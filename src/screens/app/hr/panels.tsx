'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '../../../lib/router'
import { SubTabs } from '../../../components/AppSideChrome'
import { AttendanceCalendar } from './AttendanceCalendar'
import { RecordDialog } from '../../../components/RecordDialog'
import { Action, Card, Chip, SearchBox, Select } from '../../../components/AppChrome'
import { csvCell, downloadCsv } from '../../../lib/csv'
import { hrSettingById, hrSettings } from '../../../lib/hrData'
import type { HrField, HrModal, HrPage } from '../../../lib/hrData'
import { CountUp } from '../../../components/CountUp'
import { api, ApiClientError } from '../../../lib/api'
import {
  downloadFile,
  formatMinuteOfDay,
  formatMinutes,
  formatWeekdays,
  useAttendance,
  useCalendars,
  useDocuments,
  useEmployees,
  useHrOverview,
  useHrSettings,
  useHrSettingsChanges,
  useLeaveEntries,
  useLeaveRequests,
  useLeaveTypes,
  useLifecycleChanges,
  useOvertime,
  useSelfService,
  useShiftAssignments,
  useShifts,
  useTimesheets,
  useVocabulary,
} from './useHr'
import type { ServerEmployee } from './useHr'

/* ----------------------------- fetch states ------------------------------- */

/**
 * The four states a real request has, drawn once.
 *
 * The screens this replaces had two — data and empty — so a refused or failed
 * request rendered as "you have nothing", which is the single most misleading
 * thing a business screen can say.
 */
type FetchState = {
  loading: boolean
  error: ApiClientError | null
  denied: boolean
  canRetry: boolean
  refetch: () => void
}

function Loading({ what }: { what: string }) {
  return (
    <div role="status" className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-[14px] text-fg-muted">
      Loading {what}…
    </div>
  )
}

function Failed({ state, what }: { state: FetchState; what: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-bad/40 bg-bad-muted/30 px-6 py-10 text-center">
      <p className="text-[15px] font-medium text-fg">
        {state.denied ? `You do not have access to ${what} in this workspace.` : `We could not load ${what}.`}
      </p>
      <p className="mt-1.5 text-[13px] text-fg-muted">{state.error?.message}</p>
      {state.canRetry && (
        <div className="mt-4">
          <Action onClick={state.refetch}>Try again</Action>
        </div>
      )}
      {state.error?.requestId && (
        <p className="mt-3 font-mono text-[11px] text-fg-muted">Reference {state.error.requestId}</p>
      )}
    </div>
  )
}

/** A write that failed is shown where the writer is looking, not swallowed. */
function WriteError({ error }: { error: ApiClientError | null }) {
  if (!error) return null
  return (
    <p role="alert" className="rounded-xl border border-bad/40 bg-bad-muted/30 px-4 py-3 text-[13px] text-fg">
      {error.isConflict ? 'Somebody else changed this while you were looking at it. ' : ''}
      {error.message}
    </p>
  )
}

/**
 * A surface with nothing behind it.
 *
 * Said plainly, and with no create button: a form that writes to a browser
 * object somebody will lose is worse than a feature that admits it is missing.
 */
function NotAvailable({ what, why }: { what: string; why?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
      <p className="text-[15px] text-fg-2">{what} is not available on this deployment.</p>
      {why && <p className="mx-auto mt-2 max-w-xl text-[14px] text-fg-muted">{why}</p>}
    </div>
  )
}

function Empty({ icon, heading, body }: { icon?: string; heading?: string; body?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface">
      <div className="px-6 py-16 text-center">
        {icon && (
          <span aria-hidden className="text-2xl text-fg-muted">
            {icon}
          </span>
        )}
        {heading && <p className="mt-4 text-xl font-semibold">{heading}</p>}
        {body && <p className={`text-[15px] text-fg-muted ${heading ? 'mt-2' : ''}`}>{body}</p>}
      </div>
    </div>
  )
}

/** Rows, in the shape the record lists elsewhere in the app use. */
function Rows({ children, grid = false }: { children: ReactNode; grid?: boolean }) {
  return (
    <ul
      className={
        grid
          ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
          : 'divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface'
      }
    >
      {children}
    </ul>
  )
}

function Row({ children, grid = false }: { children: ReactNode; grid?: boolean }) {
  return (
    <li
      className={`flex flex-wrap items-center gap-4 px-6 py-3.5 text-[14px] ${
        grid ? 'rounded-2xl border border-line bg-surface' : ''
      }`}
    >
      {children}
    </li>
  )
}

const toneFor = (status: string) =>
  ({
    approved: 'tone-emerald',
    present: 'tone-emerald',
    submitted: 'tone-amber',
    draft: 'tone-slate',
    rejected: 'tone-rose',
    absent: 'tone-rose',
    cancelled: 'tone-slate',
  })[status] ?? 'tone-sky'

