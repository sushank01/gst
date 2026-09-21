'use client'

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useSearchParams } from '../../lib/router'
import { useAuth } from '../../lib/auth'
import { useWorkspace, type AuditEvent } from '../../lib/workspace'

type SortKey = 'at' | 'user' | 'action' | 'status' | 'resource'

const ranges = {
  'Last 24 hours': 1,
  'Last 7 days': 7,
  'Last 30 days': 30,
  'Last 90 days': 90,
  'All time': Infinity,
} as const

type RangeLabel = keyof typeof ranges

const rowOptions = [25, 50, 100]

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

/** Turn the filtered rows into a file the browser saves. */
function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

const columns = ['Timestamp', 'User', 'Role', 'Action', 'Status', 'Resource', 'Resource ID', 'IP'] as const

export default function Governance() {
  const [params, setParams] = useSearchParams()
  const { session } = useAuth()
  const { audit } = useWorkspace()

  const [action, setAction] = useState('All Actions')
  const [resource, setResource] = useState('All Resources')
  const [status, setStatus] = useState('All Status')
  const [range, setRange] = useState<RangeLabel>('Last 30 days')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'at', desc: true })
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [, setTick] = useState(0)

  // The header promises a refresh every 30s, so the range actually re-evaluates.
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000)
    return () => clearInterval(timer)
  }, [])

  // The live URL carries the tab; keep it so a link into the audit tab lands here.
  useEffect(() => {
    if (params.get('tab')) return
    setParams({ tab: 'audit' }, { replace: true })
  }, [params, setParams])

  const email = session?.user.email ?? ''
  const userOf = (event: AuditEvent) => (event.user === 'owner' ? email : '')

  const actions = useMemo(
    () => ['All Actions', ...[...new Set(audit.map((event) => event.action))].sort()],
    [audit],
  )
  const resources = useMemo(
    () => ['All Resources', ...[...new Set(audit.map((event) => event.resource))].sort()],
    [audit],
  )

  const filtered = useMemo(() => {
    const cutoff = ranges[range] === Infinity ? 0 : Date.now() - ranges[range] * 86_400_000
    const needle = query.trim().toLowerCase()

    const rows = audit.filter((event) => {
      if (new Date(event.at).getTime() < cutoff) return false
      if (action !== 'All Actions' && event.action !== action) return false
      if (resource !== 'All Resources' && event.resource !== resource) return false
      if (status !== 'All Status' && event.status !== status) return false
      if (!needle) return true
      return `${userOf(event)} ${event.action} ${event.resource} ${event.resourceId}`.toLowerCase().includes(needle)
    })

    const direction = sort.desc ? -1 : 1
    return [...rows].sort((a, b) => {
      const left = sort.key === 'at' ? a.at : sort.key === 'user' ? userOf(a) : a[sort.key]
      const right = sort.key === 'at' ? b.at : sort.key === 'user' ? userOf(b) : b[sort.key]
      return left < right ? -direction : left > right ? direction : 0
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit, action, resource, status, range, query, sort, email])

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage))
  const current = Math.min(page, pageCount)
  const start = (current - 1) * perPage
  const rows = filtered.slice(start, start + perPage)

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, desc: !prev.desc } : { key, desc: true }))
  }

  function exportRows(format: 'csv' | 'json') {
    const flat = filtered.map((event) => ({
      timestamp: event.at,
      user: userOf(event),
      role: event.role,
      action: event.action,
      status: event.status,
      resource: event.resource,
      resourceId: event.resourceId,
      ip: event.ip,
    }))
    const stamp = new Date().toISOString().slice(0, 10)

    if (format === 'json') {
      download(`audit-trail-${stamp}.json`, JSON.stringify(flat, null, 2), 'application/json')
      return
    }

    const head = Object.keys(flat[0] ?? { timestamp: '' }).join(',')
    const body = flat.map((row) => Object.values(row).map((cell) => `"${cell}"`).join(',')).join('\n')
    download(`audit-trail-${stamp}.csv`, `${head}\n${body}`, 'text/csv')
  }

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
        <Dropdown label="Filter by action" value={action} options={actions} onChange={setAction} />
        <Dropdown label="Filter by resource" value={resource} options={resources} onChange={setResource} />
        <Dropdown
          label="Filter by status"
          value={status}
          options={['All Status', 'Success', 'Failed']}
          onChange={setStatus}
        />
        <Dropdown
          label="Date range"
          value={range}
          options={Object.keys(ranges)}
          onChange={(next) => setRange(next as RangeLabel)}
        />
        <button
          onClick={() => exportRows('csv')}
          className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
        >
          <Icon name="download" size={15} /> Export CSV
        </button>
        <button
          onClick={() => exportRows('json')}
          className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
        >
          <Icon name="download" size={15} /> Export JSON
        </button>
        <p className="ml-auto flex items-center gap-2 text-[13px] text-fg-muted">
          <Icon name="activity" size={15} className="text-accent" />
          Auto-refreshes every 30s
        </p>
      </div>

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
          onChange={(next) => setRange(next as RangeLabel)}
        />
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[60rem] border-collapse text-[13px]">
          <thead className="border-b border-line text-[12px] text-fg-muted">
            <tr>
              <SortHeader label="Timestamp" column="at" sort={sort} onSort={toggleSort} />
              <SortHeader label="User" column="user" sort={sort} onSort={toggleSort} />
              <th scope="col" className="px-5 py-3 text-left font-medium">
                Role
              </th>
              <SortHeader label="Action" column="action" sort={sort} onSort={toggleSort} />
              <SortHeader label="Status" column="status" sort={sort} onSort={toggleSort} />
              <SortHeader label="Resource" column="resource" sort={sort} onSort={toggleSort} />
              <th scope="col" className="px-5 py-3 text-left font-medium">
                Resource ID
              </th>
              <th scope="col" className="px-5 py-3 text-left font-medium">
                IP
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length ? (
              rows.map((event) => (
                <tr key={event.id}>
                  <td className="px-5 py-3.5 whitespace-nowrap">{formatStamp(event.at)}</td>
                  <td className="px-5 py-3.5">{userOf(event)}</td>
                  <td className="px-5 py-3.5">{event.role}</td>
                  <td className="px-5 py-3.5">{event.action}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`rounded-lg px-2.5 py-1 text-[12px] font-medium ${
                        event.status === 'Success' ? 'bg-ok-muted text-ok' : 'bg-surface-2 text-fg-muted'
                      }`}
                    >
                      {event.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">{event.resource}</td>
                  <td className="px-5 py-3.5 font-mono text-[12px] text-fg-muted">{event.resourceId}</td>
                  <td className="px-5 py-3.5 text-fg-muted">{event.ip}</td>
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

      <div className="mt-4 flex flex-wrap items-center gap-4 text-[13px] text-fg-muted">
        <p>
          Showing{' '}
          <span className="font-medium text-fg">
            {filtered.length ? start + 1 : 0}–{start + rows.length}
          </span>{' '}
          of <span className="font-medium text-fg">{filtered.length}</span>
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
            disabled={current === 1}
            aria-label="Previous page"
            className="rounded-lg border border-line px-2.5 py-1 transition hover:bg-surface-2 disabled:opacity-40"
          >
            ‹
          </button>
          <span className="flex items-center gap-2">
            Page
            <span className="rounded-lg border border-line px-3 py-1 text-fg">{current}</span>
            of {pageCount}
          </span>
          <button
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            disabled={current === pageCount}
            aria-label="Next page"
            className="rounded-lg border border-line px-2.5 py-1 transition hover:bg-surface-2 disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  )
}
