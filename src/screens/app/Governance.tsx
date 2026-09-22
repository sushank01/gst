'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useSearchParams } from '../../lib/router'
import { api } from '../../lib/api'
import { csvCell } from '../../lib/csv'
import { useMutation, useResource } from '../../lib/useResource'

/**
 * The audit trail, from the server.
 *
 * Everything on this screen used to be computed in the browser over an array
 * the prototype kept in localStorage: the row count, the filter menus, the
 * paging, and a User column that printed the signed-in reader's own address
 * beside every event. Now the trail is read through `GET /api/v1/audit`, which
 * filters and pages in SQL, resolves the actor against `users` and their role
 * against `memberships`, and refuses the whole screen to anyone without
 * `audit.read` — a member sees that refusal rather than an empty table.
 */

type AuditEvent = {
  id: string
  occurredAt: string
  actorKind: string
  actorUserId: string | null
  actorEmail: string | null
  actorName: string | null
  actorRole: string | null
  action: string
  resource: string
  resourceId: string | null
  outcome: string
  requestId: string | null
}

type AuditPage = {
  rows: AuditEvent[]
  total: number
  facets: { actions: string[]; resources: string[] }
}

type SortKey = 'occurredAt' | 'actor' | 'action' | 'outcome' | 'resource'

const ranges = {
  'Last 24 hours': 1,
  'Last 7 days': 7,
  'Last 30 days': 30,
  'Last 90 days': 90,
  'All time': Infinity,
} as const

type RangeLabel = keyof typeof ranges

const rowOptions = [25, 50, 100]

/** How often the trail is re-read. The header says so, so it has to be true. */
const POLL_MS = 30_000

const outcomeOptions = ['All Status', 'Success', 'Failed', 'Denied'] as const

const outcomeParam: Record<string, string | undefined> = {
  'All Status': undefined,
  Success: 'success',
  Failed: 'failure',
  Denied: 'denied',
}

const outcomeLabels: Record<string, string> = { success: 'Success', failure: 'Failed', denied: 'Denied' }

/** Who acted, when it was not a person: the scheduler, a webhook, a portal. */
const actorKindLabels: Record<string, string> = {
  user: 'Deleted user',
  system: 'System',
  job: 'Scheduled job',
  integration: 'Integration',
  portal: 'Portal',
}