function Tag({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${tone}`}>{children}</span>
}

/** Previous / next over a server total. */
function Pager({
  total,
  page,
  pageSize,
  onPage,
  noun,
  state,
}: {
  total: number
  page: number
  pageSize: number
  onPage: (next: number) => void
  noun: string
  /** Given when the pager sits outside the list's own loading branch. */
  state?: { loading: boolean; error: ApiClientError | null }
}) {
  // `total` is the last answer the server gave, which after a failure belongs
  // to a list that is no longer on screen — "Page 1 of 9" under a panel saying
  // the list could not be loaded offers to page through nothing.
  if (state?.loading || state?.error) return null
  if (total <= pageSize) return null
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <nav aria-label={`${noun} pagination`} className="flex items-center justify-end gap-3 text-sm">
      <button
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        className="rounded-xl border border-line px-3 py-2 disabled:opacity-40"
      >
        Previous
      </button>
      <span>
        Page {page + 1} of {pages}
      </span>
      <button
        disabled={page + 1 >= pages}
        onClick={() => onPage(page + 1)}
        className="rounded-xl border border-line px-3 py-2 disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  )
}

/**
 * A count, only once there is one.
 *
 * "Leave (0)" printed above a spinner is a measurement nobody has taken, and
 * above a failed request it is a measurement that failed. Both read as "your
 * team has nothing waiting on you", which is the opposite of what an approval
 * queue exists to say.
 */
function Count({ state, total }: { state: { loading: boolean; error: ApiClientError | null }; total: number }) {
  if (state.loading || state.error) return null
  return <> ({total})</>
}

/**
 * The count beside a list.
 *
 * `total` is the server's count for the filter, but it is 0 before the first
 * answer arrives and it is the PREVIOUS filter's count after a failure. Both
 * render as "0 employees" next to a toolbar somebody is reading to find out
 * how many there are, which is a measurement nobody took. The figure appears
 * only when it is one.
 */
function ListCount({
  state,
  total,
  one,
  many,
}: {
  state: { loading: boolean; refreshing: boolean; error: ApiClientError | null }
  total: number
  one: string
  many: string
}) {
  if (state.error) return null
  return (
    <span className="text-[13px] text-fg-muted" aria-live="polite">
      {state.loading ? 'Counting…' : state.refreshing ? 'Updating…' : `${total} ${total === 1 ? one : many}`}
    </span>
  )
}

/** A list the server has more rows for than were asked for. */
function Truncated({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  if (total <= shown) return null
  return (
    <p className="text-[12px] text-fg-muted">
      Showing the first {shown} of {total} {noun}.
    </p>
  )
}

/** A button that names an action this deployment cannot perform. */
function MutedAction({ children, why }: { children: ReactNode; why: string }) {
  return (
    <button
      disabled
      title={why}
      className="cursor-not-allowed rounded-xl border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-fg-muted opacity-60"
    >
      {children}
    </button>
  )
}

/* -------------------------------- Dashboard ------------------------------- */

/**
 * The dashboard, from `GET /hr/overview`.
 *
 * Every figure here is counted by the same queries the screens underneath read,
 * and the two the server cannot compute — attrition, and anything about
 * onboarding — are listed as unavailable rather than rendered as an animated
 * zero that reads like a measurement.
 */
export function HrDashboard() {
  const { data, loading, error, denied, canRetry, refetch } = useHrOverview()
  const overview = data?.overview

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="mt-1.5 text-[15px] text-fg-muted">
          Headcount, joiners, leavers, and everything waiting on People Ops today.
        </p>
      </div>

      {loading ? (
        <Loading what="your workspace figures" />
      ) : error || !overview ? (
        <Failed state={{ loading, error, denied, canRetry, refetch }} what="the HR dashboard" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Active headcount', value: overview.headcount },
              { label: 'On probation', value: overview.onProbation },
              { label: 'Joiners this month', value: overview.joinersThisMonth },
              { label: 'Leavers this month', value: overview.leaversThisMonth },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-line bg-surface p-5">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">{kpi.label}</p>
                <p className="mt-2.5 text-3xl font-bold">
                  <CountUp value={String(kpi.value)} />
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'On leave today', value: overview.onLeaveToday, sub: 'approved absences' },
              { label: 'Leave to approve', value: overview.pendingApprovals.leave, sub: 'requests awaiting a decision' },
              { label: 'Timesheets to approve', value: overview.pendingApprovals.timesheets, sub: 'submitted, not yet decided' },
              { label: 'Overtime to approve', value: overview.pendingApprovals.overtime, sub: 'claims awaiting a decision' },
            ].map((queue) => (
              <div key={queue.label} className="rounded-2xl border border-line bg-surface p-5">
                <p className="text-[14px] text-fg-2">{queue.label}</p>
                <p className="mt-2 text-2xl font-bold">{queue.value}</p>
                <p className="mt-1 text-[12px] text-fg-muted">{queue.sub}</p>
              </div>
            ))}
          </div>

          <Card>
            <h3 className="text-lg font-semibold">Headcount by department</h3>
            {overview.byDepartment.length ? (
              <ul className="mt-4 divide-y divide-line">
                {overview.byDepartment.map((row) => (
                  <li key={row.departmentId ?? 'none'} className="flex items-center justify-between gap-4 py-2.5 text-[15px]">
                    <span className={row.name ? '' : 'text-fg-muted italic'}>{row.name ?? 'No department set'}</span>
                    <span className="font-mono text-[14px]">{row.headcount}</span>
                  </li>
                ))}
              </ul>
            ) : (
              /*
               * What this breakdown counts is ACTIVE headcount — the same
               * filter as the KPI above it. "No employee records yet" is a
               * claim about the whole directory, and a workspace whose people
               * are all pre-joining or have all left has records and would be
               * told it has none.
               */
              <p className="py-16 text-center text-[15px] text-fg-muted">
                Nobody is currently active, so there is no headcount to break down. Active, probation and notice-period
                employees appear here — add or activate one under People → Employees.
              </p>
            )}
          </Card>

          {overview.unavailable.length > 0 && (
            <Card>
              <h3 className="text-lg font-semibold">Not measured here</h3>
              <ul className="mt-3 space-y-2">
                {overview.unavailable.map((entry) => (
                  <li key={entry.metric} className="text-[14px] text-fg-muted">
                    <span className="font-medium text-fg-2">{entry.metric}</span> — {entry.reason}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

/* -------------------------------- Settings -------------------------------- */

/** The add row every taxonomy editor shares: one item, or one per line. */
function AddRow({
  placeholder,
  disabled,
  onAdd,
}: {
  placeholder: string
  disabled: boolean
  onAdd: (names: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const [bulk, setBulk] = useState(false)

  // "Bulk add" is the same control taking one item per line.
  const commit = () => {
    const names = (bulk ? draft.split('\n') : [draft]).map((line) => line.trim()).filter(Boolean)
    if (!names.length) return
    onAdd(names)
    setDraft('')
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      {bulk ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          placeholder={`${placeholder} — one per line`}
          aria-label={`${placeholder} — one per line`}
          className="min-w-[16rem] flex-1 rounded-xl border border-dashed border-line bg-surface px-4 py-3 text-[15px] text-fg placeholder:text-fg-muted focus:border-accent focus:border-solid focus:outline-none"
        />
      ) : (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-[16rem] flex-1 rounded-xl border border-dashed border-line bg-surface px-4 py-3 text-[15px] text-fg placeholder:text-fg-muted focus:border-accent focus:border-solid focus:outline-none"
        />
      )}
      <button
        onClick={commit}
        disabled={!draft.trim() || disabled}
        className="rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
      >
        + Add
      </button>
      <button
        onClick={() => setBulk((prev) => !prev)}
        aria-pressed={bulk}
        className="rounded-xl border border-line bg-surface px-5 py-3 text-[14px] font-medium text-fg-2 transition hover:bg-surface-2"
      >
        {bulk ? 'Single add' : 'Bulk add'}
      </button>
    </div>
  )
}

function NamedList({
  items,
  onRemove,
  removeDisabled,
}: {
  items: { id: string; name: string; hint?: string }[]
  onRemove: (id: string) => void
  removeDisabled: boolean
}) {
  if (!items.length) return <p className="py-14 text-center text-[15px] text-fg-muted">No items configured. Add one below.</p>
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-4 py-3 text-[15px]">
          <span className="flex-1">{item.name}</span>
          {item.hint && <span className="text-[13px] text-fg-muted">{item.hint}</span>}
          <button
            onClick={() => onRemove(item.id)}
            disabled={removeDisabled}
            aria-label={`Remove ${item.name}`}
            className="text-[13px] text-fg-muted transition hover:text-bad disabled:opacity-40"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Departments, designations and locations — real rows with real ids. */
function VocabularySetting({ kind, placeholder }: { kind: 'department' | 'designation' | 'location'; placeholder: string }) {
  const vocabulary = useVocabulary(kind)

  if (vocabulary.loading) return <Loading what="the list" />
  if (vocabulary.error) return <Failed state={vocabulary} what="this list" />

  return (
    <>
      <WriteError error={vocabulary.writeError} />
      <NamedList items={vocabulary.entries} onRemove={(id) => void vocabulary.remove(id)} removeDisabled={vocabulary.writing} />
      <AddRow
        placeholder={placeholder}
        disabled={vocabulary.writing}
        // The whole paste goes in one call. Looping over `add` here fired the
        // first request and dropped the rest on the mutation's in-flight
        // guard, which looked exactly like a bulk add that had worked.
        onAdd={(names) => void vocabulary.add(names)}
      />
    </>
  )
}

/**
 * The leave-type library.
 *
 * A type needs a code as well as a name, so the add row derives one from the
 * name and the server refuses a clash — better than inventing a second field
 * the transcribed screen never had.
 */
function LeaveTypeSetting() {
  const types = useLeaveTypes()

  if (types.loading) return <Loading what="the leave types" />
  if (types.error) return <Failed state={types} what="the leave types" />

  return (
    <>
      <WriteError error={types.writeError} />
      <NamedList
        items={types.leaveTypes.map((type) => ({ id: type.id, name: type.name, hint: type.code }))}
        onRemove={(id) => void types.archive(id)}
        removeDisabled={types.writing}
      />
      <AddRow
        placeholder="Add new leave type..."
        disabled={types.writing}
        onAdd={(names) =>
          void types.add(
            names.map((name) => ({
              name,
              code: name.replace(/[^A-Za-z0-9]/g, '').slice(0, 20).toUpperCase() || 'LEAVE',
            })),
          )
        }
      />
    </>
  )
}

/**
 * A taxonomy with no table of its own, kept in the app's settings document.
 *
 * `writeSettings` is version-checked, so the version read is sent back with the
 * change and a second administrator gets a conflict instead of silently
 * overwriting the first. That is why the list is not edited optimistically.
 *
 * What it does NOT do is change how anything behaves. Nothing on the server
 * reads these sections: the employment types the hire dialog offers, the
 * statuses a settled day can carry and the approval route leave follows are all
 * fixed in the schema. The list is stored for this workspace and read back
 * here, and the pane says so — each of these panes carries a blurb claiming it
 * drives payroll, attendance or the holiday calendar, and an editor that files
 * an entry away in silence lets the reader believe it.
 */
function SettingsListSetting({ section, placeholder }: { section: string; placeholder: string }) {
  const settings = useHrSettings(section)

  if (settings.loading) return <Loading what="the list" />
  if (settings.error) return <Failed state={settings} what="this list" />

  const document = settings.settings
  const items = Array.isArray(document?.value.items) ? (document.value.items as string[]) : []
  const write = (next: string[], summary: string) => void settings.save({ items: next }, document?.version ?? 0, summary)

  return (
    <>
      <p className="mb-4 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[13px] leading-relaxed text-fg-muted">
        This list is saved for your workspace and shown here, but nothing else in HR reads it yet — it does not change
        what the other screens offer or how anything is calculated.
      </p>
      <WriteError error={settings.writeError} />
      <NamedList
        items={items.map((name) => ({ id: name, name }))}
        onRemove={(name) => write(items.filter((item) => item !== name), `Removed ${name}`)}
        removeDisabled={settings.writing}
      />
      <AddRow
        placeholder={placeholder}
        disabled={settings.writing}
        onAdd={(names) => {
          const merged = [...items, ...names.filter((name) => !items.includes(name))]
          write(merged, names.length > 1 ? `Added ${names.length} entries` : `Added ${names[0]}`)
        }}
      />
    </>
  )
}

/** A settings pane that stores a document rather than a list. */
function SettingsDocumentPanel({ section, title }: { section: string; title: string }) {
  const settings = useHrSettings(section)

  if (settings.loading) return <Loading what={title.toLowerCase()} />
  if (settings.error) return <Failed state={settings} what={title.toLowerCase()} />

  const entries = Object.entries(settings.settings?.value ?? {})
  if (!entries.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
        <p className="text-[15px] text-fg-muted">Nothing configured yet for {title.toLowerCase()}.</p>
      </div>
    )
  }

  return (
    <dl className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-wrap items-center gap-4 px-6 py-3.5 text-[14px]">
          <dt className="min-w-[12rem] flex-1 font-medium">{key}</dt>
          <dd className="min-w-0 flex-[2] truncate text-fg-muted">{JSON.stringify(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function ChangeHistoryPanel() {
  const history = useHrSettingsChanges()

  if (history.loading) return <Loading what="the change history" />
  if (history.error) return <Failed state={history} what="the change history" />
  if (!history.changes.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
        <p className="text-[15px] text-fg-muted">No configuration changes recorded yet.</p>
      </div>
    )
  }

  return (
    <Rows>
      {history.changes.map((change) => (
        <Row key={change.id}>
          <span className="min-w-[14rem] flex-1 font-medium">{change.summary}</span>
          <span className="text-[13px] text-fg-muted">{change.changedByName ?? 'Someone no longer in this workspace'}</span>
          <span className="text-[13px] text-fg-muted">{new Date(change.changedAt).toLocaleString('en-GB')}</span>
          {change.reverted && <Tag tone="tone-slate">reverted</Tag>}
        </Row>
      ))}
    </Rows>
  )
}

/** Settings sections whose list has a table of its own behind it. */
const VOCABULARY_SECTIONS: Record<string, 'department' | 'designation' | 'location'> = {
  departments: 'department',
  designations: 'designation',
  locations: 'location',
}

/** Panes governed by the decision not to hold live provider credentials. */
const CREDENTIAL_PANES = new Set(['integrations', 'ai_agents'])

export function HrSettings() {
  const [active, setActive] = useState('general')
  const setting = hrSettingById.get(active) ?? hrSettings[0]
  const vocabularyKind = VOCABULARY_SECTIONS[setting.id]

  return (
    <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
      <nav aria-label="HR settings" className="space-y-0.5 lg:border-r lg:border-line lg:pr-4">
        {hrSettings.map((item) => (
          <button
            key={item.id}
            onClick={() => setActive(item.id)}
            aria-current={active === item.id ? 'page' : undefined}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition ${
              active === item.id ? 'bg-accent/10 font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            <span aria-hidden className="w-4 shrink-0 text-center text-[13px]">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0">
        <h2 className="text-2xl font-bold tracking-tight">{setting.title}</h2>
        <p className="mt-1.5 max-w-4xl text-[15px] leading-relaxed text-fg-muted">{setting.blurb}</p>

        <div className="mt-8">
          {vocabularyKind ? (
            <VocabularySetting
              key={setting.id}
              kind={vocabularyKind}
              placeholder={setting.addPlaceholder ?? 'Add new item...'}
            />
          ) : setting.id === 'leave_types' ? (
            <LeaveTypeSetting />
          ) : setting.kind === 'list' ? (
            <SettingsListSetting
              key={setting.id}
              section={setting.id}
              placeholder={setting.addPlaceholder ?? 'Add new item...'}
            />
          ) : setting.id === 'change_history' ? (
            <ChangeHistoryPanel />
          ) : CREDENTIAL_PANES.has(setting.id) ? (
            <NotAvailable
              what={setting.title}
              why="This workspace does not hold third-party provider credentials, so there is nothing here to connect or configure."
            />
          ) : (
            <SettingsDocumentPanel key={setting.id} section={setting.id} title={setting.title} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ page scaffold ----------------------------- */

/** Shifts uses underlined tabs with icons rather than the pill group. */
function UnderlineTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { label: string; icon?: string }[]
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex gap-6 border-b border-line">
      {tabs.map((tab) => {
        const active = tab.label === value
        return (
          <button
            key={tab.label}
            onClick={() => onChange(tab.label)}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-[15px] font-medium transition ${
              active ? 'border-accent text-accent' : 'border-transparent text-fg-2 hover:text-fg'
            }`}
          >
            {tab.icon && <span aria-hidden className="text-[13px]">{tab.icon}</span>}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function PageShell({
  page,
  actions,
  subTab,
  onSubTab,
  children,
}: {
  page: HrPage
  actions?: ReactNode
  subTab?: string
  onSubTab?: (next: string) => void
  children: ReactNode
}) {
  const tabs = page.subTabs
  const active = tabs?.find((tab) => tab.label === subTab)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {page.title && <h2 className="text-2xl font-bold tracking-tight">{page.title}</h2>}
          {page.blurb && <p className="mt-1.5 max-w-3xl text-[15px] text-fg-muted">{page.blurb}</p>}
        </div>

        {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}

        {tabs && page.subTabStyle !== 'underline' && onSubTab && (
          <SubTabs
            tabs={tabs.map((tab) => (tab.icon ? `${tab.icon} ${tab.label}` : tab.label))}
            value={active?.icon ? `${active.icon} ${active.label}` : (subTab ?? '')}
            onChange={(next) => {
              const match = tabs.find((tab) => next.endsWith(tab.label))
              if (match) onSubTab(match.label)
            }}
          />
        )}
      </div>

      {tabs && page.subTabStyle === 'underline' && onSubTab && (
        <UnderlineTabs tabs={tabs} value={subTab ?? ''} onChange={onSubTab} />
      )}

      {children}
    </div>
  )
}

