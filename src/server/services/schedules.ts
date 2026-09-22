import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { describeUpcoming, isValidCron, isValidTimezone, nextOccurrence } from '../jobs/cron.ts'
import { cancelJob, enqueueJob } from '../jobs/queue.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Schedules and the jobs they produce.
 *
 * The cron engine, the occurrence uniqueness, the leases and the fencing
 * tokens already exist and are tested; this is the tenant-facing surface over
 * them. Two things it refuses to fake:
 *
 *  - A "next run" is computed from the stored expression and IANA zone, not
 *    from a UTC guess. "Every day at 09:00" is a different instant in summer
 *    and winter, and a preview that ignores that is wrong twice a year.
 *  - Running a schedule by hand enqueues a REAL job through the same path the
 *    dispatcher uses. The prototype's "Run now" printed a success line and did
 *    nothing, which is the failure this module exists to not repeat.
 */

export type ScheduleRow = {
  id: string
  name: string
  kind: string
  targetRef: string | null
  cron: string
  timezone: string
  overlapPolicy: string
  active: boolean
  lastRunAt: string | null
  lastStatus: string | null
  nextRunAt: string | null
  /** The next few occurrences in local time, so a preview is checkable. */
  upcoming: string[]
}

type Raw = Record<string, unknown>

/**
 * The next few occurrences, or none when the stored expression cannot be read.
 *
 * A stored row can hold an expression this engine refuses — written before the
 * validation above existed, by a migration, or by any other writer — and the
 * dispatcher already survives exactly that, one row at a time. Throwing here
 * instead would answer the whole workspace's list with a 500, so a single
 * unreadable row would hide every other schedule. It costs its own preview and
 * nothing else; the screen then says the occurrence could not be computed.
 */
function upcomingFor(cron: string, timezone: string, now: Date): string[] {
  try {
    return describeUpcoming(cron, timezone, now, 3)
  } catch {
    return []
  }
}

function mapSchedule(row: Raw, now: Date): ScheduleRow {
  const cron = row.cron as string
  const timezone = row.timezone as string
  return {
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as string,
    targetRef: (row.target_ref as string) ?? null,
    cron,
    timezone,
    overlapPolicy: row.overlap_policy as string,
    active: row.active as boolean,
    lastRunAt: row.last_run_at ? new Date(row.last_run_at as string).toISOString() : null,
    lastStatus: (row.last_status as string) ?? null,
    nextRunAt: row.next_run_at ? new Date(row.next_run_at as string).toISOString() : null,
    upcoming: row.active ? upcomingFor(cron, timezone, now) : [],
  }
}

export async function listSchedules(ctx: TenantContext): Promise<ScheduleRow[]> {
  ctx.require('job.read')
  const { rows } = await ctx.db.query<Raw>('select * from schedules where tenant_id = $1 order by name', [ctx.tenantId])
  return rows.map((row) => mapSchedule(row, ctx.now))
}

