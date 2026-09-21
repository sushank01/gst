'use client'

import { useMemo, useState } from 'react'
import { pendingApprovals } from '../../lib/appData'
import type { Approval } from '../../lib/appData'
import { relativeTime } from '../../lib/relativeTime'
import { useWorkspace } from '../../lib/workspace'
import type { ApprovalDecision } from '../../lib/workspace'

const decisionTone: Record<ApprovalDecision, string> = {
  approved: 'bg-ok-muted text-ok',
  modified: 'bg-warn-muted text-warn',
  rejected: 'bg-bad-muted text-bad',
}

function QueueRow({
  approval,
  active,
  decision,
  onSelect,
}: {
  approval: Approval
  active: boolean
  decision?: ApprovalDecision
  onSelect: () => void
}) {
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
          <p className="text-[14px] font-medium">{approval.agent}</p>
          {decision && (
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${decisionTone[decision]}`}>
              {decision}
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-fg-muted">{approval.summary}</p>
        <p className="mt-1.5 text-[11px] text-fg-muted">
          {approval.app} · {relativeTime(approval.raisedAt)}
        </p>
      </button>
    </li>
  )
}

function Detail({
  approval,
  decision,
  onDecide,
}: {
  approval: Approval
  decision?: ApprovalDecision
  onDecide: (next: ApprovalDecision) => void
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{approval.agent}</h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            {approval.app} · {approval.node}
          </p>
        </div>
        {decision && (
          <span className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold ${decisionTone[decision]}`}>
            {decision}
          </span>
        )}
      </div>

      <p className="mt-5 rounded-xl border border-warn/30 bg-warn-muted/40 px-4 py-3 text-[13px] text-warn">
        Paused by guardrail — {approval.guardrail}
      </p>

      <p className="mt-5 text-[15px] leading-relaxed text-fg-2">{approval.summary}</p>

      <section className="mt-6 overflow-hidden rounded-2xl border border-line">
        <h3 className="border-b border-line bg-surface-2/50 px-4 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">
          Extracted data
        </h3>
        <dl className="divide-y divide-line">
          {approval.fields.map((field) => (
            <div key={field.label} className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-[13px] text-fg-muted">{field.label}</dt>
              <dd className={`text-right text-[13px] font-medium ${field.flagged ? 'text-warn' : ''}`}>
                {field.value}
                {field.flagged && (
                  <span aria-hidden className="ml-1.5">
                    ⚑
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {decision ? (
        <p className="mt-6 text-[13px] text-fg-muted">
          Recorded in the audit trail with actor, timestamp, and the state before and after. The run resumed on your
          decision.
        </p>
      ) : (
        <div className="mt-6 flex flex-wrap gap-2.5">
          <button
            onClick={() => onDecide('approved')}
            className="rounded-xl bg-accent px-5 py-2.5 text-[14px] font-semibold text-white transition hover:opacity-90"
          >
            Approve
          </button>
          <button
            onClick={() => onDecide('modified')}
            className="rounded-xl border border-line px-5 py-2.5 text-[14px] font-medium text-fg-2 transition hover:bg-surface-2"
          >
            Modify
          </button>
          <button
            onClick={() => onDecide('rejected')}
            className="rounded-xl border border-bad/40 px-5 py-2.5 text-[14px] font-medium text-bad transition hover:bg-bad-muted/40"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

export default function Approvals() {
  const { approvals, decideApproval, reload } = useWorkspace()
  const [selected, setSelected] = useState<string | null>(null)

  const awaiting = useMemo(() => pendingApprovals.filter((item) => !approvals[item.id]), [approvals])
  const reviewed = useMemo(() => pendingApprovals.filter((item) => approvals[item.id]), [approvals])

  const stats = useMemo(() => {
    const values = Object.values(approvals)
    return {
      total: values.length,
      approved: values.filter((value) => value === 'approved').length,
      modified: values.filter((value) => value === 'modified').length,
      rejected: values.filter((value) => value === 'rejected').length,
    }
  }, [approvals])

  const active = pendingApprovals.find((item) => item.id === selected) ?? null

  return (
    <div className="-mx-6 -mt-2 flex min-h-[calc(100dvh-5rem)]">
      <aside className="flex w-[290px] shrink-0 flex-col border-r border-line">
        <header className="border-b border-line px-4 py-4">
          <h1 className="flex items-center gap-2 text-[15px] font-semibold text-accent">
            <span aria-hidden>🛡</span>
            Approvals
          </h1>
          <p className="mt-0.5 text-[12px] text-fg-muted">Human-In-the-Loop Review</p>
        </header>

        <section className="border-b border-line">
          <div className="flex items-center justify-between px-4 py-2.5">
            <h2 className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Awaiting review</h2>
            <button
              onClick={reload}
              aria-label="Refresh queue"
              className="text-fg-muted transition hover:rotate-180 hover:text-fg"
            >
              ⟳
            </button>
          </div>

          {awaiting.length ? (
            <ul className="divide-y divide-line">
              {awaiting.map((item) => (
                <QueueRow
                  key={item.id}
                  approval={item}
                  active={selected === item.id}
                  onSelect={() => setSelected(item.id)}
                />
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center">
              <span aria-hidden className="text-lg text-fg-muted">
                ✓
              </span>
              <p className="mt-2 text-[12px] text-fg-muted">No pending reviews</p>
            </div>
          )}
        </section>

        <section className="flex-1 border-b border-line">
          <h2 className="px-4 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">
            Recently reviewed
          </h2>

          {reviewed.length ? (
            <ul className="divide-y divide-line">
              {reviewed.map((item) => (
                <QueueRow
                  key={item.id}
                  approval={item}
                  active={selected === item.id}
                  decision={approvals[item.id]}
                  onSelect={() => setSelected(item.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-[12px] text-fg-muted italic">No recent reviews</p>
          )}
        </section>

        <section className="px-4 py-4">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Stats</h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            {[
              { label: 'Total Reviews', value: stats.total, tone: '' },
              { label: 'Approved', value: stats.approved, tone: 'text-ok' },
              { label: 'Modified', value: stats.modified, tone: 'text-warn' },
              { label: 'Rejected', value: stats.rejected, tone: 'text-bad' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className={row.tone || 'text-fg-2'}>{row.label}</dt>
                <dd className={`font-semibold ${row.tone}`}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </aside>

      <div className="min-w-0 flex-1">
        {active ? (
          <Detail
            approval={active}
            decision={approvals[active.id]}
            onDecide={(next) => decideApproval(active.id, next, active.agent)}
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
              <p className="mt-6 text-lg font-medium text-fg-2">Select a review from the queue</p>
              <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-fg-muted">
                HITL nodes pause agent execution and present extracted data for your review. Approve, modify, or
                reject before the agent continues.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