/** Page-local sub-tab state, reset when the page changes. */
function useSubTab(page: HrPage): [string, (next: string) => void] {
  const [subTab, setSubTab] = useState(page.subTabs?.[0]?.label ?? '')
  const known = page.subTabs?.some((tab) => tab.label === subTab)
  return [known ? subTab : (page.subTabs?.[0]?.label ?? ''), setSubTab]
}

/* ------------------------------- dialogs ---------------------------------- */

/** A select whose options are server rows, with an explicit "unset" choice. */
const NONE = '— none —'
const CHOOSE = 'Select…'

function optionOf(label: string, options: string[], required = false, span = 1, hint?: string): HrField {
  return {
    kind: 'select',
    label,
    value: required ? CHOOSE : NONE,
    options: required ? [CHOOSE, ...options] : [NONE, ...options],
    required,
    span,
    hint,
  }
}

/**
 * The employee picker's options, and a hint when the list is only the first
 * page of a larger directory. A truncated picker that says nothing is how
 * somebody concludes a colleague does not exist.
 */
function employeePicker(list: { employees: ServerEmployee[]; total: number }) {
  return {
    options: list.employees.map(employeeLabel),
    hint:
      list.total > list.employees.length
        ? `Showing the first ${list.employees.length} of ${list.total} employees.`
        : undefined,
  }
}

/**
 * What is wrong with a dropdown, beside the dropdown.
 *
 * A picker whose own request failed renders as an empty list of choices, which
 * reads as "this workspace has no departments" — the same shape as a genuinely
 * empty one. A truncated picker reads as "that colleague does not exist". Both
 * are said out loud here rather than left to be inferred from a short list.
 */
function PickerNote({
  state,
  what,
  shown,
  total,
}: {
  state: { error: ApiClientError | null; denied: boolean }
  what: string
  shown: number
  total?: number
}) {
  if (state.error) {
    return (
      <span role="alert" className="text-[12px] text-bad">
        {state.denied
          ? `You cannot see ${what}, so this filter is empty.`
          : `The ${what} could not be loaded, so this filter is empty.`}
      </span>
    )
  }
  if (total !== undefined && total > shown) {
    return (
      <span className="text-[12px] text-fg-muted">
        Showing the first {shown} of {total} {what}.
      </span>
    )
  }
  return null
}

/** The same warning, for an employee filter dropdown rather than a dialog field. */
function TruncatedPicker({
  list,
}: {
  list: { employees: ServerEmployee[]; total: number; error: ApiClientError | null; denied: boolean }
}) {
  return <PickerNote state={list} what="employees" shown={list.employees.length} total={list.total} />
}

const idByName = (rows: { id: string; name: string }[], chosen: string | undefined) =>
  rows.find((row) => row.name === chosen)?.id

const EMPLOYMENT_TYPES: Record<string, string> = {
  'Full time': 'full_time',
  'Part time': 'part_time',
  Contract: 'contract',
  Intern: 'intern',
  Consultant: 'consultant',
}

/** `${name} · ${employeeNo}`, because two colleagues may share a name. */
const employeeLabel = (employee: ServerEmployee) => `${employee.fullName} · ${employee.employeeNo}`

/* ------------------------------- Employees -------------------------------- */

const EMPLOYEE_STATUSES = ['pre_joining', 'probation', 'active', 'notice', 'exited', 'suspended']
const PAGE_SIZE = 25

