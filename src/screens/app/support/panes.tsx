'use client'

import { Link } from '../../../lib/router'
import { useMemo, useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { useAuth } from '../../../lib/auth'
import { articleStates, reportRanges, supportReportTabs, ticketQueues } from '../../../lib/supportData'
import { useWorkspace, type Ticket } from '../../../lib/workspace'
import { Dialog, EmptyBlock, Label, inputClass } from '../../../components/EnterpriseUi'

const priorityTone: Record<string, string> = {
  Urgent: 'tone-rose',
  High: 'tone-amber',
  Medium: 'tone-sky',
  Low: 'tone-slate',
}

/** What the live app shows where the trial plan does not include a feature. */
export function PlanGate({ feature, onBack }: { feature: string; onBack: () => void }) {
  return (
    <div className="grid place-items-center py-16">
      <div className="max-w-md rounded-2xl border border-line bg-surface px-10 py-12 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-muted text-accent">
          <Icon name="lock" size={24} />
        </span>
        <h2 className="mt-5 text-[20px] font-bold tracking-tight">{feature} isn&apos;t on your plan</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">
          Your current plan (trial) doesn&apos;t include {feature}. Upgrade to unlock this feature for your
          organization.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="secondary" onClick={onBack}>
            Back to dashboard
          </Button>
          <Link to="/app/account">
            <Button variant="accent">
              <Icon name="sparkles" size={15} /> Upgrade plan
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="flex items-center gap-2 text-[13px] text-fg-2">
        <span className={tone}>
          <Icon name={icon} size={15} />
        </span>
        {label}
      </p>
      <p className="mt-2.5 text-[24px] leading-none font-bold">{value}</p>
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
        <p className="py-10 text-center text-[14px] text-fg-muted">No data</p>
      )}
    </section>
  )
}

