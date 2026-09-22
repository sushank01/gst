'use client'

import { useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { articleStates, reportRanges, supportReportTabs } from '../../../lib/supportData'
import { Dialog, EmptyBlock, Label, inputClass } from '../../../components/EnterpriseUi'
import type { ApiClientError } from '../../../lib/api'
import {
  formatMinutes,
  percentOf,
  toneForColour,
  useCannedResponses,
  useCsat,
  useKbArticles,
  useKbCategories,
  useMembers,
  useMyRequests,
  useServerTickets,
  useSlaPolicies,
  useSlaReport,
  useSupportStats,
  useSupportVocabulary,
  useServerTicketsFilters,
  useTicketSla,
  type SlaClock,
  type TicketQueue,
} from './useSupport'

/* --------------------------- shared fetch states -------------------------- */

type FetchLike = {
  loading: boolean
  error: ApiClientError | null
  canRetry: boolean
  denied: boolean
  refetch: () => void
}

/**
 * What to show instead of the data, or nothing when the data is there.
 *
 * A failed request must never render as an empty list: several of these panes
 * used to read an empty array as a positive statement — "Nothing needs
 * review", "No tickets yet" — which is exactly how "the server is down"
 * becomes "you have nothing to do".
 */
export function fetchNotice(state: FetchLike, label: string): React.ReactElement | null {
  if (state.loading) {
    return (
      <p className="py-12 text-center text-[14px] text-fg-muted" role="status">
        Loading {label}…
      </p>
    )
  }
  if (!state.error) return null
  return (
    <div role="alert" className="rounded-2xl border border-line bg-surface px-6 py-12 text-center">
      <Icon name="alert-triangle" size={28} className="mx-auto text-warn" />
      <p className="mt-3 text-[14px] text-fg-2">
        {state.denied ? 'You do not have access to this.' : `${label} could not be loaded. ${state.error.message}`}
      </p>
      {state.canRetry && (
        <Button variant="secondary" className="mt-4" onClick={state.refetch}>
          Try again
        </Button>
      )}
    </div>
  )
}

/** A write that failed, including the one case that needs a reload to fix. */
export function WriteError({ error, onReload }: { error: ApiClientError | null; onReload?: () => void }) {
  if (!error) return null
  return (
    <p role="alert" className="mt-3 text-[13px] text-bad">
      {error.isConflict ? 'Somebody else changed this while you had it open. ' : ''}
      {error.message}
      {error.isConflict && onReload && (
        <button onClick={onReload} className="ml-1.5 underline">
          Reload
        </button>
      )}
    </p>
  )
}

/**
 * A surface with nothing behind it on this deployment.
 *
 * Said plainly and once, rather than as an empty list that reads like good
 * news, and never as a control that looks as though it would save something.
 */
export function NotAvailable({ title, blurb }: { title: string; blurb: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface-2/40 px-6 py-12 text-center">
      <Icon name="alert-triangle" size={26} className="mx-auto text-fg-muted" />
      <h3 className="mt-3 text-[15px] font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-[13.5px] leading-relaxed text-fg-muted">{blurb}</p>
    </div>
  )
}

/* -------------------------------- dashboard ------------------------------- */

function Kpi({
  label,
  value,
  icon,
  tone,
  quiet,
}: {
  label: string
  value: string
  icon: string
  tone: string
  /** The figure could not be measured, so it is a sentence and not a number. */
  quiet?: boolean
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="flex items-center gap-2 text-[13px] text-fg-2">
        <span className={tone}>
          <Icon name={icon} size={15} />
        </span>
        {label}
      </p>
      <p className={quiet ? 'mt-2.5 text-[14px] leading-snug text-fg-muted' : 'mt-2.5 text-[24px] leading-none font-bold'}>
        {value}
      </p>
    </div>
  )
}

/** A count-per-value breakdown, drawn as bars rather than an empty chart frame. */
function Breakdown({ title, counts }: { title: string; counts: [string, number][] }) {
  const max = counts.reduce((top, [, value]) => Math.max(top, value), 0)

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h3 className="text-[16px] font-semibold">{title}</h3>
      {counts.length ? (
        <ul className="mt-5 space-y-3">
          {counts.map(([label, value]) => (
            <li key={label}>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span>{label}</span>
                <span className="font-mono text-fg-muted">{value}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-[14px] text-fg-muted">No tickets yet</p>
      )}
    </section>
  )
}

export function SupportDashboard() {
  const resource = useSupportStats()
  const notice = fetchNotice(
    { loading: resource.loading, error: resource.error, canRetry: resource.canRetry, denied: resource.denied, refetch: resource.refetch },
    'the dashboard',
  )
  if (notice) return notice

  const stats = resource.data?.stats
  if (!stats) return null

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon="headset" tone="text-accent" label="Total Tickets" value={String(stats.total)} />
        <Kpi icon="clock" tone="text-fg-muted" label="Open" value={String(stats.open)} />
        <Kpi
          icon="shield-check"
          tone="text-ok"
          label="Resolved"
          value={stats.total ? `${stats.closed} (${percentOf(stats.closed, stats.total)})` : '0'}
        />
        <Kpi icon="alert-triangle" tone="text-warn" label="SLA Breached" value={String(stats.slaBreached)} />
        {/* An average of nothing is not zero, and a tile that shows 0.0 here
            tells somebody their customers rate them worst possible. */}
        <Kpi
          icon="sparkles"
          tone="text-warn"
          label="Avg CSAT"
          quiet={stats.csatAverage === null}
          value={stats.csatAverage ?? 'Nobody has answered a survey yet'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Breakdown title="By Status" counts={stats.byStatus.map((row) => [row.label, row.count])} />
        <Breakdown title="By Priority" counts={stats.byPriority.map((row) => [row.label, row.count])} />
        <Breakdown title="By Category" counts={stats.byCategory.map((row) => [row.label, row.count])} />
      </div>
    </div>
  )
}

/* --------------------------------- tickets -------------------------------- */

const queues: { id: TicketQueue; label: string }[] = [
  { id: 'all', label: 'All tickets' },
  { id: 'mine', label: 'My tickets' },
  { id: 'unassigned', label: 'Unassigned' },
]

/** One SLA clock, as the server reports it — not as anybody toggled it. */
function SlaPill({ clock }: { clock: SlaClock }) {
  const name = clock.target === 'first_response' ? 'First response' : 'Resolution'
  const [tone, text] = clock.breached
    ? ['tone-rose', 'breached']
    : clock.satisfied
      ? ['tone-emerald', 'met']
      : clock.remainingMinutes === null
        ? ['tone-slate', 'paused']
        : clock.remainingMinutes < 0
          ? ['tone-amber', 'overdue']
          : ['tone-sky', `${formatMinutes(clock.remainingMinutes)} left`]

  return (
    <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${tone}`}>
      {name} · {text}
    </span>
  )
}

function TicketSla({ ticketId }: { ticketId: string }) {
  const resource = useTicketSla(ticketId)

  if (resource.loading) return <span className="text-[12px] text-fg-muted">Reading the SLA clocks…</span>
  if (resource.error) {
    return (
      <span className="text-[12px] text-bad" role="alert">
        The SLA clocks could not be read.
      </span>
    )
  }
  const clocks = resource.data?.sla ?? []
  if (!clocks.length) {
    // No policy and no priority target matched when the ticket was opened, so
    // there is genuinely nothing being measured. Saying so beats a green tick.
    return <span className="text-[12px] text-fg-muted">No SLA target applies to this ticket.</span>
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      {clocks.map((clock) => (
        <SlaPill key={clock.target} clock={clock} />
      ))}
    </span>
  )
}

export function TicketsPane() {
  const vocabulary = useSupportVocabulary()
  const { members, loading: membersLoading } = useMembers()
  const filters = useServerTicketsFilters()
  const tickets = useServerTickets(filters.filters)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const [draft, setDraft] = useState({
    subject: '',
    body: '',
    requesterEmail: '',
    priority: '',
    category: '',
    channel: '',
    tags: '',
  })

  /*
   * Who holds the ticket, or nothing when we cannot say yet.
   *
   * The member list is its own request. Answering "someone else" while it is
   * still in flight names a person the ticket may well be assigned to already
   * — the caller renders the bare verb instead until an answer arrives.
   */
  const nameOf = (userId: string | null) => {
    if (!userId) return null
    if (membersLoading) return null
    return members.find((member) => member.userId === userId)?.fullName ?? 'someone no longer in this workspace'
  }

  const notice = fetchNotice(tickets, 'tickets')
  const from = tickets.total ? filters.filters.offset + 1 : 0
  const to = Math.min(filters.filters.offset + tickets.tickets.length, tickets.total)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-[22px] font-bold tracking-tight">Tickets</h2>
          <p className="mt-1.5 text-[14px] text-fg-muted">
            Customer requests, most recently active first. Filter by queue or status; click any ticket to expand.
          </p>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>
          + New ticket
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {queues.map((item) => (
          <button
            key={item.id}
            onClick={() => filters.setQueue(item.id)}
            aria-pressed={filters.queue === item.id}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
              filters.queue === item.id ? 'bg-accent-muted font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {item.label}
          </button>
        ))}
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        {[{ slug: '', label: 'All' }, ...vocabulary.statuses].map((item) => (
          <button
            key={item.slug || 'all'}
            onClick={() => filters.setStatus(item.slug)}
            aria-pressed={filters.status === item.slug}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
              filters.status === item.slug ? 'bg-accent-muted font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {item.label}
          </button>
        ))}
        <select
          aria-label="Source"
          value={filters.channel}
          onChange={(event) => filters.setChannel(event.target.value)}
          className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
        >
          <option value="">All sources</option>
          {vocabulary.channels.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="relative">
          <Icon name="tag" size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <input
            value={filters.tags}
            onChange={(event) => filters.setTags(event.target.value)}
            placeholder="Filter by tag(s)..."
            aria-label="Filter by tags"
            className="rounded-xl border border-line bg-surface py-2 pr-3 pl-9 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[12px] text-fg-muted">
          {/* The server's count for this filter, not the length of the page. */}
          {tickets.loading || tickets.error ? '' : `${from}–${to} of ${tickets.total}`}
          {tickets.refreshing && ' · refreshing'}
        </span>
        <span className="relative">
          <Icon name="search" size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <input
            value={filters.query}
            onChange={(event) => filters.setQuery(event.target.value)}
            placeholder="Search tickets..."
            aria-label="Search tickets"
            className="w-64 rounded-xl border border-line bg-surface py-2 pr-3 pl-9 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </span>
      </div>

      <WriteError error={tickets.writeError} onReload={tickets.refetch} />

      {/* The vocabulary is a second request, and its failure is visible all
          over this pane: the status chips collapse to "All", every priority
          and status renders as its raw slug, and the New-ticket dialog offers
          no priority, category or source. An empty filter strip would read as
          "this workspace has no statuses". */}
      {vocabulary.error && (
        <p role="alert" className="mt-3 text-[13px] text-warn">
          The ticket vocabulary could not be loaded, so statuses and priorities show as stored values and the filters
          above are incomplete.{' '}
          <button onClick={vocabulary.refetch} className="underline">
            Try again
          </button>
        </p>
      )}

      <div className="mt-4">
        {filters.queue === 'mine' && !tickets.me ? (
          <p role="status" className="rounded-2xl bg-surface-2/50 px-6 py-16 text-center text-[15px] text-fg-2">
            {/* Not "you have no tickets": we do not know who you are, so the
                server was never asked. */}
            We could not tell who you are signed in as, so your queue cannot be filtered to you.
          </p>
        ) : (
          notice ??
          (tickets.tickets.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {tickets.tickets.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    onClick={() => setExpanded((prev) => (prev === ticket.id ? null : ticket.id))}
                    aria-expanded={expanded === ticket.id}
                    className="flex w-full flex-wrap items-center gap-4 px-5 py-3.5 text-left transition hover:bg-surface-2"
                  >
                    <span className="w-20 shrink-0 font-mono text-[12px] text-fg-muted">{ticket.reference}</span>
                    <span className="min-w-[12rem] flex-1">
                      <span className="block text-[14px] font-medium">{ticket.subject}</span>
                      <span className="mt-0.5 block text-[12px] text-fg-muted">
                        {ticket.requesterEmail ?? ticket.requesterName ?? 'No requester recorded'} ·{' '}
                        {vocabulary.labelOf('channel', ticket.channel)}
                        {ticket.tags.length ? ` · ${ticket.tags.join(', ')}` : ''}
                      </span>
                    </span>
                    <span
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                        toneForColour[vocabulary.colourOf('priority', ticket.priority) ?? ''] ?? 'tone-slate'
                      }`}
                    >
                      {vocabulary.labelOf('priority', ticket.priority)}
                    </span>
                    <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-2">
                      {vocabulary.labelOf('status', ticket.status)}
                    </span>
                  </button>

                  {expanded === ticket.id && (
                    <div className="app-enter border-t border-line bg-surface-2/40 px-5 py-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="text-[13px] text-fg-2">
                          Status
                          <select
                            value={ticket.status}
                            disabled={tickets.writing}
                            onChange={(event) => void tickets.transitionTicket(ticket.id, ticket.version, event.target.value)}
                            className="ml-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-[13px] focus:border-accent focus:outline-none"
                          >
                            {vocabulary.statuses.map((item) => (
                              <option key={item.slug} value={item.slug}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          variant="secondary"
                          className="!py-1.5 !text-[13px]"
                          disabled={tickets.writing || !tickets.me}
                          onClick={() =>
                            void tickets.assignTicket(ticket.id, ticket.version, ticket.assigneeUserId ? null : tickets.me)
                          }
                        >
                          {ticket.assigneeUserId
                            ? (() => {
                                const held = nameOf(ticket.assigneeUserId)
                                return held ? `Unassign (${held})` : 'Unassign'
                              })()
                            : 'Assign to me'}
                        </Button>
                      </div>
                      {/* The real clocks, from sla_instances. What used to be
                          here was a boolean an agent flipped by hand, which
                          could say "met" about a ticket days past its target. */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <TicketSla ticketId={ticket.id} />
                      </div>
                      <p className="mt-3 text-[12px] text-fg-muted">
                        {vocabulary.labelOf('category', ticket.category) || 'No category'} · opened{' '}
                        {new Date(ticket.createdAt).toLocaleString('en-GB')}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl bg-surface-2/50 px-6 py-16 text-center">
              <Icon name="headset" size={30} className="mx-auto text-fg-muted" />
              <p className="mt-4 text-[15px] text-fg-2">
                {filters.filtered
                  ? 'No tickets match these filters.'
                  : 'No tickets yet. Create your first ticket to start tracking support requests.'}
              </p>
            </div>
          ))
        )}
      </div>

      {tickets.total > filters.filters.limit && (
        <div className="mt-4 flex items-center justify-end gap-3 text-[13px]">
          <Button
            variant="secondary"
            className="!py-1.5 !text-[13px]"
            disabled={filters.page === 0}
            onClick={() => filters.setPage(filters.page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            className="!py-1.5 !text-[13px]"
            disabled={to >= tickets.total}
            onClick={() => filters.setPage(filters.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {open && (
        <Dialog title="New ticket" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>
                Subject <span className="text-bad">*</span>
              </Label>
              <input
                value={draft.subject}
                onChange={(event) => setDraft((prev) => ({ ...prev, subject: event.target.value }))}
                placeholder="Cannot log in to the portal"
                className={inputClass}
              />
              {tickets.fieldErrors.subject && <span className="text-[12px] text-bad">{tickets.fieldErrors.subject}</span>}
            </label>
            <label>
              {/* The opening message is required: a ticket with a subject and
                  no body gives the next agent nothing to work from. */}
              <Label>
                First message <span className="text-bad">*</span>
              </Label>
              <textarea
                rows={4}
                value={draft.body}
                onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
                placeholder="What the customer told us"
                className={inputClass}
              />
              {tickets.fieldErrors.body && <span className="text-[12px] text-bad">{tickets.fieldErrors.body}</span>}
            </label>
            <label>
              <Label>Requester email</Label>
              <input
                value={draft.requesterEmail}
                onChange={(event) => setDraft((prev) => ({ ...prev, requesterEmail: event.target.value }))}
                placeholder="name@customer.com"
                className={inputClass}
              />
              {tickets.fieldErrors.requesterEmail && (
                <span className="text-[12px] text-bad">{tickets.fieldErrors.requesterEmail}</span>
              )}
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <Label>Priority</Label>
                <select
                  value={draft.priority}
                  onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">Default</option>
                  {vocabulary.priorities.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Label>Category</Label>
                <select
                  value={draft.category}
                  onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">None</option>
                  {vocabulary.categories.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Label>Source</Label>
                <select
                  value={draft.channel}
                  onChange={(event) => setDraft((prev) => ({ ...prev, channel: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">Default</option>
                  {vocabulary.channels.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Label>Tags</Label>
                <input
                  value={draft.tags}
                  onChange={(event) => setDraft((prev) => ({ ...prev, tags: event.target.value }))}
                  placeholder="comma, separated"
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          <WriteError error={tickets.writeError} />

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.subject.trim() || !draft.body.trim() || tickets.writing}
              onClick={async () => {
                const created = await tickets.createTicket({
                  subject: draft.subject.trim(),
                  body: draft.body.trim(),
                  requesterEmail: draft.requesterEmail.trim(),
                  priority: draft.priority,
                  category: draft.category,
                  channel: draft.channel,
                  tags: draft.tags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
                // The dialog stays open on a refusal, so nothing typed is lost.
                if (!created) return
                setDraft({ ...draft, subject: '', body: '', requesterEmail: '', tags: '' })
                setOpen(false)
              }}
            >
              {tickets.writing ? 'Creating…' : 'Create ticket'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ----------------------------- knowledge base ----------------------------- */

export function KnowledgeBasePane() {
  const categories = useKbCategories()
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('')
  const articles = useKbArticles({ query: applied, categoryId, status })
  const [open, setOpen] = useState<'article' | 'category' | null>(null)
  const [draft, setDraft] = useState({ title: '', categoryId: '', body: '', publish: false })
  const [categoryName, setCategoryName] = useState('')

  const notice = fetchNotice(articles, 'articles')

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Knowledge Base</h2>
          <p className="mt-1.5 text-[14px] text-fg-muted">Help articles and documentation for agents and customers</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setOpen('category')}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
          >
            <Icon name="folder" size={15} /> New Category
          </button>
          <Button variant="accent" onClick={() => setOpen('article')}>
            + New Article
          </Button>
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && setApplied(search)}
          /* Keyword search over the title and body, run in SQL. It was
             advertised as working "in any language"; it matches words, so a
             question in German finds nothing in an English article. */
          placeholder="Search titles and article text..."
          aria-label="Search the knowledge base"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-[14px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
        <Button variant="accent" onClick={() => setApplied(search)}>
          Search
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          aria-label="Category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
        >
          <option value="">All Categories</option>
          {categories.categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {articleStates.map((item) => {
          const value = item === 'All' ? '' : item
          return (
            <button
              key={item}
              onClick={() => setStatus(value)}
              aria-pressed={status === value}
              className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
                status === value ? 'bg-accent font-medium text-white' : 'bg-surface-2 text-fg-2 hover:bg-surface'
              }`}
            >
              {item}
            </button>
          )
        })}
        <span className="ml-auto text-[12px] text-fg-muted">
          {articles.loading || articles.error ? '' : `${articles.total} article${articles.total === 1 ? '' : 's'}`}
        </span>
      </div>

      <WriteError error={articles.writeError} onReload={articles.refetch} />

      <div className="mt-5">
        {notice ??
          (articles.articles.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {articles.articles.map((article) => (
                <li key={article.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <span className="min-w-[14rem] flex-1">
                    <span className="block text-[14px] font-medium">{article.title}</span>
                    <span className="mt-0.5 block text-[12px] text-fg-muted">
                      {article.categoryName ?? 'No category'}
                    </span>
                  </span>
                  <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-2">
                    {article.status}
                  </span>
                  <Button
                    variant="secondary"
                    className="!py-2 !text-[13px]"
                    disabled={articles.writing || article.status === 'archived'}
                    onClick={() => void articles.archiveArticle(article.id, article.version)}
                  >
                    {/* Archived, not destroyed: its earlier versions still have
                        to explain what a customer read last week. */}
                    Archive
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyBlock
              icon="book"
              title={applied || categoryId || status ? 'No articles match this filter' : 'No articles yet'}
              blurb={applied || categoryId || status ? undefined : 'Create your first knowledge base article'}
            />
          ))}
      </div>

      {open === 'article' && (
        <Dialog title="New article" onClose={() => setOpen(null)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Title</Label>
              <input
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                className={inputClass}
              />
              {articles.fieldErrors.title && <span className="text-[12px] text-bad">{articles.fieldErrors.title}</span>}
            </label>
            <label>
              <Label>Category</Label>
              <select
                value={draft.categoryId}
                onChange={(event) => setDraft((prev) => ({ ...prev, categoryId: event.target.value }))}
                className={inputClass}
              >
                <option value="">None</option>
                {categories.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label>Body</Label>
              <textarea
                rows={5}
                value={draft.body}
                onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-3 text-[14px]">
              <input
                type="checkbox"
                checked={draft.publish}
                onChange={(event) => setDraft((prev) => ({ ...prev, publish: event.target.checked }))}
                className="h-4 w-4 accent-accent"
              />
              Publish it straight away
            </label>
            <p className="-mt-2 text-[12px] leading-relaxed text-fg-muted">
              Publishing records which version became public, and is refused for an empty article — a blank page in
              front of a customer is worse than no page.
            </p>
          </div>

          <WriteError error={articles.writeError} />

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.title.trim() || (draft.publish && !draft.body.trim()) || articles.writing}
              onClick={async () => {
                const created = await articles.createArticle({
                  title: draft.title.trim(),
                  body: draft.body,
                  categoryId: draft.categoryId,
                  publish: draft.publish,
                })
                if (!created) return
                setDraft({ ...draft, title: '', body: '' })
                setOpen(null)
              }}
            >
              {articles.writing ? 'Creating…' : 'Create article'}
            </Button>
          </div>
        </Dialog>
      )}

      {open === 'category' && (
        <Dialog title="New category" onClose={() => setOpen(null)}>
          <label className="mt-5 block">
            <Label>Name</Label>
            <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} className={inputClass} />
            {categories.fieldErrors.name && <span className="text-[12px] text-bad">{categories.fieldErrors.name}</span>}
          </label>

          <WriteError error={categories.createError} />

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!categoryName.trim() || categories.creating}
              onClick={async () => {
                const created = await categories.createCategory(categoryName.trim())
                if (!created) return
                setCategoryName('')
                setOpen(null)
              }}
            >
              {categories.creating ? 'Creating…' : 'Create category'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ------------------------------- my requests ------------------------------ */

export function MyRequestsPane() {
  const requests = useMyRequests()
  const vocabulary = useSupportVocabulary()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ subject: '', body: '' })

  const notice = fetchNotice(requests, 'your requests')

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">My support requests</h2>
          <p className="mt-1.5 text-[14px] text-fg-muted">Raise a request and follow it here — no email needed.</p>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)} disabled={!requests.email}>
          <Icon name="message" size={15} /> New request
        </Button>
      </div>

      {/* Status labels come from the vocabulary request, which can fail on its
          own. Without the note, every status would quietly become its slug. */}
      {vocabulary.error && (
        <p role="alert" className="mt-3 text-[13px] text-warn">
          Statuses show as stored values: the ticket vocabulary could not be loaded.
        </p>
      )}

      <div className="mt-8 border-t border-dashed border-line pt-8">
        {/* The list is keyed on the address the requests were raised under. If
            we do not have one, nothing was asked of the server, and an empty
            list would read as "you have never raised anything". */}
        {!requests.loading && !requests.email ? (
          <p role="status" className="text-center text-[14px] text-fg-muted">
            We could not tell which email address your requests would be under, so none can be looked up.
          </p>
        ) : (
          notice ??
          (requests.tickets.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {requests.tickets.map((ticket) => (
                <li key={ticket.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <span className="w-20 shrink-0 font-mono text-[12px] text-fg-muted">{ticket.reference}</span>
                  <span className="min-w-0 flex-1 text-[14px]">{ticket.subject}</span>
                  <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-2">
                    {vocabulary.labelOf('status', ticket.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-[14px] text-fg-muted">No requests yet.</p>
          ))
        )}
      </div>

      {open && (
        <Dialog title="New request" onClose={() => setOpen(false)}>
          <label className="mt-5 block">
            <Label>
              Summary <span className="text-bad">*</span>
            </Label>
            <input
              value={draft.subject}
              onChange={(event) => setDraft((prev) => ({ ...prev, subject: event.target.value }))}
              placeholder="Laptop will not connect to the VPN"
              className={inputClass}
            />
          </label>
          <label className="mt-4 block">
            {/* Both are wanted by the server: the summary is what an agent sees
                in the queue, the detail is what they act on. */}
            <Label>
              What do you need help with? <span className="text-bad">*</span>
            </Label>
            <textarea
              rows={4}
              value={draft.body}
              onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
              className={inputClass}
            />
          </label>

          <WriteError error={requests.raiseError} />

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.subject.trim() || !draft.body.trim() || requests.raising}
              onClick={async () => {
                const created = await requests.raiseRequest({ subject: draft.subject.trim(), body: draft.body.trim() })
                if (!created) return
                setDraft({ subject: '', body: '' })
                setOpen(false)
              }}
            >
              {requests.raising ? 'Submitting…' : 'Submit request'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ---------------------------- canned responses ---------------------------- */

export function CannedRepliesPane() {
  const canned = useCannedResponses()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ shortcut: '', title: '', body: '' })

  const notice = fetchNotice(canned, 'canned replies')

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Canned Responses</h2>
          <p className="mt-1.5 text-[14px] text-fg-muted">Quick-reply templates for ticket responses</p>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>
          + New Response
        </Button>
      </div>

      <WriteError error={canned.writeError} onReload={canned.refetch} />

      <div className="mt-6">
        {notice ??
          (canned.responses.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {canned.responses.map((response) => (
                <li key={response.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <span className="min-w-[14rem] flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                      {response.title}
                      <span className="rounded-lg bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-fg-muted">
                        /{response.shortcut}
                      </span>
                    </span>
                    <span className="mt-1 block text-[13px] text-fg-muted">{response.body}</span>
                  </span>
                  <Button
                    variant="secondary"
                    className="!py-2 !text-[13px]"
                    disabled={canned.writing}
                    onClick={() => void canned.archiveResponse(response.id)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyBlock icon="message" title="No canned responses" blurb="Create templates for quick ticket replies" />
          ))}
      </div>

      {open && (
        <Dialog title="New response" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>
                Shortcut <span className="text-bad">*</span>
              </Label>
              <input
                value={draft.shortcut}
                onChange={(event) => setDraft((prev) => ({ ...prev, shortcut: event.target.value }))}
                placeholder="refund"
                className={`${inputClass} font-mono text-[13px]`}
              />
              {/* The key an agent types to insert it. It is unique per
                  workspace, so a clash has to be shown rather than swallowed. */}
              <span className="mt-1.5 block text-[12px] text-fg-muted">
                Typed as /{draft.shortcut.trim().replace(/^\//, '') || 'shortcut'} in a reply.
              </span>
              {canned.fieldErrors.shortcut && <span className="text-[12px] text-bad">{canned.fieldErrors.shortcut}</span>}
            </label>
            <label>
              <Label>Title</Label>
              <input
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label>
              <Label>Body</Label>
              <textarea
                rows={5}
                value={draft.body}
                onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
                className={inputClass}
              />
            </label>
          </div>

          <WriteError error={canned.writeError} />

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.title.trim() || !draft.shortcut.trim() || !draft.body.trim() || canned.writing}
              onClick={async () => {
                const created = await canned.createResponse({
                  shortcut: draft.shortcut.trim(),
                  title: draft.title.trim(),
                  body: draft.body.trim(),
                })
                if (!created) return
                setDraft({ shortcut: '', title: '', body: '' })
                setOpen(false)
              }}
            >
              {canned.writing ? 'Creating…' : 'Create response'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ------------------------------- SLA policies ----------------------------- */

export function SlaPoliciesPane() {
  const policies = useSlaPolicies()
  const vocabulary = useSupportVocabulary()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', priority: '', firstResponseMinutes: '60', resolutionMinutes: '480' })

  const notice = fetchNotice(policies, 'SLA policies')

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-[22px] font-bold tracking-tight">SLA policies</h2>
          <p className="mt-1.5 text-[14px] text-fg-muted">
            A policy sets the clocks a ticket starts with. The one whose priority matches wins; otherwise the
            priority&apos;s own targets are used. An inactive policy sets no clocks on new tickets and leaves existing
            ones alone.
          </p>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>
          + New policy
        </Button>
      </div>

      <WriteError error={policies.writeError} onReload={policies.refetch} />

      <div className="mt-6">
        {notice ??
          (policies.policies.length ? (
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[46rem] border-collapse text-[13px]">
                <thead className="border-b border-line text-[12px] text-fg-muted">
                  <tr>
                    {['Policy', 'Applies to', 'First response', 'Resolution', 'Status', ''].map((column, index) => (
                      <th
                        key={column || index}
                        scope="col"
                        className={`px-5 py-3.5 font-medium ${index > 1 ? 'text-right' : 'text-left'}`}
                      >
                        {column || <span className="sr-only">Actions</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {policies.policies.map((policy) => {
                    const priority = policy.appliesTo?.priority
                    return (
                      <tr key={policy.id}>
                        <td className="px-5 py-3.5 font-medium">{policy.name}</td>
                        <td className="px-5 py-3.5 text-fg-2">
                          {typeof priority === 'string' ? vocabulary.labelOf('priority', priority) : 'Every ticket'}
                        </td>
                        <td className="px-5 py-3.5 text-right">{formatMinutes(policy.firstResponseMinutes)}</td>
                        <td className="px-5 py-3.5 text-right">{formatMinutes(policy.resolutionMinutes)}</td>
                        <td className="px-5 py-3.5 text-right">
                          {policy.active ? <span className="text-ok">Active</span> : <span className="text-fg-muted">Off</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Button
                            variant="secondary"
                            className="!py-1.5 !text-[13px]"
                            disabled={policies.writing}
                            onClick={() => void policies.setPolicyActive(policy.id, !policy.active)}
                          >
                            {policy.active ? 'Turn off' : 'Turn on'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyBlock
              icon="shield"
              title="No SLA policies yet"
              blurb="Without one, a ticket's clocks come from its priority's own targets."
            />
          ))}
      </div>

      {open && (
        <Dialog title="New SLA policy" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Name</Label>
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Platinum"
                className={inputClass}
              />
              {policies.fieldErrors.name && <span className="text-[12px] text-bad">{policies.fieldErrors.name}</span>}
            </label>
            <label>
              <Label>Applies to priority</Label>
              <select
                value={draft.priority}
                onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value }))}
                className={inputClass}
              >
                <option value="">Every ticket</option>
                {vocabulary.priorities.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <Label>First response (minutes)</Label>
                <input
                  type="number"
                  min={1}
                  value={draft.firstResponseMinutes}
                  onChange={(event) => setDraft((prev) => ({ ...prev, firstResponseMinutes: event.target.value }))}
                  className={inputClass}
                />
              </label>
              <label>
                <Label>Resolution (minutes)</Label>
                <input
                  type="number"
                  min={1}
                  value={draft.resolutionMinutes}
                  onChange={(event) => setDraft((prev) => ({ ...prev, resolutionMinutes: event.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>
            <p className="text-[12px] leading-relaxed text-fg-muted">
              Targets are measured in working time against the default calendar, so a four-hour target started at 17:00
              on a Friday is not missed at 21:00.
            </p>
          </div>

          <WriteError error={policies.writeError} />

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.name.trim() || policies.writing}
              onClick={async () => {
                const created = await policies.createPolicy({
                  name: draft.name.trim(),
                  firstResponseMinutes: Number(draft.firstResponseMinutes) || undefined,
                  resolutionMinutes: Number(draft.resolutionMinutes) || undefined,
                  appliesTo: draft.priority ? { priority: draft.priority } : undefined,
                })
                if (!created) return
                setDraft({ ...draft, name: '' })
                setOpen(false)
              }}
            >
              {policies.writing ? 'Creating…' : 'Create policy'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ------------------------------ routing rules ----------------------------- */

export function RoutingRulesPane() {
  return (
    <div>
      <h2 className="text-[22px] font-bold tracking-tight">Routing rules</h2>
      <p className="mt-1.5 max-w-3xl text-[14px] text-fg-muted">
        Rules that would put an incoming ticket on the right team or agent automatically.
      </p>
      <div className="mt-6">
        <NotAvailable
          title="Routing rules are not available on this deployment"
          blurb={
            <>
              Nothing stores or evaluates a routing rule here — there is no table, no endpoint and no dispatcher behind
              it, so a rule saved on this screen would never fire. Tickets can be assigned by hand from the ticket list,
              and escalation rules under Settings can reassign a ticket once an SLA boundary is crossed.
            </>
          }
        />
      </div>
    </div>
  )
}

/* --------------------------------- reports -------------------------------- */

const rangeDays: Record<string, number> = {
  'Last 7 days': 7,
  'Last 30 days': 30,
  'Last 90 days': 90,
  'Last 12 months': 365,
}

function SlaComplianceTable({ from }: { from: string }) {
  const resource = useSlaReport(from)
  const notice = fetchNotice(
    { loading: resource.loading, error: resource.error, canRetry: resource.canRetry, denied: resource.denied, refetch: resource.refetch },
    'the SLA report',
  )
  if (notice) return notice

  const rows = resource.data?.rows ?? []
  if (!rows.length) {
    return <p className="rounded-2xl border border-line bg-surface px-6 py-14 text-center text-[14px] text-fg-muted">No tickets were opened in this period.</p>
  }

  const totals = rows.reduce(
    (sum, row) => ({
      tickets: sum.tickets + row.tickets,
      firstMet: sum.firstMet + row.firstResponseMet,
      firstBreached: sum.firstBreached + row.firstResponseBreached,
      resMet: sum.resMet + row.resolutionMet,
      resBreached: sum.resBreached + row.resolutionBreached,
    }),
    { tickets: 0, firstMet: 0, firstBreached: 0, resMet: 0, resBreached: 0 },
  )

  // A clock that has not settled belongs in neither column, so the denominator
  // is what has actually been decided — not every ticket in the window.
  const share = (met: number, breached: number) => percentOf(met, met + breached) ?? 'Not measured'

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[46rem] border-collapse text-[13px]">
          <thead className="border-b border-line text-[12px] text-fg-muted">
            <tr>
              <th scope="col" className="px-5 py-3.5 text-left font-medium">
                Priority
              </th>
              {['Tickets', 'First-response met', 'First-response %', 'Resolution met', 'Resolution %'].map((column) => (
                <th key={column} scope="col" className="px-5 py-3.5 text-right font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.priority}>
                <td className="px-5 py-3.5">{row.label}</td>
                <td className="px-5 py-3.5 text-right">{row.tickets}</td>
                <td className="px-5 py-3.5 text-right">{row.firstResponseMet}</td>
                <td className="px-5 py-3.5 text-right">{share(row.firstResponseMet, row.firstResponseBreached)}</td>
                <td className="px-5 py-3.5 text-right">{row.resolutionMet}</td>
                <td className="px-5 py-3.5 text-right">{share(row.resolutionMet, row.resolutionBreached)}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="px-5 py-3.5">Total</td>
              <td className="px-5 py-3.5 text-right">{totals.tickets}</td>
              <td className="px-5 py-3.5 text-right">{totals.firstMet}</td>
              <td className="px-5 py-3.5 text-right">{share(totals.firstMet, totals.firstBreached)}</td>
              <td className="px-5 py-3.5 text-right">{totals.resMet}</td>
              <td className="px-5 py-3.5 text-right">{share(totals.resMet, totals.resBreached)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">
        Each percentage is of the clocks that have settled — met or breached. A clock still running is counted in
        neither, because its outcome has not happened yet. First response and resolution are separate clocks, so the two
        columns can and should differ.
      </p>
    </>
  )
}

function CsatReport() {
  const csat = useCsat({ answeredOnly: true })
  const notice = fetchNotice(csat, 'the CSAT report')
  if (notice) return notice

  /*
   * Every figure here is the server's, counted in SQL over every rating.
   * Averaging `csat.rows` instead would have averaged one page — the endpoint
   * returns at most 100 — and printed it as "the" average, with "Ratings
   * received" silently stopping at 100 once a workspace passed that.
   */
  if (csat.average === null) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center text-[14px] text-fg-muted">
        <p>
          No satisfaction rating has been recorded. {csat.pending} resolved ticket
          {csat.pending === 1 ? ' has' : 's have'} none.
        </p>
        {/* "Not yet" would imply answers are on their way. Surveys are queued
            against the ticket, but no mail transport carries them and there is
            no page that accepts an answer, so no score can arrive here until
            one of those exists. Settings → CSAT survey says the same. */}
        <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed">
          Surveys are queued but nothing delivers them on this deployment and there is no page for a customer to
          answer on, so this report stays empty until a delivery path exists.
        </p>
      </div>
    )
  }

  // Scores nobody chose are absent from the server's breakdown; showing them
  // as a real zero is the point of a distribution.
  const counts = new Map(csat.distribution.map((row) => [row.score, row.count]))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi icon="sparkles" tone="text-warn" label="Average score" value={csat.average} />
        <Kpi icon="message" tone="text-accent" label="Ratings received" value={String(csat.total)} />
        <Kpi icon="clock" tone="text-fg-muted" label="Resolved, still unrated" value={String(csat.pending)} />
      </div>
      <Breakdown
        title="By score"
        counts={[5, 4, 3, 2, 1].map((score) => [`${score} out of 5`, counts.get(score) ?? 0])}
      />
    </div>
  )
}

const unavailableReports: Record<string, { title: string; blurb: string }> = {
  response: {
    title: 'Response-time reporting is not built here',
    blurb:
      'Each ticket records when it was first answered, so this is computable — but nothing on this deployment aggregates it, and a number invented on the page would not be one. The SLA Compliance tab reports whether first-response targets were met.',
  },
  reopen: {
    title: 'Reopen-rate reporting is not built here',
    blurb:
      'Every reopen is counted on the ticket, but no endpoint turns those counts into a rate, so there is nothing honest to show on this tab yet.',
  },
  leaderboard: {
    title: 'The agent leaderboard is not built here',
    blurb:
      'Tickets record who they are assigned to, but nothing aggregates per-agent throughput or resolution time, and ranking people on a number the product cannot compute would be worse than showing nothing.',
  },
  heatmap: {
    title: 'The volume heatmap is not built here',
    blurb: 'Nothing on this deployment buckets ticket volume by hour and weekday.',
  },
}

export function SupportReportsPane() {
  const [tab, setTab] = useState<string>('sla')
  const [range, setRange] = useState<string>('Last 30 days')

  // NPS is gone: there is no net-promoter question, table or column anywhere in
  // the product, so that tab could never have shown anything.
  const tabs = supportReportTabs.filter((item) => item.id !== 'nps')
  const days = rangeDays[range] ?? 30
  // Captured once, so the window does not shift underneath a re-render and
  // quietly change the figures somebody is reading.
  const [now] = useState(() => Date.now())
  const from = new Date(now - days * 86_400_000).toISOString().slice(0, 10)

  return (
    <div>
      <h2 className="text-[22px] font-bold tracking-tight">Support reports</h2>
      <p className="mt-1.5 max-w-4xl text-[14px] text-fg-muted">
        SLA compliance and customer satisfaction, computed from the ticket and survey records. No survey can be
        answered on this deployment, so the CSAT tab has nothing to report yet. Response times, reopen rate, the agent
        leaderboard and the volume heatmap are not built here at all.
      </p>

      <nav className="mt-6 flex flex-wrap gap-6 border-b border-line">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-[14px] transition ${
              tab === item.id ? 'border-accent font-medium text-accent' : 'border-transparent text-fg-2 hover:text-fg'
            }`}
          >
            <Icon name={item.icon} size={15} />
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'sla' && (
        <div className="mt-5 flex justify-end">
          <select
            aria-label="Range"
            value={range}
            onChange={(event) => setRange(event.target.value)}
            className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
          >
            {reportRanges.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-4">
        {tab === 'sla' ? (
          <SlaComplianceTable from={from} />
        ) : tab === 'csat' ? (
          <CsatReport />
        ) : (
          <NotAvailable
            title={unavailableReports[tab]?.title ?? 'This report is not built here'}
            blurb={unavailableReports[tab]?.blurb ?? ''}
          />
        )}
      </div>
    </div>
  )
}