function EmployeesPage({ page }: { page: HrPage }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [designationId, setDesignationId] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [joinedFrom, setJoinedFrom] = useState('')
  const [joinedTo, setJoinedTo] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [hiring, setHiring] = useState(false)
  const [exiting, setExiting] = useState<ServerEmployee | null>(null)

  const departments = useVocabulary('department')
  const designations = useVocabulary('designation')
  const locations = useVocabulary('location')

  const employees = useEmployees({
    q: query || undefined,
    status: status || undefined,
    departmentId: departmentId || undefined,
    designationId: designationId || undefined,
    employmentType: employmentType || undefined,
    joinedFrom: joinedFrom || undefined,
    joinedTo: joinedTo || undefined,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  })

  // Managers are chosen from the directory itself, so the reporting line always
  // points at a real record rather than at a name somebody typed.
  const managers = useEmployees({ limit: 200 })

  /*
   * Whether ANY control is narrowing the list.
   *
   * The empty state turns on this: "No employees yet — add employees to start
   * managing your team" is a claim about the workspace, and it is false the
   * moment a filter is on. Checking only three of the seven controls told a
   * company of five hundred that it had nobody as soon as somebody picked a
   * designation, an employment type or a Joined range.
   */
  const filtered = Boolean(
    query || status || departmentId || designationId || employmentType || joinedFrom || joinedTo,
  )

  const reset = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPageIndex(0)
  }

  const hireModal: HrModal = {
    title: 'Add employee',
    submit: 'Add employee',
    fields: [
      { kind: 'text', label: 'Full name', required: true, span: 2 },
      { kind: 'text', label: 'Employee number', placeholder: 'Left blank, the next one is allocated', span: 1 },
      { kind: 'text', label: 'Work email', span: 2 },
      { kind: 'text', label: 'Phone', span: 1 },
      { kind: 'date', label: 'Joined on', required: true, span: 1 },
      optionOf('Employment type', Object.keys(EMPLOYMENT_TYPES)),
      optionOf('Department', departments.entries.map((entry) => entry.name)),
      optionOf('Designation', designations.entries.map((entry) => entry.name)),
      optionOf('Location', locations.entries.map((entry) => entry.name)),
      optionOf('Reports to', employeePicker(managers).options, false, 1, employeePicker(managers).hint),
    ],
  }

  const exitModal: HrModal = {
    title: exiting ? `Record exit — ${exiting.fullName}` : 'Record exit',
    submit: 'Record exit',
    fields: [
      { kind: 'date', label: 'Last working day', required: true, span: 1 },
      { kind: 'text', label: 'Reason', required: true, span: 2 },
      { kind: 'textarea', label: 'Note' },
    ],
  }

  return (
    <PageShell
      page={page}
      actions={
        <>
          <MutedAction why="Inviting an employee to a platform account is not available on this deployment.">
            ✉ Invite pending
          </MutedAction>
          <MutedAction why="Bulk hire from CSV is not available on this deployment.">⤒ Bulk hire (CSV)</MutedAction>
          <Action variant="solid" onClick={() => setHiring(true)}>
            + Add employee
          </Action>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchBox placeholder="Search by name, email, employee ID" value={query} onChange={reset(setQuery)} />
          <Select
            label="All departments"
            value={departments.entries.find((entry) => entry.id === departmentId)?.name ?? 'All departments'}
            options={departments.entries.map((entry) => entry.name)}
            onChange={(name) => reset(setDepartmentId)(idByName(departments.entries, name) ?? '')}
          />
          <Select
            label="All designations"
            value={designations.entries.find((entry) => entry.id === designationId)?.name ?? 'All designations'}
            options={designations.entries.map((entry) => entry.name)}
            onChange={(name) => reset(setDesignationId)(idByName(designations.entries, name) ?? '')}
          />
          <Select
            label="All types"
            value={
              Object.entries(EMPLOYMENT_TYPES).find(([, code]) => code === employmentType)?.[0] ?? 'All types'
            }
            options={Object.keys(EMPLOYMENT_TYPES)}
            onChange={(label) => reset(setEmploymentType)(EMPLOYMENT_TYPES[label] ?? '')}
          />
          <Select
            label="Any status"
            value={status || 'Any status'}
            options={EMPLOYEE_STATUSES}
            onChange={(value) => reset(setStatus)(value === 'Any status' ? '' : value)}
          />
          <ListCount state={employees} total={employees.total} one="employee" many="employees" />
          <PickerNote state={departments} what="departments" shown={departments.entries.length} />
          <PickerNote state={designations} what="designations" shown={designations.entries.length} />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[13px] text-fg-2">Joined</span>
          <input
            type="date"
            aria-label="Joined from"
            value={joinedFrom}
            onChange={(event) => reset(setJoinedFrom)(event.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-fg-2"
          />
          <span aria-hidden className="text-fg-muted">
            –
          </span>
          <input
            type="date"
            aria-label="Joined to"
            value={joinedTo}
            onChange={(event) => reset(setJoinedTo)(event.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-fg-2"
          />
          <span className="ml-auto">
            <ViewToggle view={view} onChange={setView} />
          </span>
        </div>
      </div>

      {employees.loading ? (
        <Loading what="the directory" />
      ) : employees.error ? (
        <Failed state={employees} what="the employee directory" />
      ) : employees.employees.length ? (
        <>
          <Rows grid={view === 'grid'}>
            {employees.employees.map((employee) => (
              <Row key={employee.id} grid={view === 'grid'}>
                <span className="min-w-[10rem] flex-1 font-medium">{employee.fullName}</span>
                <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
                  {[employee.employeeNo, employee.designationName, employee.departmentName, employee.workEmail]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <Tag tone={toneFor(employee.status)}>{employee.status}</Tag>
                {employee.joinedOn && <span className="text-[12px] text-fg-muted">joined {employee.joinedOn}</span>}
                {employee.status !== 'exited' && (
                  <button
                    onClick={() => setExiting(employee)}
                    className="text-[13px] text-fg-muted transition hover:text-bad"
                  >
                    Record exit
                  </button>
                )}
              </Row>
            ))}
          </Rows>
          <Pager total={employees.total} page={pageIndex} pageSize={PAGE_SIZE} onPage={setPageIndex} noun="Employee" />
        </>
      ) : (
        <Empty
          icon={page.emptyIcon}
          heading={filtered ? 'No employees match these filters' : page.emptyTitle}
          body={filtered ? 'Clear or widen a filter to see more of the directory.' : page.empty}
        />
      )}

      {hiring && (
        <RecordDialog
          modal={hireModal}
          onClose={() => setHiring(false)}
          onSubmit={async ({ fields }) => {
            await api.post('/hr/employees', {
              fullName: fields['Full name'],
              employeeNo: fields['Employee number'] || undefined,
              workEmail: fields['Work email'] || undefined,
              phone: fields.Phone || undefined,
              joinedOn: fields['Joined on'],
              employmentType: EMPLOYMENT_TYPES[fields['Employment type'] ?? ''] || undefined,
              departmentId: idByName(departments.entries, fields.Department),
              designationId: idByName(designations.entries, fields.Designation),
              locationId: idByName(locations.entries, fields.Location),
              managerId: managers.employees.find((row) => employeeLabel(row) === fields['Reports to'])?.id,
            })
            employees.refetch()
            managers.refetch()
          }}
        />
      )}

      {exiting && (
        <RecordDialog
          modal={exitModal}
          onClose={() => setExiting(null)}
          onSubmit={async ({ fields }) => {
            // The version read is sent back, so an exit recorded against a
            // record somebody else has since changed is refused rather than
            // quietly overwriting their edit.
            try {
              await api.post(`/hr/employees/${exiting.id}/exit`, {
                exitedOn: fields['Last working day'],
                reason: fields.Reason,
                note: fields.Note || undefined,
                version: exiting.version,
              })
            } catch (error) {
              /*
               * The version this dialog sends was captured when the row was
               * clicked. Rethrowing the conflict on its own left that stale
               * version in place, so pressing the button again failed exactly
               * the same way for ever — the message was true and the screen
               * was a dead end. The directory is reloaded and the writer is
               * told to reopen, which is the only thing that can work.
               */
              if (error instanceof ApiClientError && error.isConflict) {
                employees.refetch()
                throw new Error(
                  'Somebody else changed this employee while you were looking at it. The directory has been reloaded — close this and open Record exit again.',
                )
              }
              throw error
            }
            employees.refetch()
          }}
        />
      )}
    </PageShell>
  )
}

function ViewToggle({ view, onChange }: { view: 'list' | 'grid'; onChange: (value: 'list' | 'grid') => void }) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-line">
      {(['list', 'grid'] as const).map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          aria-pressed={view === option}
          aria-label={`${option} view`}
          className={`px-2.5 py-2 text-[13px] transition ${
            view === option ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:bg-surface-2'
          }`}
        >
          {option === 'list' ? '☰' : '▦'}
        </button>
      ))}
    </div>
  )
}

/* --------------------------------- Leaves --------------------------------- */

const LEAVE_CHIPS: { label: string; status: string }[] = [
  { label: 'All', status: '' },
  { label: 'Pending', status: 'submitted' },
  { label: 'Approved', status: 'approved' },
  { label: 'Rejected', status: 'rejected' },
  { label: 'Cancelled', status: 'cancelled' },
]

function LeaveRequestsTab({ page }: { page: HrPage }) {
  const [chip, setChip] = useState('All')
  const [pageIndex, setPageIndex] = useState(0)
  const [booking, setBooking] = useState(false)
  const status = LEAVE_CHIPS.find((item) => item.label === chip)?.status ?? ''

  const requests = useLeaveRequests({
    status: status || undefined,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  })
  const types = useLeaveTypes()
  const employees = useEmployees({ limit: 200 })

  const bookModal: HrModal = {
    title: 'Request Leave',
    submit: 'Request Leave',
    fields: [
      optionOf('Employee', employeePicker(employees).options, true, 2, employeePicker(employees).hint),
      optionOf('Leave type', types.leaveTypes.map((type) => type.name), true, 1),
      { kind: 'date', label: 'From', required: true, span: 1 },
      { kind: 'date', label: 'To', required: true, span: 1 },
      { kind: 'checkbox', label: 'Half day' },
      { kind: 'textarea', label: 'Reason' },
    ],
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {LEAVE_CHIPS.map((item) => (
            <Chip
              key={item.label}
              active={chip === item.label}
              onClick={() => {
                setChip(item.label)
                setPageIndex(0)
              }}
            >
              {item.label}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <ListCount state={requests} total={requests.total} one="request" many="requests" />
          <Action variant="solid" onClick={() => setBooking(true)}>
            + Request Leave
          </Action>
        </div>
      </div>

      <WriteError error={requests.writeError} />

      {requests.loading ? (
        <Loading what="leave requests" />
      ) : requests.error ? (
        <Failed state={requests} what="leave requests" />
      ) : requests.requests.length ? (
        <Rows>
          {requests.requests.map((request) => (
            <Row key={request.id}>
              <span className="min-w-[10rem] flex-1 font-medium">{request.employeeName}</span>
              <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
                {request.leaveTypeName} · {request.startsOn} to {request.endsOn} · {request.dayCount} day(s)
              </span>
              <Tag tone={toneFor(request.status)}>{request.status}</Tag>
              {request.status === 'submitted' && (
                <>
                  <button
                    disabled={requests.writing}
                    onClick={() => void requests.decide(request.id, 'approved', request.version)}
                    className="text-[13px] font-medium text-ok disabled:opacity-40"
                  >
                    Approve
                  </button>
                  <button
                    disabled={requests.writing}
                    onClick={() => void requests.decide(request.id, 'rejected', request.version)}
                    className="text-[13px] font-medium text-bad disabled:opacity-40"
                  >
                    Reject
                  </button>
                </>
              )}
              {(request.status === 'submitted' || request.status === 'approved') && (
                <button
                  disabled={requests.writing}
                  onClick={() => void requests.cancel(request.id, request.version)}
                  className="text-[13px] text-fg-muted transition hover:text-bad disabled:opacity-40"
                >
                  Cancel
                </button>
              )}
            </Row>
          ))}
        </Rows>
      ) : (
        <Empty icon={page.emptyIcon} heading={chip === 'All' ? 'No leave requests' : `No ${chip.toLowerCase()} leave requests`} />
      )}

      <Pager total={requests.total} page={pageIndex} pageSize={PAGE_SIZE} onPage={setPageIndex} noun="Leave" state={requests} />

      {booking && (
        <RecordDialog
          modal={bookModal}
          onClose={() => setBooking(false)}
          onSubmit={async ({ fields }) => {
            const employee = employees.employees.find((row) => employeeLabel(row) === fields.Employee)
            const type = types.leaveTypes.find((row) => row.name === fields['Leave type'])
            if (!employee || !type) throw new Error('Choose an employee and a leave type.')
            await api.post('/hr/leave/requests', {
              employeeId: employee.id,
              leaveTypeId: type.id,
              startsOn: fields.From,
              endsOn: fields.To,
              halfDay: fields['Half day'] === 'Yes',
              reason: fields.Reason || undefined,
            })
            requests.refetch()
          }}
        />
      )}
    </>
  )
}

function LeaveLedgerTab({ kind, action }: { kind: 'grant' | 'encashment'; action: string }) {
  const [open, setOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  // The ledger is paged rather than cut off at the first 25 rows: a list that
  // silently stops is indistinguishable from a workspace that granted 25 times.
  const entries = useLeaveEntries({ kind, limit: PAGE_SIZE, offset: pageIndex * PAGE_SIZE })
  const types = useLeaveTypes()
  const employees = useEmployees({ limit: 200 })

  const modal: HrModal = {
    title: action.replace(/^\+\s*/, ''),
    submit: action.replace(/^\+\s*/, ''),
    fields: [
      optionOf('Employee', employeePicker(employees).options, true, 2, employeePicker(employees).hint),
      optionOf('Leave type', types.leaveTypes.map((type) => type.name), true, 1),
      { kind: 'number', label: 'Days', value: '1', span: 1 },
      { kind: 'number', label: 'Year', value: String(new Date().getUTCFullYear()), span: 1 },
      { kind: 'text', label: 'Reason', required: true, span: 2 },
    ],
  }

  return (
    <>
      <div className="flex items-center justify-end gap-3">
        <ListCount state={entries} total={entries.total} one="entry" many="entries" />
        <Action variant="solid" onClick={() => setOpen(true)}>
          {action}
        </Action>
      </div>

      {entries.loading ? (
        <Loading what="the ledger" />
      ) : entries.error ? (
        <Failed state={entries} what="the leave ledger" />
      ) : entries.entries.length ? (
        <Rows>
          {entries.entries.map((entry) => (
            <Row key={entry.id}>
              <span className="min-w-[10rem] flex-1 font-medium">{entry.employeeName}</span>
              <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
                {entry.leaveTypeName} · {entry.year} · {entry.note ?? 'no reason recorded'}
              </span>
              <span className="font-mono text-[13px]">{entry.days} day(s)</span>
              <span className="text-[12px] text-fg-muted">{new Date(entry.createdAt).toLocaleDateString('en-GB')}</span>
            </Row>
          ))}
        </Rows>
      ) : (
        <Empty body={kind === 'grant' ? 'No allocations yet' : 'No encashments yet'} />
      )}

      <Pager
        total={entries.total}
        page={pageIndex}
        pageSize={PAGE_SIZE}
        onPage={setPageIndex}
        noun={kind === 'grant' ? 'Allocation' : 'Encashment'}
        state={entries}
      />

      {open && (
        <RecordDialog
          modal={modal}
          onClose={() => setOpen(false)}
          onSubmit={async ({ fields }) => {
            const employee = employees.employees.find((row) => employeeLabel(row) === fields.Employee)
            const type = types.leaveTypes.find((row) => row.name === fields['Leave type'])
            if (!employee || !type) throw new Error('Choose an employee and a leave type.')
            if (!fields.Days || !fields.Year) throw new Error('Enter a number of days and a year.')
            const { recorded } = await api.post<{ recorded: boolean }>('/hr/leave/allocations', {
              employeeId: employee.id,
              leaveTypeId: type.id,
              year: Number(fields.Year),
              // Days stay a decimal string end to end: half a day is real, and
              // a float that has been through JSON is not what was typed.
              days: fields.Days,
              reason: fields.Reason,
              kind,
            })
            entries.refetch()
            /*
             * The write is idempotent per (kind, employee, type, year, reason),
             * so a second submission with the same reason answers 200 and
             * changes nothing. Closing the dialog on that would report a grant
             * that never happened — and would hide that the days typed the
             * second time were not the days that were stored.
             */
            if (!recorded) {
              throw new Error(
                `An entry for ${employee.fullName} · ${type.name} · ${fields.Year} with this reason already exists, so nothing was written. Change the reason to record a separate entry.`,
              )
            }
          }}
        />
      )}
    </>
  )
}

function LeaveTypesTab() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <LeaveTypeSetting />
    </div>
  )
}

/**
 * Holidays come from the tenant's working calendar, which is the same calendar
 * leave day-counts and attendance settlement read. A workspace with none
 * configured is told so rather than shown an empty list it might mistake for
 * "no holidays this year".
 */
function LeaveHolidaysTab() {
  const calendars = useCalendars()

  if (calendars.loading) return <Loading what="the holiday calendar" />
  if (calendars.error) return <Failed state={calendars} what="the holiday calendar" />
  if (!calendars.defaultCalendar) {
    return (
      <NotAvailable
        what="A holiday list"
        why="No default working calendar is configured for this workspace, so there is no working week or holiday list to read. Configure one under Support → Calendars."
      />
    )
  }

  const calendar = calendars.defaultCalendar
  if (!calendar.holidays.length) {
    return <Empty body={`${calendar.name} has no holidays recorded.`} />
  }

  return (
    <Rows>
      {calendar.holidays.map((holiday) => (
        <Row key={holiday.observedOn}>
          <span className="min-w-[10rem] flex-1 font-medium">{holiday.name}</span>
          <span className="text-[13px] text-fg-muted">{holiday.observedOn}</span>
        </Row>
      ))}
    </Rows>
  )
}

function LeavesPage({ page }: { page: HrPage }) {
  const [subTab, setSubTab] = useState(page.subTabs?.[0]?.label ?? 'Requests')

  return (
    <PageShell page={page} subTab={subTab} onSubTab={setSubTab}>
      {page.link && (
        <p className="flex items-center gap-2 text-[15px] font-medium text-accent">
          <span aria-hidden>🗓</span>
          <Link to="/app/me/leaves" className="hover:underline">
            {page.link}
          </Link>
        </p>
      )}

      {subTab === 'Requests' && <LeaveRequestsTab page={page} />}
      {subTab === 'Allocations' && <LeaveLedgerTab kind="grant" action="+ Grant leave" />}
      {subTab === 'Encashments' && <LeaveLedgerTab kind="encashment" action="+ Record encashment" />}
      {subTab === 'Types' && <LeaveTypesTab />}
      {subTab === 'Holidays' && <LeaveHolidaysTab />}
      {subTab === 'Comp-off' && (
        <NotAvailable
          what="Comp-off"
          why="Compensatory time off has no model of its own here — time worked in lieu is not distinguishable from any other leave entry."
        />
      )}
      {subTab === 'Policies' && (
        <NotAvailable what="Leave policies" why="Each leave type carries its own accrual and approval rules; there is no separate policy record." />
      )}
      {subTab === 'Periods & Accrual' && (
        <NotAvailable what="Fiscal periods and accrual runs" why="Leave entries carry the year they belong to, but nothing schedules an accrual run." />
      )}
      {subTab === 'Block lists' && <NotAvailable what="Blackout lists" why="Nothing records dates on which leave may not be booked." />}
    </PageShell>
  )
}

/* ------------------------------- Timesheets -------------------------------- */

const TIMESHEET_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'locked']

function TimesheetsPage({ page }: { page: HrPage }) {
  const [status, setStatus] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [opening, setOpening] = useState(false)

  const timesheets = useTimesheets({
    status: status || undefined,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  })
  const employees = useEmployees({ limit: 200 })

  const modal: HrModal = {
    title: 'New timesheet',
    submit: 'Create',
    fields: [
      optionOf('Employee', employeePicker(employees).options, true, 2, employeePicker(employees).hint),
      { kind: 'date', label: 'Period start', required: true, offsetDays: -30, span: 1 },
      { kind: 'date', label: 'Period end', required: true, span: 1 },
    ],
  }

  return (
    <PageShell
      page={page}
      actions={
        <Action variant="solid" onClick={() => setOpening(true)}>
          + New timesheet
        </Action>
      }
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <Select
          label="All statuses"
          value={status || 'All statuses'}
          options={TIMESHEET_STATUSES}
          onChange={(value) => {
            setStatus(value === 'All statuses' ? '' : value)
            setPageIndex(0)
          }}
        />
        <ListCount state={timesheets} total={timesheets.total} one="timesheet" many="timesheets" />
      </div>

      <WriteError error={timesheets.writeError} />

      {timesheets.loading ? (
        <Loading what="timesheets" />
      ) : timesheets.error ? (
        <Failed state={timesheets} what="timesheets" />
      ) : timesheets.timesheets.length ? (
        <>
          <Rows>
            {timesheets.timesheets.map((sheet) => (
              <Row key={sheet.id}>
                <span className="min-w-[10rem] flex-1 font-medium">{sheet.employeeName}</span>
                <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
                  {sheet.periodStart} to {sheet.periodEnd}
                </span>
                <span className="font-mono text-[13px]">{formatMinutes(sheet.totalMinutes)}</span>
                <Tag tone={toneFor(sheet.status)}>{sheet.status}</Tag>
                {(sheet.status === 'draft' || sheet.status === 'rejected') && (
                  <button
                    disabled={timesheets.writing}
                    onClick={() => void timesheets.submit(sheet.id, sheet.version)}
                    className="text-[13px] font-medium text-accent disabled:opacity-40"
                  >
                    Submit
                  </button>
                )}
                {sheet.status === 'submitted' && (
                  <>
                    <button
                      disabled={timesheets.writing}
                      onClick={() => void timesheets.decide(sheet.id, 'approved', sheet.version)}
                      className="text-[13px] font-medium text-ok disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      disabled={timesheets.writing}
                      onClick={() => void timesheets.decide(sheet.id, 'rejected', sheet.version)}
                      className="text-[13px] font-medium text-bad disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </>
                )}
              </Row>
            ))}
          </Rows>
          <Pager total={timesheets.total} page={pageIndex} pageSize={PAGE_SIZE} onPage={setPageIndex} noun="Timesheet" />
        </>
      ) : (
        <Empty body={page.empty} />
      )}

      <p className="text-[13px] text-fg-muted">
        Daily entries are added through the API; this screen opens a period, submits it and decides it.
      </p>

      {opening && (
        <RecordDialog
          modal={modal}
          onClose={() => setOpening(false)}
          onSubmit={async ({ fields }) => {
            const employee = employees.employees.find((row) => employeeLabel(row) === fields.Employee)
            if (!employee) throw new Error('Choose an employee.')
            await api.post('/hr/timesheets', {
              employeeId: employee.id,
              periodStart: fields['Period start'],
              periodEnd: fields['Period end'],
            })
            timesheets.refetch()
          }}
        />
      )}
    </PageShell>
  )
}

/* -------------------------------- Overtime --------------------------------- */

const OVERTIME_STATUSES = ['submitted', 'approved', 'rejected', 'cancelled']

function OvertimePage({ page }: { page: HrPage }) {
  const [status, setStatus] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [logging, setLogging] = useState(false)
  // Paged: the count beside the filter is the server's count for the whole
  // filter, so without a pager it named claims there was no way to reach.
  const claims = useOvertime({ status: status || undefined, limit: PAGE_SIZE, offset: pageIndex * PAGE_SIZE })
  const employees = useEmployees({ limit: 200 })

  const modal: HrModal = {
    title: 'Log overtime',
    submit: 'Log overtime',
    fields: [
      optionOf('Employee', employeePicker(employees).options, true, 2, employeePicker(employees).hint),
      { kind: 'date', label: 'Worked on', required: true, span: 1 },
      { kind: 'number', label: 'Minutes', value: '60', span: 1 },
      { kind: 'textarea', label: 'Reason' },
    ],
  }

  return (
    <PageShell
      page={page}
      actions={
        <Action variant="solid" onClick={() => setLogging(true)}>
          + Log overtime
        </Action>
      }
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <Select
          label="All statuses"
          value={status || 'All statuses'}
          options={OVERTIME_STATUSES}
          onChange={(value) => {
            setStatus(value === 'All statuses' ? '' : value)
            setPageIndex(0)
          }}
        />
        <ListCount state={claims} total={claims.total} one="claim" many="claims" />
      </div>

      <WriteError error={claims.writeError} />

      {claims.loading ? (
        <Loading what="overtime claims" />
      ) : claims.error ? (
        <Failed state={claims} what="overtime claims" />
      ) : claims.claims.length ? (
        <Rows>
          {claims.claims.map((claim) => (
            <Row key={claim.id}>
              <span className="min-w-[10rem] flex-1 font-medium">{claim.employeeName}</span>
              <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
                {claim.workedOn} · {claim.reason ?? 'no reason recorded'}
              </span>
              <span className="font-mono text-[13px]">{formatMinutes(claim.minutes)}</span>
              <Tag tone={toneFor(claim.status)}>{claim.status}</Tag>
              {claim.status === 'submitted' && (
                <>
                  <button
                    disabled={claims.writing}
                    onClick={() => void claims.decide(claim.id, 'approved', claim.version)}
                    className="text-[13px] font-medium text-ok disabled:opacity-40"
                  >
                    Approve
                  </button>
                  <button
                    disabled={claims.writing}
                    onClick={() => void claims.decide(claim.id, 'rejected', claim.version)}
                    className="text-[13px] font-medium text-bad disabled:opacity-40"
                  >
                    Reject
                  </button>
                </>
              )}
            </Row>
          ))}
        </Rows>
      ) : (
        <Empty body={page.empty} />
      )}

      <Pager total={claims.total} page={pageIndex} pageSize={PAGE_SIZE} onPage={setPageIndex} noun="Overtime" state={claims} />

      {logging && (
        <RecordDialog
          modal={modal}
          onClose={() => setLogging(false)}
          onSubmit={async ({ fields }) => {
            const employee = employees.employees.find((row) => employeeLabel(row) === fields.Employee)
            if (!employee) throw new Error('Choose an employee.')
            if (!fields.Minutes) throw new Error('Enter how many minutes were worked.')
            await api.post('/hr/overtime', {
              employeeId: employee.id,
              workedOn: fields['Worked on'],
              minutes: Number(fields.Minutes),
              reason: fields.Reason || undefined,
            })
            claims.refetch()
          }}
        />
      )}
    </PageShell>
  )
}

/* ----------------------------- Overtime report ----------------------------- */

const monthAgo = () => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
const todayIso = () => new Date().toISOString().slice(0, 10)

const REPORT_LIMIT = 500

/**
 * Overtime measured from settled attendance, over the range the filter asks for.
 *
 * The two figures above the list are the server's totals for the whole filter,
 * so they answer for the range rather than for the rows that happen to fit on
 * screen — and they move when the dates do, which the transcribed screen's
 * "computed live" claim promised and never did.
 */
function OvertimeReportPage({ page }: { page: HrPage }) {
  const [from, setFrom] = useState(monthAgo)
  const [to, setTo] = useState(todayIso)
  const [employeeId, setEmployeeId] = useState('')

  const employees = useEmployees({ limit: 200 })
  const report = useAttendance({
    from,
    to,
    employeeId: employeeId || undefined,
    minOvertimeMinutes: 1,
    limit: REPORT_LIMIT,
  })

  const complete = report.total <= report.days.length
  const exportCsv = () => {
    const header = ['Employee', 'Date', 'Status', 'Worked minutes', 'Overtime minutes', 'Late minutes']
    const body = report.days.map((day) => [
      day.employeeName,
      day.attendanceOn,
      day.status,
      String(day.workedMinutes),
      String(day.overtimeMinutes),
      String(day.lateMinutes),
    ])
    downloadCsv(`overtime-${from}-to-${to}`, [header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n'))
  }

  const chosen = employees.employees.find((employee) => employee.id === employeeId)

  return (
    <PageShell page={page}>
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-line bg-surface p-5">
        <label className="block">
          <span className="text-[13px] text-fg-muted">From</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="mt-1.5 block rounded-xl border border-line bg-surface px-3 py-2 text-[14px]"
          />
        </label>
        <label className="block">
          <span className="text-[13px] text-fg-muted">To</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="mt-1.5 block rounded-xl border border-line bg-surface px-3 py-2 text-[14px]"
          />
        </label>
        <label className="block min-w-[14rem] flex-1">
          <span className="text-[13px] text-fg-muted">Employee</span>
          <span className="mt-1.5 block">
            <Select
              label="All employees"
              value={chosen ? employeeLabel(chosen) : 'All employees'}
              options={employees.employees.map(employeeLabel)}
              onChange={(label) =>
                setEmployeeId(employees.employees.find((employee) => employeeLabel(employee) === label)?.id ?? '')
              }
            />
          </span>
          <span className="mt-1 block">
            <TruncatedPicker list={employees} />
          </span>
        </label>
        <button
          onClick={exportCsv}
          // Also disabled mid-refetch: the rows in hand still belong to the
          // previous range, and a CSV named for the new one would not hold it.
          disabled={!report.days.length || !complete || report.refreshing}
          title={
            report.refreshing
              ? 'Still measuring this range'
              : !report.days.length
                ? 'Nothing measured in this range'
                : complete
                  ? undefined
                  : `Only ${report.days.length} of ${report.total} matching days are loaded — narrow the range to export them all`
          }
          className="rounded-xl border border-line px-4 py-2 text-[14px] font-medium text-fg-2 transition enabled:hover:bg-surface-2 disabled:text-fg-muted disabled:opacity-50"
        >
          ⤓ Export CSV
        </button>
      </div>

      {report.loading ? (
        <Loading what="overtime" />
      ) : report.error ? (
        <Failed state={report} what="the overtime report" />
      ) : (
        <>
          {/*
            * While a new range is in flight the previous range's rows are still
            * in hand, so these two figures would read as the answer for dates
            * the server has not been asked about yet. They are withheld until
            * the request that matches the filter card has landed.
            */}
          <div className="flex flex-wrap gap-12 rounded-2xl border border-line bg-surface p-5" aria-live="polite">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Days with OT</p>
              <p className="mt-2 text-3xl font-bold">
                {report.refreshing || !report.totals ? (
                  <span className="text-[15px] font-normal text-fg-muted">Measuring…</span>
                ) : (
                  <CountUp value={String(report.totals.days)} />
                )}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Total OT in range</p>
              <p className="mt-2 text-3xl font-bold">
                {report.refreshing || !report.totals ? (
                  <span className="text-[15px] font-normal text-fg-muted">Measuring…</span>
                ) : (
                  formatMinutes(report.totals.overtimeMinutes)
                )}
              </p>
            </div>
          </div>

          {report.days.length ? (
            <Rows>
              {report.days.map((day) => (
                <Row key={`${day.employeeId}-${day.attendanceOn}`}>
                  <span className="min-w-[10rem] flex-1 font-medium">{day.employeeName}</span>
                  <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
                    {day.attendanceOn} · worked {formatMinutes(day.workedMinutes)}
                  </span>
                  <span className="font-mono text-[13px]">{formatMinutes(day.overtimeMinutes)} OT</span>
                </Row>
              ))}
            </Rows>
          ) : (
            <Empty body={page.empty} />
          )}

          <p className="text-[13px] text-fg-muted">
            Overtime is measured against an employee&apos;s assigned shift. A day with no shift assignment cannot have
            overtime computed for it at all, and does not appear here.
          </p>
        </>
      )}
    </PageShell>
  )
}

/* ------------------------------- Attendance -------------------------------- */

const ATTENDANCE_STATUSES = ['present', 'absent', 'weekly_off', 'holiday', 'leave', 'half_day', 'on_duty']

function AttendancePage({ page }: { page: HrPage }) {
  const [from, setFrom] = useState(monthAgo)
  const [to, setTo] = useState(todayIso)
  const [departmentId, setDepartmentId] = useState('')
  const [status, setStatus] = useState('')
  const [pageIndex, setPageIndex] = useState(0)

  const departments = useVocabulary('department')
  const attendance = useAttendance({
    from,
    to,
    departmentId: departmentId || undefined,
    status: status || undefined,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  })

  return (
    <PageShell page={page}>
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          type="date"
          aria-label="Attendance from"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value)
            setPageIndex(0)
          }}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-fg-2"
        />
        <span aria-hidden className="text-fg-muted">
          –
        </span>
        <input
          type="date"
          aria-label="Attendance to"
          value={to}
          onChange={(event) => {
            setTo(event.target.value)
            setPageIndex(0)
          }}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-fg-2"
        />
        <Select
          label="All departments"
          value={departments.entries.find((entry) => entry.id === departmentId)?.name ?? 'All departments'}
          options={departments.entries.map((entry) => entry.name)}
          onChange={(name) => {
            setDepartmentId(idByName(departments.entries, name) ?? '')
            setPageIndex(0)
          }}
        />
        <Select
          label="Any status"
          value={status || 'Any status'}
          options={ATTENDANCE_STATUSES}
          onChange={(value) => {
            setStatus(value === 'Any status' ? '' : value)
            setPageIndex(0)
          }}
        />
        <ListCount state={attendance} total={attendance.total} one="settled day" many="settled days" />
        <PickerNote state={departments} what="departments" shown={departments.entries.length} />
      </div>

      {attendance.loading ? (
        <Loading what="attendance" />
      ) : attendance.error ? (
        <Failed state={attendance} what="attendance" />
      ) : attendance.days.length ? (
        <>
          <Rows>
            {attendance.days.map((day) => (
              <Row key={`${day.employeeId}-${day.attendanceOn}`}>
                <span className="min-w-[10rem] flex-1 font-medium">{day.employeeName}</span>
                <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
                  {day.attendanceOn}
                  {day.departmentName ? ` · ${day.departmentName}` : ''}
                </span>
                <Tag tone={toneFor(day.status)}>{day.status.replace('_', ' ')}</Tag>
                <span className="font-mono text-[13px]">{formatMinutes(day.workedMinutes)}</span>
                {day.lateMinutes > 0 && <span className="text-[12px] text-warn">{formatMinutes(day.lateMinutes)} late</span>}
              </Row>
            ))}
          </Rows>
          <Pager total={attendance.total} page={pageIndex} pageSize={PAGE_SIZE} onPage={setPageIndex} noun="Attendance" />
        </>
      ) : (
        <Empty body="No settled attendance in this range." />
      )}

      <p className="text-[13px] text-fg-muted">
        A day appears once it has been settled from its clock events. Punched days that have not been settled are not
        shown as absence, because nobody has worked out what they were yet.
      </p>
    </PageShell>
  )
}

/* --------------------------------- Shifts ---------------------------------- */

const WEEK_PATTERNS: Record<string, number[]> = {
  'Monday to Friday': [1, 2, 3, 4, 5],
  'Monday to Saturday': [1, 2, 3, 4, 5, 6],
  'Every day': [],
}

/** "09:30" to a minute of the day; anything else is rejected by the caller. */
function minutesOfClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 47 || minutes > 59) return null
  return hours * 60 + minutes
}

