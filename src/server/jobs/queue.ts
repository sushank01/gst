import type { Db } from '../db/client.ts'

/**
 * Durable job queue.
 *
 * Four properties the prototype's "run now" button did not have:
 *   * **exactly one occurrence** — a unique index on (schedule, occurrence)
 *     means two dispatchers racing cannot both create the same run
 *   * **leases** — a worker that dies releases its work by timeout instead of
 *     stranding it as permanently "running"
 *   * **fencing** — every claim bumps a token, so a result arriving late from a
 *     worker everyone gave up on is rejected rather than overwriting a newer one
 *   * **bounded retries** — exponential backoff to a dead-letter state, never
 *     an infinite loop
 *
 * None of this depends on where the work executes, so it is all testable today
 * against a local worker while decision D1 is open.
 */

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'dead'

export type EnqueueJob = {
  tenantId?: string | null
  companyId?: string | null
  scheduleId?: string | null
  kind: string
  payload?: Record<string, unknown>
  occurrenceAt?: Date | null
  availableAt?: Date
  maxAttempts?: number
}

export type ClaimedJob = {
  id: string
  tenantId: string | null
  kind: string
  payload: Record<string, unknown>
  attempts: number
  maxAttempts: number
  fence: string
  checkpoint: Record<string, unknown> | null
}

/**
 * Returns the job id, or null when this occurrence already exists.
 *
 * Null is the normal, expected answer for a duplicate — the caller has nothing
 * to do, which is exactly what "already scheduled" should feel like.
 */
export async function enqueueJob(db: Db, job: EnqueueJob, now: Date): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `insert into jobs (tenant_id, company_id, schedule_id, kind, payload, occurrence_at, available_at, max_attempts)
     values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, 3))
     on conflict (schedule_id, occurrence_at) where schedule_id is not null and occurrence_at is not null
     do nothing
     returning id`,
    [
      job.tenantId ?? null,
      job.companyId ?? null,
      job.scheduleId ?? null,
      job.kind,
      JSON.stringify(job.payload ?? {}),
      job.occurrenceAt ?? null,
      job.availableAt ?? now,
      job.maxAttempts ?? null,
    ],
  )
  return rows[0]?.id ?? null
}

/**
 * Claims due jobs for one worker.
 *
 * `for update skip locked` lets many dispatchers run concurrently: each takes a
 * disjoint set without blocking on the others.
 */
export async function claimJobs(
  db: Db,
  worker: string,
  now: Date,
  options: { limit?: number; leaseMs?: number; kinds?: string[] } = {},
): Promise<ClaimedJob[]> {
  const { limit = 5, leaseMs = 60_000, kinds } = options
  const { rows } = await db.query<{
    id: string
    tenant_id: string | null
    kind: string
    payload: Record<string, unknown>
    attempts: number
    max_attempts: number
    fence: string
    checkpoint: Record<string, unknown> | null
  }>(
    `update jobs
        set status = 'running',
            locked_by = $1,
            locked_until = $2,
            attempts = attempts + 1,
            fence = fence + 1,
            started_at = coalesce(started_at, $3)
      where id in (
        select id from jobs
         where status in ('queued', 'running')
           and available_at <= $3
           and (locked_until is null or locked_until < $3)
           and ($5::text[] is null or kind = any($5))
         order by available_at
         limit $4
         for update skip locked
      )
      returning id, tenant_id, kind, payload, attempts, max_attempts, fence::text as fence, checkpoint`,
    [worker, new Date(now.getTime() + leaseMs), now, limit, kinds ?? null],
  )
  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    kind: row.kind,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    fence: row.fence,
    checkpoint: row.checkpoint,
  }))
}

/** Extends a lease for a step that is legitimately still working. */
export async function heartbeat(db: Db, jobId: string, fence: string, now: Date, leaseMs = 60_000): Promise<boolean> {
  const { rowCount } = await db.query(
    `update jobs set locked_until = $3 where id = $1 and fence = $2::bigint and status = 'running'`,
    [jobId, fence, new Date(now.getTime() + leaseMs)],
  )
  return rowCount > 0
}