export async function createSchedule(
  ctx: TenantContext,
  input: {
    name: string
    kind: string
    cron: string
    timezone?: string
    targetRef?: string | null
    payload?: Record<string, unknown>
    overlapPolicy?: 'skip' | 'queue' | 'allow'
    catchupWindowSeconds?: number
  },
): Promise<ScheduleRow> {
  ctx.require('job.manage')

  // Both are validated here rather than at the first dispatch, so a schedule
  // that can never fire is refused while somebody is still looking at it.
  if (!isValidCron(input.cron)) throw unprocessable('bad_cron', `"${input.cron}" is not a five-field cron expression.`)
  const timezone = input.timezone ?? 'UTC'
  if (!isValidTimezone(timezone)) throw unprocessable('bad_timezone', `${timezone} is not a recognised IANA timezone.`)

  const next = nextOccurrence(input.cron, timezone, ctx.now)
  if (!next) {
    /*
     * A cron like `0 0 30 2 *` — the 30th of February — parses but can never
     * occur. Storing it would produce a schedule that silently never runs.
     */
    throw unprocessable('never_occurs', 'That expression never occurs.')
  }

  const { rows } = await ctx.db.query<Raw>(
    `insert into schedules
       (tenant_id, company_id, name, kind, target_ref, payload, cron, timezone, overlap_policy,
        catchup_window_seconds, next_run_at, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [
      ctx.tenantId,
      ctx.companyId,
      input.name,
      input.kind,
      input.targetRef ?? null,
      JSON.stringify(input.payload ?? {}),
      input.cron,
      timezone,
      input.overlapPolicy ?? 'skip',
      input.catchupWindowSeconds ?? 3600,
      next,
      ctx.userId,
    ],
  )
  await recordAudit(ctx.db, ctx, {
    action: 'schedule.created',
    resource: 'schedule',
    resourceId: rows[0].id as string,
    detail: { name: input.name, cron: input.cron, timezone },
  })
  return mapSchedule(rows[0], ctx.now)
}

export async function updateSchedule(
  ctx: TenantContext,
  scheduleId: string,
  input: { name?: string; cron?: string; timezone?: string; overlapPolicy?: 'skip' | 'queue' | 'allow'; active?: boolean },
): Promise<ScheduleRow> {
  ctx.require('job.manage')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Raw>('select * from schedules where id = $1 and tenant_id = $2 for update', [
      scheduleId,
      ctx.tenantId,
    ])
    if (!rows[0]) throw notFound('That schedule')

    const cron = input.cron ?? (rows[0].cron as string)
    const timezone = input.timezone ?? (rows[0].timezone as string)
    if (!isValidCron(cron)) throw unprocessable('bad_cron', `"${cron}" is not a five-field cron expression.`)
    if (!isValidTimezone(timezone)) throw unprocessable('bad_timezone', `${timezone} is not a recognised IANA timezone.`)

    const active = input.active ?? (rows[0].active as boolean)
    // Recomputed whenever the expression or zone changes, so the stored next
    // run never describes the old schedule.
    const next = active ? nextOccurrence(cron, timezone, ctx.now) : null
    if (active && !next) throw unprocessable('never_occurs', 'That expression never occurs.')

    await tx.query(
      `update schedules
          set name = coalesce($3, name), cron = $4, timezone = $5,
              overlap_policy = coalesce($6, overlap_policy), active = $7, next_run_at = $8, updated_at = $9
        where id = $1 and tenant_id = $2`,
      [scheduleId, ctx.tenantId, input.name ?? null, cron, timezone, input.overlapPolicy ?? null, active, next, ctx.now],
    )
    await recordAudit(tx, ctx, { action: 'schedule.updated', resource: 'schedule', resourceId: scheduleId })
    const { rows: after } = await tx.query<Raw>('select * from schedules where id = $1', [scheduleId])
    return mapSchedule(after[0], ctx.now)
  })
}

export async function deleteSchedule(ctx: TenantContext, scheduleId: string): Promise<void> {
  ctx.require('job.manage')
  const { rowCount } = await ctx.db.query('delete from schedules where id = $1 and tenant_id = $2', [scheduleId, ctx.tenantId])
  if (!rowCount) throw notFound('That schedule')
  await recordAudit(ctx.db, ctx, { action: 'schedule.deleted', resource: 'schedule', resourceId: scheduleId })
}

/**
 * Runs a schedule now, by enqueuing a real job.
 *
 * The occurrence is stamped with the current instant rather than the schedule's
 * next slot, so a manual run cannot consume the slot the dispatcher is about to
 * fill — and the unique index on (schedule, occurrence) still prevents two
 * manual runs at the same instant becoming two jobs.
 */
export async function runScheduleNow(ctx: TenantContext, scheduleId: string): Promise<{ jobId: string | null }> {
  ctx.require('job.run')

  const { rows } = await ctx.db.query<{ kind: string; payload: Record<string, unknown>; active: boolean }>(
    'select kind, payload, active from schedules where id = $1 and tenant_id = $2',
    [scheduleId, ctx.tenantId],
  )
  if (!rows[0]) throw notFound('That schedule')

  const jobId = await enqueueJob(
    ctx.db,
    {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      scheduleId,
      kind: rows[0].kind,
      payload: { ...rows[0].payload, manual: true, requestedBy: ctx.userId },
      occurrenceAt: ctx.now,
    },
    ctx.now,
  )
  await recordAudit(ctx.db, ctx, {
    action: 'schedule.run_requested',
    resource: 'schedule',
    resourceId: scheduleId,
    detail: { jobId },
  })
  /*
   * A null id means the occurrence already existed — the same instant was
   * already queued. Reported honestly rather than as a fresh run.
   */
  return { jobId }
}

export type JobRow = {
  id: string
  kind: string
  status: string
  scheduleId: string | null
  scheduleName: string | null
  attempts: number
  maxAttempts: number
  progress: number
  occurrenceAt: string | null
  startedAt: string | null
  finishedAt: string | null
  lastError: string | null
  createdAt: string
}

const mapJob = (row: Raw): JobRow => ({
  id: row.id as string,
  kind: row.kind as string,
  status: row.status as string,
  scheduleId: (row.schedule_id as string) ?? null,
  scheduleName: (row.schedule_name as string) ?? null,
  attempts: row.attempts as number,
  maxAttempts: row.max_attempts as number,
  progress: row.progress as number,
  occurrenceAt: row.occurrence_at ? new Date(row.occurrence_at as string).toISOString() : null,
  startedAt: row.started_at ? new Date(row.started_at as string).toISOString() : null,
  finishedAt: row.finished_at ? new Date(row.finished_at as string).toISOString() : null,
  lastError: (row.last_error as string) ?? null,
  createdAt: new Date(row.created_at as string).toISOString(),
})

export async function listJobs(
  ctx: TenantContext,
  options: { status?: string; scheduleId?: string; kind?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: JobRow[]; total: number }> {
  ctx.require('job.read')
  const filters = ['j.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.status) add('j.status = $?', options.status)
  if (options.scheduleId) add('j.schedule_id = $?', options.scheduleId)
  if (options.kind) add('j.kind = $?', options.kind)
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from jobs j where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  /*
   * The id breaks ties on created_at. Jobs enqueued in the same millisecond —
   * a dispatcher sweeping several schedules, or two manual runs — otherwise
   * have no defined order, and limit/offset over an unstable order can show one
   * row on both pages while another is never reached at all.
   */
  const { rows } = await ctx.db.query<Raw>(
    `select j.*, s.name as schedule_name
       from jobs j left join schedules s on s.id = j.schedule_id
      where ${where} order by j.created_at desc, j.id desc limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return { total: Number(counted[0].n), rows: rows.map(mapJob) }
}

export type JobAttempt = {
  attempt: number
  status: string
  startedAt: string
  finishedAt: string | null
  error: string | null
}

/** Every attempt, including the ones a retry overwrote on the job row. */
export async function jobAttempts(ctx: TenantContext, jobId: string): Promise<JobAttempt[]> {
  ctx.require('job.read')
  const { rows: job } = await ctx.db.query('select 1 from jobs where id = $1 and tenant_id = $2', [jobId, ctx.tenantId])
  if (!job[0]) throw notFound('That job')

  const { rows } = await ctx.db.query<{
    attempt: number
    status: string
    started_at: Date
    finished_at: Date | null
    error: string | null
  }>(
    'select attempt, status, started_at, finished_at, error from job_runs where job_id = $1 order by attempt',
    [jobId],
  )
  return rows.map((row) => ({
    attempt: row.attempt,
    status: row.status,
    startedAt: new Date(row.started_at).toISOString(),
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    error: row.error,
  }))
}

export async function cancelQueuedJob(ctx: TenantContext, jobId: string): Promise<void> {
  ctx.require('job.manage')
  const { rows } = await ctx.db.query<{ status: string }>(
    'select status from jobs where id = $1 and tenant_id = $2',
    [jobId, ctx.tenantId],
  )
  if (!rows[0]) throw notFound('That job')

  /*
   * Only a job still waiting may be cancelled here. The queue's own cancel
   * accepts a running job as well — the dispatcher uses it to stop work it owns
   * — but a running job holds a lease, and cancelling it from a screen would
   * leave a worker writing results for something the screen calls cancelled.
   * The status is therefore checked before the update rather than assumed from
   * its return value. (A job that starts running between this check and the
   * update would still be cancelled; closing that window means narrowing the
   * queue's own update, which the dispatcher shares.)
   */
  if (rows[0].status !== 'queued') throw conflict('That job has already started or finished.')

  const cancelled = await cancelJob(ctx.db, jobId, ctx.now)
  if (!cancelled) throw conflict('That job has already started or finished.')
  await recordAudit(ctx.db, ctx, { action: 'job.cancelled', resource: 'job', resourceId: jobId })
}

export type MissedRun = { scheduleId: string; scheduleName: string; occurrenceAt: string; reason: string }

/**
 * Occurrences that were not run.
 *
 * Recorded rather than silently skipped: a schedule that quietly missed a
 * night is indistinguishable from one that ran and did nothing.
 */
export async function missedRuns(ctx: TenantContext, limit = 50): Promise<MissedRun[]> {
  ctx.require('job.read')
  const { rows } = await ctx.db.query<{ schedule_id: string; name: string; occurrence_at: Date; reason: string }>(
    `select m.schedule_id, s.name, m.occurrence_at, m.reason
       from missed_occurrences m
       join schedules s on s.id = m.schedule_id
      where s.tenant_id = $1 order by m.occurrence_at desc limit $2`,
    [ctx.tenantId, Math.min(limit, 200)],
  )
  return rows.map((row) => ({
    scheduleId: row.schedule_id,
    scheduleName: row.name,
    occurrenceAt: new Date(row.occurrence_at).toISOString(),
    reason: row.reason,
  }))
}
