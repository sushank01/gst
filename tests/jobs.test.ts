import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  enqueueJob, claimJobs, completeJob, failJob, heartbeat, checkpointJob, reapStuckJobs, cancelJob,
} from '../src/server/jobs/queue.ts'
import { dispatchDue, refreshNextRun } from '../src/server/jobs/scheduler.ts'
import { enqueue, claim, markDelivered, markFailed, releaseExpiredLeases } from '../src/server/events/outbox.ts'

async function tenantDb() {
  const db = await freshDb()
  const c = clock()
  const userId = await seedUser(db, { email: 'a@example.com' })
  const tenant = await createTenantWithOwner(db, userId, { name: 'Acme' }, c.now(), 'req')
  return { db, c, tenantId: tenant.tenantId }
}

const scheduleRow = async (db: any, tenantId: string, cron: string, tz = 'UTC', overlap = 'skip') => {
  const { rows } = await db.query(
    `insert into schedules (tenant_id, name, kind, cron, timezone, overlap_policy)
     values ($1, 'Nightly', 'report.export', $2, $3, $4) returning id`,
    [tenantId, cron, tz, overlap],
  )
  return rows[0].id as string
}

/* --------------------------------- queue --------------------------------- */

test('a job is claimed once, even by two workers racing', async () => {
  const { db, c, tenantId } = await tenantDb()
  await enqueueJob(db, { tenantId, kind: 'report.export' }, c.now())

  const [a, b] = await Promise.all([claimJobs(db, 'worker-a', c.now()), claimJobs(db, 'worker-b', c.now())])
  assert.equal(a.length + b.length, 1, 'exactly one worker got it')
  await db.close()
})

test('a claim bumps the fence and sets a lease', async () => {
  const { db, c, tenantId } = await tenantDb()
  await enqueueJob(db, { tenantId, kind: 'report.export' }, c.now())
  const [job] = await claimJobs(db, 'w1', c.now())
  assert.equal(job.attempts, 1)
  assert.equal(job.fence, '1')

  const { rows } = await db.query<{ locked_by: string; locked_until: Date; status: string }>(
    'select locked_by, locked_until, status from jobs where id = $1',
    [job.id],
  )
  assert.equal(rows[0].locked_by, 'w1')
  assert.equal(rows[0].status, 'running')
  assert.ok(new Date(rows[0].locked_until).getTime() > c.now().getTime())
  await db.close()
})

test('FENCING: a late result from a superseded worker is rejected', async () => {
  const { db, c, tenantId } = await tenantDb()
  await enqueueJob(db, { tenantId, kind: 'report.export', maxAttempts: 5 }, c.now())
  const [first] = await claimJobs(db, 'slow-worker', c.now(), { leaseMs: 1000 })

  // The lease expires and the reaper returns the job to the queue.
  const later = c.advance(5000)
  assert.equal(await reapStuckJobs(db, later), 1)
  const [second] = await claimJobs(db, 'fast-worker', later)
  assert.notEqual(second.fence, first.fence)

  // The original worker finally reports back with its stale fence.
  assert.equal(await completeJob(db, first.id, first.fence, { ok: true }, later), false, 'stale completion ignored')
  assert.equal(await completeJob(db, second.id, second.fence, { ok: true }, later), true)

  const { rows } = await db.query<{ status: string }>('select status from jobs where id = $1', [first.id])
  assert.equal(rows[0].status, 'succeeded')
  await db.close()
})

test('a heartbeat extends the lease; a stale fence cannot', async () => {
  const { db, c, tenantId } = await tenantDb()
  await enqueueJob(db, { tenantId, kind: 'report.export' }, c.now())
  const [job] = await claimJobs(db, 'w1', c.now(), { leaseMs: 1000 })
  assert.equal(await heartbeat(db, job.id, job.fence, c.now(), 60_000), true)
  assert.equal(await heartbeat(db, job.id, '999', c.now()), false)
  await db.close()
})

test('checkpoints survive so a bounded step resumes rather than restarts', async () => {
  const { db, c, tenantId } = await tenantDb()
  await enqueueJob(db, { tenantId, kind: 'rfp.extract' }, c.now())
  const [job] = await claimJobs(db, 'w1', c.now())
  assert.equal(await checkpointJob(db, job.id, job.fence, { page: 12 }, 40, c.now()), true)

  const later = c.advance(120_000)
  await reapStuckJobs(db, later)
  const [resumed] = await claimJobs(db, 'w2', later)
  assert.deepEqual(resumed.checkpoint, { page: 12 }, 'the next worker starts from page 12')
  assert.equal(resumed.attempts, 2)
  await db.close()
})