/** Records partial progress so a bounded step can resume rather than restart. */
export async function checkpointJob(
  db: Db,
  jobId: string,
  fence: string,
  checkpoint: Record<string, unknown>,
  progress: number,
  now: Date,
  leaseMs = 60_000,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `update jobs
        set checkpoint = $3, progress = least(100, greatest(0, $4)), locked_until = $5
      where id = $1 and fence = $2::bigint and status = 'running'`,
    [jobId, fence, JSON.stringify(checkpoint), Math.round(progress), new Date(now.getTime() + leaseMs)],
  )
  return rowCount > 0
}

/**
 * All completion paths check the fence. A worker whose lease expired and was
 * re-claimed by another worker will find its update affects zero rows, which is
 * exactly the protection against a late result clobbering a newer attempt.
 */
export async function completeJob(
  db: Db,
  jobId: string,
  fence: string,
  result: Record<string, unknown>,
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const { rowCount } = await tx.query(
      `update jobs
          set status = 'succeeded', result = $3, finished_at = $4, progress = 100,
              locked_by = null, locked_until = null, last_error = null
        where id = $1 and fence = $2::bigint and status = 'running'`,
      [jobId, fence, JSON.stringify(result), now],
    )
    if (rowCount === 0) return false
    await writeRun(tx, jobId, fence, 'succeeded', now, null)
    return true
  })
}

export async function failJob(
  db: Db,
  job: { id: string; fence: string; attempts: number; maxAttempts: number },
  error: string,
  now: Date,
): Promise<'retry' | 'dead' | 'stale'> {
  const exhausted = job.attempts >= job.maxAttempts
  // Backoff is capped so a permanently broken job does not drift to a retry
  // interval measured in days before it dead-letters.
  const backoffMs = Math.min(2 ** job.attempts * 1000, 15 * 60 * 1000)
  return db.transaction(async (tx) => {
    const { rowCount } = await tx.query(
      `update jobs
          set status = $3, last_error = $4, available_at = $5, finished_at = $6,
              locked_by = null, locked_until = null
        where id = $1 and fence = $2::bigint and status = 'running'`,
      [
        job.id,
        job.fence,
        exhausted ? 'dead' : 'queued',
        error.slice(0, 2000),
        new Date(now.getTime() + backoffMs),
        exhausted ? now : null,
      ],
    )
    if (rowCount === 0) return 'stale'
    await writeRun(tx, job.id, job.fence, 'failed', now, error.slice(0, 2000))
    return exhausted ? 'dead' : 'retry'
  })
}

async function writeRun(db: Db, jobId: string, fence: string, status: string, now: Date, error: string | null) {
  await db.query(
    `insert into job_runs (job_id, attempt, fence, status, started_at, finished_at, error)
     select $1, attempts, $2::bigint, $3, coalesce(started_at, $4), $4, $5 from jobs where id = $1`,
    [jobId, fence, status, now, error],
  )
}

/**
 * Returns jobs whose lease expired while running — a worker crashed, was
 * redeployed, or lost the network. They go back to the queue rather than
 * sitting as "running" forever.
 */
export async function reapStuckJobs(db: Db, now: Date): Promise<number> {
  const { rowCount } = await db.query(
    `update jobs
        set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
            last_error = coalesce(last_error, 'Worker lease expired before the job reported back.'),
            locked_by = null, locked_until = null
      where status = 'running' and locked_until is not null and locked_until < $1`,
    [now],
  )
  return rowCount
}

export async function cancelJob(db: Db, jobId: string, now: Date): Promise<boolean> {
  const { rowCount } = await db.query(
    `update jobs set status = 'cancelled', finished_at = $2, locked_by = null, locked_until = null
      where id = $1 and status in ('queued', 'running')`,
    [jobId, now],
  )
  return rowCount > 0
}
