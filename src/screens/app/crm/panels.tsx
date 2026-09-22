'use client'

import { useState } from 'react'
import { Action, BigEmpty, Card, Chip, SearchBox, Segmented, Select, Toolbar } from '../../../components/AppChrome'
import { activityTypes, contactTypes, leadSources, leadStatuses, settingsGroups, timeRanges } from '../../../lib/crmData'
import { CountUp } from '../../../components/CountUp'
import { useAuth } from '../../../lib/auth'
import { Dialog } from '../../../components/Dialog'
import { RecordDialog } from '../../../components/RecordDialog'
import { useSearchParams } from '../../../lib/router'
import { useLeadFilters, useLeadSummary, useServerLeads, type ServerLead } from './useServerLeads'
import {
  LoadFailed,
  Loading,
  NotAvailable,
  WriteProblem,
  companyBody,
  contactBody,
  crmModals,
  formatBucket,
  formatMoney,
  useActivities,
  useCompanies,
  useContactDuplicates,
  useContacts,
  useDealFilters,
  useDeals,
  usePartyFilters,
  usePipelines,
  type ActivityFilters,
  type CrmActivity,
  type CrmParty,
  type DealFilters,
} from './records'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/*
 * Fixed request shapes for the surfaces that do not filter. Module constants so
 * the resource key is stable and the panel does not refetch on every render.
 */
const TOTALS_ONLY: DealFilters = { pipelineId: '', stageId: '', query: '', source: '', favourites: false, mine: false, limit: 1, offset: 0 }
const RECENT_ACTIVITY: ActivityFilters = { kind: '', query: '', from: '', to: '', limit: 10, offset: 0 }
const PICKER_PAGE = { query: '', type: 'All', includeArchived: false, limit: 100, offset: 0 }
const NO_LEAD_FILTERS = { query: '', status: 'All', source: '', sort: 'recent' as const, limit: 1, offset: 0 }

const pickerClass =
  'rounded-xl border border-line bg-surface py-2 pr-8 pl-3.5 text-[13px] text-fg-2 transition hover:bg-surface-2 focus:border-accent focus:outline-none'

const fieldClass =
  'mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px] focus:border-accent focus:outline-none'

