'use client'

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'
import {
  describeCron,
  formatInstant,
  useJobAttempts,
  useMissedRuns,
  useServerJobs,
  useServerSchedules,
  type Job,
  type Schedule,
  type SchedulesHandle,
} from './useSchedules'

const statusOptions = ['All status', 'Active', 'Paused'] as const
/** The job statuses the database itself allows, plus the unfiltered view. */
const jobStatusOptions = ['All jobs', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'dead'] as const

/**
 * What nothing on this deployment does yet.
 *
 * Said on the card rather than left to be discovered: a schedule whose next run
 * is displayed to the minute, on a deployment with no dispatcher, otherwise
 * reads as a promise that it will fire.
 */
const NOT_DISPATCHED =
  'Schedules are stored and their occurrences are computed on the server, but nothing on this deployment dispatches them yet — a queued job stays queued until an execution platform is configured.'

/** A borderless native select styled to match the live schedules toolbar. */
function FilterSelect({
  value,
  options,
  onChange,
  label,
}: {
  value: string
  options: readonly string[]
  onChange: (next: string) => void
  label: string
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-xl border border-line bg-surface py-2 pr-8 pl-3.5 text-[13px] text-fg-2 transition hover:bg-surface-2 focus:border-accent focus:outline-none"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}

/**
 * When this schedule next runs.
 *
 * Read from the occurrences the server computes at request time, not from the
 * stored `nextRunAt`: only a dispatcher advances that column, and nothing on
 * this deployment dispatches, so the stored value drifts into the past while
 * the computed occurrences stay true. A stored instant already behind us is
 * said plainly rather than shown as the next run.
 */
function nextLine(job: Schedule): string {
  if (!job.active) return 'Paused — no next occurrence is scheduled.'
  if (!job.upcoming.length) return 'The next occurrence could not be computed for this expression.'

  const [next, ...rest] = job.upcoming
  const then = rest.length
    ? `, then ${rest.map((instant) => formatInstant(instant, job.timezone)).join(', ')}`
    : ''
  const overdue = job.nextRunAt !== null && new Date(job.nextRunAt).getTime() < Date.now()
  return `Next ${formatInstant(next, job.timezone)}${then}${
    overdue ? ' · an earlier occurrence fell due and was not dispatched' : ''
  }`
}

/**
 * The schedules card. Shared by `/app/scheduled-jobs` (Run & Review) and
 * `/app/admin/scheduled-jobs` (Administer) — the live product shows the same
 * counter, search and filters on both, and only the admin page can create.
 *
 * Searching and filtering stay in the browser because the server returns every
 * schedule for the workspace in one unpaged answer; the counter therefore
 * describes the whole set rather than a loaded page.
 *
 * The handle is a prop rather than a hook call so the admin page's create
 * dialog and this list are the same instance — otherwise a new schedule would
 * not appear until a reload.
 */
export function SchedulesCard({
  schedules,
  onQueued,
}: {
  schedules: SchedulesHandle
  /** Called when "Run now" actually created a job, so a queue shown beside this card can re-read. */
  onQueued?: () => void
}) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('All types')
  const [status, setStatus] = useState<string>('All status')
  const [ran, setRan] = useState<{ id: string; text: string } | null>(null)

  const rows = schedules.schedules
  const activeCount = rows.filter((job) => job.active).length

  // Built from the kinds actually returned. The prototype offered a fixed
  // four-value enum, three of whose options no row could ever match.
  const kindOptions = useMemo(
    () => ['All types', ...[...new Set(rows.map((job) => job.kind))].sort((a, b) => a.localeCompare(b))],
    [rows],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((job) => {
      if (kind !== 'All types' && job.kind !== kind) return false
      if (status === 'Active' && !job.active) return false
      if (status === 'Paused' && job.active) return false
      if (!needle) return true
      return `${job.name} ${job.targetRef ?? ''}`.toLowerCase().includes(needle)
    })
  }, [rows, query, kind, status])

  const counter = schedules.loading
    ? 'Loading schedules…'
    : schedules.error
      ? 'Schedule count unavailable'
      : schedules.refreshing
        ? 'Updating…'
        : `${activeCount} active · ${rows.length} total`

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <p className="flex items-center gap-2 text-[13px] text-fg-2">
          <Icon name="calendar-clock" size={16} className="text-accent" />
          <span aria-live="polite">{counter}</span>
        </p>
        <div className="relative ml-auto min-w-[14rem] flex-1">
          <span aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted">
            ⌕
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or target..."
            aria-label="Search name or target..."
            className="w-full rounded-xl border border-line bg-surface py-2 pr-3 pl-8 text-[13px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </div>
        <FilterSelect label="Filter by type" value={kind} options={kindOptions} onChange={setKind} />
        <FilterSelect label="Filter by status" value={status} options={statusOptions} onChange={setStatus} />
      </div>

      {schedules.refusal && (
        <p role="alert" className="border-b border-line bg-bad-muted/30 px-5 py-3 text-[13px] text-bad">
          {schedules.refusal}
        </p>
      )}

      {schedules.loading ? (
        <p role="status" className="px-5 py-14 text-center text-[13px] text-fg-muted">
          Loading schedules…
        </p>
      ) : schedules.error ? (
        /* A failed request is never drawn as an empty list — that is how "the
           server is down" becomes "nothing is running on a timer". */
        <div role="alert" className="px-5 py-12 text-center">
          <p className="text-[14px] font-medium text-fg">
            {schedules.denied
              ? 'You do not have access to scheduled jobs in this workspace.'
              : 'We could not load your scheduled jobs.'}
          </p>
          <p className="mt-1.5 text-[13px] text-fg-muted">{schedules.error.message}</p>
          {schedules.canRetry && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" className="!py-2 !text-[13px]" onClick={schedules.refetch}>
                Try again
              </Button>
            </div>
          )}
          {schedules.error.requestId && (
            <p className="mt-3 font-mono text-[11px] text-fg-muted">Reference {schedules.error.requestId}</p>
          )}
        </div>
      ) : visible.length ? (
        <ul className="divide-y divide-line">
          {visible.map((job) => {
            const busy = schedules.pendingId === job.id
            return (
              <li key={job.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-[14rem] flex-1">
                  <p className="text-[14px] font-medium">{job.name}</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">
                    {job.kind}
                    {job.targetRef ? ` · ${job.targetRef}` : ''} · {describeCron(job.cron) ?? job.cron} ·{' '}
                    {job.timezone}
                  </p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">{nextLine(job)}</p>
                </div>
                <span
                  className={`rounded-lg px-2.5 py-1 text-[12px] font-medium ${
                    job.active ? 'bg-ok-muted text-ok' : 'bg-surface-2 text-fg-muted'
                  }`}
                >
                  {job.active ? 'Active' : 'Paused'}
                </span>
                <Button
                  variant="secondary"
                  className="!py-2 !text-[13px]"
                  disabled={busy}
                  onClick={async () => {
                    setRan(null)
                    const outcome = await schedules.runNow(job.id)
                    if (!outcome) return
                    // A job the reader is being told about must not be missing
                    // from the queue listed below it.
                    if (outcome.jobId) onQueued?.()
                    setRan({
                      id: job.id,
                      text: outcome.jobId
                        ? `Queued as job ${outcome.jobId.slice(0, 8)}. It will not start until an execution platform is configured.`
                        : 'That instant was already queued — no second job was created.',
                    })
                  }}
                >
                  Run now
                </Button>
                <Button
                  variant="secondary"
                  className="!py-2 !text-[13px]"
                  disabled={busy}
                  onClick={() => void schedules.setActive(job.id, !job.active)}
                >
                  {job.active ? 'Pause' : 'Resume'}
                </Button>
                <Button
                  variant="secondary"
                  className="!py-2 !text-[13px]"
                  disabled={busy}
                  onClick={() => void schedules.removeSchedule(job.id)}
                >
                  Remove
                </Button>
                {ran?.id === job.id && <p className="w-full text-[12px] text-fg-muted">{ran.text}</p>}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-5 py-14 text-center text-[13px] text-fg-muted">
          {rows.length ? 'No jobs match these filters.' : 'No scheduled jobs. Nothing is running on a timer.'}
        </p>
      )}

      <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-[12px] text-fg-muted">
        <Icon name="alert-triangle" size={14} className="mt-0.5 shrink-0" />
        <span>{NOT_DISPATCHED} Run now enqueues a real job rather than reporting one that did not happen.</span>
      </p>
    </section>
  )
}

/** The attempts behind one job, fetched only while its row is open. */
function JobAttempts({ jobId }: { jobId: string }) {
  const attempts = useJobAttempts(jobId)

  if (attempts.loading) {
    return (
      <p role="status" className="px-5 py-4 text-[12px] text-fg-muted">
        Loading attempts…
      </p>
    )
  }
  if (attempts.error) {
    return (
      <div role="alert" className="px-5 py-4 text-[12px]">
        <p className="text-bad">
          {attempts.denied ? 'You do not have access to this job.' : attempts.error.message}
        </p>
        {attempts.canRetry && (
          <button onClick={attempts.refetch} className="mt-2 text-accent underline">
            Try again
          </button>
        )}
      </div>
    )
  }

  const rows = attempts.data?.attempts ?? []
  if (!rows.length) {
    return (
      <p className="px-5 py-4 text-[12px] text-fg-muted">
        No attempts recorded — no worker has picked this job up.
      </p>
    )
  }

  return (
    <ol className="divide-y divide-line">
      {rows.map((attempt) => (
        <li key={attempt.attempt} className="flex flex-wrap items-start gap-3 px-5 py-3 text-[12px]">
          <span className="font-medium">Attempt {attempt.attempt}</span>
          <span className="text-fg-muted">{attempt.status}</span>
          <span className="text-fg-muted">
            started {formatInstant(attempt.startedAt)}
            {attempt.finishedAt ? ` · finished ${formatInstant(attempt.finishedAt)}` : ' · not finished'}
          </span>
          {attempt.error && <span className="w-full text-bad">{attempt.error}</span>}
        </li>
      ))}
    </ol>
  )
}

/** How long one job took, or nothing at all when it has not both started and finished. */
function duration(job: Job): string | null {
  if (!job.startedAt || !job.finishedAt) return null
  const ms = new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
  return `${(ms / 1000).toFixed(1)}s`
}

const PAGE_SIZE = 25

/**
 * The queue behind the schedules.
 *
 * Its total is the server's count for the filter, not the length of the loaded
 * page, so the number beside the list keeps meaning something past page one.
 */
function JobsCard({ queuedToken = 0 }: { queuedToken?: number }) {
  const [status, setStatus] = useState<string>('All jobs')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const jobs = useServerJobs({ status: status === 'All jobs' ? 'All' : status, limit: PAGE_SIZE, offset: page * PAGE_SIZE })

  const { refetch } = jobs
  useEffect(() => {
    // A run requested above enqueued a job. Without this the card keeps the
    // answer it fetched before that, so the page says "Queued as job 4f2c…"
    // directly over a list that says there are no jobs.
    if (queuedToken) refetch()
  }, [queuedToken, refetch])

  const pageCount = Math.max(1, Math.ceil(jobs.total / PAGE_SIZE))
  const counter = jobs.loading
    ? 'Loading jobs…'
    : jobs.error
      ? 'Job count unavailable'
      : jobs.refreshing
        ? 'Updating…'
        : `${jobs.total} job${jobs.total === 1 ? '' : 's'}`

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <p className="flex items-center gap-2 text-[13px] text-fg-2">
          <Icon name="clock" size={16} className="text-accent" />
          <span aria-live="polite">{counter}</span>
        </p>
        <div className="ml-auto">
          <FilterSelect
            label="Filter jobs by status"
            value={status}
            options={jobStatusOptions}
            onChange={(next) => {
              setStatus(next)
              // A new filter must start at page one, or the list looks empty.
              setPage(0)
            }}
          />
        </div>
      </div>

      {jobs.cancelError && (
        <p role="alert" className="border-b border-line bg-bad-muted/30 px-5 py-3 text-[13px] text-bad">
          {jobs.cancelError.message}
        </p>
      )}

      {jobs.loading ? (
        <p role="status" className="px-5 py-14 text-center text-[13px] text-fg-muted">
          Loading jobs…
        </p>
      ) : jobs.error ? (
        <div role="alert" className="px-5 py-12 text-center">
          <p className="text-[14px] font-medium text-fg">
            {jobs.denied ? 'You do not have access to jobs in this workspace.' : 'We could not load the job queue.'}
          </p>
          <p className="mt-1.5 text-[13px] text-fg-muted">{jobs.error.message}</p>
          {jobs.canRetry && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" className="!py-2 !text-[13px]" onClick={jobs.refetch}>
                Try again
              </Button>
            </div>
          )}
        </div>
      ) : jobs.jobs.length ? (
        <ul className="divide-y divide-line">
          {jobs.jobs.map((job) => {
            const open = openId === job.id
            const took = duration(job)
            return (
              <li key={job.id}>
                <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <button
                    onClick={() => setOpenId(open ? null : job.id)}
                    aria-expanded={open}
                    className="min-w-[14rem] flex-1 text-left"
                  >
                    <p className="text-[14px] font-medium">{job.kind}</p>
                    <p className="mt-0.5 text-[12px] text-fg-muted">
                      {job.scheduleName ?? 'Not from a schedule'} · queued {formatInstant(job.createdAt)} ·{' '}
                      {job.attempts} of {job.maxAttempts} attempt{job.maxAttempts === 1 ? '' : 's'}
                      {took ? ` · ${took}` : ''}
                    </p>
                    {job.lastError && <p className="mt-0.5 text-[12px] text-bad">{job.lastError}</p>}
                  </button>
                  <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-fg-2">
                    {job.status}
                  </span>
                  {job.status === 'queued' && (
                    <Button
                      variant="secondary"
                      className="!py-2 !text-[13px]"
                      disabled={jobs.cancelling}
                      onClick={() => void jobs.cancelJob(job.id)}
                    >
                      Cancel
                    </Button>
                  )}
                  {/* A second handle on the same toggle, hidden from assistive
                      technology because the row's own button already announces it. */}
                  <button
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setOpenId(open ? null : job.id)}
                    className="text-[12px] text-fg-muted"
                  >
                    {open ? '▲' : '▼'}
                  </button>
                </div>
                {open && (
                  <div className="border-t border-line bg-bg">
                    <JobAttempts jobId={job.id} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-5 py-14 text-center text-[13px] text-fg-muted">
          {/* The queue can shrink under a reader who is past page one — a
              cancelled job leaves its filter. Saying "no jobs" then would be
              false: the server has just counted some. */}
          {jobs.total > 0 && page > 0
            ? 'This page is past the end of the list — the queue changed while you were reading it.'
            : status === 'All jobs'
              ? 'No jobs yet. Run a schedule to queue one.'
              : `No ${status} jobs.`}
        </p>
      )}

      {jobs.total > PAGE_SIZE && (
        <nav aria-label="Job pagination" className="flex items-center justify-end gap-3 border-t border-line px-5 py-3 text-[13px]">
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="rounded-xl border border-line px-3 py-1.5 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-fg-muted">
            Page {page + 1} of {pageCount}
          </span>
          <button
            disabled={page + 1 >= pageCount}
            onClick={() => setPage(page + 1)}
            className="rounded-xl border border-line px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}
    </section>
  )
}

/**
 * Occurrences that were recorded as missed.
 *
 * Only a dispatcher writes this record, when it comes back up and finds work
 * whose moment has passed. Nothing on this deployment dispatches, so the record
 * stays empty — and an empty list here means "nothing has been recorded", NOT
 * "nothing has been missed". The second reading is the false one, and on this
 * deployment it is exactly backwards, so the empty state says which it is.
 */
function MissedRunsCard() {
  const missed = useMissedRuns()
  const rows = missed.data?.missed ?? []

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <p className="flex items-center gap-2 border-b border-line px-5 py-4 text-[13px] text-fg-2">
        <Icon name="alert-triangle" size={16} className="text-accent" />
        Missed occurrences
      </p>

      {missed.loading ? (
        <p role="status" className="px-5 py-8 text-center text-[13px] text-fg-muted">
          Loading missed occurrences…
        </p>
      ) : missed.error ? (
        <div role="alert" className="px-5 py-8 text-center">
          <p className="text-[13px] text-bad">
            {missed.denied
              ? 'You do not have access to scheduled jobs in this workspace.'
              : missed.error.message}
          </p>
          {missed.canRetry && (
            <button onClick={missed.refetch} className="mt-2 text-[13px] text-accent underline">
              Try again
            </button>
          )}
        </div>
      ) : rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={`${row.scheduleId}-${row.occurrenceAt}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
              <span className="font-medium">{row.scheduleName}</span>
              <span className="text-fg-muted">{formatInstant(row.occurrenceAt)}</span>
              <span className="text-fg-muted">{row.reason}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 py-8 text-center text-[13px] text-fg-muted">
          <p>Nothing has been recorded here.</p>
          <p className="mx-auto mt-1.5 max-w-lg text-[12px]">
            This record is written by a dispatcher that finds an occurrence whose moment has passed. Nothing on this
            deployment dispatches, so occurrences that fall due are not run and are not recorded as missed either —
            read this as &ldquo;no record&rdquo;, not as &ldquo;nothing was missed&rdquo;.
          </p>
        </div>
      )}
    </section>
  )
}

/** `/app/scheduled-jobs` — the Run & Review view, which cannot create schedules. */
export function ScheduledJobs() {
  const schedules = useServerSchedules()
  // Bumped when a manual run created a job, so the queue below re-reads rather
  // than contradicting the line that has just reported it.
  const [queuedToken, setQueuedToken] = useState(0)

  return (
    <div className="mx-auto max-w-5xl pt-2">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">Scheduled Jobs</h1>
        {/* Not "things that run on a timer": nothing here dispatches, which the
            card below says in full. A heading that promised it would undo that. */}
        <p className="mt-2 text-[15px] text-fg-muted">
          The schedules stored for your workspace, the occurrences the server computes for each one, and the jobs they
          have queued. Pause or remove anything.
        </p>
      </header>

      <div className="mt-6 space-y-6">
        <SchedulesCard schedules={schedules} onQueued={() => setQueuedToken((token) => token + 1)} />
        <JobsCard queuedToken={queuedToken} />
        <MissedRunsCard />
      </div>
    </div>
  )
}
