'use client'

import { RecordList } from '../../../components/RecordList'
import { recordsCsv, downloadCsv } from '../../../lib/csv'

import { useEffect, useState } from 'react'
import { Link } from '../../../lib/router'
import { SubTabs } from '../../../components/AppSideChrome'
import { AttendanceCalendar } from './AttendanceCalendar'
import { RecordDialog } from '../../../components/RecordDialog'
import { Action, Card, Chip, SearchBox, Select } from '../../../components/AppChrome'
import { hrSettingById, hrSettings } from '../../../lib/hrData'
import type { HrModal, HrPage, HrStat } from '../../../lib/hrData'
import { useWorkspace } from '../../../lib/workspace'
import { CountUp } from '../../../components/CountUp'

/* -------------------------------- Dashboard ------------------------------- */

export function HrDashboard() {
  const kpis = [
    { label: 'Active headcount', value: '0' },
    { label: 'Joiners', value: '0' },
    { label: 'Leavers', value: '0' },
    { label: 'Attrition', value: '0.0%' },
  ]

  const queues = [
    { label: 'Open positions', value: '0', sub: 'across all departments' },
    { label: 'On leave today', value: '0', sub: 'approved absences' },
    { label: 'Pending approvals', value: '0', sub: 'leave, timesheets, overtime' },
    { label: 'Onboardings in flight', value: '0', sub: 'joining this month' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="mt-1.5 text-[15px] text-fg-muted">
          Headcount, joiners, leavers, and everything waiting on People Ops today.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">{kpi.label}</p>
            <p className="mt-2.5 text-3xl font-bold">
              <CountUp value={kpi.value} />
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {queues.map((queue) => (
          <div key={queue.label} className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-[14px] text-fg-2">{queue.label}</p>
            <p className="mt-2 text-2xl font-bold">{queue.value}</p>
            <p className="mt-1 text-[12px] text-fg-muted">{queue.sub}</p>
          </div>
        ))}
      </div>

      <Card>
        <h3 className="text-lg font-semibold">Headcount by department</h3>
        <p className="py-16 text-center text-[15px] text-fg-muted">
          No employee records yet. Add your first employee, or import your existing roster.
        </p>
      </Card>
    </div>
  )
}

/* -------------------------------- Settings -------------------------------- */

/** A taxonomy editor: the list, then the inline add row. */
function SettingList({ settingKey, placeholder }: { settingKey: string; placeholder: string }) {
  const { appRecords, addAppRecord, removeAppRecord } = useWorkspace()
  const key = `hr.taxonomy.${settingKey}`
  const items = appRecords[key] ?? []
  const [draft, setDraft] = useState('')
  const [bulk, setBulk] = useState(false)

  // "Bulk add" is the same control taking one item per line.
  const commit = () => {
    draft
      .split(bulk ? '\n' : '\u0000')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => addAppRecord(key, line, {}))
    setDraft('')
  }

  return (
    <>
      {items.length ? (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 py-3 text-[15px]">
              <span className="flex-1">{item.title}</span>
              <button
                onClick={() => removeAppRecord(key, item.id)}
                aria-label={`Remove ${item.title}`}
                className="text-[13px] text-fg-muted transition hover:text-bad"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-14 text-center text-[15px] text-fg-muted">No items configured. Add one below.</p>
      )}

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
          disabled={!draft.trim()}
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
    </>
  )
}

