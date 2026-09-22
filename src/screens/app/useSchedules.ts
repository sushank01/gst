'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { ApiClientError, api } from '../../lib/api.ts'
import { useMutation, useResource } from '../../lib/useResource.ts'

/**
 * Schedules, and the jobs they produce, from the server.
 *
 * The browser used to own all of this: a schedule was an object in one
 * localStorage key, its "next run" a string this file's predecessor computed in
 * UTC and then never recomputed, and "Run now" appended a finished, successful
 * run without starting anything. Three things change.
 *
 *  * The next run and the occurrences after it come from the server, computed
 *    in the schedule's own IANA zone. "Every day at 02:00" is a different
 *    instant in summer and winter, so a preview that assumes UTC is wrong twice
 *    a year — and a preview stored as text is wrong the moment it fires.
 *  * Running by hand enqueues a real job. A null `jobId` means that instant was
 *    already queued, reported as such rather than as a fresh run.
 *  * Every fetch state is represented, so a failed request cannot be mistaken
 *    for "nothing is scheduled".
 */

export type Schedule = {
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
  /** The next few occurrences in the schedule's zone, so a preview is checkable. */
  upcoming: string[]
}

export type NewSchedule = {
  name: string
  kind: string
  cron: string
  timezone: string
  targetRef?: string
}