function ShiftsPage({ page }: { page: HrPage }) {
  const [subTab, setSubTab] = useSubTab(page)
  const [creating, setCreating] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const shifts = useShifts()
  const assignments = useShiftAssignments(subTab === 'Assignments')
  const employees = useEmployees({ limit: 200 }, subTab === 'Assignments')

  const shiftModal: HrModal = {
    title: 'New shift',
    submit: 'Create shift',
    fields: [
      { kind: 'text', label: 'Name', required: true, span: 2 },
      { kind: 'text', label: 'Starts', required: true, placeholder: '09:00', span: 1 },
      { kind: 'text', label: 'Ends', required: true, placeholder: '18:00', span: 1 },
      { kind: 'number', label: 'Break (minutes)', value: '60', span: 1 },
      { kind: 'number', label: 'Grace (minutes)', value: '10', span: 1 },
      optionOf('Days', Object.keys(WEEK_PATTERNS), true, 2),
    ],
  }

  const assignModal: HrModal = {
    title: 'Assign shift',
    submit: 'Assign',
    fields: [
      optionOf('Employee', employeePicker(employees).options, true, 2, employeePicker(employees).hint),
      optionOf('Shift', shifts.shifts.map((shift) => shift.name), true, 1),
      { kind: 'date', label: 'Effective from', required: true, span: 1 },
    ],
  }

  return (
    <PageShell
      page={page}
      subTab={subTab}
      onSubTab={setSubTab}
      actions={
        subTab === 'Assignments' ? (
          <Action variant="solid" onClick={() => setAssigning(true)}>
            + Assign shift
          </Action>
        ) : (
          <Action variant="solid" onClick={() => setCreating(true)}>
            + New shift
          </Action>
        )
      }
    >
      {subTab === 'Definitions' &&
        (shifts.loading ? (
          <Loading what="shifts" />
        ) : shifts.error ? (
          <Failed state={shifts} what="shifts" />
        ) : shifts.shifts.length ? (
          <Rows>
            {shifts.shifts.map((shift) => (
              <Row key={shift.id}>
                <span className="min-w-[10rem] flex-1 font-medium">{shift.name}</span>
                <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
                  {formatMinuteOfDay(shift.startsMinute)}–{formatMinuteOfDay(shift.endsMinute)} ·{' '}
                  {formatWeekdays(shift.weekdays)}
                </span>
                <span className="text-[12px] text-fg-muted">{shift.breakMinutes}m break</span>
                <span className="text-[12px] text-fg-muted">{shift.graceMinutes}m grace</span>
              </Row>
            ))}
          </Rows>
        ) : (
          <Empty body="No shifts defined yet. Click New shift to add your first one." />
        ))}

      {subTab === 'Assignments' &&
        (assignments.loading ? (
          <Loading what="shift assignments" />
        ) : assignments.error ? (
          <Failed state={assignments} what="shift assignments" />
        ) : assignments.assignments.length ? (
          <Rows>
            {assignments.assignments.map((assignment) => (
              <Row key={assignment.id}>
                <span className="min-w-[10rem] flex-1 font-medium">{assignment.employeeName}</span>
                <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">{assignment.shiftName}</span>
                <span className="text-[13px] text-fg-muted">
                  {assignment.effectiveFrom} — {assignment.effectiveTo ?? 'open'}
                </span>
              </Row>
            ))}
          </Rows>
        ) : (
          <Empty body="No shift assignments yet." />
        ))}

      {subTab === 'Assignments' && !assignments.loading && !assignments.error && (
        <Truncated shown={assignments.assignments.length} total={assignments.total} noun="assignments" />
      )}

      {creating && (
        <RecordDialog
          modal={shiftModal}
          onClose={() => setCreating(false)}
          onSubmit={async ({ fields }) => {
            const startsMinute = minutesOfClock(fields.Starts ?? '')
            const endsMinute = minutesOfClock(fields.Ends ?? '')
            if (startsMinute === null || endsMinute === null) throw new Error('Enter times as HH:MM, for example 09:00.')
            const weekdays = WEEK_PATTERNS[fields.Days ?? '']
            // "Every day" is a real choice, so an unchosen pattern must not
            // fall through to it.
            if (!weekdays) throw new Error('Choose which days the shift runs.')
            await api.post('/hr/shifts', {
              name: fields.Name,
              startsMinute,
              endsMinute,
              breakMinutes: Number(fields['Break (minutes)'] ?? 0),
              graceMinutes: Number(fields['Grace (minutes)'] ?? 0),
              weekdays,
            })
            shifts.refetch()
          }}
        />
      )}

      {assigning && (
        <RecordDialog
          modal={assignModal}
          onClose={() => setAssigning(false)}
          onSubmit={async ({ fields }) => {
            const employee = employees.employees.find((row) => employeeLabel(row) === fields.Employee)
            const shift = shifts.shifts.find((row) => row.name === fields.Shift)
            if (!employee || !shift) throw new Error('Choose an employee and a shift.')
            await api.post('/hr/shifts/assignments', {
              employeeId: employee.id,
              shiftId: shift.id,
              effectiveFrom: fields['Effective from'],
            })
            assignments.refetch()
          }}
        />
      )}
    </PageShell>
  )
}

