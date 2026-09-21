'use client'

import { useState } from 'react'
import { PageHeader, EmptyState } from '../../components/PageHeader'
import { useWorkspace } from '../../lib/workspace'

const kindStyles: Record<string, string> = {
  llm: 'bg-indigo-50 text-indigo-700',
  tool: 'bg-sky-50 text-sky-700',
  guardrail: 'bg-amber-50 text-amber-700',
  hitl: 'bg-violet-50 text-violet-700',
  output: 'bg-accent/15 text-accent',
}

export default function Runs() {
  const { runs } = useWorkspace()
  const [openId, setOpenId] = useState<string | null>(runs[0]?.id ?? null)

  if (!runs.length) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="Runs"
          title="Nothing runs silently."
          blurb="Every execution records which nodes fired, which tools were called, which guardrails checked in, and what it cost."
        />
        <EmptyState
          icon="◷"
          title="No runs yet"
          blurb="Run a test from Agent Studio and the full trace shows up here."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Runs"
        title="Nothing runs silently."
        blurb="Walk any trace: which nodes fired, which tools were called, what the model returned, which guardrails checked in, and how many credits it cost."
      />

      <ul className="space-y-2">
        {runs.map((run) => {
          const open = openId === run.id
          return (
            <li key={run.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <button
                onClick={() => setOpenId(open ? null : run.id)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{run.agent}</p>
                  <p className="text-xs text-fg-muted">
                    {run.source} · {new Date(run.startedAt).toLocaleTimeString()} · {run.id}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className="rounded-lg bg-accent/15 px-2 py-0.5 font-medium text-accent">
                    {run.status}
                  </span>
                  <span className="text-fg-muted">{run.credits} credits</span>
                  <span className="text-fg-muted">{(run.ms / 1000).toFixed(1)}s</span>
                  <span aria-hidden className="text-fg-muted">
                    {open ? '▲' : '▼'}
                  </span>
                </div>
              </button>

              {open && (
                <ol className="divide-y divide-line border-t border-line">
                  {run.trace.map((step, index) => (
                    <li key={`${run.id}-${index}`} className="flex items-start gap-3 px-4 py-3">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${kindStyles[step.kind]}`}>
                        {step.kind}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium">{step.node}</p>
                        <p className="text-xs text-fg-muted">{step.detail}</p>
                      </div>
                      <span className="shrink-0 text-xs text-fg-muted">
                        {step.ms}ms · {step.credits}c
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          )
        })}
      </ul>

      <p className="mt-5 text-xs text-fg-muted">
        Traces are auditable the same way your systems of record are — who, what, when, before, after.
      </p>
    </div>
  )
}