/** A select whose options are real records, so there is no "everything" entry. */
function Picker({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={pickerClass}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

/**
 * One statistic.
 *
 * `unavailable` is the whole point: a figure nobody could compute is said in
 * words, not rendered as a zero that reads as a measurement.
 */
function Stat({
  label,
  value,
  sub,
  icon,
  featured,
  unavailable,
}: {
  label: string
  value?: string
  sub?: string
  icon?: string
  featured?: boolean
  unavailable?: string
}) {
  return (
    <div className={`rounded-2xl border p-6 ${featured ? 'border-accent bg-accent text-white' : 'border-line bg-surface'}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-[11px] font-semibold tracking-[0.08em] uppercase ${featured ? 'text-white/80' : 'text-fg-muted'}`}>
          {label}
        </p>
        {icon && (
          <span aria-hidden className={`grid h-9 w-9 place-items-center rounded-xl text-[14px] ${featured ? 'bg-white/15' : 'bg-surface-2'}`}>
            {icon}
          </span>
        )}
      </div>
      {unavailable ? (
        <p className={`mt-5 text-[14px] leading-snug ${featured ? 'text-white/80' : 'text-fg-muted'}`}>{unavailable}</p>
      ) : (
        <>
          <p className="mt-5 text-4xl font-bold">
            <CountUp value={value ?? ''} />
          </p>
          {sub && <p className={`mt-2 text-[13px] ${featured ? 'text-white/70' : 'text-fg-muted'}`}>{sub}</p>}
        </>
      )}
    </div>
  )
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * Fires a row action.
 *
 * The hook has already recorded the failure for the banner above the list and
 * rethrown it for dialogs to display; a row action has no dialog, so it
 * absorbs the rejection here rather than leaving it unhandled.
 */
const rowAction = (run: Promise<unknown>, then?: () => void) => {
  void run.then(
    () => then?.(),
    () => undefined,
  )
}

/**
 * The count beside a list, which is a measurement rather than a default.
 *
 * Every one of these hooks starts at `total: 0`, so printing the number
 * unconditionally puts a confident "0 contacts" over a request that is still in
 * flight or has failed — the two states where the honest answer is that nobody
 * has counted yet. Only a total the server actually sent is rendered as one.
 */
function countLabel(
  state: { loaded: boolean; refreshing: boolean; error: unknown },
  total: number,
  one: string,
  many: string,
): string {
  if (state.error) return 'Count unavailable'
  if (!state.loaded) return 'Counting…'
  if (state.refreshing) return 'Updating…'
  return `${total} ${total === 1 ? one : many}`
}

/* -------------------------------- Dashboard ------------------------------- */

export function CrmDashboard() {
  const { session } = useAuth()
  const firstName = session?.user.fullName.split(' ')[0] ?? 'there'
  const [, setParams] = useSearchParams()
  const deals = useDeals(TOTALS_ONLY)
  const activity = useActivities(RECENT_ACTIVITY)
  const [creating, setCreating] = useState<'deal' | 'lead' | 'task' | null>(null)

  const summary = deals.summary
  const decided = (summary?.won.count ?? 0) + (summary?.lost.count ?? 0)
  const allTime = (summary?.open.count ?? 0) + decided
  const openCount = summary?.open.count ?? 0
  const pipelineValue = summary ? formatBucket(summary.open, deals.defaultCurrency) : ''

  const maxInStage = Math.max(1, ...deals.stages.map((stage) => stage.count))

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
              {/* A failed request is not a slow one: saying "loading…" over an
                  error that has already come back is its own small lie. */}
              {deals.error
                ? 'We could not load your pipeline.'
                : !summary
                  ? 'Loading your pipeline…'
                  : openCount
                    ? `${openCount} open deal${openCount === 1 ? '' : 's'} worth ${pipelineValue}.`
                    : "No open deals yet. Let's start your pipeline."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Action variant="solid" onClick={() => setCreating('deal')}>
              + New deal
            </Action>
            <Action onClick={() => setCreating('lead')}>◎ New lead</Action>
            <Action onClick={() => setCreating('task')}>☑ New task</Action>
          </div>
        </div>
      </section>

      {deals.loading ? (
        <Loading noun="your pipeline" />
      ) : deals.error ? (
        <LoadFailed state={deals} noun="deals" />
      ) : !summary ? (
        // Without this the tiles below would render the `?? 0` fallbacks as if
        // the server had counted nothing, rather than not having answered.
        <Loading noun="your pipeline" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Pipeline value"
              value={pipelineValue}
              sub={`across ${openCount} open deal${openCount === 1 ? '' : 's'}`}
              icon="$"
              featured
            />
            <Stat label="Open deals" value={String(openCount)} sub={`${allTime} all time`} icon="💼" />
            <Stat label="Won" value={String(summary.won.count)} sub="closed successfully" icon="🏆" />
            <Stat
              label="Win rate"
              icon="🔥"
              {...(decided
                ? { value: `${Math.round((summary.won.count / decided) * 100)}%`, sub: `of ${decided} decided` }
                : // A win rate over nothing is 0/0, which is not zero per cent.
                  { unavailable: 'No deals have been won or lost yet, so there is no rate to show.' })}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Pipeline flow</h3>
                <span className="text-[13px] text-fg-muted">{deals.pipelineName ?? 'No pipeline yet'}</span>
              </div>

              {deals.stages.length ? (
                <ul className="mt-6 space-y-4">
                  {deals.stages.map((stage) => (
                    <li key={stage.id} className="flex items-center gap-4">
                      <span className="w-32 shrink-0 truncate text-[15px] text-fg-2">{stage.name}</span>
                      {/* The bar is the stage's share of the busiest stage — a
                          proportion, where the prototype drew a fixed spacer. */}
                      <span className="h-7 flex-1 overflow-hidden rounded-lg bg-surface-2">
                        <span
                          className="block h-full rounded-lg bg-accent/70"
                          style={{ width: `${Math.round((stage.count / maxInStage) * 100)}%` }}
                        />
                      </span>
                      <span className="w-16 shrink-0 text-right text-[13px] text-fg-muted">
                        {stage.count} deal{stage.count === 1 ? '' : 's'}
                      </span>
                      <span className="w-32 shrink-0 truncate text-right text-[15px] font-semibold">
                        {formatBucket(stage, deals.defaultCurrency)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-16 text-center text-[15px] text-fg-muted">
                  Your first deal creates the Sales Pipeline and its stages.
                </p>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Recent activity</h3>
                <button onClick={() => setParams({ tab: 'activities' })} className="text-[13px] text-accent hover:underline">
                  View all
                </button>
              </div>
              {activity.error ? (
                <div className="mt-6">
                  <LoadFailed state={activity} noun="activity" />
                </div>
              ) : activity.activities.length ? (
                <ul className="mt-5 divide-y divide-line">
                  {activity.activities.map((item) => (
                    <li key={item.id} className="flex items-baseline gap-3 py-2.5 text-[14px]">
                      <span className="w-14 shrink-0 text-[12px] text-fg-muted">{item.kind}</span>
                      <span className="min-w-0 flex-1 truncate">{item.subject}</span>
                      {item.target && <span className="truncate text-[12px] text-fg-muted">{item.target.name}</span>}
                      <span className="shrink-0 text-[12px] text-fg-muted">{shortDate(item.occursAt ?? item.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : activity.loaded ? (
                <div className="py-20 text-center">
                  <span aria-hidden className="text-2xl text-accent">
                    📞
                  </span>
                  <p className="mt-4 text-lg font-medium">No activity yet.</p>
                  <p className="mt-1.5 text-[14px] text-fg-muted">Calls, emails and notes will appear here.</p>
                </div>
              ) : (
                <div className="mt-6">
                  <Loading noun="activity" />
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {creating === 'deal' && <NewDealDialog onClose={() => setCreating(null)} onCreated={deals.refetch} />}
      {creating === 'lead' && <DashboardLeadDialog onClose={() => setCreating(null)} />}
      {creating === 'task' && (
        <NewActivityDialog title="New task" kind="Task" onClose={() => setCreating(null)} onCreated={activity.refetch} />
      )}
    </div>
  )
}

/** The dashboard's "New lead" button, wired to the same endpoint the Leads tab uses. */
function DashboardLeadDialog({ onClose }: { onClose: () => void }) {
  const leads = useServerLeads(NO_LEAD_FILTERS)
  return (
    <NewLeadDialog
      pending={leads.writing}
      fieldErrors={leads.fieldErrors}
      error={leads.writeError?.message ?? null}
      onClose={onClose}
      onSubmit={async (input) => {
        const created = await leads.createLead(input)
        if (created) onClose()
      }}
    />
  )
}

/* ---------------------------------- Leads --------------------------------- */

/**
 * Leads — the first screen moved off browser state onto the server.
 *
 * Filtering, searching, sorting and paging are SQL, so the count beside the
 * list is the number of matching rows rather than the number that happened to
 * be loaded. Every real fetch state is rendered: a failure shows an error with
 * a retry instead of an empty list, which is the distinction the prototype
 * could not make because its data was always present.
 */
export function CrmLeads() {
  const { filters, query, status, source, sort, page, pageSize, setQuery, setStatus, setSource, setSort, setPageSize, setPage } =
    useLeadFilters()
  const [view, setView] = useState('List')
  const [creating, setCreating] = useState(false)
  const [converting, setConverting] = useState<ServerLead | null>(null)
  const leads = useServerLeads(filters)
  const summary = useLeadSummary()

  const pageCount = Math.max(1, Math.ceil(leads.total / pageSize))

  const rowActions = {
    onConvert: setConverting,
    onArchive: (lead: ServerLead) => {
      void leads.archiveLead(lead.id, lead.version)
    },
  }

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
              {countLabel(leads, leads.total, 'lead', 'leads')}
            </span>
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
          {/* Sorting is a query parameter: the highest scorer is on page one,
              not merely at the top of whichever page was already loaded. */}
          <button
            onClick={() => setSort(sort === 'score' ? 'recent' : 'score')}
            aria-pressed={sort === 'score'}
            className={`rounded-xl px-3.5 py-2 text-[13px] font-medium transition hover:bg-surface-2 ${
              sort === 'score' ? 'bg-accent-muted text-accent' : 'text-accent'
            }`}
          >
            Sort by score
          </button>
        </Toolbar>
      </div>

      <WriteProblem error={leads.writeError} onDismiss={leads.clearWriteError} />

      {leads.loading ? (
        <Loading noun="leads" />
      ) : leads.error ? (
        <LoadFailed state={leads} noun="leads" />
      ) : leads.leads.length ? (
        view === 'Board' ? (
          <div className="space-y-3">
            <div className="grid gap-4 md:grid-cols-3">
              {leadStatuses
                .filter((item) => item !== 'All')
                .map((stage) => (
                  <section key={stage}>
                    <h3 className="mb-3 flex items-center gap-2 font-semibold">
                      {stage}
                      {/* The workspace's count for the status, not this page's. */}
                      {summary.byStatus && <span className="text-fg-muted">{summary.byStatus[stage] ?? 0}</span>}
                    </h3>
                    <LeadRows rows={leads.leads.filter((lead) => lead.status === stage)} {...rowActions} />
                  </section>
                ))}
            </div>
            {leads.total > leads.leads.length && (
              <p className="text-[13px] text-fg-muted">
                Cards show the {leads.leads.length} leads on this page; the count beside each status is the workspace total.
              </p>
            )}
          </div>
        ) : (
          <LeadRows rows={leads.leads} {...rowActions} />
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

      {converting && (
        <ConvertLeadDialog
          lead={converting}
          pending={leads.writing}
          error={leads.convertError?.message ?? null}
          onClose={() => setConverting(null)}
          onSubmit={async (input) => {
            const dealId = await leads.convertLead(converting.id, converting.version, input)
            if (dealId) setConverting(null)
          }}
        />
      )}
    </div>
  )
}

/** One row per server record. Money-free, so no formatting decisions here. */
function LeadRows({
  rows,
  onConvert,
  onArchive,
}: {
  rows: ServerLead[]
  onConvert: (lead: ServerLead) => void
  onArchive: (lead: ServerLead) => void
}) {
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
          {lead.convertedAt ? (
            <span className="text-[12px] text-fg-muted">Converted</span>
          ) : (
            <button onClick={() => onConvert(lead)} className="text-[13px] text-accent transition hover:underline">
              Convert
            </button>
          )}
          <button
            onClick={() => onArchive(lead)}
            aria-label={`Archive ${lead.name}`}
            className="text-[13px] text-fg-muted transition hover:text-bad"
          >
            Archive
          </button>
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
  onSubmit: (input: {
    name: string
    email?: string
    phone?: string
    company?: string
    source?: string
    score?: number
    notes?: string
  }) => void
  pending: boolean
  fieldErrors: Record<string, string>
  error: string | null
}) {
  const [values, setValues] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    source: leadSources[0],
    score: '0',
    notes: '',
  })
  const set = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog title="New lead" onClose={onClose}>
      <div className="mt-5 grid gap-4">
        {(['name', 'email', 'company', 'phone'] as const).map((field) => (
          <label key={field}>
            <span className="text-[13px] text-fg-2">
              {field === 'name' ? 'Name' : field === 'email' ? 'Email' : field === 'company' ? 'Company' : 'Phone'}
              {field === 'name' && <span className="text-bad"> *</span>}
            </span>
            <input value={values[field]} onChange={(event) => set(field, event.target.value)} className={fieldClass} />
            {fieldErrors[field] && <span className="mt-1 block text-[12px] text-bad">{fieldErrors[field]}</span>}
          </label>
        ))}
        <label>
          <span className="text-[13px] text-fg-2">Source</span>
          <select value={values.source} onChange={(event) => set('source', event.target.value)} className={fieldClass}>
            {leadSources.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        {/* The score was in the payload with no input behind it, so every lead
            was created with a zero nobody chose. */}
        <label>
          <span className="text-[13px] text-fg-2">Score (0–100)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={values.score}
            onChange={(event) => set('score', event.target.value)}
            className={fieldClass}
          />
          {fieldErrors.score && <span className="mt-1 block text-[12px] text-bad">{fieldErrors.score}</span>}
        </label>
        <label>
          <span className="text-[13px] text-fg-2">Notes</span>
          <textarea rows={3} value={values.notes} onChange={(event) => set('notes', event.target.value)} className={fieldClass} />
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
              phone: values.phone || undefined,
              source: values.source,
              score: Number(values.score) || 0,
              notes: values.notes || undefined,
            })
          }
        >
          {pending ? 'Creating…' : 'Create lead'}
        </Action>
      </div>
    </Dialog>
  )
}

/**
 * Conversion, which the server has always supported and no screen reached.
 *
 * The amount is typed as text and sent as a decimal string: routing it through
 * a JS number is how a quote becomes 0.30000000000000004.
 */
function ConvertLeadDialog({
  lead,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  lead: ServerLead
  onClose: () => void
  onSubmit: (input: { dealName: string; amount: string; currency: string }) => void
  pending: boolean
  error: string | null
}) {
  const deals = useDeals(TOTALS_ONLY)
  const [dealName, setDealName] = useState(`${lead.company ?? lead.name} deal`)
  const [amount, setAmount] = useState('0')
  const [currency, setCurrency] = useState('')
  const chosen = currency || deals.defaultCurrency || ''

  return (
    <Dialog title={`Convert ${lead.name}`} onClose={onClose}>
      <p className="mt-3 text-[13px] text-fg-muted">
        The lead is kept and linked to the new deal, so its history survives the conversion.
      </p>
      <div className="mt-5 grid gap-4">
        <label>
          <span className="text-[13px] text-fg-2">
            Deal name<span className="text-bad"> *</span>
          </span>
          <input value={dealName} onChange={(event) => setDealName(event.target.value)} className={fieldClass} />
        </label>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label>
            <span className="text-[13px] text-fg-2">Amount</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label>
            <span className="text-[13px] text-fg-2">Currency</span>
            <input
              value={chosen}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              maxLength={3}
              placeholder="USD"
              className={fieldClass}
            />
          </label>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-[13px] text-bad">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <Action onClick={onClose}>Cancel</Action>
        <Action variant="solid" onClick={() => onSubmit({ dealName, amount, currency: chosen })}>
          {pending ? 'Converting…' : 'Convert to deal'}
        </Action>
      </div>
    </Dialog>
  )
}

/* ---------------------------- Party list & rows --------------------------- */

function PartyRows({
  rows,
  columns,
  onArchive,
}: {
  rows: CrmParty[]
  columns: (party: CrmParty) => string
  onArchive: (party: CrmParty) => void
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((party) => (
        <li key={party.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5 text-[14px]">
          <span className="min-w-[10rem] flex-1 font-medium">{party.name}</span>
          <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">{columns(party)}</span>
          {party.partyType && <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-sky">{party.partyType}</span>}
          {party.archivedAt ? (
            <span className="text-[12px] text-fg-muted">Archived</span>
          ) : (
            <button
              onClick={() => onArchive(party)}
              aria-label={`Archive ${party.name}`}
              className="text-[13px] text-fg-muted transition hover:text-bad"
            >
              Archive
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function Pagination({
  total,
  page,
  pageSize,
  setPage,
  label,
}: {
  total: number
  page: number
  pageSize: number
  setPage: (page: number) => void
  label: string
}) {
  if (total <= pageSize) return null
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return (
    <nav aria-label={label} className="flex items-center justify-end gap-3 text-sm">
      <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-xl border border-line px-3 py-2 disabled:opacity-40">
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
  )
}

/* -------------------------------- Contacts -------------------------------- */

export function CrmContacts() {
  const { filters, query, type, includeArchived, page, pageSize, setQuery, setType, setIncludeArchived, setPageSize, setPage } =
    usePartyFilters()
  const contacts = useContacts(filters)
  const duplicates = useContactDuplicates()
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [creating, setCreating] = useState(false)

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
          {/* The count is the workspace's, and the button shows the groups it
              counted rather than quietly changing a filter chip. */}
          <Action onClick={() => setShowDuplicates((prev) => !prev)}>
            {showDuplicates ? '⇄ Back to all contacts' : `⇄ Find duplicates${duplicates.total === undefined ? '' : ` (${duplicates.total})`}`}
          </Action>
          <Select
            label="/ page"
            value={`${pageSize} / page`}
            onChange={(value) => setPageSize(parseInt(value, 10) || 25)}
            options={['25 / page', '50 / page', '100 / page']}
          />
          <span className="text-[13px] text-fg-muted" aria-live="polite">
            {countLabel(contacts, contacts.total, 'contact', 'contacts')}
          </span>
          <Action variant="solid" onClick={() => setCreating(true)}>
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
          <Action onClick={() => setIncludeArchived(!includeArchived)}>
            {includeArchived ? '▤ Hide archived' : '▤ Include archived'}
          </Action>
        </div>
      </Card>

      <WriteProblem error={contacts.writeError} onDismiss={contacts.clearWriteError} />

      {showDuplicates ? (
        duplicates.error ? (
          // The resource's own state, not a hand-built one: a 403 claiming to
          // be retryable offers a button that can never work.
          <LoadFailed state={duplicates} noun="duplicates" />
        ) : !duplicates.loaded ? (
          <Loading noun="duplicate contacts" />
        ) : duplicates.groups.length ? (
          <div className="space-y-4">
            {duplicates.groups.map((group) => (
              <section key={group.name}>
                <h3 className="mb-2 text-[15px] font-semibold">{group.name}</h3>
                <PartyRows
                  rows={group.parties}
                  columns={(party) => [party.company, party.email, party.phone].filter(Boolean).join(' · ') || '—'}
                  onArchive={(party) => rowAction(contacts.archive(party.id, party.version), duplicates.refetch)}
                />
              </section>
            ))}
            {/* The endpoint caps what it returns; a truncated list that says
                nothing reads as the complete set of collisions. */}
            {duplicates.total !== undefined && duplicates.total > duplicates.shown && (
              <p className="text-[13px] text-fg-muted">
                Showing {duplicates.shown} of {duplicates.total} contacts that share a name with another; the rest are
                not on this list.
              </p>
            )}
          </div>
        ) : (
          <NotAvailable
            title="No duplicate contacts"
            reason="No two contacts in this workspace share a name. Email addresses cannot collide — the database already refuses a second contact with the same address."
          />
        )
      ) : contacts.loading ? (
        <Loading noun="contacts" />
      ) : contacts.error ? (
        <LoadFailed state={contacts} noun="contacts" />
      ) : contacts.rows.length ? (
        <>
          <PartyRows
            rows={contacts.rows}
            columns={(party) => [party.company, party.email, party.phone].filter(Boolean).join(' · ') || '—'}
            onArchive={(party) => rowAction(contacts.archive(party.id, party.version))}
          />
          <Pagination total={contacts.total} page={page} pageSize={pageSize} setPage={setPage} label="Contact pagination" />
        </>
      ) : (
        <BigEmpty
          icon="👤"
          title={query || type !== 'All' ? 'No contacts match these filters' : 'No contacts yet'}
          blurb="Add your first contact to start building your address book."
          action={
            <Action variant="solid" onClick={() => setCreating(true)}>
              + Add contact
            </Action>
          }
        />
      )}

      {creating && (
        <RecordDialog
          modal={crmModals['crm.contacts']}
          onClose={() => setCreating(false)}
          onSubmit={async ({ fields }) => {
            await contacts.create(contactBody(fields))
            duplicates.refetch()
          }}
        />
      )}
    </div>
  )
}

/* -------------------------------- Companies ------------------------------- */

export function CrmCompanies() {
  const { filters, query, type, includeArchived, page, pageSize, setQuery, setType, setIncludeArchived, setPageSize, setPage } =
    usePartyFilters()
  const companies = useCompanies(filters)
  const [creating, setCreating] = useState(false)

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
          <SearchBox placeholder="Search companies..." value={query} onChange={setQuery} />
          <Select
            label="All types"
            value={type === 'All' ? 'All types' : type}
            onChange={(value) => setType(value === 'All types' ? 'All' : value)}
            options={['All types', ...contactTypes.filter((item) => item !== 'All')]}
          />
          <Select
            label="/ page"
            value={`${pageSize} / page`}
            onChange={(value) => setPageSize(parseInt(value, 10) || 25)}
            options={['25 / page', '50 / page', '100 / page']}
          />
          <span className="text-[13px] text-fg-muted" aria-live="polite">
            {countLabel(companies, companies.total, 'account', 'accounts')}
          </span>
          <Action onClick={() => setIncludeArchived(!includeArchived)}>
            {includeArchived ? '▤ Hide archived' : '▤ Include archived'}
          </Action>
          <Action variant="solid" onClick={() => setCreating(true)}>
            + Add Company
          </Action>
        </div>
      </Card>

      <WriteProblem error={companies.writeError} onDismiss={companies.clearWriteError} />

      {companies.loading ? (
        <Loading noun="accounts" />
      ) : companies.error ? (
        <LoadFailed state={companies} noun="accounts" />
      ) : companies.rows.length ? (
        <>
          <PartyRows
            rows={companies.rows}
            columns={(party) =>
              [party.industry, party.website, party.employeeCount === null ? null : `${party.employeeCount} staff`]
                .filter(Boolean)
                .join(' · ') || '—'
            }
            onArchive={(party) => rowAction(companies.archive(party.id, party.version))}
          />
          <Pagination total={companies.total} page={page} pageSize={pageSize} setPage={setPage} label="Account pagination" />
        </>
      ) : (
        <BigEmpty
          icon="🏢"
          title={query || type !== 'All' ? 'No accounts match these filters' : 'No companies yet'}
          blurb="Add your first account. Naming a company on a lead or contact creates one too."
          action={
            <Action variant="solid" onClick={() => setCreating(true)}>
              + Add Company
            </Action>
          }
        />
      )}

      {creating && (
        <RecordDialog
          modal={crmModals['crm.companies']}
          onClose={() => setCreating(false)}
          onSubmit={async ({ fields }) => {
            await companies.create(companyBody(fields))
          }}
        />
      )}
    </div>
  )
}

/* ---------------------------------- Deals --------------------------------- */

export function CrmDeals() {
  const [view, setView] = useState('Board')
  const { filters, pipelineId, stageId, query, source, favourites, mine, page, pageSize, setPipelineId, setStageId, setQuery, setSource, setFavourites, setMine, setPage } =
    useDealFilters()
  const deals = useDeals(filters)
  const pipelines = usePipelines()
  const [creating, setCreating] = useState(false)

  const stageName = deals.stages.find((stage) => stage.id === stageId)?.name ?? 'All stages'
  /** Deals the board deliberately does not draw, counted so it can say so. */
  const lostOnBoard = deals.stages
    .filter((stage) => stage.outcome === 'lost')
    .reduce((sum, stage) => sum + stage.count, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented options={['Board', 'Table']} value={view} onChange={setView} />
        {pipelines.pipelines.length > 1 && (
          <Picker
            label="Pipeline"
            value={pipelineId || deals.pipelineId || ''}
            onChange={setPipelineId}
            options={pipelines.pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))}
          />
        )}
        <Select
          label="All stages"
          value={stageName}
          onChange={(value) =>
            setStageId(value === 'All stages' ? '' : (deals.stages.find((stage) => stage.name === value)?.id ?? ''))
          }
          options={['All stages', ...deals.stages.map((stage) => stage.name)]}
        />
        <Select
          label="All sources"
          value={source || 'All sources'}
          onChange={(value) => setSource(value === 'All sources' ? '' : value)}
          options={['All sources', ...leadSources]}
        />
        <Action onClick={() => setMine(!mine)}>{mine ? '👤 All owners' : '👤 My deals'}</Action>
        <Action onClick={() => setFavourites(!favourites)}>{favourites ? '★ All deals' : '★ Favorites'}</Action>
        <SearchBox placeholder="Search deals..." value={query} onChange={setQuery} />
        <span className="text-[13px] text-fg-muted" aria-live="polite">
          {countLabel(deals, deals.total, 'deal', 'deals')}
        </span>
        <Action variant="solid" onClick={() => setCreating(true)}>
          + New deal
        </Action>
      </div>

      <WriteProblem error={deals.writeError} onDismiss={deals.clearWriteError} />

      {deals.loading ? (
        <Loading noun="deals" />
      ) : deals.error ? (
        <LoadFailed state={deals} noun="deals" />
      ) : !deals.pipelineId ? (
        <NotAvailable
          title="No pipeline yet"
          reason="Your first deal creates the Sales Pipeline and its stages. Nothing is configured until then, so there is no board to show."
        />
      ) : view === 'Board' ? (
        <div className="space-y-3">
          <div className="flex min-w-max gap-4 overflow-x-auto pb-3">
            {deals.stages
              .filter((stage) => stage.outcome !== 'lost')
              .map((stage) => {
                const inStage = deals.deals.filter((deal) => deal.stageId === stage.id)
                return (
                  <section key={stage.id} className="w-64 shrink-0">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="flex items-center gap-2 text-[15px] font-semibold">
                        <span aria-hidden className={`h-2 w-2 rounded-full ${stage.outcome === 'won' ? 'bg-emerald-600' : 'bg-accent'}`} />
                        {stage.name}
                        {/* The server's count for this column, not the cards below. */}
                        <span className="text-fg-muted">{stage.count}</span>
                      </p>
                      <span className="truncate text-[13px] text-fg-muted">{formatBucket(stage, deals.defaultCurrency)}</span>
                    </div>
                    {inStage.length ? (
                      <ul className="space-y-2">
                        {inStage.map((deal) => (
                          <li key={deal.id} className="rounded-2xl border border-line bg-surface p-3.5">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[14px] font-medium">{deal.name}</p>
                              <button
                                onClick={() => rowAction(deals.update(deal.id, deal.version, { isFavourite: !deal.isFavourite }))}
                                aria-pressed={deal.isFavourite}
                                aria-label={`Favourite ${deal.name}`}
                                className={deal.isFavourite ? 'text-warn' : 'text-fg-muted transition hover:text-warn'}
                              >
                                ★
                              </button>
                            </div>
                            <p className="mt-1 text-[12px] text-fg-muted">
                              {deal.account ?? 'No account'} · {formatMoney(deal.amount, deal.currency)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="grid h-48 place-items-center px-3 text-center rounded-2xl bg-surface-2 text-[13px] text-fg-muted">
                        {/* A column emptied by the stage filter has not run off
                            the end of a page — saying so would send somebody
                            paging for deals that are being deliberately hidden. */}
                        {!stage.count
                          ? 'No deals'
                          : stageId && stage.id !== stageId
                            ? 'Hidden by the stage filter'
                            : 'None on this page'}
                      </div>
                    )}
                    {stage.count > inStage.length && inStage.length > 0 && (
                      <p className="mt-2 text-[12px] text-fg-muted">
                        {stage.count - inStage.length} more in this stage, on another page.
                      </p>
                    )}
                  </section>
                )
              })}
          </div>
          {/* Lost stages are left off the board, so the count in the toolbar is
              larger than anything the columns add up to. Say which deals are
              missing rather than letting the two numbers quietly disagree. */}
          {lostOnBoard > 0 && (
            <p className="text-[13px] text-fg-muted">
              {lostOnBoard} lost deal{lostOnBoard === 1 ? ' is' : 's are'} counted in the total above but not shown on
              the board. The table view lists them.
            </p>
          )}
          {/* The columns tell people deals are "on another page"; without this
              the board offers no way to reach one. */}
          <Pagination total={deals.total} page={page} pageSize={pageSize} setPage={setPage} label="Deal pagination" />
        </div>
      ) : deals.deals.length ? (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {deals.deals.map((deal) => (
              <li key={deal.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5 text-[14px]">
                <span className="min-w-[10rem] flex-1 font-medium">{deal.name}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">{deal.account ?? '—'}</span>
                <span className="font-mono text-[13px]">{formatMoney(deal.amount, deal.currency)}</span>
                {/* Moving a stage here is a real, version-checked write that
                    records the transition in deal_stage_history. */}
                <Picker
                  label={`Stage for ${deal.name}`}
                  value={deal.stageId}
                  onChange={(value) => rowAction(deals.update(deal.id, deal.version, { stageId: value }))}
                  options={deals.stages.map((stage) => ({ value: stage.id, label: stage.name }))}
                />
                {deal.expectedClose && <span className="text-[12px] text-fg-muted">{shortDate(deal.expectedClose)}</span>}
                <button
                  onClick={() => rowAction(deals.archive(deal.id, deal.version))}
                  aria-label={`Archive ${deal.name}`}
                  className="text-[13px] text-fg-muted transition hover:text-bad"
                >
                  Archive
                </button>
              </li>
            ))}
          </ul>
          <Pagination total={deals.total} page={page} pageSize={pageSize} setPage={setPage} label="Deal pagination" />
        </>
      ) : (
        <BigEmpty icon="⚡" title="No deals match these filters" blurb="Create a deal, or convert a qualified lead." />
      )}

      {creating && <NewDealDialog onClose={() => setCreating(false)} onCreated={deals.refetch} />}
    </div>
  )
}

/**
 * A deal, pointed at real records.
 *
 * The account and the contact are ids, not typed names, because that is what
 * `deals.account_id` and `deals.primary_contact_id` are — the prototype's free
 * text meant renaming an account orphaned its deals.
 */
function NewDealDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const deals = useDeals(TOTALS_ONLY)
  const pipelines = usePipelines()
  const contacts = useContacts(PICKER_PAGE)
  const companies = useCompanies(PICKER_PAGE)

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('0')
  const [currency, setCurrency] = useState('')
  const [stage, setStage] = useState('')
  const [account, setAccount] = useState('')
  const [contact, setContact] = useState('')
  const [expectedClose, setExpectedClose] = useState('')
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pipeline = pipelines.pipelines.find((entry) => entry.isDefault) ?? pipelines.pipelines[0]
  const chosenCurrency = currency || deals.defaultCurrency || ''

  const submit = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await deals.create({
        name,
        amount,
        currency: chosenCurrency,
        pipelineId: stage ? pipeline?.id : undefined,
        stageId: stage || undefined,
        accountId: account || undefined,
        primaryContactId: contact || undefined,
        expectedClose: expectedClose || undefined,
        source: source || undefined,
      })
      onCreated()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That deal could not be created.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title="New deal" onClose={onClose} size="lg">
      <div className="mt-5 grid gap-4">
        <label>
          <span className="text-[13px] text-fg-2">
            Name<span className="text-bad"> *</span>
          </span>
          <input value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
        </label>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label>
            <span className="text-[13px] text-fg-2">Amount</span>
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={fieldClass} />
          </label>
          <label>
            <span className="text-[13px] text-fg-2">Currency</span>
            <input
              value={chosenCurrency}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              maxLength={3}
              placeholder="USD"
              className={fieldClass}
            />
          </label>
        </div>

        <label>
          <span className="text-[13px] text-fg-2">Stage</span>
          <select value={stage} onChange={(event) => setStage(event.target.value)} className={fieldClass}>
            <option value="">
              {pipeline ? `First stage of ${pipeline.name}` : 'Creates the default pipeline'}
            </option>
            {(pipeline?.stages ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-[13px] text-fg-2">Account</span>
          <select value={account} onChange={(event) => setAccount(event.target.value)} className={fieldClass}>
            <option value="">No account</option>
            {companies.rows.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          {companies.total > companies.rows.length && (
            <span className="mt-1 block text-[12px] text-fg-muted">
              Showing the first {companies.rows.length} of {companies.total} accounts.
            </span>
          )}
        </label>

        <label>
          <span className="text-[13px] text-fg-2">Primary contact</span>
          <select value={contact} onChange={(event) => setContact(event.target.value)} className={fieldClass}>
            <option value="">No contact</option>
            {contacts.rows.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          {/* The accounts list says this; the contacts list did not, so somebody
              whose contact was not in the first page had no way to know why. */}
          {contacts.total > contacts.rows.length && (
            <span className="mt-1 block text-[12px] text-fg-muted">
              Showing the first {contacts.rows.length} of {contacts.total} contacts.
            </span>
          )}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-[13px] text-fg-2">Expected close</span>
            <input type="date" value={expectedClose} onChange={(event) => setExpectedClose(event.target.value)} className={fieldClass} />
          </label>
          <label>
            <span className="text-[13px] text-fg-2">Source</span>
            <select value={source} onChange={(event) => setSource(event.target.value)} className={fieldClass}>
              <option value="">Not recorded</option>
              {leadSources.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[13px] text-bad">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Action onClick={onClose}>Cancel</Action>
        <Action variant="solid" onClick={() => void submit()}>
          {saving ? 'Creating…' : 'Create deal'}
        </Action>
      </div>
    </Dialog>
  )
}

/* -------------------------------- Calendar -------------------------------- */

export function CrmCalendar() {
  const [cursor, setCursor] = useState(() => new Date())
  const [creating, setCreating] = useState(false)

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
  const end = new Date(cells[41])
  end.setDate(end.getDate() + 1)

  const shift = (delta: number) => setCursor(new Date(year, month + delta, 1))

  /*
   * The window is the whole visible grid, as timestamps. The prototype compared
   * a stored date *string* against each cell's formatted date, which silently
   * dropped anything entered in another zone.
   */
  const activities = useActivities({
    kind: '',
    query: '',
    from: start.toISOString(),
    to: end.toISOString(),
    limit: 200,
    offset: 0,
  })

  const eventsOn = (date: Date) =>
    activities.activities.filter(
      (item) => item.occursAt && new Date(item.occursAt).toLocaleDateString('en-CA') === date.toLocaleDateString('en-CA'),
    )

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
          <span className="text-[13px] text-fg-muted" aria-live="polite">
            {countLabel(activities, activities.total, 'scheduled', 'scheduled')}
          </span>
        </div>
        <Action variant="solid" onClick={() => setCreating(true)}>
          + New Event
        </Action>
      </div>

      {activities.error ? (
        <LoadFailed state={activities} noun="calendar entries" />
      ) : !activities.loaded ? (
        // A grid drawn before the month's entries arrive is an empty calendar,
        // which is a specific and wrong claim about the month.
        <Loading noun="this month" />
      ) : (
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
                  className={`min-h-[7rem] border-r border-b border-line p-2.5 last:border-r-0 ${inMonth ? '' : 'text-fg-muted'}`}
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
                        title={`${event.subject}${event.target ? ` — ${event.target.name}` : ''}`}
                      >
                        {event.subject}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* The request is capped, so a busy month can hold entries the grid does
          not draw. A calendar that quietly omits appointments is worse than one
          that admits it. */}
      {activities.loaded && activities.total > activities.activities.length && (
        <p className="text-[13px] text-fg-muted">
          {activities.total - activities.activities.length} further entr
          {activities.total - activities.activities.length === 1 ? 'y is' : 'ies are'} scheduled this month and not shown
          on the grid. Follow-ups lists them all.
        </p>
      )}

      {creating && (
        <NewActivityDialog title="New event" kind="Meeting" scheduled onClose={() => setCreating(false)} onCreated={activities.refetch} />
      )}
    </div>
  )
}

/* ------------------------------- Follow-ups ------------------------------- */

/** Turns a named range into a real window, so the filter filters. */
function rangeWindow(range: string): { from: string; to: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  if (range === 'Today') end.setDate(end.getDate() + 1)
  else if (range === 'This week') {
    start.setDate(start.getDate() - start.getDay())
    end.setTime(start.getTime())
    end.setDate(end.getDate() + 7)
  } else if (range === 'This month') {
    start.setDate(1)
    end.setTime(start.getTime())
    end.setMonth(end.getMonth() + 1)
  } else {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1)
    end.setTime(start.getTime())
    end.setMonth(end.getMonth() + 3)
  }
  return { from: start.toISOString(), to: end.toISOString() }
}

export function CrmActivities() {
  const [kind, setKind] = useState('All')
  const [range, setRange] = useState('Any time')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const pageSize = 50

  const window = range === 'Any time' ? { from: '', to: '' } : rangeWindow(range)
  const activities = useActivities({ kind, query, ...window, limit: pageSize, offset: page * pageSize })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox
          placeholder="Search activities..."
          value={query}
          onChange={(value) => {
            setQuery(value)
            setPage(0)
          }}
        />
        <Select
          label="All types"
          value={kind === 'All' ? 'All types' : kind}
          onChange={(value) => {
            setKind(value === 'All types' ? 'All' : value)
            setPage(0)
          }}
          options={['All types', ...activityTypes]}
        />
        <Select
          label="Any time"
          value={range}
          onChange={(value) => {
            setRange(value)
            setPage(0)
          }}
          options={['Any time', ...timeRanges]}
        />
        <span className="text-[13px] text-fg-muted" aria-live="polite">
          {countLabel(activities, activities.total, 'logged', 'logged')}
        </span>
        <div className="ml-auto flex items-center gap-2.5">
          <Action variant="solid" onClick={() => setCreating(true)}>
            + Log Activity
          </Action>
        </div>
      </div>

      <WriteProblem error={activities.writeError} onDismiss={activities.clearWriteError} />

      {activities.loading ? (
        <Loading noun="activities" />
      ) : activities.error ? (
        <LoadFailed state={activities} noun="activities" />
      ) : activities.activities.length ? (
        <>
          <ActivityRows rows={activities.activities} onComplete={(item) => rowAction(activities.update(item.id, item.version, { completed: true }))} />
          <Pagination total={activities.total} page={page} pageSize={pageSize} setPage={setPage} label="Activity pagination" />
        </>
      ) : (
        <BigEmpty
          icon="☑"
          title={query || kind !== 'All' || range !== 'Any time' ? 'Nothing matches these filters' : 'No activities yet'}
          blurb="Log calls, emails, meetings, tasks, and notes against a contact, account, deal or lead."
          action={
            <Action variant="solid" onClick={() => setCreating(true)}>
              Log activity
            </Action>
          }
        />
      )}

      {creating && <NewActivityDialog title="Log activity" onClose={() => setCreating(false)} onCreated={activities.refetch} />}
    </div>
  )
}

function ActivityRows({ rows, onComplete }: { rows: CrmActivity[]; onComplete: (item: CrmActivity) => void }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5 text-[14px]">
          <span className="w-16 shrink-0 text-[12px] text-fg-muted">{item.kind}</span>
          <span className="min-w-[10rem] flex-1 font-medium">{item.subject}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">{item.target?.name ?? '—'}</span>
          {item.occursAt && <span className="text-[12px] text-fg-muted">{shortDate(item.occursAt)}</span>}
          {item.completedAt ? (
            <span className="text-[12px] text-good">Done{item.outcome ? ` · ${item.outcome}` : ''}</span>
          ) : (
            <button onClick={() => onComplete(item)} className="text-[13px] text-accent transition hover:underline">
              Mark done
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * An activity against exactly one record.
 *
 * `activity_has_one_target` is a database constraint, so the target picker is
 * not a nicety — an activity with nothing to be about cannot be stored, and an
 * activity about two things cannot either.
 */
function NewActivityDialog({
  title,
  kind: fixedKind,
  scheduled,
  onClose,
  onCreated,
}: {
  title: string
  kind?: string
  scheduled?: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const activities = useActivities(RECENT_ACTIVITY)
  const contacts = useContacts(PICKER_PAGE)
  const companies = useCompanies(PICKER_PAGE)
  const deals = useDeals({ ...TOTALS_ONLY, limit: 100 })

  const [kind, setKind] = useState(fixedKind ?? activityTypes[0])
  const [subject, setSubject] = useState('')
  const [target, setTarget] = useState('')
  const [when, setWhen] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    const [targetKind, targetId] = target.split(':')
    try {
      await activities.create({
        kind,
        subject,
        body: body || undefined,
        partyId: targetKind === 'party' ? targetId : undefined,
        dealId: targetKind === 'deal' ? targetId : undefined,
        occursAt: when ? new Date(when).toISOString() : undefined,
        // A timestamp without the zone it was entered in is not a time.
        timezone: when ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
      })
      onCreated()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That could not be logged.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title={title} onClose={onClose} size="lg">
      <div className="mt-5 grid gap-4">
        <label>
          <span className="text-[13px] text-fg-2">
            Subject<span className="text-bad"> *</span>
          </span>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} className={fieldClass} />
        </label>

        {!fixedKind && (
          <label>
            <span className="text-[13px] text-fg-2">Type</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)} className={fieldClass}>
              {activityTypes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        )}

        <label>
          <span className="text-[13px] text-fg-2">
            About<span className="text-bad"> *</span>
          </span>
          <select value={target} onChange={(event) => setTarget(event.target.value)} className={fieldClass}>
            <option value="">Choose a record</option>
            {contacts.rows.length > 0 && (
              <optgroup label="Contacts">
                {contacts.rows.map((entry) => (
                  <option key={entry.id} value={`party:${entry.id}`}>
                    {entry.name}
                  </option>
                ))}
              </optgroup>
            )}
            {companies.rows.length > 0 && (
              <optgroup label="Accounts">
                {companies.rows.map((entry) => (
                  <option key={entry.id} value={`party:${entry.id}`}>
                    {entry.name}
                  </option>
                ))}
              </optgroup>
            )}
            {deals.deals.length > 0 && (
              <optgroup label="Deals">
                {deals.deals.map((entry) => (
                  <option key={entry.id} value={`deal:${entry.id}`}>
                    {entry.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {!contacts.rows.length && !companies.rows.length && !deals.deals.length ? (
            <span className="mt-1 block text-[12px] text-fg-muted">
              Add a contact, account or deal first — an activity has to be about one of them.
            </span>
          ) : (
            /* These three lists are pages, not the workspace. Saying so is the
               difference between "it is not there" and "it is not listed". */
            (contacts.total > contacts.rows.length ||
              companies.total > companies.rows.length ||
              deals.total > deals.deals.length) && (
              <span className="mt-1 block text-[12px] text-fg-muted">
                Only the most recent contacts, accounts and deals are listed here, not every one in the workspace.
              </span>
            )
          )}
        </label>

        <label>
          <span className="text-[13px] text-fg-2">{scheduled ? 'When' : 'When (optional)'}</span>
          <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} className={fieldClass} />
          <span className="mt-1 block text-[12px] text-fg-muted">
            Saved with your time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
          </span>
        </label>

        <label>
          <span className="text-[13px] text-fg-2">Notes</span>
          <textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} className={fieldClass} />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[13px] text-bad">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Action onClick={onClose}>Cancel</Action>
        <Action variant="solid" onClick={() => void submit()}>
          {saving ? 'Saving…' : 'Save'}
        </Action>
      </div>
    </Dialog>
  )
}

/* -------------------------------- Sequences ------------------------------- */

export function CrmSequences() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Sequences</h2>
        <p className="mt-1.5 text-[15px] text-fg-muted">
          Multi-step follow-up across email and WhatsApp, that reacts to what each person does.
        </p>
      </div>

      {/*
        The prototype let somebody name a sequence, stored it in the browser and
        printed 'Draft / 0 / 0 / 0 / 0' beside it. There is no sequences table
        in any migration and no sending provider configured, so there is nothing
        to create and nothing to count.
      */}
      <NotAvailable
        title="Sequences are not available on this deployment"
        reason="Sending needs an email and WhatsApp provider, and enrolment needs a sequences table that this database does not have. Until both exist there is nothing to enrol anybody into, so this screen creates nothing rather than storing a name that never sends."
      />
    </div>
  )
}

/* --------------------------------- Reports -------------------------------- */

export function CrmReports() {
  const deals = useDeals(TOTALS_ONLY)
  const leads = useLeadSummary()

  const summary = deals.summary
  const decided = (summary?.won.count ?? 0) + (summary?.lost.count ?? 0)
  const allDeals = (summary?.open.count ?? 0) + decided

  const leadTotal = leads.byStatus ? Object.values(leads.byStatus).reduce((sum, count) => sum + count, 0) : undefined
  const converted = leads.byStatus?.Converted ?? 0

  const statuses = summary
    ? [
        { label: 'Open', tone: 'bg-blue-500', count: summary.open.count },
        { label: 'Won', tone: 'bg-emerald-500', count: summary.won.count },
        { label: 'Lost', tone: 'bg-red-500', count: summary.lost.count },
      ]
    : []

  const maxInStage = Math.max(1, ...deals.stages.map((stage) => stage.count))

  return (
    <div className="space-y-5">
      {deals.loading ? (
        <Loading noun="reports" />
      ) : deals.error ? (
        <LoadFailed state={deals} noun="reports" />
      ) : !summary ? (
        // Every tile below is derived from `summary`; without it they would all
        // fall back to zeros that read as findings.
        <Loading noun="reports" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Total deals" value={String(allDeals)} sub={deals.pipelineName ?? undefined} />
            <Stat
              label="Pipeline value"
              value={formatBucket(summary.open, deals.defaultCurrency)}
              sub={`${summary.open.count} open`}
            />
            <Stat
              label="Win rate"
              icon="⚡"
              {...(decided
                ? {
                    value: `${Math.round((summary.won.count / decided) * 100)}%`,
                    sub: `${summary.won.count} won / ${decided} closed`,
                  }
                : { unavailable: 'Nothing has been won or lost yet, so there is no rate to compute.' })}
            />
            <Stat
              label="Lead conversion"
              icon="🏅"
              {...(leads.error
                ? // A failed count is not a slow one. Left as "loading…" this
                  // tile would spin for the rest of the session.
                  { unavailable: 'Lead counts could not be loaded, so there is no conversion rate to show.' }
                : leadTotal === undefined
                  ? { unavailable: 'Loading lead counts…' }
                  : leadTotal > 0
                    ? {
                        value: `${Math.round((converted / leadTotal) * 100)}%`,
                        sub: `${converted} converted / ${leadTotal} leads`,
                      }
                    : // A conversion rate with no leads is 0/0, not zero per cent.
                      { unavailable: 'No leads have been created yet, so there is no conversion rate.' })}
            />
            <Stat label="Won" value={String(summary.won.count)} sub="closed successfully" icon="🏆" />
            <Stat label="Lost" value={String(summary.lost.count)} sub="closed unsuccessfully" />
          </div>

          <Card>
            <h3 className="flex items-center gap-2.5 text-lg font-semibold">
              <span aria-hidden className="text-accent">
                📊
              </span>
              Pipeline funnel
              <span className="text-[14px] font-normal text-fg-muted">{deals.pipelineName ?? 'No pipeline yet'}</span>
            </h3>
            {deals.stages.length ? (
              <ul className="mt-6 space-y-4">
                {deals.stages.map((stage) => (
                  <li key={stage.id} className="flex items-center gap-4">
                    <span className="w-32 shrink-0 truncate text-[15px] text-fg-2">{stage.name}</span>
                    <span className="h-6 flex-1 overflow-hidden rounded-lg bg-surface-2">
                      <span
                        className="block h-full rounded-lg bg-accent/70"
                        style={{ width: `${Math.round((stage.count / maxInStage) * 100)}%` }}
                      />
                    </span>
                    <span className="w-16 shrink-0 text-right text-[14px] text-fg-muted">{stage.count}</span>
                    <span className="w-32 shrink-0 truncate text-right text-[14px]">
                      {formatBucket(stage, deals.defaultCurrency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-16 text-center text-[15px] text-fg-muted">No pipeline configured yet.</p>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="flex items-center gap-2.5 text-lg font-semibold">
                <span aria-hidden className="text-accent">
                  $
                </span>
                Deal status breakdown
              </h3>
              {allDeals ? (
                <ul className="mt-6 space-y-4">
                  {statuses.map((status) => (
                    <li key={status.label} className="flex items-center gap-4">
                      <span className="w-14 text-[15px] text-fg-2">{status.label}</span>
                      <span className="relative h-6 flex-1 overflow-hidden rounded-lg bg-surface-2">
                        {/* The width is the share of all deals, where the
                            prototype drew a fixed 1.5px sliver. */}
                        <span
                          className={`absolute inset-y-0 left-0 ${status.tone}`}
                          style={{ width: `${Math.round((status.count / allDeals) * 100)}%` }}
                        />
                      </span>
                      <span className="w-20 text-right text-[14px] text-fg-muted">
                        {status.count} ({Math.round((status.count / allDeals) * 100)}%)
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-16 text-center text-[15px] text-fg-muted">No deals yet.</p>
              )}
            </Card>

            <Card>
              <h3 className="flex items-center gap-2.5 text-lg font-semibold">
                <span aria-hidden className="text-accent">
                  📈
                </span>
                Deals by source
              </h3>
              <p className="mx-auto max-w-sm py-14 text-center text-[15px] leading-relaxed text-fg-muted">
                Not available yet. Deals record a source, but nothing groups them by it — this needs an aggregate the
                API does not expose, and counting only the loaded page would be wrong.
              </p>
            </Card>
          </div>

          <Card>
            <h3 className="flex items-center gap-2.5 text-lg font-semibold">
              <span aria-hidden className="text-accent">
                📈
              </span>
              Lost reasons
            </h3>
            <p className="mx-auto max-w-lg py-14 text-center text-[15px] leading-relaxed text-fg-muted">
              Not available yet. A lost deal stores its reason, but grouping the workspace&rsquo;s reasons needs an
              aggregate endpoint that does not exist.
            </p>
          </Card>

          <Card>
            <h3 className="flex items-center gap-2.5 text-lg font-semibold">
              <span aria-hidden className="text-accent">
                ◷
              </span>
              Sales velocity
            </h3>
            <p className="mx-auto max-w-lg py-14 text-center text-[15px] leading-relaxed text-fg-muted">
              Not available yet. Every stage move is recorded in <code>deal_stage_history</code>, so time-in-stage and
              cycle length are derivable — but nothing queries it, and a velocity score nobody computed would be a made-up
              number.
            </p>
          </Card>

          <Card>
            <h3 className="flex items-center gap-2.5 text-lg font-semibold">
              <span aria-hidden className="text-accent">
                🏅
              </span>
              Activity leaderboard
            </h3>
            <p className="mx-auto max-w-lg py-14 text-center text-[15px] leading-relaxed text-fg-muted">
              Not available yet. Activities record who logged them, but there is no per-owner aggregate — the old
              &ldquo;no activity in the last 30d&rdquo; was an assertion about a window nobody had queried.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}

/* -------------------------------- Settings -------------------------------- */

export function CrmSettings() {
  const [active, setActive] = useState('Pipelines & stages')
  const [open, setOpen] = useState<string | null>('pipeline')
  const [creating, setCreating] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const pipelines = usePipelines()

  /*
   * The box used to have no `value` and no `onChange`: it took typing and did
   * nothing with it. It filters the navigation now — which is all it could ever
   * have done, since these labels are the only thing on the screen to search.
   */
  const needle = search.trim().toLowerCase()
  const groups = needle
    ? settingsGroups
        .map((group) => ({ ...group, items: group.items.filter((item) => item.label.toLowerCase().includes(needle)) }))
        .filter((group) => group.items.length)
    : settingsGroups

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
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-8 text-[13px] focus:border-accent focus:outline-none"
          />
          {/* The "/" badge that sat here advertised a keyboard shortcut nothing
              listened for. */}
        </div>

        <nav aria-label="CRM settings" className="mt-5 space-y-1">
          {needle && !groups.length && (
            <p className="px-3 py-2 text-[13px] text-fg-muted">No settings match “{search.trim()}”.</p>
          )}
          {groups.map((group) => {
            // A filtered list is opened, or the matches would stay hidden
            // inside collapsed groups.
            const expanded = needle ? true : open === group.id
            return (
              <div key={group.id}>
                {/* While a search is narrowing the list the collapse toggle has
                    nothing to do, so it is a heading rather than a button that
                    would absorb clicks and not respond. */}
                {needle ? (
                  <p className="px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">
                    {group.label}
                  </p>
                ) : (
                  <button
                    onClick={() => setOpen(expanded ? null : group.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase"
                  >
                    {/* The number that used to sit here counted the hard-coded
                        menu items, and read as "11 things you have configured". */}
                    <span>{group.label}</span>
                    <span aria-hidden>{expanded ? '⌄' : '›'}</span>
                  </button>
                )}

                {expanded && (
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.label}>
                        <button
                          onClick={() => setActive(item.label)}
                          aria-current={active === item.label ? 'page' : undefined}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] transition ${
                            active === item.label ? 'bg-accent/10 font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2'
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
                <h2 className="text-2xl font-bold tracking-tight">Pipelines &amp; stages</h2>
                <p className="mt-1.5 text-[15px] text-fg-muted">Define how deals flow through your sales process.</p>
              </div>
              <Action variant="solid" onClick={() => setCreating('')}>
                + New pipeline
              </Action>
            </div>

            <div className="mt-6 space-y-4">
              <WriteProblem error={pipelines.writeError} onDismiss={pipelines.clearWriteError} />

              {pipelines.loading ? (
                <Loading noun="pipelines" />
              ) : pipelines.error ? (
                <LoadFailed state={pipelines} noun="pipelines" />
              ) : pipelines.pipelines.length ? (
                pipelines.pipelines.map((pipeline) => (
                  <Card key={pipeline.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="flex items-center gap-2.5 text-xl font-semibold">
                          {pipeline.name}
                          {pipeline.isDefault && (
                            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-fg-2">Default</span>
                          )}
                        </h3>
                        <p className="mt-1 text-[14px] text-fg-muted">
                          {pipeline.stages.length} stage{pipeline.stages.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button
                        onClick={() => setCreating(pipeline.id)}
                        aria-label={`Duplicate ${pipeline.name}`}
                        title="Duplicate pipeline"
                        className="text-fg-muted transition hover:text-fg"
                      >
                        ⧉
                      </button>
                    </div>

                    <ul className="mt-5 flex flex-wrap gap-2">
                      {pipeline.stages.map((stage) => (
                        <li key={stage.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-[14px]">
                          <span
                            aria-hidden
                            className={`h-2 w-2 rounded-full ${
                              stage.outcome === 'won' ? 'bg-emerald-600' : stage.outcome === 'lost' ? 'bg-red-500' : 'bg-accent'
                            }`}
                          />
                          {stage.name}
                          <span className="text-fg-muted">{stage.probability}%</span>
                        </li>
                      ))}
                    </ul>

                    <p className="mt-4 text-[13px] text-fg-muted">
                      Stages are read-only here — renaming and reordering them needs an endpoint this deployment does not
                      have. Duplicating a pipeline with ⧉ copies its stages.
                    </p>
                  </Card>
                ))
              ) : (
                <NotAvailable
                  title="No pipeline yet"
                  reason="The Sales Pipeline and its eight stages are created the first time a deal is made or a lead is converted, so nothing is configured until then."
                />
              )}
            </div>

            {creating !== null && (
              <RecordDialog
                modal={crmModals['crm.pipelines']}
                onClose={() => setCreating(null)}
                onSubmit={async ({ fields }) => {
                  await pipelines.create({ name: fields.Name ?? '', duplicateOf: creating || undefined })
                }}
              />
            )}
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold tracking-tight">{active}</h2>
            <div className="mt-6">
              {/*
                These panes claimed to be "editable without a developer" over a
                card that saved nothing. Pipelines and stages are real tables;
                everything else here would need the generic settings store wiring
                up, which this deployment has not had done.
              */}
              <NotAvailable
                title={`${active} is not configurable yet`}
                reason="This workspace has no stored settings for this section, and nothing on this screen would save them. Pipelines and stages are the part of CRM configuration that is real today."
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
