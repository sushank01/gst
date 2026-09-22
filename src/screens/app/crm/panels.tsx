'use client'

import { useState } from 'react'
import { Action, BigEmpty, Card, Chip, SearchBox, Segmented, Select, Toolbar } from '../../../components/AppChrome'
import {
  activityTypes,
  contactTypes,
  flowStages,
  leadSources,
  leadStatuses,
  pipelineStages,
  settingsGroups,
  timeRanges,
} from '../../../lib/crmData'
import { CountUp } from '../../../components/CountUp'
import { useAuth } from '../../../lib/auth'
import { Dialog } from '../../../components/Dialog'
import { useLeadFilters, useServerLeads, type ServerLead } from './useServerLeads'
import { useRecords } from './records'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/* -------------------------------- Dashboard ------------------------------- */

export function CrmDashboard() {
  const { session } = useAuth()
  const firstName = session?.user.fullName.split(' ')[0] ?? 'there'
  const deals = useRecords('crm.deals')
  const leads = useRecords('crm.leads')
  const tasks = useRecords('crm.tasks')

  const stageOf = (deal: (typeof deals.records)[number]) => deal.fields.Stage ?? 'New'
  const open = deals.records.filter((deal) => !['Won', 'Lost'].includes(stageOf(deal)))
  const won = deals.records.filter((deal) => stageOf(deal) === 'Won')
  const decided = deals.records.filter((deal) => ['Won', 'Lost'].includes(stageOf(deal)))
  const pipeline = open.reduce((total, deal) => total + Number(deal.fields.Value ?? 0), 0)

  // Every figure counts the tenant's own deals, so a fresh CRM reads zero.
  const kpis = [
    {
      label: 'Pipeline value',
      value: `$${pipeline.toLocaleString()}`,
      sub: `across ${open.length} open deal${open.length === 1 ? '' : 's'}`,
      icon: '$',
      featured: true,
    },
    { label: 'Open deals', value: String(open.length), sub: `${deals.records.length} all time`, icon: '💼' },
    { label: 'Won', value: String(won.length), sub: 'closed successfully', icon: '🏆' },
    {
      label: 'Win rate',
      value: decided.length ? `${Math.round((won.length / decided.length) * 100)}%` : '0%',
      sub: decided.length ? `of ${decided.length} decided` : 'no deals yet',
      icon: '🔥',
    },
  ]

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="h-1.5 bg-accent" />
        <div className="flex flex-wrap items-center justify-between gap-5 p-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              {greeting()}, {firstName}
            </h2>
            <p className="mt-2 text-[15px] text-fg-muted">
              {open.length
                ? `${open.length} open deal${open.length === 1 ? '' : 's'} worth $${pipeline.toLocaleString()}.`
                : "No open deals yet. Let's start your pipeline."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Action variant="solid" onClick={() => deals.create()}>
              + New deal
            </Action>
            <Action onClick={() => leads.create()}>◎ New lead</Action>
            <Action onClick={() => tasks.create()}>☑ New task</Action>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-2xl border p-6 ${
              kpi.featured ? 'border-accent bg-accent text-white' : 'border-line bg-surface'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p
                className={`text-[11px] font-semibold tracking-[0.08em] uppercase ${
                  kpi.featured ? 'text-white/80' : 'text-fg-muted'
                }`}
              >
                {kpi.label}
              </p>
              <span
                aria-hidden
                className={`grid h-9 w-9 place-items-center rounded-xl text-[14px] ${
                  kpi.featured ? 'bg-white/15' : 'bg-surface-2'
                }`}
              >
                {kpi.icon}
              </span>
            </div>
            <p className="mt-5 text-4xl font-bold">
              <CountUp value={kpi.value} />
            </p>
            <p className={`mt-2 text-[13px] ${kpi.featured ? 'text-white/70' : 'text-fg-muted'}`}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Pipeline flow</h3>
            <span className="text-[13px] text-fg-muted">by stage value</span>
          </div>

          <ul className="mt-6 space-y-4">
            {flowStages.map((stage) => (
              <li key={stage.name} className="flex items-center gap-4">
                <span className="w-32 shrink-0 truncate text-[15px] text-fg-2">{stage.name}</span>
                <span className="h-7 flex-1 rounded-lg bg-surface-2" />
                <span className="w-16 shrink-0 text-right text-[13px] text-fg-muted">
                  {deals.records.filter((deal) => (deal.fields.Stage ?? 'New') === stage.name).length} deals
                </span>
                <span className="w-10 shrink-0 text-right text-[15px] font-semibold">
                  $
                  {deals.records
                    .filter((deal) => (deal.fields.Stage ?? 'New') === stage.name)
                    .reduce((total, deal) => total + Number(deal.fields.Value ?? 0), 0)
                    .toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recent activity</h3>
            <span className="text-[13px] text-fg-muted">Last 10 · View all</span>
          </div>
          <div className="py-20 text-center">
            <span aria-hidden className="text-2xl text-accent">
              📞
            </span>
            <p className="mt-4 text-lg font-medium">No activity yet.</p>
            <p className="mt-1.5 text-[14px] text-fg-muted">Calls, emails and notes will appear here.</p>
          </div>
        </Card>
      </div>

      {deals.dialog}
      {leads.dialog}
      {tasks.dialog}
    </div>
  )
}

/* ---------------------------------- Leads --------------------------------- */

/**
 * Leads — the first screen moved off browser state onto the server.
 *
 * Filtering, searching and paging are SQL, so the count beside the list is the
 * number of matching rows rather than the number that happened to be loaded.
 * Every real fetch state is rendered: a failure shows an error with a retry
 * instead of an empty list, which is the distinction the prototype could not
 * make because its data was always present.
 */
export function CrmLeads() {
  const { filters, query, status, source, page, pageSize, setQuery, setStatus, setSource, setPageSize, setPage } =
    useLeadFilters()
  const [view, setView] = useState('List')
  const [byScore, setByScore] = useState(false)
  const [creating, setCreating] = useState(false)
  const leads = useServerLeads(filters)

  const pageCount = Math.max(1, Math.ceil(leads.total / pageSize))
  const shown = byScore ? [...leads.leads].sort((a, b) => b.score - a.score) : leads.leads

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Toolbar>
            {leadStatuses.map((item) => (
              <Chip key={item} active={status === item} onClick={() => setStatus(item)}>
                {item}
              </Chip>
            ))}
          </Toolbar>

          <div className="flex flex-wrap items-center gap-2.5">
            <Segmented options={['List', 'Board']} value={view} onChange={setView} />
            <SearchBox placeholder="Search leads..." value={query} onChange={setQuery} />
            <Select
              label="/ page"
              value={`${pageSize} / page`}
              onChange={(value) => setPageSize(parseInt(value, 10) || 25)}
              options={['25 / page', '50 / page', '100 / page']}
            />
            <span className="text-[13px] text-fg-muted" aria-live="polite">
              {leads.refreshing ? 'Updating…' : `${leads.total} lead${leads.total === 1 ? '' : 's'}`}
            </span>
            <Action onClick={() => setByScore(true)}>Show highest scores</Action>
            <Action variant="solid" onClick={() => setCreating(true)}>
              + New lead
            </Action>
          </div>
        </div>

        <Toolbar>
          <Select
            label="All sources"
            value={source || 'All sources'}
            onChange={(value) => setSource(value === 'All sources' ? '' : value)}
            options={['All sources', ...leadSources]}
          />
          <button
            onClick={() => setByScore((prev) => !prev)}
            aria-pressed={byScore}
            className={`rounded-xl px-3.5 py-2 text-[13px] font-medium transition hover:bg-surface-2 ${
              byScore ? 'bg-accent-muted text-accent' : 'text-accent'
            }`}
          >
            Sort by score
          </button>
        </Toolbar>
      </div>

      {leads.loading ? (
        <div role="status" className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-[14px] text-fg-muted">
          Loading leads…
        </div>
      ) : leads.error ? (
        /* An error is never rendered as an empty list — that is how a failed
           request gets mistaken for "you have no data". */
        <div role="alert" className="rounded-2xl border border-bad/40 bg-bad-muted/30 px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-fg">
            {leads.denied ? 'You do not have access to leads in this workspace.' : 'We could not load your leads.'}
          </p>
          <p className="mt-1.5 text-[13px] text-fg-muted">{leads.error.message}</p>
          {leads.canRetry && (
            <div className="mt-4">
              <Action onClick={leads.refetch}>Try again</Action>
            </div>
          )}
          {leads.error.requestId && (
            <p className="mt-3 font-mono text-[11px] text-fg-muted">Reference {leads.error.requestId}</p>
          )}
        </div>
      ) : shown.length ? (
        view === 'Board' ? (
          <div className="grid gap-4 md:grid-cols-3">
            {leadStatuses
              .filter((item) => item !== 'All')
              .map((stage) => (
                <section key={stage}>
                  <h3 className="mb-3 font-semibold">{stage}</h3>
                  <LeadRows rows={shown.filter((lead) => lead.status === stage)} />
                </section>
              ))}
          </div>
        ) : (
          <LeadRows rows={shown} />
        )
      ) : (
        <BigEmpty
          icon="👤"
          title={query || status !== 'All' || source ? 'No leads match these filters' : 'No leads yet'}
          blurb="Create your first lead to start building your pipeline."
          action={
            <Action variant="solid" onClick={() => setCreating(true)}>
              + New lead
            </Action>
          }
        />
      )}

      {leads.total > pageSize && (
        <nav aria-label="Lead pagination" className="flex items-center justify-end gap-3 text-sm">
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="rounded-xl border border-line px-3 py-2 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {pageCount}
          </span>
          <button
            disabled={page + 1 >= pageCount}
            onClick={() => setPage(page + 1)}
            className="rounded-xl border border-line px-3 py-2 disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}

      {creating && (
        <NewLeadDialog
          pending={leads.writing}
          fieldErrors={leads.fieldErrors}
          error={leads.writeError?.message ?? null}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            const created = await leads.createLead(input)
            if (created) setCreating(false)
          }}
        />
      )}
    </div>
  )
}

/** One row per server record. Money-free, so no formatting decisions here. */
function LeadRows({ rows }: { rows: ServerLead[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((lead) => (
        <li key={lead.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5 text-[14px]">
          <span className="min-w-[10rem] flex-1 font-medium">{lead.name}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">
            {[lead.company, lead.email].filter(Boolean).join(' · ') || '—'}
          </span>
          <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-sky">{lead.status}</span>
          {lead.source && <span className="text-[12px] text-fg-muted">{lead.source}</span>}
          <span className="w-10 text-right font-mono text-[12px]">{lead.score}</span>
        </li>
      ))}
    </ul>
  )
}

function NewLeadDialog({
  onClose,
  onSubmit,
  pending,
  fieldErrors,
  error,
}: {
  onClose: () => void
  onSubmit: (input: { name: string; email?: string; company?: string; source?: string; score?: number }) => void
  pending: boolean
  fieldErrors: Record<string, string>
  error: string | null
}) {
  const [values, setValues] = useState({ name: '', email: '', company: '', source: leadSources[0], score: '0' })
  const set = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog title="New lead" onClose={onClose}>
      <div className="mt-5 grid gap-4">
        {(['name', 'email', 'company'] as const).map((field) => (
          <label key={field}>
            <span className="text-[13px] text-fg-2">
              {field === 'name' ? 'Name' : field === 'email' ? 'Email' : 'Company'}
              {field === 'name' && <span className="text-bad"> *</span>}
            </span>
            <input
              value={values[field]}
              onChange={(event) => set(field, event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px] focus:border-accent focus:outline-none"
            />
            {fieldErrors[field] && <span className="mt-1 block text-[12px] text-bad">{fieldErrors[field]}</span>}
          </label>
        ))}
        <label>
          <span className="text-[13px] text-fg-2">Source</span>
          <select
            value={values.source}
            onChange={(event) => set('source', event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px]"
          >
            {leadSources.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      {/* A server error that is not field-specific still has to be visible. */}
      {error && !Object.keys(fieldErrors).length && (
        <p role="alert" className="mt-4 text-[13px] text-bad">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <Action onClick={onClose}>Cancel</Action>
        <Action
          variant="solid"
          onClick={() =>
            onSubmit({
              name: values.name,
              email: values.email || undefined,
              company: values.company || undefined,
              source: values.source,
              score: Number(values.score) || 0,
            })
          }
        >
          {pending ? 'Creating…' : 'Create lead'}
        </Action>
      </div>
    </Dialog>
  )
}

/* -------------------------------- Contacts -------------------------------- */

export function CrmContacts() {
  const [type, setType] = useState('All')
  const [archived, setArchived] = useState(false)
  const { records, query, setQuery, create, dialog, list, exportCsv, importCsv } = useRecords('crm.contacts')

  const visible = records.filter((item) => type === 'All' || (item.fields.Type ?? 'Prospect') === type)
  const duplicates = records.filter(
    (item, index) => records.findIndex((other) => other.title.toLowerCase() === item.title.toLowerCase()) !== index,
  )

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <span aria-hidden className="text-accent">
            👥
          </span>
          Contacts
        </h2>
        <p className="mt-1.5 text-[15px] text-fg-muted">Manage leads, clients, vendors, and partners across your org.</p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <SearchBox placeholder="Search contacts..." value={query} onChange={setQuery} />
          <Action onClick={() => setType('All')}>
            ⇄ Find duplicates{duplicates.length ? ` (${duplicates.length})` : ''}
          </Action>
          <Select label="/ page" options={['25 / page', '50 / page', '100 / page']} />
          <span className="text-[13px] text-fg-muted">
            {visible.length} contact{visible.length === 1 ? '' : 's'}
          </span>
          <Action onClick={importCsv}>⤒ Import CSV</Action>
          <Action onClick={() => exportCsv('contacts')}>⤓ Export CSV</Action>
          <Action variant="solid" onClick={() => create()}>
            + Add contact
          </Action>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Toolbar>
            {contactTypes.map((item) => (
              <Chip key={item} active={type === item} onClick={() => setType(item)}>
                {item}
              </Chip>
            ))}
          </Toolbar>
          <Action onClick={() => setArchived((prev) => !prev)}>
            {archived ? '▤ Hide archived' : '▤ Include archived'}
          </Action>
        </div>
      </Card>

      {visible.length ? (
        list(undefined, visible)
      ) : (
        <BigEmpty
          icon="👤"
          title="No contacts yet"
          blurb="Add your first contact or find duplicates to merge. Press c to start."
          action={
            <Action variant="solid" onClick={() => create()}>
              + Add contact
            </Action>
          }
        />
      )}
      {dialog}
    </div>
  )
}

/* -------------------------------- Companies ------------------------------- */

export function CrmCompanies() {
  const { records, query, setQuery, create, dialog, list, exportCsv, importCsv } = useRecords('crm.companies')

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <span aria-hidden className="text-accent">
            🏢
          </span>
          Accounts
        </h2>
        <p className="mt-1.5 text-[15px] text-fg-muted">Manage clients, vendors, and partners</p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Action onClick={() => create('Prospect company')}>Prospects only</Action>
          <Action onClick={() => create('Sales customer')}>Needs Sales Customer</Action>
          <SearchBox placeholder="Search companies..." value={query} onChange={setQuery} />
          <Select label="/ page" options={['25 / page', '50 / page', '100 / page']} />
          <Action onClick={importCsv}>⤒ Import</Action>
          <Action onClick={() => exportCsv('companies')}>⤓ CSV</Action>
          <Action onClick={() => exportCsv('companies')}>⤓ CSV (spreadsheet)</Action>
          <Action variant="solid" onClick={() => create()}>
            + Add Company
          </Action>
        </div>
      </Card>

      {records.length ? (
        list()
      ) : (
        <BigEmpty
          icon="🏢"
          title="No companies yet"
          blurb="Add your first account, or import your existing customer list."
          action={
            <Action variant="solid" onClick={() => create()}>
              + Add Company
            </Action>
          }
        />
      )}
      {dialog}
    </div>
  )
}

/* ---------------------------------- Deals --------------------------------- */

export function CrmDeals() {
  const [view, setView] = useState('Board')
  const [favourites, setFavourites] = useState(false)
  const { records, query, setQuery, create, dialog, list } = useRecords('crm.deals')

  const dealsIn = (stage: string) => records.filter((deal) => (deal.fields.Stage ?? 'New') === stage)
  const valueOf = (rows: typeof records) => rows.reduce((total, deal) => total + Number(deal.fields.Value ?? 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented options={['Board', 'Table']} value={view} onChange={setView} />
        <Select label="Sales Pipeline" options={['Sales Pipeline']} />
        <Select label="Stage" options={pipelineStages.map((stage) => stage.name)} />
        <Select label="Status" options={leadStatuses} />
        <Select label="Source" options={leadSources} />
        <Select label="Owner" options={['Me', 'Unassigned']} />
        <Action onClick={() => setFavourites((prev) => !prev)}>{favourites ? '★ All deals' : '★ Favorites'}</Action>
        <SearchBox placeholder="Search deals..." value={query} onChange={setQuery} />
        <Action variant="solid" onClick={() => create()}>
          + New deal
        </Action>
      </div>

      {view === 'Board' ? (
        <div className="overflow-x-auto pb-3">
          <div className="flex min-w-max gap-4">
            {pipelineStages
              .filter((stage) => stage.name !== 'Lost')
              .map((stage) => (
                <section key={stage.name} className="w-64 shrink-0">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-[15px] font-semibold">
                      <span aria-hidden className={`h-2 w-2 rounded-full ${stage.tone}`} />
                      {stage.name}
                      <span className="text-fg-muted">{dealsIn(stage.name).length}</span>
                    </p>
                    <span className="text-[13px] text-fg-muted">
                      ${valueOf(dealsIn(stage.name)).toLocaleString()}
                    </span>
                  </div>
                  {dealsIn(stage.name).length ? (
                    <ul className="space-y-2">
                      {dealsIn(stage.name).map((deal) => (
                        <li key={deal.id} className="rounded-2xl border border-line bg-surface p-3.5">
                          <p className="text-[14px] font-medium">{deal.title}</p>
                          <p className="mt-1 text-[12px] text-fg-muted">
                            {deal.fields.Company ?? 'No company'} · ${Number(deal.fields.Value ?? 0).toLocaleString()}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="grid h-48 place-items-center rounded-2xl bg-surface-2 text-[13px] text-fg-muted">
                      No deals
                    </div>
                  )}
                </section>
              ))}
          </div>
        </div>
      ) : records.length ? (
        list()
      ) : (
        <BigEmpty icon="⚡" title="No deals yet" blurb="Create your first deal, or convert a qualified lead." />
      )}
      {dialog}
    </div>
  )
}

/* -------------------------------- Calendar -------------------------------- */

export function CrmCalendar() {
  const [cursor, setCursor] = useState(() => new Date())

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const today = new Date()

  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })

  const shift = (delta: number) => setCursor(new Date(year, month + delta, 1))
  const { records, create, dialog } = useRecords('crm.events')
  const eventsOn = (date: Date) =>
    records.filter((event) => event.fields.Date === date.toLocaleDateString('en-CA'))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight">
            {cursor.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
          </h2>
          <button onClick={() => shift(-1)} aria-label="Previous month" className="px-2 text-fg-muted hover:text-fg">
            ‹
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
          >
            Today
          </button>
          <button onClick={() => shift(1)} aria-label="Next month" className="px-2 text-fg-muted hover:text-fg">
            ›
          </button>
        </div>
        <Action variant="solid" onClick={() => create()}>
          + New Event
        </Action>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-7 border-b border-line bg-surface-2/60">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="py-3 text-center text-[13px] text-fg-muted">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((date, index) => {
            const inMonth = date.getMonth() === month
            const isToday = date.toDateString() === today.toDateString()
            return (
              <div
                key={index}
                className={`min-h-[7rem] border-r border-b border-line p-2.5 last:border-r-0 ${
                  inMonth ? '' : 'text-fg-muted'
                }`}
              >
                <span
                  className={`grid h-7 w-7 place-items-center rounded-full text-[14px] ${
                    isToday ? 'bg-accent font-semibold text-white' : ''
                  }`}
                >
                  {date.getDate()}
                </span>
                <ul className="mt-1.5 space-y-1">
                  {eventsOn(date).map((event) => (
                    <li
                      key={event.id}
                      className="truncate rounded-md bg-accent-muted px-1.5 py-0.5 text-[11px] text-accent"
                      title={event.title}
                    >
                      {event.title}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
      {dialog}
    </div>
  )
}

/* ------------------------------- Follow-ups ------------------------------- */

export function CrmActivities() {
  const [view, setView] = useState('Timeline')
  const { records, query, setQuery, create, dialog, list } = useRecords('crm.activities')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox placeholder="Search activities..." value={query} onChange={setQuery} />
        <Select label="All types" options={activityTypes} />
        <Select label="Any time" options={timeRanges} />
        <div className="ml-auto flex items-center gap-2.5">
          <Segmented options={['Timeline', 'Table']} value={view} onChange={setView} />
          <Action variant="solid" onClick={() => create()}>
            + Log Activity
          </Action>
        </div>
      </div>

      {records.length ? (
        list()
      ) : (
        <BigEmpty
          icon="☑"
          title="No activities yet"
          blurb="Log calls, emails, meetings, tasks, and notes. Press c to start."
          action={
            <Action variant="solid" onClick={() => create()}>
              Log activity
            </Action>
          }
        />
      )}
      {dialog}
    </div>
  )
}

/* -------------------------------- Sequences ------------------------------- */

export function CrmSequences() {
  const { records, create, dialog } = useRecords('crm.sequences')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sequences</h2>
          <p className="mt-1.5 text-[15px] text-fg-muted">
            Multi-step follow-up across email and WhatsApp, that reacts to what each person does.
          </p>
        </div>
        <Action variant="solid" onClick={() => create()}>
          + New sequence
        </Action>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-6 border-b border-line px-6 py-3.5 text-[14px] font-medium">
          {['Name', 'Status', 'People', 'In progress', 'Replied', 'Stopped'].map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
        {records.length ? (
          <ul className="divide-y divide-line">
            {records.map((sequence) => (
              <li key={sequence.id} className="grid grid-cols-6 px-6 py-3.5 text-[14px]">
                <span className="font-medium">{sequence.title}</span>
                <span className="text-fg-muted">Draft</span>
                <span className="text-fg-muted">0</span>
                <span className="text-fg-muted">0</span>
                <span className="text-fg-muted">0</span>
                <span className="text-fg-muted">0</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-16 text-center">
            <p className="text-xl font-semibold">No sequences yet</p>
            <p className="mx-auto mt-2 max-w-lg text-[15px] text-fg-muted">
              A sequence sends a first message, then decides what to do next based on whether the person replies.
            </p>
          </div>
        )}
      </div>
      {dialog}
    </div>
  )
}

/* --------------------------------- Reports -------------------------------- */

export function CrmReports() {
  const [funnel, setFunnel] = useState('Total')
  const [period, setPeriod] = useState('30d')

  const kpis = [
    { label: 'Total Deals', value: '0' },
    { label: 'Pipeline Value', value: '$0' },
    { label: 'Forecast (Weighted)', value: '$0', icon: '📈' },
    { label: 'Win Rate', value: '0%', sub: '0 won / 0 closed', icon: '⚡' },
    { label: 'Lead Conversion', value: '0%', sub: '0 converted / 0 leads', icon: '🏅' },
    { label: 'Avg Won Deal', value: '$0' },
  ]

  const statuses = [
    { label: 'Open', tone: 'bg-blue-500' },
    { label: 'Won', tone: 'bg-emerald-500' },
    { label: 'Lost', tone: 'bg-red-500' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[14px] text-fg-2">
                {kpi.icon && (
                  <span aria-hidden className="text-accent">
                    {kpi.icon}
                  </span>
                )}
                {kpi.label}
              </p>
              <span aria-hidden className="grid h-4 w-4 place-items-center rounded-full border border-line text-[9px] text-fg-muted">
                i
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold">
              <CountUp value={kpi.value} />
            </p>
            {kpi.sub && <p className="mt-1.5 text-[12px] text-fg-muted">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2.5 text-lg font-semibold">
            <span aria-hidden className="text-accent">
              📊
            </span>
            Pipeline Funnel
          </h3>
          <Segmented options={['Total', 'Weighted']} value={funnel} onChange={setFunnel} />
        </div>
        <p className="py-16 text-center text-[15px] text-fg-muted">No deals to report.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="flex items-center gap-2.5 text-lg font-semibold">
            <span aria-hidden className="text-accent">
              📈
            </span>
            Deals by Source
          </h3>
          <p className="py-16 text-center text-[15px] text-fg-muted">No data</p>
        </Card>

        <Card>
          <h3 className="flex items-center gap-2.5 text-lg font-semibold">
            <span aria-hidden className="text-accent">
              $
            </span>
            Deal Status Breakdown
          </h3>
          <ul className="mt-6 space-y-4">
            {statuses.map((status) => (
              <li key={status.label} className="flex items-center gap-4">
                <span className="w-14 text-[15px] text-fg-2">{status.label}</span>
                <span className="relative h-6 flex-1 overflow-hidden rounded-lg bg-surface-2">
                  <span className={`absolute inset-y-0 left-0 w-1.5 ${status.tone}`} />
                </span>
                <span className="w-20 text-right text-[14px] text-fg-muted">0 (0%)</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <h3 className="flex items-center gap-2.5 text-lg font-semibold">
          <span aria-hidden className="text-accent">
            📈
          </span>
          Lost Reasons <span className="text-[14px] font-normal text-fg-muted">(0 lost)</span>
        </h3>
        <p className="py-14 text-center text-[15px] text-fg-muted">No lost deals yet — nothing to analyse.</p>
      </Card>

      <Card>
        <h3 className="flex items-center gap-2.5 text-lg font-semibold">
          <span aria-hidden className="text-accent">
            ◷
          </span>
          Sales Velocity
        </h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Velocity Score', value: '—', icon: '⚡' },
            { label: 'Avg Cycle', value: '—', icon: '🕐' },
            { label: 'Win Rate', value: '0%' },
            { label: 'Avg Deal Value', value: '$0' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-line p-5">
              <p className="flex items-center gap-1.5 text-[14px] text-fg-2">
                {item.icon && (
                  <span aria-hidden className="text-warn">
                    {item.icon}
                  </span>
                )}
                {item.label}
              </p>
              <p className="mt-2.5 text-3xl font-bold">
                <CountUp value={item.value} />
              </p>
            </div>
          ))}
        </div>

        <p className="mt-7 text-[12px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Average time in stage</p>
        <p className="py-10 text-center text-[15px] text-fg-muted">
          No stage transitions recorded yet. Move deals through stages to build this chart.
        </p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2.5 text-lg font-semibold">
            <span aria-hidden className="text-accent">
              🏅
            </span>
            Activity Leaderboard
          </h3>
          <Segmented options={['7d', '30d', '90d', '1y', 'This month']} value={period} onChange={setPeriod} />
        </div>
        <p className="py-14 text-center text-[15px] text-fg-muted">No activity in the last {period}.</p>
      </Card>
    </div>
  )
}

/* -------------------------------- Settings -------------------------------- */

export function CrmSettings() {
  const [active, setActive] = useState('Pipelines & stages')
  const [open, setOpen] = useState<string | null>('pipeline')
  const [renaming, setRenaming] = useState(false)
  const pipelines = useRecords('crm.pipelines')

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside>
        <div className="relative">
          <span aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted">
            ⌕
          </span>
          <input
            placeholder="Search settings..."
            aria-label="Search settings"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pr-9 pl-8 text-[13px] focus:border-accent focus:outline-none"
          />
          <span
            aria-hidden
            className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md border border-line px-1.5 text-[11px] text-fg-muted"
          >
            /
          </span>
        </div>

        <nav aria-label="CRM settings" className="mt-5 space-y-1">
          {settingsGroups.map((group) => {
            const expanded = open === group.id
            return (
              <div key={group.id}>
                <button
                  onClick={() => setOpen(expanded ? null : group.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase"
                >
                  <span>
                    {group.label} <span className="ml-1 text-fg-muted/70">{group.count}</span>
                  </span>
                  <span aria-hidden>{expanded ? '⌄' : '›'}</span>
                </button>

                {expanded && (
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.label}>
                        <button
                          onClick={() => setActive(item.label)}
                          aria-current={active === item.label ? 'page' : undefined}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] transition ${
                            active === item.label
                              ? 'bg-accent/10 font-semibold text-accent'
                              : 'text-fg-2 hover:bg-surface-2'
                          }`}
                        >
                          <span aria-hidden className="w-4 shrink-0 text-center text-[13px]">
                            {item.icon}
                          </span>
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      <div>
        {active === 'Pipelines & stages' ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Pipelines & stages</h2>
                <p className="mt-1.5 text-[15px] text-fg-muted">Define how deals flow through your sales process.</p>
              </div>
              <Action variant="solid" onClick={() => pipelines.create()}>
                + New pipeline
              </Action>
            </div>

            <Card className="mt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="flex items-center gap-2.5 text-xl font-semibold">
                    Sales Pipeline
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-fg-2">
                      Default
                    </span>
                  </h3>
                  <p className="mt-1 text-[14px] text-fg-muted">Default sales pipeline</p>
                </div>
                <div className="flex gap-2 text-fg-muted">
                  <button
                    onClick={() => pipelines.create('Duplicate of Sales Pipeline')}
                    aria-label="Duplicate pipeline"
                    title="Duplicate pipeline"
                    className="transition hover:text-fg"
                  >
                    ⧉
                  </button>
                  <button
                    onClick={() => setRenaming((prev) => !prev)}
                    aria-label="Edit pipeline"
                    title="Edit pipeline"
                    aria-expanded={renaming}
                    className="transition hover:text-fg"
                  >
                    ✎
                  </button>
                </div>
              </div>

              <ul className="mt-5 flex flex-wrap gap-2">
                {pipelineStages.map((stage) => (
                  <li
                    key={stage.name}
                    className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-[14px]"
                  >
                    <span aria-hidden className={`h-2 w-2 rounded-full ${stage.tone}`} />
                    {stage.name}
                    <span className="text-fg-muted">{stage.probability}%</span>
                  </li>
                ))}
              </ul>

              {renaming && (
                <p className="mt-4 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[13px] leading-relaxed text-fg-muted">
                  The default pipeline ships with the app, so its stages are read-only. Duplicate it with ⧉ and edit
                  the copy.
                </p>
              )}
            </Card>

            {pipelines.records.length > 0 && (
              <ul className="mt-4 space-y-3">
                {pipelines.records.map((pipeline) => (
                  <li
                    key={pipeline.id}
                    className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-4"
                  >
                    <span className="min-w-[10rem] flex-1 text-[15px] font-semibold">{pipeline.title}</span>
                    <span className="text-[13px] text-fg-muted">{pipeline.fields.Description ?? 'Custom pipeline'}</span>
                  </li>
                ))}
              </ul>
            )}

            {pipelines.dialog}
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold tracking-tight">{active}</h2>
            <p className="mt-1.5 text-[15px] text-fg-muted">
              Tenant-configurable — every dropdown, status, and label here is editable without a developer.
            </p>
            <Card className="mt-6">
              <p className="py-14 text-center text-[15px] text-fg-muted">
                Nothing configured yet for {active.toLowerCase()}.
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
