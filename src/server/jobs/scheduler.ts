import type { Db } from '../db/client.ts'
import { nextOccurrence, occurrencesBetween } from './cron.ts'
import { enqueueJob } from './queue.ts'

/**
 * Turns schedule definitions into job rows.
 *
 * This is the piece the prototype never had: a schedule there was a row with a
 * toggle, and "run now" invented a result. Here, one dispatch pass computes the
 * occurrences that are actually due, creates exactly one job per occurrence,
 * and records the ones it could not reach in time instead of losing them.
 *
 * It is deliberately independent of where jobs execute (decision D1) — a local
 * worker, a Vercel function and a remote container all consume the same rows.
 */

export type DispatchSummary = {
  scheduled: number
  skipped: number
  missed: number
  errors: { scheduleId: string; message: string }[]
}

type ScheduleRow = {
  id: string
  tenant_id: string
  company_id: string | null
  kind: string
  target_ref: string | null
  payload: Record<string, unknown>
  cron: string
  timezone: string
  overlap_policy: 'skip' | 'queue' | 'allow'
  catchup_window_seconds: number
  last_run_at: Date | null
  next_run_at: Date | null
}

/**
 * Creates jobs for every due occurrence.
 *
 * Safe to run concurrently and safe to run often: the unique
 * (schedule, occurrence) index makes duplicate creation impossible, so two
 * dispatchers firing at the same second produce one job, not two.
 */
export async function dispatchDue(db: Db, now: Date, options: { limit?: number } = {}): Promise<DispatchSummary> {
  const summary: DispatchSummary = { scheduled: 0, skipped: 0, missed: 0, errors: [] }

  const { rows } = await db.query<ScheduleRow>(
    `select id, tenant_id, company_id, kind, target_ref, payload, cron, timezone,
            overlap_policy, catchup_window_seconds, last_run_at, next_run_at
       from schedules
      where active
        and (next_run_at is null or next_run_at <= $1)
      order by coalesce(next_run_at, $1)
      limit $2`,
    [now, options.limit ?? 100],
  )

  for (const schedule of rows) {
    try {
      /*
       * Only catch up as far back as the schedule allows. A dispatcher that was
       * down for a day must not fire 24 hourly runs at once; the rest are
       * recorded as missed so the gap is visible rather than silent.
       */
      const windowStart = new Date(now.getTime() - schedule.catchup_window_seconds * 1000)
      const from = schedule.next_run_at ?? schedule.last_run_at ?? windowStart
      const effectiveFrom = from.getTime() < windowStart.getTime() ? windowStart : from

      /*
       * `next_run_at` names an occurrence that is itself due, but occurrence
       * search is strictly-after. Without this the run stored as "next" is
       * always skipped and the schedule silently advances past every fire —
       * which is exactly what the test caught.
       */
      const searchFrom = new Date(effectiveFrom.getTime() - 1)

      if (from.getTime() < windowStart.getTime()) {
        const lost = occurrencesBetween(schedule.cron, schedule.timezone, new Date(from.getTime() - 1), windowStart, 500)
        for (const occurrence of lost) {
          await db.query(
            `insert into missed_occurrences (schedule_id, occurrence_at, reason) values ($1, $2, $3)
             on conflict (schedule_id, occurrence_at) do nothing`,
            [schedule.id, occurrence, 'Outside the catch-up window when the dispatcher next ran.'],
          )
          summary.missed += 1
        }
      }

      const due = occurrencesBetween(schedule.cron, schedule.timezone, searchFrom, now, 50)

      for (const occurrence of due) {
        if (schedule.overlap_policy !== 'allow') {
          const { rows: running } = await db.query<{ id: string }>(
            `select id from jobs where schedule_id = $1 and status in ('queued', 'running') limit 1`,
            [schedule.id],
          )
          if (running.length) {
            if (schedule.overlap_policy === 'skip') {
              await db.query(
                `insert into missed_occurrences (schedule_id, occurrence_at, reason) values ($1, $2, $3)
                 on conflict (schedule_id, occurrence_at) do nothing`,
                [schedule.id, occurrence, 'Previous run still in progress and overlap policy is skip.'],
              )
              summary.skipped += 1
              continue
            }
            // 'queue' falls through: the job is created and waits its turn.
          }
        }

        const id = await enqueueJob(db, {
          tenantId: schedule.tenant_id,
          companyId: schedule.company_id,
          scheduleId: schedule.id,
          kind: schedule.kind,
          payload: { ...schedule.payload, targetRef: schedule.target_ref, occurrenceAt: occurrence.toISOString() },
          occurrenceAt: occurrence,
        }, now)
        if (id) summary.scheduled += 1
      }

      const upcoming = nextOccurrence(schedule.cron, schedule.timezone, now)
      await db.query('update schedules set next_run_at = $2, last_run_at = coalesce($3, last_run_at), updated_at = $4 where id = $1', [
        schedule.id,
        upcoming,
        due.length ? due[due.length - 1] : null,
        now,
      ])
    } catch (error) {
      // One bad cron expression must not stop every other tenant's schedules.
      summary.errors.push({ scheduleId: schedule.id, message: error instanceof Error ? error.message : String(error) })
      await db.query('update schedules set last_status = $2, updated_at = $3 where id = $1', [
        schedule.id,
        `error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200),
        now,
      ])
    }
  }

  return summary
}

/** Recomputes `next_run_at` after a schedule is created or edited. */
export async function refreshNextRun(db: Db, scheduleId: string, now: Date): Promise<Date | null> {
  const { rows } = await db.query<{ cron: string; timezone: string; active: boolean }>(
    'select cron, timezone, active from schedules where id = $1',
    [scheduleId],
  )
  const schedule = rows[0]
  if (!schedule) return null
  const next = schedule.active ? nextOccurrence(schedule.cron, schedule.timezone, now) : null
  await db.query('update schedules set next_run_at = $2, updated_at = $3 where id = $1', [scheduleId, next, now])
  return next
}
