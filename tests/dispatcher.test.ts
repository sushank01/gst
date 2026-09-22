import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock } from './helpers/db.ts'
import { enqueue } from '../src/server/events/outbox.ts'
import { collectingTransport, dispatchOnce, webhookTransport, type Transport } from '../src/server/events/dispatcher.ts'

const statusOf = async (db: Awaited<ReturnType<typeof freshDb>>, topic: string) => {
  const { rows } = await db.query<{ status: string; attempts: number; last_error: string | null }>(
    'select status, attempts, last_error from outbox where topic = $1 order by id limit 1',
    [topic],
  )
  return rows[0]
}

test('a message with no transport is put back untouched, not failed', async () => {
  const db = await freshDb()
  const c = clock()
  await enqueue(db, { topic: 'email.verify', payload: { to: 'ada@example.com' } }, c.now())

  const summary = await dispatchOnce(db, { transports: {}, worker: 'w1', now: c.now() })
  assert.deepEqual(
    { claimed: summary.claimed, delivered: summary.delivered, unroutable: summary.unroutable, dead: summary.dead },
    { claimed: 1, delivered: 0, unroutable: 1, dead: 0 },
  )

  const row = await statusOf(db, 'email.verify')
  assert.equal(row.status, 'pending', 'it is still waiting to be sent')
  assert.equal(row.attempts, 0, 'a missing mail provider must not burn the retry budget of a real message')
  assert.match(row.last_error ?? '', /No transport is configured/)

  // Once a transport exists it goes out, with its attempts intact.
  const transport = collectingTransport()
  const second = await dispatchOnce(db, { transports: { 'email.verify': transport }, worker: 'w1', now: c.now() })
  assert.equal(second.delivered, 1)
  assert.equal(transport.delivered[0].payload.to, 'ada@example.com')
  assert.equal((await statusOf(db, 'email.verify')).status, 'delivered')
  await db.close()
})

test('nothing is ever marked delivered that was not delivered', async () => {
  const db = await freshDb()
  const c = clock()
  await enqueue(db, { topic: 'email.verify', payload: {} }, c.now())

  const failing: Transport = { name: 'failing', deliver: () => Promise.resolve({ status: 'retry', error: 'smtp timeout' }) }
  const summary = await dispatchOnce(db, { transports: { 'email.verify': failing }, worker: 'w1', now: c.now() })
  assert.equal(summary.delivered, 0)
  assert.equal(summary.retried, 1)

  const row = await statusOf(db, 'email.verify')
  assert.equal(row.status, 'pending')
  assert.equal(row.attempts, 1, 'a real failure does spend an attempt')
  assert.match(row.last_error ?? '', /smtp timeout/)
  await db.close()
})

test('a transport that throws is a failure, not a delivery', async () => {
  const db = await freshDb()
  const c = clock()
  await enqueue(db, { topic: 'email.verify', payload: {} }, c.now())

  const exploding: Transport = { name: 'boom', deliver: () => Promise.reject(new Error('connection reset')) }
  const summary = await dispatchOnce(db, { transports: { 'email.verify': exploding }, worker: 'w1', now: c.now() })
  assert.equal(summary.delivered, 0)
  assert.equal(summary.retried, 1)
  assert.match((await statusOf(db, 'email.verify')).last_error ?? '', /connection reset/)
  await db.close()
})

test('a permanent failure dead-letters at once rather than retrying pointlessly', async () => {
  const db = await freshDb()
  const c = clock()
  await enqueue(db, { topic: 'email.verify', payload: { to: 'not-an-address' } }, c.now())

  const rejecting: Transport = {
    name: 'rejecting',
    deliver: () => Promise.resolve({ status: 'permanent', error: 'recipient address is malformed' }),
  }
  const summary = await dispatchOnce(db, { transports: { 'email.verify': rejecting }, worker: 'w1', now: c.now() })
  assert.equal(summary.dead, 1)

  const row = await statusOf(db, 'email.verify')
  assert.equal(row.status, 'dead', 'no amount of retrying fixes a malformed address')
  assert.equal(row.attempts, 1)
  await db.close()
})

test('retries back off and eventually dead-letter instead of looping forever', async () => {
  const db = await freshDb()
  const c = clock()
  await enqueue(db, { topic: 'email.verify', payload: {}, maxAttempts: 3 }, c.now())
  const failing: Transport = { name: 'failing', deliver: () => Promise.resolve({ status: 'retry', error: 'nope' }) }

  let now = c.now()
  for (let pass = 0; pass < 6; pass += 1) {
    // Far enough ahead that the backoff has always elapsed.
    now = new Date(now.getTime() + 60 * 60 * 1000)
    await dispatchOnce(db, { transports: { 'email.verify': failing }, worker: 'w1', now })
  }
  const row = await statusOf(db, 'email.verify')
  assert.equal(row.status, 'dead')
  assert.equal(row.attempts, 3, 'it stops at the attempt limit rather than retrying forever')
  await db.close()
})

