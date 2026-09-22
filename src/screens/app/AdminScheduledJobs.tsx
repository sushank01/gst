'use client'

import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'
import { marketApps } from '../../lib/appData'
import { useInstallations } from '../../lib/useInstallations'
import { SchedulesCard } from './ScheduledJobs'
import { describeCron, useServerSchedules, type SchedulesHandle } from './useSchedules'

const cadences = ['Hourly', 'Daily', 'Weekly', 'Monthly'] as const
type Cadence = (typeof cadences)[number]

const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)

/**
 * The handler key the schedule is stored under.
 *
 * `kind` is what the dispatcher looks up to find the code that runs a job. No
 * handler is registered on this deployment, which is why the card says a queued
 * job stays queued; the key is still stored honestly rather than invented per
 * row from a display label.
 */
const HANDLER_KIND = 'agent.run'

/** The cron the schedule compiles to, shown under the pickers as the live dialog does. */
function cron(cadence: Cadence, time: string) {
  const hour = Number(time.slice(0, 2))
  if (cadence === 'Hourly') return '0 * * * *'
  if (cadence === 'Daily') return `0 ${hour} * * *`
  if (cadence === 'Weekly') return `0 ${hour} * * 1`
  return `0 ${hour} 1 * *`
}

type IntlWithZones = typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }

/**
 * The zones this browser knows, or the two it certainly knows.
 *
 * The zone is stored with the schedule and every occurrence is computed in it,
 * so it is chosen here rather than assumed to be UTC — "every day at 02:00" is
 * a different instant in summer and winter.
 */
function zoneOptions(browserZone: string): string[] {
  const all = (Intl as IntlWithZones).supportedValuesOf?.('timeZone') ?? []
  return all.length ? all : [...new Set([browserZone, 'UTC'])]
}

function NewAutomation({ schedules, onClose }: { schedules: SchedulesHandle; onClose: () => void }) {
  const installations = useInstallations()
  // Only what this workspace has actually installed and left enabled; the
  // catalogue's other cards are advertising, not something to schedule.
  const apps = useMemo(() => {
    const enabled = new Set(installations.apps.filter((app) => app.status === 'installed').map((app) => app.code))
    return marketApps.filter((app) => enabled.has(app.code))
  }, [installations.apps])

  const browserZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', [])
  const zones = useMemo(() => zoneOptions(browserZone), [browserZone])

  const [appCode, setAppCode] = useState('')
  const [agent, setAgent] = useState('')
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState<Cadence>('Daily')
  const [time, setTime] = useState('02:00')
  const [timezone, setTimezone] = useState(browserZone)

  const app = apps.find((item) => item.code === appCode)
  const expression = cron(cadence, time)

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
              disabled={installations.loading || Boolean(installations.error)}
              onChange={(event) => {
                setAppCode(event.target.value)
                setAgent('')
              }}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal text-fg focus:border-accent focus:outline-none disabled:text-fg-muted"
            >
              <option value="">
                {installations.loading
                  ? 'Loading your applications...'
                  : installations.error
                    ? 'Your applications could not be loaded'
                    : apps.length
                      ? 'Select an app...'
                      : 'No applications are installed'}
              </option>
              {apps.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
            {installations.error && (
              <span className="mt-1.5 block text-[12px] font-normal text-bad">{installations.error.message}</span>
            )}
          </label>

          <label className="text-[13px] font-medium text-fg-2">
            What to run
            <select
              value={agent}
              disabled={!app?.agents.length}
              onChange={(event) => setAgent(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal text-fg focus:border-accent focus:outline-none disabled:text-fg-muted"
            >
              <option value="">
                {!app ? 'Pick an app first' : app.agents.length ? 'Select an agent...' : 'This app bundles no agents'}
              </option>
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
              <select
                aria-label="Timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal text-fg focus:border-accent focus:outline-none"
              >
                {zones.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-[12px] font-normal text-fg-muted">
              {describeCron(expression) ?? expression} · {timezone} · {expression}
            </p>
            {(schedules.createFieldErrors.cron || schedules.createFieldErrors.timezone) && (
              <p className="mt-1.5 text-[12px] font-normal text-bad">
                {schedules.createFieldErrors.cron ?? schedules.createFieldErrors.timezone}
              </p>
            )}
          </div>
        </div>

        {schedules.createError && (
          <p role="alert" className="mt-4 text-[13px] text-bad">
            {schedules.createError.message}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={schedules.creating}
            disabled={!app || !agent || !name.trim()}
            onClick={async () => {
              const created = await schedules.createSchedule({
                name: name.trim(),
                kind: HANDLER_KIND,
                // The expression and zone the dialog has been showing all along
                // — the prototype displayed a cron and then stored a sentence.
                cron: expression,
                timezone,
                targetRef: `${app?.code}:${agent}`,
              })
              // Only on success: a dialog that closes on a failed save is how
              // somebody loses what they typed.
              if (created) onClose()
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
  // One handle shared by the card and the dialog, so a schedule created here
  // appears in the list behind it rather than waiting for a reload.
  const schedules = useServerSchedules()

  return (
    <div className="mx-auto max-w-5xl pt-2">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">Scheduled Jobs</h1>
        {/* "Re-time anything" was not true: this screen creates, pauses,
            resumes and removes. Changing a stored cadence has no control here,
            and the kinds listed were a taxonomy no row carried. */}
        <p className="mt-2 text-[15px] text-fg-muted">
          Your organisation&apos;s schedules. Create one, pause it, resume it or remove it — changing the cadence of a
          schedule that already exists is not offered on this screen yet.
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
        <SchedulesCard schedules={schedules} />
      </div>

      {open && <NewAutomation schedules={schedules} onClose={() => setOpen(false)} />}
    </div>
  )
}
