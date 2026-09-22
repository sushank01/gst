'use client'

import { useCallback, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { useMutation, useResource } from '../../lib/useResource'
import { formatAmount } from '../../lib/useWorkspaceSummary'

/**
 * Everything in this workspace that is waiting for somebody to decide it.
 *
 * The prototype's queue was two constants in `appData.ts` — an invoice and a
 * contract, with invented extracted fields and a "raised 48 minutes ago" that
 * was evaluated whenever the page loaded — and the decision went into
 * localStorage. There are no agent runs in this deployment and no
 * human-in-the-loop pause to resume, so none of that could be made real.
 *
 * What IS real is the approval queue the rest of the product writes to: expense
 * claims, travel requests, asset requests and leave. Each has a submitted state
 * and a decision endpoint that records who decided, at which level, with
 * optimistic concurrency. This screen is those four lists in one place.
 */

type SourceId = 'expense' | 'travel' | 'asset' | 'leave'

type ExpenseReport = {
  id: string
  reference: string
  title: string
  currency: string
  status: string
  currentLevel: number
  totalAmount: string
  version: number
}

type TravelRequest = {
  id: string
  reference: string
  purpose: string
  tripKind: string
  origin: string | null
  destination: string
  departsOn: string
  returnsOn: string
  estimatedCost: string | null
  currency: string | null
  currentLevel: number
  version: number
}

type AssetRequest = {
  id: string
  reference: string
  assetType: string | null
  quantity: number
  reason: string | null
  neededBy: string | null
  currentLevel: number
  version: number
}

type LeaveRequest = {
  id: string
  leaveTypeId: string
  startsOn: string
  endsOn: string
  dayCount: string
  reason: string | null
  version: number
}

type Fact = { label: string; value: string }

type QueueItem = {
  key: string
  source: SourceId
  id: string
  version: number
  heading: string
  reference: string | null
  summary: string
  facts: Fact[]
  decisionPath: string
}

const sourceLabels: Record<SourceId, string> = {
  expense: 'Expense claim',
  travel: 'Travel',
  asset: 'Asset request',
  leave: 'Leave',
}

const sourceTone: Record<SourceId, string> = {
  expense: 'bg-accent-muted text-accent',
  travel: 'bg-warn-muted text-warn',
  asset: 'bg-surface-2 text-fg-2',
  leave: 'bg-ok-muted text-ok',
}

/** Only rows in this state are decidable; every decision endpoint refuses the rest. */
const SUBMITTED = { status: 'submitted', limit: 50 } as const

/** What the server says the record became, once the decision was recorded. */
const statusSentence = (status: string | undefined) => {
  if (status === 'submitted') return 'Recorded. It still needs a decision at the next approval level.'
  if (!status) return 'Recorded.'
  return `Recorded. It is now ${status}.`
}

function useQueue() {
  const expenses = useResource<{ reports: ExpenseReport[]; total: number }>(
    'approvals:expenses',
    useCallback(
      (signal) => api.get<{ reports: ExpenseReport[]; total: number }>('/expenses/reports', SUBMITTED, signal),
      [],
    ),
  )
  const travel = useResource<{ requests: TravelRequest[]; total: number }>(
    'approvals:travel',
    useCallback(
      (signal) => api.get<{ requests: TravelRequest[]; total: number }>('/travel/requests', SUBMITTED, signal),
      [],
    ),
  )
  const assets = useResource<{ requests: AssetRequest[]; total: number }>(
    'approvals:assets',
    useCallback(
      (signal) => api.get<{ requests: AssetRequest[]; total: number }>('/assets/requests', SUBMITTED, signal),
      [],
    ),
  )
  const leave = useResource<{ requests: LeaveRequest[]; total: number }>(
    'approvals:leave',
    useCallback(
      (signal) => api.get<{ requests: LeaveRequest[]; total: number }>('/hr/leave/requests', SUBMITTED, signal),
      [],
    ),
  )

  // Leave rows carry a type id, not a name. The lookup is only worth a request
  // when there is something waiting to be named.
  const leaveRows = useMemo(() => leave.data?.requests ?? [], [leave.data])
  const leaveTypes = useResource<{ leaveTypes: { id: string; name: string }[] }>(
    'approvals:leave-types',
    useCallback(
      (signal) => api.get<{ leaveTypes: { id: string; name: string }[] }>('/hr/leave/types', undefined, signal),
      [],
    ),
    { enabled: leaveRows.length > 0 },
  )

  const items = useMemo<QueueItem[]>(() => {
    const typeNames = new Map((leaveTypes.data?.leaveTypes ?? []).map((type) => [type.id, type.name]))

    const expenseItems = (expenses.data?.reports ?? []).map<QueueItem>((report) => ({
      key: `expense:${report.id}`,
      source: 'expense',
      id: report.id,
      version: report.version,
      heading: report.title,
      reference: report.reference,
      summary: `Expense claim for ${formatAmount(report.totalAmount, report.currency)}.`,
      facts: [
        { label: 'Reference', value: report.reference },
        { label: 'Claimed', value: formatAmount(report.totalAmount, report.currency) },
        { label: 'Approval level', value: String(report.currentLevel) },
      ],
      decisionPath: `/expenses/reports/${report.id}/decision`,
    }))

    const travelItems = (travel.data?.requests ?? []).map<QueueItem>((trip) => ({
      key: `travel:${trip.id}`,
      source: 'travel',
      id: trip.id,
      version: trip.version,
      heading: trip.destination,
      reference: trip.reference,
      summary: trip.purpose,
      facts: [
        { label: 'Reference', value: trip.reference },
        { label: 'Route', value: trip.origin ? `${trip.origin} → ${trip.destination}` : trip.destination },
        { label: 'Departs', value: trip.departsOn },
        { label: 'Returns', value: trip.returnsOn },
        { label: 'Trip', value: trip.tripKind },
        // An estimate nobody entered is left out: a cost line reading zero
        // would be read as a free trip.
        ...(trip.estimatedCost
          ? [{ label: 'Estimated cost', value: formatAmount(trip.estimatedCost, trip.currency) }]
          : []),
        { label: 'Approval level', value: String(trip.currentLevel) },
      ],
      decisionPath: `/travel/requests/${trip.id}/decision`,
    }))

    const assetItems = (assets.data?.requests ?? []).map<QueueItem>((request) => ({
      key: `asset:${request.id}`,
      source: 'asset',
      id: request.id,
      version: request.version,
      heading: request.assetType ?? 'Asset request',
      reference: request.reference,
      summary: request.reason ?? `${request.quantity} × ${request.assetType ?? 'unspecified item'}.`,
      facts: [
        { label: 'Reference', value: request.reference },
        ...(request.assetType ? [{ label: 'Type', value: request.assetType }] : []),
        { label: 'Quantity', value: String(request.quantity) },
        ...(request.neededBy ? [{ label: 'Needed by', value: request.neededBy }] : []),
        { label: 'Approval level', value: String(request.currentLevel) },
      ],
      decisionPath: `/assets/requests/${request.id}/decision`,
    }))

    const leaveItems = leaveRows.map<QueueItem>((request) => {
      const typeName = typeNames.get(request.leaveTypeId)
      return {
        key: `leave:${request.id}`,
        source: 'leave',
        id: request.id,
        version: request.version,
        heading: typeName ?? 'Leave request',
        reference: null,
        summary: `${request.dayCount} day(s), ${request.startsOn} to ${request.endsOn}.`,
        facts: [
          ...(typeName ? [{ label: 'Leave type', value: typeName }] : []),
          { label: 'From', value: request.startsOn },
          { label: 'To', value: request.endsOn },
          { label: 'Days', value: request.dayCount },
          ...(request.reason ? [{ label: 'Reason', value: request.reason }] : []),
        ],
        decisionPath: `/hr/leave/requests/${request.id}/decision`,
      }
    })

    return [...expenseItems, ...travelItems, ...assetItems, ...leaveItems]
  }, [expenses.data, travel.data, assets.data, leaveRows, leaveTypes.data])

  const sources = useMemo(
    () => [
      { id: 'expense' as const, resource: expenses, total: expenses.data?.total },
      { id: 'travel' as const, resource: travel, total: travel.data?.total },
      { id: 'asset' as const, resource: assets, total: assets.data?.total },
      { id: 'leave' as const, resource: leave, total: leave.data?.total },
    ],
    [expenses, travel, assets, leave],
  )

  const refetchAll = useCallback(() => {
    expenses.refetch()
    travel.refetch()
    assets.refetch()
    leave.refetch()
  }, [expenses, travel, assets, leave])

  return {
    items,
    sources,
    loading: sources.some((source) => source.resource.loading),
    refreshing: sources.some((source) => source.resource.refreshing),
    /** The server's totals, summed. Sources that failed are excluded, not counted as nought. */
    total: sources.reduce((sum, source) => sum + (source.total ?? 0), 0),
    anyFailed: sources.some((source) => source.resource.error),
    refetchAll,
  }
}

function QueueRow({ item, active, onSelect }: { item: QueueItem; active: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={`w-full border-l-2 px-4 py-3.5 text-left transition ${
          active ? 'border-accent bg-accent/5' : 'border-transparent hover:bg-surface-2'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[14px] font-medium">{item.heading}</p>
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${sourceTone[item.source]}`}>
            {sourceLabels[item.source]}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-fg-muted">{item.summary}</p>
        {item.reference && <p className="mt-1.5 font-mono text-[11px] text-fg-muted">{item.reference}</p>}
      </button>
    </li>
  )
}

function Detail({
  item,
  onDecided,
}: {
  item: QueueItem
  onDecided: (message: string) => void
}) {
  const [note, setNote] = useState('')

  const [decide, state] = useMutation(async (decision: 'approved' | 'rejected') => {
    // The version read with the row goes back with the decision: two approvers
    // on the same claim get a conflict, not a silent second decision.
    const body = await api.post<Record<string, { status?: string }>>(item.decisionPath, {
      decision,
      version: item.version,
      note: note.trim() || undefined,
    })
    onDecided(statusSentence(Object.values(body)[0]?.status))
    return true
  })

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{item.heading}</h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            {sourceLabels[item.source]}
            {item.reference ? ` · ${item.reference}` : ''}
          </p>
        </div>
      </div>

      <p className="mt-5 text-[15px] leading-relaxed text-fg-2">{item.summary}</p>

      <section className="mt-6 overflow-hidden rounded-2xl border border-line">
        <h3 className="border-b border-line bg-surface-2/50 px-4 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">
          Request
        </h3>
        <dl className="divide-y divide-line">
          {item.facts.map((fact) => (
            <div key={fact.label} className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-[13px] text-fg-muted">{fact.label}</dt>
              <dd className="text-right text-[13px] font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <label className="mt-6 block text-[13px] font-medium">
        Note (optional)
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="Why you are approving or rejecting this."
          className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
        />
      </label>

      {state.error && (
        <p role="alert" className="mt-4 rounded-xl border border-bad/40 bg-bad-muted/30 px-4 py-3 text-[13px] text-bad">
          {state.error.isConflict
            ? `Somebody else changed this while you had it open — ${state.error.message} Refresh the queue and look again.`
            : state.error.message}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2.5">
        <button
          onClick={() => decide('approved')}
          disabled={state.pending}
          className="rounded-xl bg-accent px-5 py-2.5 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => decide('rejected')}
          disabled={state.pending}
          className="rounded-xl border border-bad/40 px-5 py-2.5 text-[14px] font-medium text-bad transition hover:bg-bad-muted/40 disabled:opacity-50"
        >
          Reject
        </button>
      </div>

      {/* Leave is decided once — `hr_leave_requests` carries no level and
          `decideLeave` has no round — so the multi-level sentence is only told
          to the three sources that actually have levels. */}
      <p className="mt-6 text-[13px] text-fg-muted">
        {item.source === 'leave'
          ? 'The decision is recorded against this request with your user and the time, and an approval moves the days off the balance. '
          : 'The decision is recorded against this record with your user, the time and the approval level, and a further level may still be required. '}
        The requester&apos;s name is held by the module that raised the request and is not read here.
      </p>
    </div>
  )
}

export default function Approvals() {
  const queue = useQueue()
  const [selected, setSelected] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)

  const active = queue.items.find((item) => item.key === selected) ?? null

  return (
    <div className="-mx-6 -mt-2 flex min-h-[calc(100dvh-5rem)]">
      <aside className="flex w-[290px] shrink-0 flex-col border-r border-line">
        <header className="border-b border-line px-4 py-4">
          <h1 className="flex items-center gap-2 text-[15px] font-semibold text-accent">
            <span aria-hidden>🛡</span>
            Approvals
          </h1>
          <p className="mt-0.5 text-[12px] text-fg-muted">Everything awaiting a decision</p>
        </header>

        <section className="border-b border-line">
          <div className="flex items-center justify-between px-4 py-2.5">
            <h2 className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Awaiting review</h2>
            <button
              onClick={queue.refetchAll}
              aria-label="Refresh queue"
              className="text-fg-muted transition hover:rotate-180 hover:text-fg"
            >
              ⟳
            </button>
          </div>

          {queue.loading ? (
            <p role="status" className="px-4 py-8 text-center text-[12px] text-fg-muted">
              Loading the queue…
            </p>
          ) : queue.items.length ? (
            <>
              <ul className="divide-y divide-line">
                {queue.items.map((item) => (
                  <QueueRow
                    key={item.key}
                    item={item}
                    active={selected === item.key}
                    onSelect={() => {
                      setSelected(item.key)
                      setOutcome(null)
                    }}
                  />
                ))}
              </ul>
              {/* Each source is fetched a page at a time; when there are more
                  waiting than are listed, the list says so rather than looking
                  like the whole queue. */}
              {queue.total > queue.items.length && (
                <p className="px-4 py-2.5 text-[11px] text-fg-muted">
                  Showing {queue.items.length} of {queue.total} awaiting a decision.
                </p>
              )}
            </>
          ) : (
            <div className="px-4 py-8 text-center">
              {/* A tick over a queue nobody could read says "all clear" about
                  four lists we never saw. The glyph follows the fact. */}
              <span aria-hidden className={`text-lg ${queue.anyFailed ? 'text-warn' : 'text-fg-muted'}`}>
                {queue.anyFailed ? '⚠' : '✓'}
              </span>
              <p className="mt-2 text-[12px] text-fg-muted">
                {queue.anyFailed ? 'Nothing from the sources we could read' : 'Nothing is awaiting a decision'}
              </p>
            </div>
          )}
        </section>

        <section className="flex-1 px-4 py-4">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Awaiting by source</h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            {queue.sources.map((source) => (
              <div key={source.id} className="flex items-center justify-between gap-3">
                <dt className="text-fg-2">{sourceLabels[source.id]}</dt>
                <dd className={`font-semibold ${source.resource.error ? 'text-bad' : ''}`}>
                  {/*
                    A source that failed to load shows as unavailable, never as
                    nought: "no travel requests are waiting" and "we could not
                    ask about travel" are different facts, and only one of them
                    means there is nothing to do.
                  */}
                  {source.resource.error
                    ? source.resource.denied
                      ? 'no access'
                      : 'unavailable'
                    : source.resource.loading
                      ? '…'
                      : (source.total ?? 0)}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
              {/* Labelled partial when a source is missing, so the figure is not
                  read as the whole queue — and left blank while the sources are
                  still answering, because a sum of four totals nobody has yet
                  is nought only in the arithmetic, not in the world. */}
              <dt className="text-fg-2">{queue.anyFailed ? 'Total (partial)' : 'Total'}</dt>
              <dd className="font-semibold">{queue.loading ? '…' : queue.total}</dd>
            </div>
          </dl>

          {queue.anyFailed && (
            <div role="alert" className="mt-4 rounded-xl border border-bad/40 bg-bad-muted/30 px-3 py-2.5 text-[12px] text-bad">
              <p>Some sources could not be read, so this queue is incomplete.</p>
              <button onClick={queue.refetchAll} className="mt-2 underline">
                Try again
              </button>
            </div>
          )}
        </section>
      </aside>

      <div className="min-w-0 flex-1">
        {outcome ? (
          <div className="grid h-full place-items-center px-6 py-20 text-center">
            <div>
              <span
                aria-hidden
                className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-ok-muted text-2xl text-ok"
              >
                ✓
              </span>
              <p className="mt-6 text-lg font-medium text-fg-2">{outcome}</p>
              <button
                onClick={() => {
                  setOutcome(null)
                  setSelected(null)
                }}
                className="mt-4 rounded-xl border border-line px-4 py-2 text-[14px] text-fg-2 transition hover:bg-surface-2"
              >
                Back to the queue
              </button>
            </div>
          </div>
        ) : active ? (
          <Detail
            key={active.key}
            item={active}
            onDecided={(message) => {
              setOutcome(message)
              queue.refetchAll()
            }}
          />
        ) : (
          <div className="grid h-full place-items-center px-6 py-20 text-center">
            <div>
              <span
                aria-hidden
                className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-surface-2 text-2xl text-fg-muted"
              >
                👤
              </span>
              <p className="mt-6 text-lg font-medium text-fg-2">Select a request from the queue</p>
              <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-fg-muted">
                Expense claims, travel, asset requests and leave that have been submitted and are waiting on a decision
                appear here. Approving or rejecting one records the decision against that record.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