test('two dispatchers running at once do not deliver the same message twice', async () => {
  const db = await freshDb()
  const c = clock()
  for (let index = 0; index < 8; index += 1) {
    await enqueue(db, { topic: 'email.verify', payload: { index } }, c.now())
  }

  const one = collectingTransport()
  const two = collectingTransport()
  await Promise.all([
    dispatchOnce(db, { transports: { 'email.verify': one }, worker: 'w1', now: c.now() }),
    dispatchOnce(db, { transports: { 'email.verify': two }, worker: 'w2', now: c.now() }),
  ])

  const seen = [...one.delivered, ...two.delivered].map((message) => message.id)
  assert.equal(seen.length, 8, 'every message went out')
  assert.equal(new Set(seen).size, 8, 'and none of them went out twice')

  const { rows } = await db.query<{ n: string }>("select count(*)::text as n from outbox where status <> 'delivered'")
  assert.equal(rows[0].n, '0')
  await db.close()
})

test('a dispatcher that dies mid-flight has its work released by the next pass', async () => {
  const db = await freshDb()
  const c = clock()
  await enqueue(db, { topic: 'email.verify', payload: {} }, c.now())

  // Claim it, then vanish without completing: the lease is the only thing
  // stopping this message being stranded forever.
  const { claim } = await import('../src/server/events/outbox.ts')
  await claim(db, 'dead-worker', c.now(), 10, 30_000)
  assert.equal((await statusOf(db, 'email.verify')).status, 'inflight')

  const transport = collectingTransport()
  const later = new Date(c.now().getTime() + 60_000)
  const summary = await dispatchOnce(db, { transports: { 'email.verify': transport }, worker: 'w2', now: later })
  assert.equal(summary.released, 1)
  assert.equal(summary.delivered, 1)
  await db.close()
})

test('the webhook transport delivers on 2xx, retries 5xx and gives up on 4xx', async () => {
  const db = await freshDb()
  const c = clock()
  const calls: { url: string; headers: Record<string, string>; body: string }[] = []
  let reply = 200

  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: init.body as string })
    return Promise.resolve(new Response(null, { status: reply }))
  }) as unknown as typeof fetch

  const transport = webhookTransport({ url: 'https://hooks.example.test/inbox', secret: 's3cret', fetchImpl })

  await enqueue(db, { topic: 'ticket.created', payload: { ticket: 'T-1' } }, c.now())
  assert.equal((await dispatchOnce(db, { transports: { 'ticket.created': transport }, worker: 'w1', now: c.now() })).delivered, 1)
  assert.equal(calls[0].headers['x-apragya-topic'], 'ticket.created')
  assert.match(calls[0].body, /T-1/)

  reply = 503
  await enqueue(db, { topic: 'ticket.created', payload: { ticket: 'T-2' }, idempotencyKey: 't2' }, c.now())
  const flaky = await dispatchOnce(db, { transports: { 'ticket.created': transport }, worker: 'w1', now: c.now() })
  assert.equal(flaky.retried, 1, 'a 503 is the endpoint having a bad day')

  reply = 422
  await enqueue(db, { topic: 'ticket.created', payload: { ticket: 'T-3' }, idempotencyKey: 't3' }, c.now())
  const rejected = await dispatchOnce(db, { transports: { 'ticket.created': transport }, worker: 'w1', now: c.now() })
  assert.equal(rejected.dead, 1, 'a rejected request will be rejected again')
  await db.close()
})

test('the secret never reaches the stored message or its error', async () => {
  const db = await freshDb()
  const c = clock()
  const fetchImpl = (() => Promise.resolve(new Response(null, { status: 500 }))) as unknown as typeof fetch
  const transport = webhookTransport({ url: 'https://hooks.example.test/inbox', secret: 'super-secret-token', fetchImpl })

  await enqueue(db, { topic: 'ticket.created', payload: { ticket: 'T-1' } }, c.now())
  await dispatchOnce(db, { transports: { 'ticket.created': transport }, worker: 'w1', now: c.now() })

  const { rows } = await db.query<{ row: string }>('select outbox::text as row from outbox')
  assert.ok(!rows[0].row.includes('super-secret-token'), 'a credential must not end up in a queue row')
  await db.close()
})
