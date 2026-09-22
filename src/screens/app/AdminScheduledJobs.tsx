'use client'

import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'
import { marketApps } from '../../lib/appData'
import { useWorkspace } from '../../lib/workspace'
import { SchedulesCard } from './ScheduledJobs'

const cadences = ['Hourly', 'Daily', 'Weekly', 'Monthly'] as const
type Cadence = (typeof cadences)[number]

const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)

/** The cron the schedule compiles to, shown under the pickers as the live dialog does. */
function cron(cadence: Cadence, time: string) {
  const hour = Number(time.slice(0, 2))
  if (cadence === 'Hourly') return '0 * * * *'
  if (cadence === 'Daily') return `0 ${hour} * * *`
  if (cadence === 'Weekly') return `0 ${hour} * * 1`
  return `0 ${hour} 1 * *`
}

function describe(cadence: Cadence, time: string) {
  if (cadence === 'Hourly') return 'Every hour, on the hour'
  if (cadence === 'Daily') return `Every day at ${time}`
  if (cadence === 'Weekly') return `Every Monday at ${time}`
  return `The 1st of every month at ${time}`
}

/** The next time this schedule is due, from now, in the UTC. */
function nextRun(cadence: Cadence, time: string) {
  const hour = Number(time.slice(0, 2))
  const next = new Date()
  next.setUTCSeconds(0, 0)

  if (cadence === 'Hourly') {
    next.setUTCMinutes(0)
    next.setUTCHours(next.getUTCHours() + 1)
  } else {
    next.setUTCMinutes(0)
    next.setUTCHours(hour)
    if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1)
    if (cadence === 'Weekly') while (next.getUTCDay() !== 1) next.setUTCDate(next.getUTCDate() + 1)
    if (cadence === 'Monthly') while (next.getUTCDate() !== 1) next.setUTCDate(next.getUTCDate() + 1)
  }

  return next.toLocaleString('en-GB', { timeZone: 'UTC', timeZoneName: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function NewAutomation({ onClose }: { onClose: () => void }) {
  const { installed, addSchedule } = useWorkspace()
  const apps = marketApps.filter((app) => installed.includes(app.code))

  const [appCode, setAppCode] = useState('')
  const [agent, setAgent] = useState('')
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState<Cadence>('Daily')
  const [time, setTime] = useState('02:00')

  const app = apps.find((item) => item.code === appCode)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="flex items-center gap-2.5 text-[17px] font-semibold">
            <Icon name="calendar-clock" size={18} className="text-accent" />
            New Automation
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-fg-muted transition hover:text-fg">
            ✕
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="text-[13px] font-medium text-fg-2">
            Target app
            <select
              value={appCode}
              onChange={(event) => {
                setAppCode(event.target.value)
                setAgent('')
              }}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal text-fg focus:border-accent focus:outline-none"
            >
              <option value="">Select an app...</option>
              {apps.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[13px] font-medium text-fg-2">
            What to run
            <select
              value={agent}
              disabled={!app}
              onChange={(event) => setAgent(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal text-fg focus:border-accent focus:outline-none disabled:text-fg-muted"
            >
              <option value="">{app ? 'Select an agent...' : 'Pick an app first'}</option>
              {app?.agents.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[13px] font-medium text-fg-2">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Nightly allocation run"
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
          </label>

          <div className="text-[13px] font-medium text-fg-2">
            Schedule
            <div className="mt-1.5 flex flex-wrap gap-3">
              <select
                aria-label="Cadence"
                value={cadence}
                onChange={(event) => setCadence(event.target.value as Cadence)}
                className="rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal text-fg focus:border-accent focus:outline-none"
              >
                {cadences.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select
                aria-label="Time"
                value={time}
                disabled={cadence === 'Hourly'}
                onChange={(event) => setTime(event.target.value)}
                className="rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal text-fg focus:border-accent focus:outline-none disabled:text-fg-muted"
              >
                {hours.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-[12px] font-normal text-fg-muted">
              {describe(cadence, time)} · UTC · {cron(cadence, time)}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!app || !agent || !name.trim()}
            onClick={() => {
              addSchedule({
                name: name.trim(),
                kind: 'Agent',
                target: `${app?.name} · ${agent}`,
                cadence: cadence === 'Hourly' ? 'Hourly' : `${cadence} · ${time}`,
                nextRun: nextRun(cadence, time),
                active: true,
              })
              onClose()
            }}
          >
            Create automation
          </Button>
        </div>
      </div>
    </div>
  )
}

/** `/app/admin/scheduled-jobs` — the Administer view, which can create schedules. */
export default function AdminScheduledJobs() {
  const [open, setOpen] = useState(false)

  return (
    <div className="mx-auto max-w-5xl pt-2">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">Scheduled Jobs</h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          Your organisation&apos;s scheduled jobs — agent runs, workflows, bots and app automations. Pause, resume or
          re-time anything.
        </p>
      </header>

      <nav className="mt-6 border-b border-line">
        <span className="-mb-px inline-flex items-center gap-2 border-b-2 border-accent px-1 pb-3 text-[14px] font-medium text-accent">
          <Icon name="calendar-clock" size={16} />
          My Schedules
        </span>
      </nav>

      <div className="mt-5 flex justify-end">
        <Button variant="accent" onClick={() => setOpen(true)}>
          + New Automation
        </Button>
      </div>

      <div className="mt-4">
        <SchedulesCard />
      </div>

      {open && <NewAutomation onClose={() => setOpen(false)} />}
    </div>
  )
}
