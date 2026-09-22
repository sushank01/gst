import type { Db } from '../db/client.ts'

/**
 * Transactional outbox.
 *
 * A side effect is enqueued in the *same* transaction as the state change that
 * justifies it. Either both commit or neither does, so "invitation sent" can
 * never be true while the invitation row is missing — and a crash between the
 * two is impossible rather than merely unlikely.
 *
 * Delivery is at-least-once; consumers must be idempotent. `idempotency_key`
 * collapses duplicate enqueues of the same logical effect.
 */

export type OutboxMessage = {
  topic: string
  payload: Record<string, unknown>
  tenantId?: string | null
  idempotencyKey?: string | null
  availableAt?: Date
  maxAttempts?: number
}

export async function enqueue(db: Db, message: OutboxMessage, now: Date): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `insert into outbox (tenant_id, topic, payload, idempotency_key, available_at, max_attempts)
     values ($1, $2, $3, $4, $5, coalesce($6, 8))
     on conflict (topic, idempotency_key) where idempotency_key is not null do nothing
     returning id::text as id`,
    [
      message.tenantId ?? null,
      message.topic,
      JSON.stringify(message.payload),
      message.idempotencyKey ?? null,
      message.availableAt ?? now,
      message.maxAttempts ?? null,
    ],
  )
  // No row means an identical effect is already queued — not an error.
  return rows[0]?.id ?? null
}

export type ClaimedMessage = {
  id: string
  topic: string
  payload: Record<string, unknown>
  tenantId: string | null
  attempts: number
  maxAttempts: number
}

/**
 * Claims due messages with a lease.
 *
 * `for update skip locked` lets several dispatchers run at once without any of
 * them waiting or, worse, both taking the same row. The lease (`locked_until`)
 * means a dispatcher that dies mid-flight releases its work by timeout rather
 * than stranding it forever.
 */
export async function claim(db: Db, worker: string, now: Date, limit = 20, leaseMs = 60_000): Promise<ClaimedMessage[]> {
  const { rows } = await db.query<{
    id: string
    topic: string
    payload: Record<string, unknown>
    tenant_id: string | null
    attempts: number
    max_attempts: number
  }>(
    `update outbox set status = 'inflight', locked_by = $1, locked_until = $2, attempts = attempts + 1
      where id in (
        select id from outbox
         where status in ('pending', 'inflight')
           and available_at <= $3
           and (locked_until is null or locked_until < $3)
         order by available_at
         limit $4
         for update skip locked
      )
      returning id::text as id, topic, payload, tenant_id, attempts, max_attempts`,
    [worker, new Date(now.getTime() + leaseMs), now, limit],
  )
  return rows.map((row) => ({
    id: row.id,
    topic: row.topic,
    payload: row.payload,
    tenantId: row.tenant_id,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  }))
}

export async function markDelivered(db: Db, id: string, now: Date): Promise<void> {
  await db.query(
    `update outbox set status = 'delivered', delivered_at = $2, locked_by = null, locked_until = null where id = $1`,
    [id, now],
  )
}

/** Exponential backoff, then the dead-letter state — never an infinite retry. */
export async function markFailed(db: Db, message: ClaimedMessage, error: string, now: Date): Promise<'retry' | 'dead'> {
  const exhausted = message.attempts >= message.maxAttempts
  const backoffMs = Math.min(2 ** message.attempts * 1000, 60 * 60 * 1000)
  await db.query(
    `update outbox
        set status = $2, last_error = $3, locked_by = null, locked_until = null, available_at = $4
      where id = $1`,
    [message.id, exhausted ? 'dead' : 'pending', error.slice(0, 1000), new Date(now.getTime() + backoffMs)],
  )
  return exhausted ? 'dead' : 'retry'
}

/** Returns leases that expired without completing — the stuck-job reaper. */
export async function releaseExpiredLeases(db: Db, now: Date): Promise<number> {
  const { rowCount } = await db.query(
    `update outbox set status = 'pending', locked_by = null, locked_until = null
      where status = 'inflight' and locked_until is not null and locked_until < $1`,
    [now],
  )
  return rowCount
}