test('failures back off, then dead-letter instead of retrying forever', async () => {
  const { db, c, tenantId } = await tenantDb()
  await enqueueJob(db, { tenantId, kind: 'report.export', maxAttempts: 2 }, c.now())

  const [first] = await claimJobs(db, 'w1', c.now())
  assert.equal(await failJob(db, first, 'provider timeout', c.now()), 'retry')
  const afterFail = await db.query<{ status: string; available_at: Date }>(
    'select status, available_at from jobs where id = $1', [first.id])
  assert.equal(afterFail.rows[0].status, 'queued')
  assert.ok(new Date(afterFail.rows[0].available_at).getTime() > c.now().getTime(), 'backoff delays the retry')

  const later = c.advance(60_000)
  const [second] = await claimJobs(db, 'w1', later)
  assert.equal(second.attempts, 2)
  assert.equal(await failJob(db, second, 'provider timeout', later), 'dead')
  const afterDead = await db.query<{ status: string }>('select status from jobs where id = $1', [first.id])
  assert.equal(afterDead.rows[0].status, 'dead', 'no infinite retry')

  const runs = await db.query<{ n: string }>('select count(*)::text as n from job_runs where job_id = $1', [first.id])
  assert.equal(runs.rows[0].n, '2', 'every attempt is recorded')
  await db.close()
})

test('cancel stops a queued job', async () => {
  const { db, c, tenantId } = await tenantDb()
  const id = await enqueueJob(db, { tenantId, kind: 'report.export' }, c.now())
  assert.equal(await cancelJob(db, id!, c.now()), true)
  assert.equal((await claimJobs(db, 'w1', c.now())).length, 0)
  await db.close()
})

test('a job scheduled for later is not claimed early', async () => {
  const { db, c, tenantId } = await tenantDb()
  await enqueueJob(db, { tenantId, kind: 'report.export', availableAt: new Date(c.now().getTime() + 60_000) }, c.now())
  assert.equal((await claimJobs(db, 'w1', c.now())).length, 0)
  assert.equal((await claimJobs(db, 'w1', c.advance(61_000))).length, 1)
  await db.close()
})

/* ------------------------------- scheduler ------------------------------- */

test('a due schedule creates exactly one job per occurrence, even across two dispatchers', async () => {
  const { db, c, tenantId } = await tenantDb()
  const scheduleId = await scheduleRow(db, tenantId, '0 * * * *')
  await refreshNextRun(db, scheduleId, c.now())

  const later = c.advance(2 * 60 * 60 * 1000)
  const [a, b] = await Promise.all([dispatchDue(db, later), dispatchDue(db, later)])
  const total = a.scheduled + b.scheduled

  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from jobs where schedule_id = $1', [scheduleId])
  assert.equal(rows[0].n, String(total))
  assert.ok(total >= 1 && total <= 2, `two hourly occurrences at most, got ${total}`)

  const distinct = await db.query<{ n: string }>(
    'select count(distinct occurrence_at)::text as n from jobs where schedule_id = $1',
    [scheduleId],
  )
  assert.equal(distinct.rows[0].n, rows[0].n, 'no duplicate occurrence')
  await db.close()
})

test('running the dispatcher twice for the same instant does not double-create', async () => {
  const { db, c, tenantId } = await tenantDb()
  const scheduleId = await scheduleRow(db, tenantId, '*/30 * * * *')
  await refreshNextRun(db, scheduleId, c.now())
  const later = c.advance(31 * 60 * 1000)

  const first = await dispatchDue(db, later)
  const second = await dispatchDue(db, later)
  assert.ok(first.scheduled >= 1)
  assert.equal(second.scheduled, 0, 'the second pass finds nothing new')
  await db.close()
})

test('overlap policy skip records a missed occurrence instead of stacking runs', async () => {
  const { db, c, tenantId } = await tenantDb()
  const scheduleId = await scheduleRow(db, tenantId, '*/5 * * * *', 'UTC', 'skip')
  await refreshNextRun(db, scheduleId, c.now())

  await dispatchDue(db, c.advance(6 * 60 * 1000))
  await claimJobs(db, 'w1', c.now()) // leave it running
  const second = await dispatchDue(db, c.advance(6 * 60 * 1000))

  assert.ok(second.skipped >= 1, 'the new occurrence is skipped while one is in flight')
  const missed = await db.query<{ reason: string }>('select reason from missed_occurrences where schedule_id = $1', [scheduleId])
  assert.match(missed.rows[0].reason, /still in progress/)
  await db.close()
})

