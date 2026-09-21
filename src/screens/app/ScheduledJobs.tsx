'use client'

import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'
import { type ScheduleKind, useWorkspace } from '../../lib/workspace'

const typeOptions: readonly ('All types' | ScheduleKind)[] = ['All types', 'Agent', 'Pipeline', 'Bot', 'Canvas Workflow']
const statusOptions = ['All status', 'Active', 'Paused'] as const

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
 * The schedules card. Shared by `/app/scheduled-jobs` (Run & Review) and
 * `/app/admin/scheduled-jobs` (Administer) — the live product shows the same
 * counter, search and filters on both, and only the admin page can create.
 */
export function SchedulesCard() {
  const { schedules, toggleSchedule, removeSchedule, recordRun } = useWorkspace()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<string>('All types')
  const [status, setStatus] = useState<string>('All status')

  const activeCount = schedules.filter((job) => job.active).length

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return schedules.filter((job) => {
      if (type !== 'All types' && job.kind !== type) return false
      if (status === 'Active' && !job.active) return false
      if (status === 'Paused' && job.active) return false
      if (!needle) return true
      return `${job.name} ${job.target}`.toLowerCase().includes(needle)
    })
  }, [schedules, query, type, status])

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <p className="flex items-center gap-2 text-[13px] text-fg-2">
          <Icon name="calendar-clock" size={16} className="text-accent" />
          <span>
            {activeCount} active · {schedules.length} total
          </span>
        </p>
        <div className="relative ml-auto min-w-[14rem] flex-1">
          <span aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted">
            ⌕
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, target, tenant..."
            aria-label="Search name, target, tenant..."
            className="w-full rounded-xl border border-line bg-surface py-2 pr-3 pl-8 text-[13px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </div>
        <FilterSelect label="Filter by type" value={type} options={typeOptions} onChange={setType} />
        <FilterSelect label="Filter by status" value={status} options={statusOptions} onChange={setStatus} />
      </div>

      {visible.length ? (
        <ul className="divide-y divide-line">
          {visible.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="min-w-[14rem] flex-1">
                <p className="text-[14px] font-medium">{job.name}</p>
                <p className="mt-0.5 text-[12px] text-fg-muted">
                  {job.kind} · {job.target} · {job.cadence} · next {job.nextRun}
                </p>
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
                onClick={() => recordRun({ agent: job.name, source: 'Scheduled Jobs' })}
              >
                Run now
              </Button>
              <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => toggleSchedule(job.id)}>
                {job.active ? 'Pause' : 'Resume'}
              </Button>
              <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => removeSchedule(job.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-14 text-center text-[13px] text-fg-muted">
          {schedules.length ? 'No jobs match these filters.' : 'No scheduled jobs. Nothing is running on a timer.'}
        </p>
      )}
    </section>
  )
}

/** `/app/scheduled-jobs` — the Run & Review view, which cannot create schedules. */
export function ScheduledJobs() {
  return (
    <div className="mx-auto max-w-5xl pt-2">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">Scheduled Jobs</h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          Agents, workflows, and bots that run on a timer in your workspace. Pause anything you want to stop.
        </p>
      </header>

      <div className="mt-6">
        <SchedulesCard />
      </div>
    </div>
  )
}