export function HrSettings() {
  const [active, setActive] = useState('general')
  const setting = hrSettingById.get(active) ?? hrSettings[0]

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
          {setting.kind === 'list' ? (
            <SettingList settingKey={setting.id} placeholder={setting.addPlaceholder ?? "Add new item..."} />
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
              <p className="text-[15px] text-fg-muted">Nothing configured yet for {setting.title.toLowerCase()}.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ Generic page ------------------------------ */

const valueTones = { fg: '', warn: 'text-warn', ok: 'text-ok', bad: 'text-bad' } as const

function StatCard({ stat }: { stat: HrStat }) {
  const card =
    stat.tone === 'active'
      ? 'border-accent bg-accent/5'
      : stat.tone === 'done'
        ? 'border-ok/40 bg-ok-muted/40'
        : 'border-line bg-surface'

  return (
    <div className={`rounded-2xl border p-5 ${card}`}>
      <p className="text-[14px] text-fg-2">{stat.label}</p>
      <p className={`mt-2.5 text-3xl font-bold ${valueTones[stat.valueTone ?? 'fg']}`}>
        <CountUp value={stat.value} />
      </p>
    </div>
  )
}

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

/**
 * Renders one HR page from its spec. Pages differ in which pieces they show —
 * header actions, sub-tabs, stat cards, a search box, filter selects, a date
 * range, a view toggle, a wide select, a row count — so each is conditional.
 */
export function HrPagePanel({ page }: { page: HrPage }) {
  const [subTab, setSubTab] = useState(page.subTabs?.[0]?.label ?? '')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [chip, setChip] = useState(page.chips?.[0] ?? '')
  const [mode, setMode] = useState(page.modeTabs?.[0]?.label ?? '')
  const [dialogOpen, setDialogOpen] = useState<HrModal | null>(null)
  const { appRecords, removeAppRecord } = useWorkspace()

  // Reset page-local state when navigating between pages.
  useEffect(() => {
    setSubTab(page.subTabs?.[0]?.label ?? '')
    setChip(page.chips?.[0] ?? '')
    setMode(page.modeTabs?.[0]?.label ?? '')
    setDialogOpen(null)
  }, [page.id, page.subTabs, page.chips, page.modeTabs])

  if (page.calendar) {
    return (
      <AttendanceCalendar
        note={page.calendar.note}
        select={page.calendar.select}
        legend={page.calendar.legend}
      />
    )
  }

  const activeSubTab = page.subTabs?.find((tab) => tab.label === subTab)
  const subEmpty = activeSubTab?.empty

  /*
   * Pages differ in how the empty state reads. Most show a sentence; some (Leaves,
   * Employees) show a large heading. A page with no `empty` sentence promotes its
   * sub-tab's text to the heading instead of printing it twice.
   */
  const emptyHeading = page.emptyTitle ?? (page.empty === '' ? subEmpty : undefined)
  const emptyBody = page.empty === '' ? undefined : (subEmpty ?? page.empty)

  /* A sub-tab may bring its own toolbar and dialog (Skills and Training do). */
  const dialog = activeSubTab?.modal ?? page.modal
  const subToolbar =
    activeSubTab &&
    (activeSubTab.note || activeSubTab.action || activeSubTab.filters || activeSubTab.select)
      ? activeSubTab
      : undefined

  const recordKey = `hr.${page.id}${activeSubTab ? `.${activeSubTab.label}` : ''}`
  const records = (appRecords[recordKey] ?? []).filter((record) => [record.title, ...Object.values(record.fields)].join(' ').toLowerCase().includes(query.trim().toLowerCase()))

  /*
   * Every action on an HR page creates something. Where the page ships a field
   * spec the dialog uses it; where it doesn't, the button still opens a dialog
   * named after itself rather than doing nothing.
   */
  const open = (label: string, modal?: HrModal) =>
    setDialogOpen(
      modal ?? {
        title: label.replace(/^[^\p{L}]+/u, ''),
        submit: label.replace(/^[^\p{L}]+/u, ''),
        fields: [
          { kind: 'text', label: 'Name', required: true, span: 2 },
          { kind: 'date', label: 'Date', span: 1 },
          { kind: 'textarea', label: 'Notes' },
        ],
      },
    )

  // A "… report" page reports on the page it is named after, so that is what
  // it exports — nothing is ever created on the report itself.
  const exportKey = page.id.endsWith('_report') ? `hr.${page.id.replace(/_report$/, '')}` : recordKey
  const exportRows = appRecords[exportKey] ?? []

  const exportCsv = () => {
    downloadCsv(exportKey, recordsCsv(exportRows))
  }

  const hasToolbar = page.search || page.filters || page.dateRange || page.viewToggle || page.count || page.action

  return (
    <div className="space-y-6">
      {page.modeTabs && (
        <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1">
          {page.modeTabs.map((item) => (
            <button
              key={item.label}
              onClick={() => setMode(item.label)}
              aria-pressed={mode === item.label}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[15px] font-medium transition ${
                mode === item.label ? 'bg-accent/10 text-accent' : 'text-fg-2 hover:bg-surface-2'
              }`}
            >
              {item.icon && <span aria-hidden className="text-[13px]">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{page.title}</h2>
          <p className="mt-1.5 max-w-3xl text-[15px] text-fg-muted">{page.blurb}</p>
        </div>

        {page.headerActions && (
          <div className="flex flex-wrap gap-2.5">
            {page.headerActions.map((item) => (
              <Action
                key={item.label}
                variant={item.primary ? 'solid' : 'outline'}
                onClick={() => open(item.label, item.primary ? dialog : undefined)}
              >
                {item.label}
              </Action>
            ))}
          </div>
        )}

        {page.subTabs && page.subTabStyle !== 'underline' && (
          <SubTabs
            tabs={page.subTabs.map((tab) => (tab.icon ? `${tab.icon} ${tab.label}` : tab.label))}
            value={activeSubTab?.icon ? `${activeSubTab.icon} ${subTab}` : subTab}
            onChange={(next) => {
              const match = page.subTabs?.find((tab) => next.endsWith(tab.label))
              if (match) setSubTab(match.label)
            }}
          />
        )}
      </div>

      {page.subTabs && page.subTabStyle === 'underline' && (
        <UnderlineTabs tabs={page.subTabs} value={subTab} onChange={setSubTab} />
      )}

      {page.notice && (
        <section className="rounded-2xl border border-warn/30 bg-warn-muted/40 p-5">
          <p className="flex gap-3 text-[15px] leading-relaxed text-warn">
            <span aria-hidden>ⓘ</span>
            {page.notice.text}
          </p>
          <div className="mt-4 pl-7">
            <Action variant="solid" onClick={() => open(page.notice!.action)}>
              {page.notice.action}
            </Action>
          </div>
        </section>
      )}

      {subToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {subToolbar.note ? (
            <p className="max-w-3xl flex-1 text-[15px] text-fg-2">{subToolbar.note}</p>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {subToolbar.filters?.map((filter) => (
                <Select key={filter} label={filter} />
              ))}
              {subToolbar.select && <Select label={subToolbar.select} />}
            </div>
          )}

          <div className="flex flex-wrap gap-2.5">
            {subToolbar.secondaryAction && (
              <Action onClick={() => open(subToolbar.secondaryAction!)}>{subToolbar.secondaryAction}</Action>
            )}
            {subToolbar.action && (
              <Action variant="solid" onClick={() => open(subToolbar.action!, activeSubTab?.modal)}>
                {subToolbar.action}
              </Action>
            )}
          </div>
        </div>
      )}

      {page.link && (
        <p className="flex items-center gap-2 text-[15px] font-medium text-accent">
          <span aria-hidden>🗓</span>
          <Link to="/app/me/leaves" className="hover:underline">
            {page.link}
          </Link>
        </p>
      )}

      {page.chips && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {page.chips.map((item) => (
              <Chip key={item} active={chip === item} onClick={() => setChip(item)}>
                {item}
              </Chip>
            ))}
          </div>
          {page.chipsAction && (
            <Action variant="solid" onClick={() => open(page.chipsAction!, dialog)}>
              {page.chipsAction}
            </Action>
          )}
        </div>
      )}

      {page.dateFilterCard && (
        <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-line bg-surface p-5">
          <label className="block">
            <span className="text-[13px] text-fg-muted">{page.dateFilterCard.from}</span>
            <input
              type="date"
              className="mt-1.5 block rounded-xl border border-line bg-surface px-3 py-2 text-[14px]"
            />
          </label>
          <label className="block">
            <span className="text-[13px] text-fg-muted">{page.dateFilterCard.to}</span>
            <input
              type="date"
              className="mt-1.5 block rounded-xl border border-line bg-surface px-3 py-2 text-[14px]"
            />
          </label>
          <label className="block min-w-[14rem] flex-1">
            <span className="text-[13px] text-fg-muted">Employee</span>
            <span className="mt-1.5 block">
              <Select label={page.dateFilterCard.select} options={exportRows.map((item) => item.title)} />
            </span>
          </label>
          <button
            onClick={exportCsv}
            disabled={!exportRows.length}
            title={exportRows.length ? undefined : 'Nothing to export in this range'}
            className="rounded-xl border border-line px-4 py-2 text-[14px] font-medium text-fg-2 transition enabled:hover:bg-surface-2 disabled:text-fg-muted disabled:opacity-50"
          >
            {page.dateFilterCard.export}
          </button>
        </div>
      )}

      {page.metrics && (
        <div className="flex flex-wrap gap-12 rounded-2xl border border-line bg-surface p-5">
          {page.metrics.map((metric) => (
            <div key={metric.label}>
              <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">{metric.label}</p>
              <p className="mt-2 text-3xl font-bold">
                <CountUp value={metric.value} />
              </p>
            </div>
          ))}
        </div>
      )}

      {page.stats && (
        <div className={`grid gap-4 sm:grid-cols-2 ${page.stats.length > 4 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
          {page.stats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </div>
      )}

      {hasToolbar && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {page.search && <SearchBox placeholder={page.search} value={query} onChange={setQuery} />}
            {page.filters?.map((filter) => (
              <Select key={filter} label={filter} />
            ))}
            {page.count && <span className="text-[13px] text-fg-muted">{page.count}</span>}
            {page.action && !page.wideSelect && (
              <span className="ml-auto">
                <Action variant="solid" onClick={() => open(page.action!, dialog)}>
                  {page.action}
                </Action>
              </span>
            )}
          </div>

          {(page.dateRange || page.viewToggle) && (
            <div className="flex flex-wrap items-center gap-2.5">
              {page.dateRange && (
                <>
                  <span className="text-[13px] text-fg-2">{page.dateRange}</span>
                  <input
                    type="date"
                    aria-label={`${page.dateRange} from`}
                    className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-fg-2"
                  />
                  <span aria-hidden className="text-fg-muted">
                    –
                  </span>
                  <input
                    type="date"
                    aria-label={`${page.dateRange} to`}
                    className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-fg-2"
                  />
                </>
              )}
              {page.viewToggle && (
                <span className="ml-auto">
                  <ViewToggle view={view} onChange={setView} />
                </span>
              )}
            </div>
          )}

          {page.wideSelect && (
            <>
              <Select label={page.wideSelect} options={records.map((item) => item.title)} />
              {page.action && (
                <div className="flex justify-end">
                  <Action variant="solid" onClick={() => open(page.action!, dialog)}>
                    {page.action}
                  </Action>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!page.notice && records.length > 0 && (
        <RecordList records={records} onDelete={(id) => removeAppRecord(recordKey, id)} grid={view === 'grid'} />
      )}

      {!page.notice && records.length === 0 && (
      <div className="rounded-2xl border border-dashed border-line bg-surface">
        <div className="px-6 py-16 text-center">
          {page.emptyIcon && (
            <span aria-hidden className="text-2xl text-fg-muted">
              {page.emptyIcon}
            </span>
          )}
          {emptyHeading && <p className="mt-4 text-xl font-semibold">{emptyHeading}</p>}
          {emptyBody && <p className={`text-[15px] text-fg-muted ${emptyHeading ? 'mt-2' : ''}`}>{emptyBody}</p>}
        </div>
      </div>
      )}

      {dialogOpen && (
        <RecordDialog modal={dialogOpen} recordKey={recordKey} onClose={() => setDialogOpen(null)} />
      )}
    </div>
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
