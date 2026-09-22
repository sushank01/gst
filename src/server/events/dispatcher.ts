import { claim, markDelivered, markFailed, releaseExpiredLeases, type ClaimedMessage } from './outbox.ts'
import type { Db } from '../db/client.ts'

/**
 * The outbox dispatcher: the loop that turns queued messages into deliveries.
 *
 * The rule this file exists to enforce is that NOTHING IS MARKED DELIVERED
 * THAT WAS NOT DELIVERED. A message whose topic has no transport registered is
 * put back as pending, untouched and un-penalised — it is a configuration gap,
 * not a delivery failure, and burning its retry budget would dead-letter real
 * messages because an administrator had not connected a mail provider yet.
 *
 * Transports are injected. There is no built-in default that pretends: a
 * dispatcher with no transports delivers nothing and says so.
 */

export type DeliveryOutcome =
  /** The transport is satisfied the message left the building. */
  | { status: 'delivered'; detail?: Record<string, unknown> }
  /** It failed, and retrying may work. */
  | { status: 'retry'; error: string }
  /** It failed and always will — a malformed address, a rejected payload. */
  | { status: 'permanent'; error: string }

export type Transport = {
  name: string
  deliver(message: ClaimedMessage): Promise<DeliveryOutcome>
}

export type DispatchSummary = {
  claimed: number
  delivered: number
  retried: number
  dead: number
  /** Claimed but returned untouched because no transport handles the topic. */
  unroutable: number
  released: number
}

export type DispatcherOptions = {
  /** Topic to transport. A topic with no entry is left alone, not failed. */
  transports: Record<string, Transport>
  worker: string
  now: Date
  limit?: number
  leaseMs?: number
}

/** Puts a claimed message back exactly as it was found, refunding its attempt. */
async function returnUnrouted(db: Db, message: ClaimedMessage): Promise<void> {
  await db.query(
    `update outbox
        set status = 'pending', locked_by = null, locked_until = null, attempts = attempts - 1,
            last_error = $2
      where id = $1`,
    [message.id, `No transport is configured for topic "${message.topic}".`],
  )
}

/**
 * Runs one dispatch pass.
 *
 * Designed to be called repeatedly — from a scheduler, a cron, or a test —
 * rather than to own a long-lived loop. A pass that dies mid-flight leaves its
 * messages leased; the next pass releases them by timeout.
 */
export async function dispatchOnce(db: Db, options: DispatcherOptions): Promise<DispatchSummary> {
  const released = await releaseExpiredLeases(db, options.now)
  const messages = await claim(db, options.worker, options.now, options.limit ?? 20, options.leaseMs ?? 60_000)

  const summary: DispatchSummary = {
    claimed: messages.length,
    delivered: 0,
    retried: 0,
    dead: 0,
    unroutable: 0,
    released,
  }

  for (const message of messages) {
    const transport = options.transports[message.topic]
    if (!transport) {
      await returnUnrouted(db, message)
      summary.unroutable += 1
      continue
    }

    let outcome: DeliveryOutcome
    try {
      outcome = await transport.deliver(message)
    } catch (error) {
      // A transport that throws is a transport that failed; it is not a
      // delivery. Treated as retryable, because most throws are transient.
      outcome = { status: 'retry', error: error instanceof Error ? error.message : String(error) }
    }

    if (outcome.status === 'delivered') {
      await markDelivered(db, message.id, options.now)
      summary.delivered += 1
      continue
    }

    if (outcome.status === 'permanent') {
      // No amount of retrying fixes a malformed address. Dead-lettered now
      // rather than after eight pointless attempts.
      await db.query(
        `update outbox set status = 'dead', last_error = $2, locked_by = null, locked_until = null where id = $1`,
        [message.id, outcome.error.slice(0, 1000)],
      )
      summary.dead += 1
      continue
    }

    const result = await markFailed(db, message, outcome.error, options.now)
    if (result === 'dead') summary.dead += 1
    else summary.retried += 1
  }
  return summary
}

/**
 * Posts the message to an HTTP endpoint.
 *
 * Real delivery over the network, with the tenant and topic in headers so the
 * receiver can route without parsing the body. A 2xx is a delivery; a 4xx
 * other than 408/429 is permanent, because repeating a rejected request will
 * get it rejected again.
 */
export function webhookTransport(options: {
  url: string
  /** Sent as a bearer token when present. Never logged. */
  secret?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Transport {
  const call = options.fetchImpl ?? fetch
  return {
    name: `webhook(${new URL(options.url).host})`,
    async deliver(message) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
      try {
        const response = await call(options.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-apragya-topic': message.topic,
            ...(message.tenantId ? { 'x-apragya-tenant': message.tenantId } : {}),
            ...(options.secret ? { authorization: `Bearer ${options.secret}` } : {}),
          },
          body: JSON.stringify({ id: message.id, topic: message.topic, payload: message.payload }),
          signal: controller.signal,
        })
        if (response.ok) return { status: 'delivered', detail: { httpStatus: response.status } }
        const permanent = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)
        return {
          status: permanent ? 'permanent' : 'retry',
          error: `HTTP ${response.status} from the endpoint.`,
        }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

/**
 * Collects messages in memory instead of sending them.
 *
 * For tests and for local development where no provider is connected. It is
 * deliberately NOT the production default: a transport that always reports
 * success would make an unconfigured system look like a working one, which is
 * the exact failure this module is built to avoid.
 */
export function collectingTransport(): Transport & { delivered: ClaimedMessage[] } {
  const delivered: ClaimedMessage[] = []
  return {
    name: 'collecting',
    delivered,
    deliver(message) {
      delivered.push(message)
      return Promise.resolve({ status: 'delivered' })
    },
  }
}