/** `Sep 20, 2026 08:51` — the format the live table uses. */
function formatStamp(iso: string) {
  const date = new Date(iso)
  const day = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${day} ${time}`
}

function Dropdown({
  label,
  value,
  options,
  onChange,
  icon,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (next: string) => void
  icon?: string
}) {
  return (
    <span className="relative inline-flex items-center">
      {icon && (
        <span aria-hidden className="pointer-events-none absolute left-3 text-fg-muted">
          {icon}
        </span>
      )}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`rounded-xl border border-line bg-surface py-2.5 pr-9 text-[13px] text-fg-2 transition hover:bg-surface-2 focus:border-accent focus:outline-none ${
          icon ? 'pl-9' : 'pl-3.5'
        }`}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </span>
  )
}

function SortHeader({
  label,
  column,
  sort,
  onSort,
  className = '',
}: {
  label: string
  column: SortKey
  sort: { key: SortKey; desc: boolean }
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sort.key === column
  return (
    <th scope="col" className={`px-5 py-3 text-left font-medium ${className}`}>
      <button
        onClick={() => onSort(column)}
        aria-label={`Sort by ${label}`}
        className={`inline-flex items-center gap-1.5 transition hover:text-fg ${active ? 'text-fg' : ''}`}
      >
        {label}
        <span aria-hidden className={active ? 'text-accent' : 'text-fg-muted'}>
          {active ? (sort.desc ? '↓' : '↑') : '⇅'}
        </span>
      </button>
    </th>
  )
}

/** Turn the exported rows into a file the browser saves. */
function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

/** The largest page `GET /api/v1/audit` will return, and so the export ceiling. */
const EXPORT_LIMIT = 500

/**
 * The exported columns, fixed rather than read off the first row.
 *
 * Derived from `rows[0]` they would vanish on an empty export, leaving a file
 * whose single header column misdescribes what was asked for.
 */
const EXPORT_COLUMNS = ['timestamp', 'user', 'role', 'action', 'status', 'resource', 'resourceId'] as const

const columns = ['Timestamp', 'User', 'Role', 'Action', 'Status', 'Resource', 'Resource ID'] as const

const actorOf = (event: AuditEvent) => event.actorEmail ?? actorKindLabels[event.actorKind] ?? event.actorKind

export default function Governance() {
  const [params, setParams] = useSearchParams()

  const [action, setAction] = useState('All Actions')
  const [resource, setResource] = useState('All Resources')
  const [status, setStatus] = useState<string>('All Status')
  const [range, setRange] = useState<RangeLabel>('Last 30 days')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'occurredAt', desc: true })
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [now, setNow] = useState(() => Date.now())
  const [tick, setTick] = useState(0)
  const [exportNote, setExportNote] = useState<string | null>(null)

  /*
   * A moving clock, so "Last 24 hours" keeps meaning the last 24 hours, and a
   * tick that forces the re-read.
   *
   * The clock alone is not enough: on "All time" there is no `from` in the
   * filter, so advancing it changes nothing the request key is built from and
   * the trail would sit there unread under a header promising a refresh — the
   * prototype's bug in a new shape. The tick is part of the key, so every range
   * genuinely re-reads on the interval the header names.
   */
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
      setTick((value) => value + 1)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [])

  // The live URL carries the tab; keep it so a link into the audit tab lands here.
  useEffect(() => {
    if (params.get('tab')) return
    setParams({ tab: 'audit' }, { replace: true })
  }, [params, setParams])

  const days = ranges[range]
  const from = useMemo(
    () => (Number.isFinite(days) ? new Date(now - days * 86_400_000).toISOString() : undefined),
    [days, now],
  )

  const filters = useMemo(
    () => ({
      action: action === 'All Actions' ? undefined : action,
      resource: resource === 'All Resources' ? undefined : resource,
      outcome: outcomeParam[status],
      from,
      q: query.trim() || undefined,
      sort: sort.key,
      direction: sort.desc ? ('desc' as const) : ('asc' as const),
    }),
    [action, resource, status, from, query, sort],
  )

  const offset = (page - 1) * perPage
  const trail = useResource<AuditPage>(
    JSON.stringify([filters, perPage, offset, tick]),
    useCallback(
      (signal) => api.get<AuditPage>('/audit', { ...filters, limit: perPage, offset }, signal),
      [filters, perPage, offset],
    ),
  )

  const rows = trail.data?.rows ?? []
  const total = trail.data?.total ?? 0
  const actions = ['All Actions', ...(trail.data?.facets.actions ?? [])]
  const resources = ['All Resources', ...(trail.data?.facets.resources ?? [])]
  const pageCount = Math.max(1, Math.ceil(total / perPage))

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, desc: !prev.desc } : { key, desc: true }))
    setPage(1)
  }

  /*
   * The export re-asks the server for the whole filtered trail rather than
   * writing out the page on screen. It is still capped, so when the cap bites
   * the file says so instead of quietly being a fraction of what its name
   * claims.
   */
  const [runExport, exportState] = useMutation(async (format: 'csv' | 'json') => {
    setExportNote(null)
    const page = await api.get<AuditPage>('/audit', { ...filters, limit: EXPORT_LIMIT, offset: 0 })
    const flat = page.rows.map((event) => ({
      timestamp: event.occurredAt,
      user: actorOf(event),
      role: event.actorRole ?? '',
      action: event.action,
      status: outcomeLabels[event.outcome] ?? event.outcome,
      resource: event.resource,
      resourceId: event.resourceId ?? '',
    }))
    const stamp = new Date().toISOString().slice(0, 10)

    if (format === 'json') {
      download(`audit-trail-${stamp}.json`, JSON.stringify(flat, null, 2), 'application/json')
    } else {
      // `csvCell` is the codebase's export cell: it doubles an embedded quote
      // so one value with a quotation mark cannot shift every column after it,
      // and it writes a leading =, + or @ as text so an audited value is never
      // run as a formula by whatever opens the file.
      const head = EXPORT_COLUMNS.join(',')
      const body = flat.map((row) => EXPORT_COLUMNS.map((key) => csvCell(row[key])).join(',')).join('\n')
      download(`audit-trail-${stamp}.csv`, `${head}\n${body}`, 'text/csv')
    }

    setExportNote(
      page.total > page.rows.length
        ? `Exported the ${page.rows.length} most recent of ${page.total} matching entries — narrow the filters to export the rest.`
        : `Exported ${page.rows.length} ${page.rows.length === 1 ? 'entry' : 'entries'}.`,
    )
  })

  return (
    <div className="pt-2">
      <header>
        <h1 className="flex items-center gap-3 text-[28px] font-bold tracking-tight">
          <Icon name="file-text" size={26} className="text-accent" />
          Audit Trail
        </h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          Tenant-scoped audit history for actions taken in your organization.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Dropdown
          label="Filter by action"
          value={action}
          options={actions}
          onChange={(next) => {
            setAction(next)
            setPage(1)
          }}
        />
        <Dropdown
          label="Filter by resource"
          value={resource}
          options={resources}
          onChange={(next) => {
            setResource(next)
            setPage(1)
          }}
        />
        <Dropdown
          label="Filter by status"
          value={status}
          options={outcomeOptions}
          onChange={(next) => {
            setStatus(next)
            setPage(1)
          }}
        />
        <Dropdown
          label="Date range"
          value={range}
          options={Object.keys(ranges)}
          onChange={(next) => {
            setRange(next as RangeLabel)
            setPage(1)
          }}
        />
        {/* The export asks for the same trail this screen just failed to read,
            so while that read is failing the buttons are off rather than live
            controls that can only produce an error — a member without
            `audit.read` can never export, and the button should say so. */}
        <button
          onClick={() => runExport('csv')}
          disabled={exportState.pending || Boolean(trail.error)}
          title={trail.error ? 'The audit trail could not be read, so there is nothing to export.' : undefined}
          className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2 disabled:opacity-50"
        >
          <Icon name="download" size={15} /> Export CSV
        </button>
        <button
          onClick={() => runExport('json')}
          disabled={exportState.pending || Boolean(trail.error)}
          title={trail.error ? 'The audit trail could not be read, so there is nothing to export.' : undefined}
          className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2 disabled:opacity-50"
        >
          <Icon name="download" size={15} /> Export JSON
        </button>
        <p className="ml-auto flex items-center gap-2 text-[13px] text-fg-muted" aria-live="polite">
          <Icon name="activity" size={15} className="text-accent" />
          {trail.refreshing ? 'Refreshing…' : 'Auto-refreshes every 30s'}
        </p>
      </div>

      {(exportNote ?? exportState.error) && (
        <p
          role="status"
          className={`mt-3 text-[13px] ${exportState.error ? 'text-bad' : 'text-fg-muted'}`}
        >
          {exportState.error ? `That export failed: ${exportState.error.message}` : exportNote}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] max-w-md flex-1">
          <span aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted">
            ⌕
          </span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Search logs..."
            aria-label="Search logs"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </div>
        <Dropdown
          label="Date range"
          icon="🗓"
          value={range}
          options={Object.keys(ranges)}
          onChange={(next) => {
            setRange(next as RangeLabel)
            setPage(1)
          }}
        />
      </div>

      {trail.error ? (
        /* A failed or refused read is never an empty table: "nothing has
           happened in this workspace" is a very different claim from "you may
           not see what has". */
        <div role="alert" className="mt-5 rounded-2xl border border-bad/40 bg-bad-muted/30 px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-fg">
            {trail.denied
              ? 'Your role cannot read the audit trail. It is limited to admins and owners.'
              : 'We could not load the audit trail.'}
          </p>
          <p className="mt-1.5 text-[13px] text-fg-muted">{trail.error.message}</p>
          {trail.canRetry && (
            <button
              onClick={trail.refetch}
              className="mt-4 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
            >
              Try again
            </button>
          )}
          {trail.error.requestId && (
            <p className="mt-3 font-mono text-[11px] text-fg-muted">Reference {trail.error.requestId}</p>
          )}
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[60rem] border-collapse text-[13px]">
            <thead className="border-b border-line text-[12px] text-fg-muted">
              <tr>
                <SortHeader label="Timestamp" column="occurredAt" sort={sort} onSort={toggleSort} />
                <SortHeader label="User" column="actor" sort={sort} onSort={toggleSort} />
                <th scope="col" className="px-5 py-3 text-left font-medium">
                  Role
                </th>
                <SortHeader label="Action" column="action" sort={sort} onSort={toggleSort} />
                <SortHeader label="Status" column="outcome" sort={sort} onSort={toggleSort} />
                <SortHeader label="Resource" column="resource" sort={sort} onSort={toggleSort} />
                <th scope="col" className="px-5 py-3 text-left font-medium">
                  Resource ID
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {trail.loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-14 text-center text-fg-muted" role="status">
                    Loading the audit trail…
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((event) => (
                  <tr key={event.id}>
                    <td className="px-5 py-3.5 whitespace-nowrap">{formatStamp(event.occurredAt)}</td>
                    <td className="px-5 py-3.5" title={event.actorName ?? undefined}>
                      {actorOf(event)}
                    </td>
                    <td className="px-5 py-3.5">{event.actorRole ?? '–'}</td>
                    <td className="px-5 py-3.5">{event.action}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-lg px-2.5 py-1 text-[12px] font-medium ${
                          event.outcome === 'success' ? 'bg-ok-muted text-ok' : 'bg-bad-muted text-bad'
                        }`}
                      >
                        {outcomeLabels[event.outcome] ?? event.outcome}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">{event.resource}</td>
                    <td className="px-5 py-3.5 font-mono text-[12px] text-fg-muted">{event.resourceId ?? '–'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-14 text-center text-fg-muted">
                    No audit entries match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/*
        The pager only exists when there is a trail behind it. Left outside the
        failure branch it printed "Showing 0–0 of 0" underneath the refusal a
        member gets and underneath the first-load spinner — a count of nought
        standing in for a number nobody has, which is the one thing this screen
        must never do.
      */}
      {!trail.error && (
        <div className="mt-4 flex flex-wrap items-center gap-4 text-[13px] text-fg-muted">
          <p>
            Showing{' '}
            <span className="font-medium text-fg">
              {trail.loading ? '…' : `${rows.length ? offset + 1 : 0}–${offset + rows.length}`}
            </span>{' '}
            {/* The total is the server's count for these filters, not the length
                of the page in front of the reader. */}
            of <span className="font-medium text-fg">{trail.loading ? '…' : total}</span>
          </p>

          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2">
              Rows
              <select
                value={perPage}
                onChange={(event) => {
                  setPerPage(Number(event.target.value))
                  setPage(1)
                }}
                className="rounded-xl border border-line bg-surface py-1.5 pr-7 pl-2.5 text-[13px] text-fg focus:border-accent focus:outline-none"
              >
                {rowOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page === 1}
              aria-label="Previous page"
              className="rounded-lg border border-line px-2.5 py-1 transition hover:bg-surface-2 disabled:opacity-40"
            >
              ‹
            </button>
            <span className="flex items-center gap-2">
              Page
              <span className="rounded-lg border border-line px-3 py-1 text-fg">{Math.min(page, pageCount)}</span>
              of {trail.loading ? '…' : pageCount}
            </span>
            <button
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              disabled={trail.loading || page >= pageCount}
              aria-label="Next page"
              className="rounded-lg border border-line px-2.5 py-1 transition hover:bg-surface-2 disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
      )}

      <p className="mt-3 text-[12px] text-fg-muted">
        The originating IP is not recorded by this deployment, so there is no column for it. Every entry is written by
        the server from the session that acted — never from anything a client sent.
      </p>
    </div>
  )
}