test('a long outage records missed runs rather than firing a burst', async () => {
  const { db, c, tenantId } = await tenantDb()
  const scheduleId = await scheduleRow(db, tenantId, '0 * * * *')
  await refreshNextRun(db, scheduleId, c.now())

  // Twelve hours later, with a one-hour catch-up window.
  const later = c.advance(12 * 60 * 60 * 1000)
  const summary = await dispatchDue(db, later)

  assert.ok(summary.scheduled <= 2, `catch-up is bounded, scheduled ${summary.scheduled}`)
  assert.ok(summary.missed >= 8, `the gap is recorded, missed ${summary.missed}`)

  // Two different reasons write to the same table: occurrences outside the
  // catch-up window, and occurrences skipped because one was still running.
  // Counting them together would hide which happened.
  const outOfWindow = await db.query<{ n: string }>(
    `select count(*)::text as n from missed_occurrences
      where schedule_id = $1 and reason like 'Outside the catch-up window%'`,
    [scheduleId],
  )
  assert.equal(outOfWindow.rows[0].n, String(summary.missed))

  const overlapped = await db.query<{ n: string }>(
    `select count(*)::text as n from missed_occurrences
      where schedule_id = $1 and reason like 'Previous run still in progress%'`,
    [scheduleId],
  )
  assert.equal(overlapped.rows[0].n, String(summary.skipped))
  await db.close()
})

test('an inactive schedule produces nothing', async () => {
  const { db, c, tenantId } = await tenantDb()
  const scheduleId = await scheduleRow(db, tenantId, '* * * * *')
  await db.query('update schedules set active = false where id = $1', [scheduleId])
  const summary = await dispatchDue(db, c.advance(10 * 60 * 1000))
  assert.equal(summary.scheduled, 0)
  await db.close()
})

test("one broken cron expression does not stop other tenants' schedules", async () => {
  const { db, c, tenantId } = await tenantDb()
  await db.query(
    `insert into schedules (tenant_id, name, kind, cron, timezone) values ($1, 'Broken', 'x', 'not a cron', 'UTC')`,
    [tenantId],
  )
  const good = await scheduleRow(db, tenantId, '*/5 * * * *')
  await refreshNextRun(db, good, c.now())

  const summary = await dispatchDue(db, c.advance(6 * 60 * 1000))
  assert.equal(summary.errors.length, 1, 'the bad one is reported')
  assert.ok(summary.scheduled >= 1, 'the good one still ran')

  const { rows } = await db.query<{ last_status: string }>("select last_status from schedules where name = 'Broken'")
  assert.match(rows[0].last_status, /^error:/)
  await db.close()
})

/* -------------------------------- outbox --------------------------------- */

test('outbox: an identical effect is enqueued once', async () => {
  const { db, c, tenantId } = await tenantDb()
  const first = await enqueue(db, { tenantId, topic: 'email.send', payload: { to: 'a@b.com' }, idempotencyKey: 'x1' }, c.now())
  const second = await enqueue(db, { tenantId, topic: 'email.send', payload: { to: 'a@b.com' }, idempotencyKey: 'x1' }, c.now())
  assert.ok(first)
  assert.equal(second, null, 'the duplicate is a no-op, not an error')
  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from outbox')
  assert.equal(rows[0].n, '1')
  await db.close()
})

test('outbox: claim, deliver, and retry with a dead letter at the end', async () => {
  const { db, c, tenantId } = await tenantDb()
  await enqueue(db, { tenantId, topic: 'email.send', payload: {} , maxAttempts: 2 }, c.now())

  const [message] = await claim(db, 'dispatcher-1', c.now())
  assert.equal(message.topic, 'email.send')
  assert.equal((await claim(db, 'dispatcher-2', c.now())).length, 0, 'held by the first lease')

  assert.equal(await markFailed(db, message, 'smtp refused', c.now()), 'retry')
  const later = c.advance(60_000)
  const [again] = await claim(db, 'dispatcher-1', later)
  assert.equal(await markFailed(db, again, 'smtp refused', later), 'dead')

  const { rows } = await db.query<{ status: string; last_error: string }>('select status, last_error from outbox')
  assert.equal(rows[0].status, 'dead')
  assert.equal(rows[0].last_error, 'smtp refused')
  await db.close()
})

test('outbox: an expired lease is released for another dispatcher', async () => {
  const { db, c, tenantId } = await tenantDb()
  await enqueue(db, { tenantId, topic: 'email.send', payload: {} }, c.now())
  const [message] = await claim(db, 'd1', c.now(), 10, 1000)
  const later = c.advance(5000)
  assert.equal(await releaseExpiredLeases(db, later), 1)
  const [retaken] = await claim(db, 'd2', later)
  assert.equal(retaken.id, message.id)
  await markDelivered(db, retaken.id, later)
  const { rows } = await db.query<{ status: string }>('select status from outbox')
  assert.equal(rows[0].status, 'delivered')
  await db.close()
})