/* --------------------------- Lifecycle changes ----------------------------- */

const changeLine = (from: string | null, to: string | null, label: string) =>
  from === to ? null : `${label}: ${from ?? 'unset'} → ${to ?? 'unset'}`

function LifecyclePage({ page }: { page: HrPage }) {
  const [subTab, setSubTab] = useSubTab(page)
  const [employeeId, setEmployeeId] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [moving, setMoving] = useState(false)

  const kind = subTab === 'Promotions' ? 'promotion' : 'transfer'
  const changes = useLifecycleChanges({
    kind,
    employeeId: employeeId || undefined,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  })
  const employees = useEmployees({ limit: 200 })
  const departments = useVocabulary('department')
  const designations = useVocabulary('designation')
  const locations = useVocabulary('location')

  const chosen = employees.employees.find((employee) => employee.id === employeeId)

  const modal: HrModal = {
    title: kind === 'promotion' ? 'New promotion' : 'New transfer',
    submit: 'Record',
    fields: [
      optionOf('Employee', employeePicker(employees).options, true, 2, employeePicker(employees).hint),
      { kind: 'date', label: 'Effective from', required: true, span: 1 },
      optionOf('Department', departments.entries.map((entry) => entry.name)),
      optionOf('Designation', designations.entries.map((entry) => entry.name)),
      optionOf('Location', locations.entries.map((entry) => entry.name)),
      { kind: 'text', label: 'Reason', required: true, span: 3 },
    ],
  }

  return (
    <PageShell page={page} subTab={subTab} onSubTab={setSubTab}>
      <div className="space-y-3">
        <Select
          label="All employees"
          value={chosen ? employeeLabel(chosen) : 'All employees'}
          options={employees.employees.map(employeeLabel)}
          onChange={(label) => {
            setEmployeeId(employees.employees.find((employee) => employeeLabel(employee) === label)?.id ?? '')
            setPageIndex(0)
          }}
        />
        <div className="flex items-center justify-end gap-3">
          <TruncatedPicker list={employees} />
          <ListCount state={changes} total={changes.total} one="change" many="changes" />
          <Action variant="solid" onClick={() => setMoving(true)}>
            {kind === 'promotion' ? '+ New promotion' : '+ New transfer'}
          </Action>
        </div>
      </div>

      {changes.loading ? (
        <Loading what="lifecycle changes" />
      ) : changes.error ? (
        <Failed state={changes} what="lifecycle changes" />
      ) : changes.changes.length ? (
        <Rows>
          {changes.changes.map((change) => (
            <Row key={change.id}>
              <span className="min-w-[10rem] flex-1 font-medium">{change.employeeName}</span>
              <span className="min-w-0 flex-[2] text-[13px] text-fg-muted">
                {[
                  changeLine(change.designationFrom, change.designationTo, 'Designation'),
                  changeLine(change.departmentFrom, change.departmentTo, 'Department'),
                  changeLine(change.locationFrom, change.locationTo, 'Location'),
                  changeLine(change.managerFrom, change.managerTo, 'Manager'),
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No field changed'}
              </span>
              <span className="text-[13px]">{change.reason}</span>
              <span className="text-[12px] text-fg-muted">from {change.effectiveFrom}</span>
            </Row>
          ))}
        </Rows>
      ) : (
        <Empty body={kind === 'promotion' ? 'No promotions recorded.' : 'No transfers recorded.'} />
      )}

      <Pager
        total={changes.total}
        page={pageIndex}
        pageSize={PAGE_SIZE}
        onPage={setPageIndex}
        noun={kind === 'promotion' ? 'Promotion' : 'Transfer'}
        state={changes}
      />

      <p className="text-[13px] text-fg-muted">
        The record keeps one reason per change rather than a promotion/transfer flag, so a change whose reason mentions a
        promotion is listed under Promotions and every other change under Transfers.
      </p>

      {moving && (
        <RecordDialog
          modal={modal}
          onClose={() => setMoving(false)}
          onSubmit={async ({ fields }) => {
            const employee = employees.employees.find((row) => employeeLabel(row) === fields.Employee)
            if (!employee) throw new Error('Choose an employee.')
            try {
              await api.post(`/hr/employees/${employee.id}/transfer`, {
                effectiveFrom: fields['Effective from'],
                departmentId: idByName(departments.entries, fields.Department),
                designationId: idByName(designations.entries, fields.Designation),
                locationId: idByName(locations.entries, fields.Location),
                reason: fields.Reason,
                version: employee.version,
              })
            } catch (error) {
              // See the exit dialog: a conflict with no reload is a button that
              // can only ever fail again.
              if (error instanceof ApiClientError && error.isConflict) {
                employees.refetch()
                throw new Error(
                  'Somebody else changed this employee while you were looking at it. The directory has been reloaded — close this and record the change again.',
                )
              }
              throw error
            }
            changes.refetch()
            employees.refetch()
          }}
        />
      )}
    </PageShell>
  )
}

/* -------------------------------- Documents -------------------------------- */

function DocumentsPage({ page }: { page: HrPage }) {
  const [employeeId, setEmployeeId] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const employees = useEmployees({ limit: 200 })
  // Paged, because the count beside the search is the server's: "40 documents"
  // over a list that stops at 25 is a count for rows nobody can open.
  const documents = useDocuments({
    employeeId: employeeId || undefined,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  })
  const today = todayIso()

  const chosen = employees.employees.find((employee) => employee.id === employeeId)

  return (
    <PageShell
      page={page}
      actions={
        <MutedAction why="Uploading a document is not available on this deployment: the file store is reachable only through the API.">
          + Add document
        </MutedAction>
      }
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <Select
          label="All employees"
          value={chosen ? employeeLabel(chosen) : 'All employees'}
          options={employees.employees.map(employeeLabel)}
          onChange={(label) => {
            setEmployeeId(employees.employees.find((employee) => employeeLabel(employee) === label)?.id ?? '')
            setPageIndex(0)
          }}
        />
        <TruncatedPicker list={employees} />
        <ListCount state={documents} total={documents.total} one="document" many="documents" />
      </div>

      {downloadError && (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad-muted/30 px-4 py-3 text-[13px] text-fg">
          {downloadError}
        </p>
      )}

      {documents.loading ? (
        <Loading what="documents" />
      ) : documents.error ? (
        <Failed state={documents} what="employee documents" />
      ) : documents.documents.length ? (
        <Rows>
          {documents.documents.map((document) => {
            const expired = document.validUntil !== null && document.validUntil < today
            return (
              <Row key={document.id}>
                <span className="min-w-[10rem] flex-1 font-medium">{document.employeeName}</span>
                <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
                  {document.kind} · {document.filename}
                </span>
                {document.validUntil && (
                  <span className={`text-[12px] ${expired ? 'font-medium text-bad' : 'text-fg-muted'}`}>
                    {expired ? 'expired' : 'valid until'} {document.validUntil}
                  </span>
                )}
                <button
                  onClick={async () => {
                    setDownloadError(null)
                    try {
                      await downloadFile(document.fileId)
                    } catch (error) {
                      setDownloadError(error instanceof Error ? error.message : 'That file could not be downloaded.')
                    }
                  }}
                  className="text-[13px] font-medium text-accent"
                >
                  Download
                </button>
              </Row>
            )
          })}
        </Rows>
      ) : (
        <Empty icon={page.emptyIcon} body={employeeId ? 'No documents held for this employee.' : page.empty} />
      )}

      <Pager total={documents.total} page={pageIndex} pageSize={PAGE_SIZE} onPage={setPageIndex} noun="Document" state={documents} />
    </PageShell>
  )
}

/* ------------------------------ self-service ------------------------------- */

/**
 * Team approvals and Performance both resolve the signed-in account to an
 * employee record. `GET /hr/me` answers `{employee: null}` honestly when there
 * is no link, so the "no employee profile" message is now a fact about this
 * account rather than a sentence printed for everybody.
 */
function TeamApprovalsPage() {
  const me = useSelfService()
  const employee = me.data?.employee ?? null
  const leave = useLeaveRequests({ managerId: employee?.id, status: 'submitted' }, Boolean(employee))
  const timesheets = useTimesheets({ managerId: employee?.id, status: 'submitted' }, Boolean(employee))
  const overtime = useOvertime({ managerId: employee?.id, status: 'submitted' }, Boolean(employee))

  if (me.loading) return <Loading what="your profile" />
  if (me.error) return <Failed state={me} what="your employee profile" />
  if (!employee) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Team approvals</h2>
        <Empty body="No employee profile is linked to your account, so there is nothing routed to you for approval." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Team approvals</h2>
        <p className="mt-1.5 max-w-3xl text-[15px] text-fg-muted">
          Everything your direct reports are waiting on you for, as {employee.fullName}.
        </p>
      </div>

      <WriteError error={leave.writeError ?? overtime.writeError ?? timesheets.writeError} />

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">
          Leave
          <Count state={leave} total={leave.total} />
        </h3>
        {leave.loading ? (
          <Loading what="leave requests" />
        ) : leave.error ? (
          <Failed state={leave} what="your team's leave requests" />
        ) : leave.requests.length ? (
          <Rows>
            {leave.requests.map((request) => (
              <Row key={request.id}>
                <span className="min-w-[10rem] flex-1 font-medium">{request.employeeName}</span>
                <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
                  {request.leaveTypeName} · {request.startsOn} to {request.endsOn} · {request.dayCount} day(s)
                </span>
                <button
                  disabled={leave.writing}
                  onClick={() => void leave.decide(request.id, 'approved', request.version)}
                  className="text-[13px] font-medium text-ok disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  disabled={leave.writing}
                  onClick={() => void leave.decide(request.id, 'rejected', request.version)}
                  className="text-[13px] font-medium text-bad disabled:opacity-40"
                >
                  Reject
                </button>
              </Row>
            ))}
          </Rows>
        ) : (
          <Empty body="No leave is waiting on you." />
        )}
        <Truncated shown={leave.requests.length} total={leave.total} noun="requests" />
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">
          Overtime
          <Count state={overtime} total={overtime.total} />
        </h3>
        {overtime.loading ? (
          <Loading what="overtime claims" />
        ) : overtime.error ? (
          <Failed state={overtime} what="your team's overtime claims" />
        ) : overtime.claims.length ? (
          <Rows>
            {overtime.claims.map((claim) => (
              <Row key={claim.id}>
                <span className="min-w-[10rem] flex-1 font-medium">{claim.employeeName}</span>
                <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
                  {claim.workedOn} · {formatMinutes(claim.minutes)}
                </span>
                <button
                  disabled={overtime.writing}
                  onClick={() => void overtime.decide(claim.id, 'approved', claim.version)}
                  className="text-[13px] font-medium text-ok disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  disabled={overtime.writing}
                  onClick={() => void overtime.decide(claim.id, 'rejected', claim.version)}
                  className="text-[13px] font-medium text-bad disabled:opacity-40"
                >
                  Reject
                </button>
              </Row>
            ))}
          </Rows>
        ) : (
          <Empty body="No overtime is waiting on you." />
        )}
        <Truncated shown={overtime.claims.length} total={overtime.total} noun="claims" />
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">
          Timesheets
          <Count state={timesheets} total={timesheets.total} />
        </h3>
        {timesheets.loading ? (
          <Loading what="timesheets" />
        ) : timesheets.error ? (
          <Failed state={timesheets} what="your team's timesheets" />
        ) : timesheets.timesheets.length ? (
          <Rows>
            {timesheets.timesheets.map((sheet) => (
              <Row key={sheet.id}>
                <span className="min-w-[10rem] flex-1 font-medium">{sheet.employeeName}</span>
                <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
                  {sheet.periodStart} to {sheet.periodEnd} · {formatMinutes(sheet.totalMinutes)}
                </span>
                <button
                  disabled={timesheets.writing}
                  onClick={() => void timesheets.decide(sheet.id, 'approved', sheet.version)}
                  className="text-[13px] font-medium text-ok disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  disabled={timesheets.writing}
                  onClick={() => void timesheets.decide(sheet.id, 'rejected', sheet.version)}
                  className="text-[13px] font-medium text-bad disabled:opacity-40"
                >
                  Reject
                </button>
              </Row>
            ))}
          </Rows>
        ) : (
          <Empty body="No timesheets are waiting on you." />
        )}
        <Truncated shown={timesheets.timesheets.length} total={timesheets.total} noun="timesheets" />
      </section>
    </div>
  )
}

function PerformancePage({ page }: { page: HrPage }) {
  const me = useSelfService()

  if (me.loading) return <Loading what="your profile" />
  if (me.error) return <Failed state={me} what="your employee profile" />

  const employee = me.data?.employee ?? null

  return (
    <PageShell page={page}>
      {!employee && page.notice && (
        // The callout is shown only when the account really has no employee
        // record; it used to print for everybody, including people who were
        // linked.
        <section className="rounded-2xl border border-warn/30 bg-warn-muted/40 p-5">
          <p className="flex gap-3 text-[15px] leading-relaxed text-warn">
            <span aria-hidden>ⓘ</span>
            You do not have an employee record yet. HR can set one up for you from People → Employees and link it to
            your account.
          </p>
        </section>
      )}

      {employee && (
        <Card>
          <h3 className="text-lg font-semibold">{employee.fullName}</h3>
          <p className="mt-1 text-[14px] text-fg-muted">
            {[employee.employeeNo, employee.designationName, employee.departmentName].filter(Boolean).join(' · ')}
          </p>
        </Card>
      )}

      <NotAvailable
        what="Performance reviews"
        why="Appraisal cycles and reviews are not served on this deployment, so neither your own review nor the reviews you owe others can be shown."
      />
    </PageShell>
  )
}

/* ------------------------------ not available ------------------------------ */

/** Why each remaining page has nothing behind it, in its own words. */
const UNAVAILABLE: Record<string, string> = {
  recruitment: 'Openings, applicants and interviews are not served on this deployment.',
  offers: 'Job offers and letter templates are not served on this deployment.',
  onboarding: 'Onboarding checklists, templates and runs have no model on this deployment.',
  separation:
    'Clearance and full-and-final settlement have no model here. An exit itself is recorded from People → Employees, which keeps the person’s history.',
  attendance_admin:
    'Attendance regularisation requests, bulk marking and approver lists have no model on this deployment. Corrections are made by re-settling a day.',
  training: 'The course catalogue and enrolments are not served on this deployment.',
  skills: 'The skill library and per-employee proficiency ratings have no model on this deployment.',
  care: 'Grievance cases and health-insurance enrolment are not served on this deployment.',
  announcements: 'Publishing and reading announcements is not served on this deployment.',
}

/**
 * A page with nothing behind it.
 *
 * It keeps its heading and sub-tabs so navigation still reads the same, and
 * drops every button: a create dialog with no endpoint writes to a browser
 * object that vanishes, which looks like success and is data loss.
 */
function UnavailablePage({ page }: { page: HrPage }) {
  const [subTab, setSubTab] = useSubTab(page)
  return (
    <PageShell page={page} subTab={subTab} onSubTab={setSubTab}>
      <NotAvailable what={page.title || page.label} why={UNAVAILABLE[page.id]} />
    </PageShell>
  )
}

/* ------------------------------ the dispatcher ----------------------------- */

/**
 * One HR page.
 *
 * Pages with a server behind them get a component that reads it; everything
 * else says so. There is no generic fallback that renders a page out of
 * browser-local records any more, because that fallback is what made twenty
 * screens look finished.
 */
export function HrPagePanel({ page }: { page: HrPage }) {
  if (page.calendar) {
    return <AttendanceCalendar select={page.calendar.select} />
  }

  switch (page.id) {
    case 'employees':
      return <EmployeesPage page={page} />
    case 'leaves':
      return <LeavesPage page={page} />
    case 'timesheets':
      return <TimesheetsPage page={page} />
    case 'overtime':
      return <OvertimePage page={page} />
    case 'overtime_report':
      return <OvertimeReportPage page={page} />
    case 'attendance':
      return <AttendancePage page={page} />
    case 'shifts':
      return <ShiftsPage page={page} />
    case 'lifecycle_changes':
      return <LifecyclePage page={page} />
    case 'documents':
      return <DocumentsPage page={page} />
    case 'team_approvals':
      return <TeamApprovalsPage />
    case 'performance':
      return <PerformancePage page={page} />
    default:
      return <UnavailablePage page={page} />
  }
}
