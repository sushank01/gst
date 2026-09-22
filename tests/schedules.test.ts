import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  cancelQueuedJob, createSchedule, deleteSchedule, jobAttempts, listJobs, listSchedules,
  missedRuns, runScheduleNow, updateSchedule,
} from '../src/server/services/schedules.ts'

async function workspace() {
  const db = await freshDb()
  const c = clock()
  const owner = await seedUser(db, { email: 'owner@example.com', fullName: 'Owner' })
  const other = await seedUser(db, { email: 'rival@example.com', fullName: 'Rival' })
  const acme = await createTenantWithOwner(db, owner, { name: 'Acme' }, c.now(), 'r1')
  const rival = await createTenantWithOwner(db, other, { name: 'Rival' }, c.now(), 'r2')
  const ctxFor = async (userId: string, tenantId: string) => {
    const { token } = await createSession(db, { userId, tenantId }, c.now())
    return withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))
  }
  return { db, c, ctx: await ctxFor(owner, acme.tenantId), rivalCtx: await ctxFor(other, rival.tenantId) }
}

const NIGHTLY = { name: 'Nightly sweep', kind: 'billing.sweep', cron: '0 2 * * *', timezone: 'Asia/Kolkata' }

test('a schedule stores its zone and previews real local occurrences', async () => {
  const { db, ctx } = await workspace()
  const schedule = await createSchedule(ctx, NIGHTLY)

  assert.equal(schedule.timezone, 'Asia/Kolkata')
  assert.ok(schedule.nextRunAt, 'the next run is computed at creation, not at first dispatch')
  assert.equal(schedule.upcoming.length, 3)
  // 02:00 in Kolkata is 20:30 UTC the previous day. A preview that ignored the
  // zone would show 02:00 UTC and be wrong by five and a half hours.
  assert.match(new Date(schedule.nextRunAt).toISOString(), /T20:30:00/)
  await db.close()
})

test('an expression that can never occur is refused while somebody is looking at it', async () => {
  const { db, ctx } = await workspace()
  await assert.rejects(() => createSchedule(ctx, { ...NIGHTLY, cron: 'not a cron' }), /five-field cron/i)
  await assert.rejects(() => createSchedule(ctx, { ...NIGHTLY, timezone: 'Mars/Olympus' }), /recognised IANA/i)
  await assert.rejects(
    () => createSchedule(ctx, { ...NIGHTLY, cron: '0 0 30 2 *' }),
    /never occurs/i,
    'the 30th of February parses but can never happen',
  )
  assert.deepEqual(await listSchedules(ctx), [])
  await db.close()
})

test('changing the expression recomputes the next run', async () => {
  const { db, ctx } = await workspace()
  const schedule = await createSchedule(ctx, NIGHTLY)
  const before = schedule.nextRunAt

  const changed = await updateSchedule(ctx, schedule.id, { cron: '30 14 * * *' })
  assert.notEqual(changed.nextRunAt, before, 'the stored next run must not describe the old schedule')
  assert.match(new Date(changed.nextRunAt!).toISOString(), /T09:00:00/)
  await db.close()
})

test('deactivating clears the next run and the preview', async () => {
  const { db, ctx } = await workspace()
  const schedule = await createSchedule(ctx, NIGHTLY)
  const paused = await updateSchedule(ctx, schedule.id, { active: false })
  assert.equal(paused.active, false)
  assert.equal(paused.nextRunAt, null, 'an inactive schedule has no next run to show')
  assert.deepEqual(paused.upcoming, [])

  const resumed = await updateSchedule(ctx, schedule.id, { active: true })
  assert.ok(resumed.nextRunAt)
  await db.close()
})

test('RUN NOW enqueues a real job, and the same instant does not enqueue two', async () => {
  const { db, ctx } = await workspace()
  const schedule = await createSchedule(ctx, NIGHTLY)

  const first = await runScheduleNow(ctx, schedule.id)
  assert.ok(first.jobId, 'the prototype printed a success line and did nothing')

  const jobs = await listJobs(ctx, {})
  assert.equal(jobs.total, 1)
  assert.equal(jobs.rows[0].kind, 'billing.sweep')
  assert.equal(jobs.rows[0].status, 'queued')
  assert.equal(jobs.rows[0].scheduleName, 'Nightly sweep')

  // The occurrence is unique per schedule, so a double-click is one job.
  const second = await runScheduleNow(ctx, schedule.id)
  assert.equal(second.jobId, null, 'reported honestly rather than as a fresh run')
  assert.equal((await listJobs(ctx, {})).total, 1)
  await db.close()
})

test('two concurrent manual runs produce one job', async () => {
  const { db, ctx } = await workspace()
  const schedule = await createSchedule(ctx, NIGHTLY)
  const results = await Promise.allSettled([runScheduleNow(ctx, schedule.id), runScheduleNow(ctx, schedule.id)])
  const ids = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<{ jobId: string | null }>).value.jobId)
    .filter(Boolean)
  assert.equal(ids.length, 1)
  assert.equal((await listJobs(ctx, {})).total, 1)
  await db.close()
})