export type Job = {
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

export type JobAttempt = {
  attempt: number
  status: string
  startedAt: string
  finishedAt: string | null
  error: string | null
}

export type MissedRun = { scheduleId: string; scheduleName: string; occurrenceAt: string; reason: string }

/** The outcome of one manual run, in the server's terms rather than a success line. */
export type RunOutcome = { jobId: string | null }

export function useServerSchedules() {
  const resource = useResource<{ schedules: Schedule[] }>(
    'schedules',
    useCallback((signal) => api.get<{ schedules: Schedule[] }>('/schedules', undefined, signal), []),
  )
  const { refetch } = resource

  /*
   * One refusal and one pending row, shared by the three row actions. Keeping a
   * separate error per action would let a stale one from a previous click stay
   * on screen beside the action that has just succeeded.
   */
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  // The guard is a ref, not state: a double click fires both handlers before
  // React re-renders, so a state flag would let the second one through.
  const inFlight = useRef(false)

  const act = useCallback(async <T>(id: string, run: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined
    inFlight.current = true
    setPendingId(id)
    setRefusal(null)
    try {
      return await run()
    } catch (error) {
      // A refusal is information: the role may not manage schedules, or the row
      // is gone. The wording is the server's, not a guess made here.
      setRefusal(error instanceof ApiClientError ? error.message : 'That could not be changed.')
      return undefined
    } finally {
      inFlight.current = false
      setPendingId(null)
    }
  }, [])

  const [createSchedule, createState] = useMutation(async (input: NewSchedule) => {
    const created = await api.post<{ schedule: Schedule }>('/schedules', input)
    refetch()
    return created.schedule
  })

  const setActive = useCallback(
    (id: string, active: boolean) =>
      act(id, async () => {
        await api.patch<{ schedule: Schedule }>(`/schedules/${id}`, { active })
        refetch()
      }),
    [act, refetch],
  )

  const removeSchedule = useCallback(
    (id: string) =>
      act(id, async () => {
        await api.delete(`/schedules/${id}`)
        refetch()
      }),
    [act, refetch],
  )

  const runNow = useCallback(
    (id: string) =>
      act(id, async () => {
        const outcome = await api.post<RunOutcome>(`/schedules/${id}/run`)
        /*
         * Nothing on the schedule row itself changes here — the last run and
         * its status are the dispatcher's to write, and a manual run only adds
         * to the queue. The list is still re-read so a row somebody else paused
         * or removed meanwhile does not linger beside the outcome.
         */
        refetch()
        return outcome
      }),
    [act, refetch],
  )

  return useMemo(
    () => ({
      schedules: resource.data?.schedules ?? [],
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      createSchedule,
      setActive,
      removeSchedule,
      runNow,
      /** The row currently being written, so only that row shows it. */
      pendingId,
      /** The last refusal from a row action, in the server's words. */
      refusal,
      creating: createState.pending,
      createError: createState.error,
      createFieldErrors: createState.fieldErrors,
    }),
    [resource, refetch, createSchedule, setActive, removeSchedule, runNow, pendingId, refusal, createState],
  )
}

/** The whole schedules surface, so a page can share one instance with a dialog. */
export type SchedulesHandle = ReturnType<typeof useServerSchedules>

export type JobFilters = { status: string; limit: number; offset: number }

export function useServerJobs(filters: JobFilters) {
  const key = JSON.stringify(filters)
  const resource = useResource<{ jobs: Job[]; total: number }>(
    `jobs:${key}`,
    useCallback(
      (signal) =>
        api.get<{ jobs: Job[]; total: number }>(
          '/jobs',
          {
            status: filters.status !== 'All' ? filters.status : undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
          signal,
        ),
      [filters.status, filters.limit, filters.offset],
    ),
  )
  const { refetch } = resource

  const [cancelJob, cancelState] = useMutation(async (id: string) => {
    await api.post(`/jobs/${id}/cancel`)
    refetch()
  })

  return useMemo(
    () => ({
      jobs: resource.data?.jobs ?? [],
      /** Jobs matching the filter on the server, not the length of this page. */
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      cancelJob,
      cancelling: cancelState.pending,
      cancelError: cancelState.error,
    }),
    [resource, refetch, cancelJob, cancelState],
  )
}

/** One job's attempts, fetched only while its row is open. */
export function useJobAttempts(jobId: string | null) {
  return useResource<{ attempts: JobAttempt[] }>(
    `job-attempts:${jobId ?? 'none'}`,
    useCallback(
      (signal) => api.get<{ attempts: JobAttempt[] }>(`/jobs/${jobId ?? ''}/attempts`, undefined, signal),
      [jobId],
    ),
    { enabled: Boolean(jobId) },
  )
}

/**
 * Occurrences that were not run, and why.
 *
 * A schedule that quietly missed a night is otherwise indistinguishable from
 * one that ran and did nothing.
 */
export function useMissedRuns() {
  return useResource<{ missed: MissedRun[] }>(
    'schedules-missed',
    useCallback((signal) => api.get<{ missed: MissedRun[] }>('/schedules/missed', undefined, signal), []),
  )
}

/**
 * An instant, shown in the zone it means something in.
 *
 * Falls back to the raw ISO string rather than inventing a time, because a
 * zone this browser's Intl does not know is not a zone we may guess at.
 */
export function formatInstant(iso: string, timezone?: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: timezone,
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    })
  } catch {
    return iso
  }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const isPlain = (field: string) => /^\d+$/.test(field)

/**
 * The cron expression in words, or null when it cannot be said exactly.
 *
 * Only the shapes this reads with certainty get a sentence; a list, range or
 * step falls through to null and the caller shows the expression itself. A
 * humanised cadence that is subtly wrong about when something runs is worse
 * than five fields the reader can check.
 */
export function describeCron(cron: string): string | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
  if (!isPlain(minute) || month !== '*') return null

  const at = hour === '*' ? null : `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`

  if (hour === '*' && dayOfMonth === '*' && dayOfWeek === '*') {
    return minute === '0' ? 'Every hour, on the hour' : `Every hour at ${minute.padStart(2, '0')} past`
  }
  if (!at || !isPlain(hour)) return null
  if (dayOfMonth === '*' && dayOfWeek === '*') return `Every day at ${at}`
  if (dayOfMonth === '*' && isPlain(dayOfWeek)) {
    const day = WEEKDAYS[Number(dayOfWeek) % 7]
    return day ? `Every ${day} at ${at}` : null
  }
  if (dayOfWeek === '*' && isPlain(dayOfMonth)) return `Day ${Number(dayOfMonth)} of every month at ${at}`
  return null
}