const tally = (items: Ticket[], key: (item: Ticket) => string): [string, number][] => {
  const counts = new Map<string, number>()
  items.forEach((item) => counts.set(key(item), (counts.get(key(item)) ?? 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

export function SupportDashboard() {
  const { tickets, supportSettings } = useWorkspace()

  // Which statuses count as open is configuration, not a constant.
  const closed = supportSettings.statuses.filter((s) => s.behaviour === 'closed').map((s) => s.label)
  const open = tickets.filter((item) => !closed.includes(item.status)).length
  const resolved = tickets.filter((item) => closed.includes(item.status)).length
  const breached = tickets.filter((item) => item.slaBreached).length
  const rated = tickets.filter((item) => item.csat !== null)
  const csat = rated.length
    ? (rated.reduce((total, item) => total + (item.csat ?? 0), 0) / rated.length).toFixed(1)
    : 'N/A'
  const resolvedPct = tickets.length ? Math.round((resolved / tickets.length) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon="headset" tone="text-accent" label="Total Tickets" value={String(tickets.length)} />
        <Kpi icon="clock" tone="text-fg-muted" label="Open" value={String(open)} />
        <Kpi icon="shield-check" tone="text-ok" label="Resolved" value={`${resolved} (${resolvedPct}%)`} />
        <Kpi icon="alert-triangle" tone="text-warn" label="SLA Breached" value={String(breached)} />
        <Kpi icon="sparkles" tone="text-warn" label="Avg CSAT" value={csat} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Breakdown title="By Status" counts={tally(tickets, (item) => item.status)} />
        <Breakdown title="By Priority" counts={tally(tickets, (item) => item.priority)} />
        <Breakdown title="By Category" counts={tally(tickets, (item) => item.category)} />
      </div>
    </div>
  )
}

export function TicketsPane() {
  const { tickets, addTicket, updateTicket, supportSettings } = useWorkspace()
  // Ticket fields are whatever Settings → Ticket fields says they are.
  const statuses = ['All', ...supportSettings.statuses.map((item) => item.label)]
  const priorities = supportSettings.priorities.map((item) => item.label)
  const categories = supportSettings.categories.map((item) => item.label)
  const sources = ['All sources', ...supportSettings.channels.map((item) => item.label)]
  const { session } = useAuth()
  const me = session?.user.fullName ?? 'Me'

  const [queue, setQueue] = useState<string>('All tickets')
  const [status, setStatus] = useState<string>('All')
  const [source, setSource] = useState<string>('All sources')
  const [tagFilter, setTagFilter] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const [draft, setDraft] = useState({
    subject: '',
    requester: '',
    priority: 'Medium',
    category: supportSettings.categories[0]?.label ?? 'General Inquiry',
    source: 'Email',
    tags: '',
  })

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const tag = tagFilter.trim().toLowerCase()
    return tickets.filter((ticket) => {
      if (queue === 'My tickets' && ticket.assignee !== me) return false
      if (queue === 'Unassigned' && ticket.assignee) return false
      if (status !== 'All' && ticket.status !== status) return false
      if (source !== 'All sources' && ticket.source !== source) return false
      if (tag && !ticket.tags.some((item) => item.toLowerCase().includes(tag))) return false
      if (!needle) return true
      return `${ticket.reference} ${ticket.subject} ${ticket.requester}`.toLowerCase().includes(needle)
    })
  }, [tickets, queue, status, source, tagFilter, query, me])

  return (
    <div>
      <button
        onClick={() => setSaved(`${queue} · ${status}${source === 'All sources' ? '' : ` · ${source}`}`)}
        className="text-[13px] text-fg-muted transition hover:text-accent"
      >
        + Save current filter
      </button>
      {saved && <p className="mt-1 text-[12px] text-fg-muted">Saved view: {saved}</p>}

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-[22px] font-bold tracking-tight">Tickets</h2>
          <p className="mt-1.5 text-[14px] text-fg-muted">
            Customer requests, sorted by SLA pressure. Filter by queue or status; click any ticket to expand.
          </p>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>
          + New ticket
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {ticketQueues.map((item) => (
          <button
            key={item}
            onClick={() => setQueue(item)}
            aria-pressed={queue === item}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
              queue === item ? 'bg-accent-muted font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {item}
          </button>
        ))}
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        {statuses.map((item) => (
          <button
            key={item}
            onClick={() => setStatus(item)}
            aria-pressed={status === item}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
              status === item ? 'bg-accent-muted font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {item}
          </button>
        ))}
        <select
          aria-label="Source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
        >
          {sources.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <span className="relative">
          <Icon name="tag" size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <input
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            placeholder="Filter by tag(s)..."
            aria-label="Filter by tags"
            className="rounded-xl border border-line bg-surface py-2 pr-3 pl-9 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </span>
      </div>

      <div className="mt-3 flex justify-end">
        <span className="relative">
          <Icon name="search" size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tickets..."
            aria-label="Search tickets"
            className="w-64 rounded-xl border border-line bg-surface py-2 pr-3 pl-9 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </span>
      </div>

      <div className="mt-4">
        {visible.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {visible.map((ticket) => (
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
                      {ticket.requester} · {ticket.source}
                      {ticket.tags.length ? ` · ${ticket.tags.join(', ')}` : ''}
                    </span>
                  </span>
                  <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${priorityTone[ticket.priority]}`}>
                    {ticket.priority}
                  </span>
                  <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-2">
                    {ticket.status}
                  </span>
                </button>

                {expanded === ticket.id && (
                  <div className="app-enter border-t border-line bg-surface-2/40 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-[13px] text-fg-2">
                        Status
                        <select
                          value={ticket.status}
                          onChange={(event) => updateTicket(ticket.id, { status: event.target.value })}
                          className="ml-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-[13px] focus:border-accent focus:outline-none"
                        >
                          {statuses
                            .filter((item) => item !== 'All')
                            .map((item) => (
                              <option key={item}>{item}</option>
                            ))}
                        </select>
                      </label>
                      <Button
                        variant="secondary"
                        className="!py-1.5 !text-[13px]"
                        onClick={() => updateTicket(ticket.id, { assignee: ticket.assignee ? null : me })}
                      >
                        {ticket.assignee ? `Unassign (${ticket.assignee})` : 'Assign to me'}
                      </Button>
                      <Button
                        variant="secondary"
                        className="!py-1.5 !text-[13px]"
                        onClick={() => updateTicket(ticket.id, { slaBreached: !ticket.slaBreached })}
                      >
                        {ticket.slaBreached ? 'Clear SLA breach' : 'Mark SLA breached'}
                      </Button>
                    </div>
                    <p className="mt-3 text-[12px] text-fg-muted">
                      {ticket.category} · opened {new Date(ticket.createdAt).toLocaleString('en-GB')}
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
              {tickets.length
                ? 'No tickets match these filters.'
                : 'No tickets yet. Create your first ticket to start tracking support requests.'}
            </p>
          </div>
        )}
      </div>

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
            </label>
            <label>
              <Label>Requester</Label>
              <input
                value={draft.requester}
                onChange={(event) => setDraft((prev) => ({ ...prev, requester: event.target.value }))}
                placeholder="name@customer.com"
                className={inputClass}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <Label>Priority</Label>
                <select
                  value={draft.priority}
                  onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value }))}
                  className={inputClass}
                >
                  {priorities.map((item) => (
                    <option key={item}>{item}</option>
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
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <Label>Source</Label>
                <select
                  value={draft.source}
                  onChange={(event) => setDraft((prev) => ({ ...prev, source: event.target.value }))}
                  className={inputClass}
                >
                  {sources
                    .filter((item) => item !== 'All sources')
                    .map((item) => (
                      <option key={item}>{item}</option>
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

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.subject.trim()}
              onClick={() => {
                addTicket({
                  subject: draft.subject.trim(),
                  requester: draft.requester.trim() || 'Unknown requester',
                  status: 'New',
                  priority: draft.priority,
                  category: draft.category,
                  source: draft.source,
                  tags: draft.tags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                  assignee: null,
                })
                setDraft({ ...draft, subject: '', requester: '', tags: '' })
                setOpen(false)
              }}
            >
              Create ticket
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export function KnowledgeBasePane() {
  const { kbArticles, kbCategories, addKbArticle, removeKbArticle, addKbCategory } = useWorkspace()
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [category, setCategory] = useState('All Categories')
  const [state, setState] = useState<string>('All')
  const [open, setOpen] = useState<'article' | 'category' | null>(null)
  const [draft, setDraft] = useState({ title: '', category: kbCategories[0] ?? '', body: '', state: 'draft' })
  const [categoryName, setCategoryName] = useState('')
  const [note, setNote] = useState<string | null>(null)

  const visible = kbArticles.filter((article) => {
    if (category !== 'All Categories' && article.category !== category) return false
    if (state !== 'All' && article.state !== state) return false
    if (!applied) return true
    const needle = applied.toLowerCase()
    return `${article.title} ${article.body}`.toLowerCase().includes(needle)
  })

  function onImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // `result` is string | ArrayBuffer; treating a buffer as text would
      // silently import the literal string "[object ArrayBuffer]".
      const text = typeof reader.result === 'string' ? reader.result : ''
      const rows = text.trim().split(/\r?\n/).slice(1)
      let added = 0
      rows.forEach((row) => {
        const [title, cat, body] = row.split(',')
        if (!title?.trim()) return
        addKbArticle({
          title: title.trim().replace(/^"|"$/g, ''),
          category: cat?.trim() || kbCategories[0] || 'Uncategorised',
          state: 'draft',
          body: body?.trim() ?? '',
        })
        added += 1
      })
      setNote(`Imported ${added} article${added === 1 ? '' : 's'} as drafts.`)
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Knowledge Base</h2>
          <p className="mt-1.5 text-[14px] text-fg-muted">Help articles and documentation for agents and customers</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2">
            <Icon name="file-text" size={15} /> Import CSV
            <input type="file" accept=".csv,text/csv" onChange={onImport} className="hidden" />
          </label>
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

      {note && <p className="mt-3 text-[13px] text-fg-muted">{note}</p>}

      <div className="mt-5 flex gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && setApplied(search)}
          placeholder="Describe the problem in any language..."
          aria-label="Search the knowledge base"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-[14px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
        <Button variant="accent" disabled={!search.trim()} onClick={() => setApplied(search)}>
          Search
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          aria-label="Category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
        >
          {['All Categories', ...kbCategories].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        {articleStates.map((item) => (
          <button
            key={item}
            onClick={() => setState(item)}
            aria-pressed={state === item}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
              state === item ? 'bg-accent font-medium text-white' : 'bg-surface-2 text-fg-2 hover:bg-surface'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {visible.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {visible.map((article) => (
              <li key={article.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <span className="min-w-[14rem] flex-1">
                  <span className="block text-[14px] font-medium">{article.title}</span>
                  <span className="mt-0.5 block text-[12px] text-fg-muted">{article.category}</span>
                </span>
                <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-2">
                  {article.state}
                </span>
                <Button
                  variant="secondary"
                  className="!py-2 !text-[13px]"
                  onClick={() => removeKbArticle(article.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock
            icon="book"
            title={kbArticles.length ? 'No articles match this filter' : 'No articles yet'}
            blurb={kbArticles.length ? undefined : 'Create your first knowledge base article'}
          />
        )}
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
            </label>
            <label>
              <Label>Category</Label>
              <select
                value={draft.category}
                onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
                className={inputClass}
              >
                {kbCategories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <Label>State</Label>
              <select
                value={draft.state}
                onChange={(event) => setDraft((prev) => ({ ...prev, state: event.target.value }))}
                className={inputClass}
              >
                {['draft', 'published', 'archived'].map((item) => (
                  <option key={item}>{item}</option>
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
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.title.trim()}
              onClick={() => {
                addKbArticle({
                  title: draft.title.trim(),
                  category: draft.category,
                  state: draft.state as 'draft' | 'published' | 'archived',
                  body: draft.body,
                })
                setDraft({ ...draft, title: '', body: '' })
                setOpen(null)
              }}
            >
              Create article
            </Button>
          </div>
        </Dialog>
      )}

      {open === 'category' && (
        <Dialog title="New category" onClose={() => setOpen(null)}>
          <label className="mt-5 block">
            <Label>Name</Label>
            <input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              className={inputClass}
            />
          </label>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!categoryName.trim()}
              onClick={() => {
                addKbCategory(categoryName.trim())
                setCategoryName('')
                setOpen(null)
              }}
            >
              Create category
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export function MyRequestsPane() {
  const { tickets, addTicket } = useWorkspace()
  const { session } = useAuth()
  const email = session?.user.email ?? ''
  const mine = tickets.filter((ticket) => ticket.requester === email)
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">My support requests</h2>
          <p className="mt-1.5 text-[14px] text-fg-muted">Raise a request and follow it here — no email needed.</p>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>
          <Icon name="message" size={15} /> New request
        </Button>
      </div>

      <div className="mt-8 border-t border-dashed border-line pt-8">
        {mine.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {mine.map((ticket) => (
              <li key={ticket.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <span className="w-20 shrink-0 font-mono text-[12px] text-fg-muted">{ticket.reference}</span>
                <span className="min-w-0 flex-1 text-[14px]">{ticket.subject}</span>
                <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-2">
                  {ticket.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-[14px] text-fg-muted">No requests yet.</p>
        )}
      </div>

      {open && (
        <Dialog title="New request" onClose={() => setOpen(false)}>
          <label className="mt-5 block">
            <Label>What do you need help with?</Label>
            <textarea
              rows={4}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className={inputClass}
            />
          </label>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!subject.trim()}
              onClick={() => {
                addTicket({
                  subject: subject.trim(),
                  requester: email,
                  status: 'New',
                  priority: 'Medium',
                  category: 'Other',
                  source: 'Portal',
                  tags: [],
                  assignee: null,
                })
                setSubject('')
                setOpen(false)
              }}
            >
              Submit request
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export function CannedRepliesPane() {
  const { cannedResponses, addCannedResponse, removeCannedResponse } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', body: '' })

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

      <div className="mt-6">
        {cannedResponses.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {cannedResponses.map((response) => (
              <li key={response.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <span className="min-w-[14rem] flex-1">
                  <span className="block text-[14px] font-medium">{response.title}</span>
                  <span className="mt-1 block text-[13px] text-fg-muted">{response.body}</span>
                </span>
                <Button
                  variant="secondary"
                  className="!py-2 !text-[13px]"
                  onClick={() => removeCannedResponse(response.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock icon="message" title="No canned responses" blurb="Create templates for quick ticket replies" />
        )}
      </div>

      {open && (
        <Dialog title="New response" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
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
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.title.trim()}
              onClick={() => {
                addCannedResponse({ title: draft.title.trim(), body: draft.body.trim() })
                setDraft({ title: '', body: '' })
                setOpen(false)
              }}
            >
              Create response
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export function SupportReportsPane() {
  const { tickets, supportSettings } = useWorkspace()
  const ticketPriorities = supportSettings.priorities.map((item) => item.label)
  const [tab, setTab] = useState<string>('sla')
  const [range, setRange] = useState<string>('Last 30 days')

  const days = range === 'Last 7 days' ? 7 : range === 'Last 90 days' ? 90 : range === 'Last 12 months' ? 365 : 30
  // The instant is captured once; the window still moves with `days`.
  const [now] = useState(() => Date.now())
  const cutoff = now - days * 86_400_000
  const inRange = tickets.filter((ticket) => new Date(ticket.createdAt).getTime() >= cutoff)

  const rows = ticketPriorities
    .map((priority) => {
      const items = inRange.filter((ticket) => ticket.priority === priority)
      const met = items.filter((ticket) => !ticket.slaBreached)
      const resolved = items.filter((ticket) => ticket.status === 'Resolved' || ticket.status === 'Closed')
      return { priority, tickets: items.length, met: met.length, resolved: resolved.length }
    })
    .filter((row) => row.tickets > 0)

  const totals = rows.reduce(
    (sum, row) => ({
      tickets: sum.tickets + row.tickets,
      met: sum.met + row.met,
      resolved: sum.resolved + row.resolved,
    }),
    { tickets: 0, met: 0, resolved: 0 },
  )

  const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–')

  return (
    <div>
      <h2 className="text-[22px] font-bold tracking-tight">Support reports</h2>
      <p className="mt-1.5 max-w-4xl text-[14px] text-fg-muted">
        SLA compliance, response times, reopen rate, customer satisfaction, NPS, agent leaderboard, and volume
        heatmap.
      </p>

      <nav className="mt-6 flex flex-wrap gap-6 border-b border-line">
        {supportReportTabs.map((item) => (
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

      {tab === 'sla' ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[46rem] border-collapse text-[13px]">
            <thead className="border-b border-line text-[12px] text-fg-muted">
              <tr>
                <th scope="col" className="px-5 py-3.5 text-left font-medium">
                  Priority
                </th>
                {['Tickets', 'First-response met', 'First-response %', 'Resolution met', 'Resolution %'].map(
                  (column) => (
                    <th key={column} scope="col" className="px-5 py-3.5 text-right font-medium">
                      {column}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.priority}>
                  <td className="px-5 py-3.5">{row.priority}</td>
                  <td className="px-5 py-3.5 text-right">{row.tickets}</td>
                  <td className="px-5 py-3.5 text-right">{row.met}</td>
                  <td className="px-5 py-3.5 text-right">{pct(row.met, row.tickets)}</td>
                  <td className="px-5 py-3.5 text-right">{row.resolved}</td>
                  <td className="px-5 py-3.5 text-right">{pct(row.resolved, row.tickets)}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="px-5 py-3.5">Total</td>
                <td className="px-5 py-3.5 text-right">{totals.tickets}</td>
                <td className="px-5 py-3.5 text-right">{totals.met}</td>
                <td className="px-5 py-3.5 text-right">{pct(totals.met, totals.tickets)}</td>
                <td className="px-5 py-3.5 text-right">{totals.resolved}</td>
                <td className="px-5 py-3.5 text-right">{pct(totals.resolved, totals.tickets)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-line bg-surface px-6 py-14 text-center text-[14px] text-fg-muted">
          {inRange.length
            ? `${supportReportTabs.find((item) => item.id === tab)?.label} needs ticket history this rebuild does not simulate yet.`
            : `No tickets in ${range.toLowerCase()}.`}
        </p>
      )}
    </div>
  )
}