test('jobs filter by status and schedule, and the count agrees', async () => {
  const { db, ctx } = await workspace()
  const one = await createSchedule(ctx, NIGHTLY)
  const two = await createSchedule(ctx, { ...NIGHTLY, name: 'Hourly', cron: '0 * * * *' })
  await runScheduleNow(ctx, one.id)
  await runScheduleNow(ctx, two.id)

  assert.equal((await listJobs(ctx, {})).total, 2)
  assert.equal((await listJobs(ctx, { scheduleId: one.id })).total, 1)
  assert.equal((await listJobs(ctx, { status: 'queued' })).total, 2)
  assert.equal((await listJobs(ctx, { status: 'succeeded' })).total, 0)
  await db.close()
})

test('a queued job can be cancelled; a running one cannot be cancelled out from under its worker', async () => {
  const { db, ctx } = await workspace()
  const schedule = await createSchedule(ctx, NIGHTLY)
  const { jobId } = await runScheduleNow(ctx, schedule.id)

  await cancelQueuedJob(ctx, jobId!)
  assert.equal((await listJobs(ctx, { status: 'cancelled' })).total, 1)
  await assert.rejects(() => cancelQueuedJob(ctx, jobId!), /already started or finished/i)
  await db.close()
})

test('every attempt is kept, including ones a retry overwrote', async () => {
  const { db, ctx } = await workspace()
  const schedule = await createSchedule(ctx, NIGHTLY)
  const { jobId } = await runScheduleNow(ctx, schedule.id)

  const { claimJobs, failJob } = await import('../src/server/jobs/queue.ts')
  const firstClaim = await claimJobs(db, 'worker-1', ctx.now, { limit: 1 })
  await failJob(db, firstClaim[0], 'provider timeout', ctx.now)
  const secondClaim = await claimJobs(db, 'worker-1', new Date(ctx.now.getTime() + 3_600_000), { limit: 1 })
  await failJob(db, secondClaim[0], 'provider timeout again', new Date(ctx.now.getTime() + 3_600_000))

  const attempts = await jobAttempts(ctx, jobId!)
  assert.equal(attempts.length, 2, 'the job row keeps only the latest error; the run rows keep both')
  assert.equal(attempts[0].error, 'provider timeout')
  assert.equal(attempts[1].error, 'provider timeout again')
  await db.close()
})

test('a missed occurrence is recorded, not silently skipped', async () => {
  const { db, ctx } = await workspace()
  const schedule = await createSchedule(ctx, NIGHTLY)
  await db.query(
    `insert into missed_occurrences (schedule_id, occurrence_at, reason) values ($1, $2, 'outside the catch-up window')`,
    [schedule.id, new Date(ctx.now.getTime() - 86_400_000)],
  )

  const missed = await missedRuns(ctx)
  assert.equal(missed.length, 1)
  assert.equal(missed[0].scheduleName, 'Nightly sweep')
  assert.match(missed[0].reason, /catch-up/)
  await db.close()
})

test('a viewer may look but not change or run', async () => {
  const { db, ctx } = await workspace()
  const viewer = await seedUser(db, { email: 'viewer@example.com', fullName: 'Viewer' })
  await db.query(`insert into memberships (tenant_id, user_id, role, status) values ($1,$2,'viewer','active')`, [
    ctx.tenantId,
    viewer,
  ])
  const { token } = await createSession(db, { userId: viewer, tenantId: ctx.tenantId }, ctx.now)
  const viewerCtx = await withTenant(await authenticate(db, token, { now: ctx.now, requestId: 'r' }))

  const schedule = await createSchedule(ctx, NIGHTLY)
  assert.equal((await listSchedules(viewerCtx)).length, 1)
  await assert.rejects(() => createSchedule(viewerCtx, NIGHTLY), /cannot job manage/i)
  await assert.rejects(() => runScheduleNow(viewerCtx, schedule.id), /cannot job run/i)
  await db.close()
})

test('ISOLATION: schedules and jobs never cross workspaces', async () => {
  const { db, ctx, rivalCtx } = await workspace()
  const schedule = await createSchedule(ctx, NIGHTLY)
  await runScheduleNow(ctx, schedule.id)

  await assert.rejects(() => runScheduleNow(rivalCtx, schedule.id), /That schedule/)
  await assert.rejects(() => updateSchedule(rivalCtx, schedule.id, { name: 'Stolen' }), /That schedule/)
  await assert.rejects(() => deleteSchedule(rivalCtx, schedule.id), /That schedule/)
  assert.deepEqual(await listSchedules(rivalCtx), [])
  assert.equal((await listJobs(rivalCtx, {})).total, 0)
  assert.deepEqual(await missedRuns(rivalCtx), [])
  await db.close()
})
