'use client'

import { useState } from 'react'
import { useNavigate } from '../../lib/router'
import { Button } from '../../components/ui'
import { PageHeader } from '../../components/PageHeader'

const canvasNodes = [
  { id: 'trigger', label: 'Trigger', kind: 'Record created', tone: 'bg-fg text-bg' },
  { id: 'rag', label: 'Knowledge', kind: 'RAG · playbooks', tone: 'bg-surface' },
  { id: 'llm', label: 'Reason', kind: 'LLM node', tone: 'bg-surface' },
  { id: 'guard', label: 'Guardrail', kind: 'Max 12 tool calls', tone: 'bg-surface' },
  { id: 'hitl', label: 'Approval', kind: 'HITL if > ₹50,000', tone: 'bg-surface' },
  { id: 'out', label: 'Output', kind: 'Write to app', tone: 'bg-surface' },
]

const tabs = ['Canvas', 'Tests', 'Runs'] as const

export default function AgentStudio() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<(typeof tabs)[number]>('Canvas')
  const [selected, setSelected] = useState(canvasNodes[2].id)

  const node = canvasNodes.find((item) => item.id === selected)!

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Agent Studio"
        title="Hand-tune every step. See it run."
        blurb="The visual canvas for authoring, testing, and shipping agents. Every node, tool call, and guardrail is inspectable."
        action={
          <Button disabled title="No model is connected on this deployment">
            Run test
          </Button>
        }
      />

      <div className="mb-4 flex gap-1 rounded-xl border border-line bg-surface p-1">
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            aria-pressed={tab === item}
            className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
              tab === item ? 'bg-fg text-white' : 'text-fg-muted hover:bg-surface-2'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'Canvas' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-2xl border border-line bg-[radial-gradient(circle,rgba(148,163,184,0.25)_1px,transparent_1px)] bg-surface [background-size:16px_16px] p-6">
            <ol className="space-y-2.5">
              {canvasNodes.map((item, index) => (
                <li key={item.id}>
                  <button
                    onClick={() => setSelected(item.id)}
                    aria-pressed={selected === item.id}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${item.tone} ${
                      selected === item.id ? 'border-accent ring-2 ring-accent/20' : 'border-line'
                    }`}
                  >
                    <p className="text-[13px] font-semibold">{item.label}</p>
                    <p className={`text-xs ${item.tone.includes('text-bg') ? 'text-white/60' : 'text-fg-muted'}`}>
                      {item.kind}
                    </p>
                  </button>
                  {index < canvasNodes.length - 1 && (
                    <div aria-hidden className="mx-auto h-4 w-px bg-line" />
                  )}
                </li>
              ))}
            </ol>
          </div>

          <aside className="h-fit rounded-2xl border border-line bg-surface p-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-fg-muted uppercase">Inspector</p>
            <h2 className="mt-2 text-sm font-semibold">{node.label}</h2>
            <p className="mt-1 text-xs text-fg-muted">{node.kind}</p>

            {/*
              * This read "Model: Auto-routed · best for task", "Guardrails:
              * Content filter · approval cap" and "On failure: Pause for human
              * review" — three settings nobody had set, on a node that is part
              * of a fixed six-node illustration. An inspector that reports
              * configuration nobody chose is worse than an empty one.
              */}
            <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
              Nothing is configured on this node. The canvas above is an illustration of the shape an agent takes,
              not a graph this workspace holds.
            </p>
          </aside>
        </div>
      )}

      {tab === 'Tests' && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Golden tests</h2>
          {/*
            * Four tests used to be listed here with results — three green, one
            * red — none of which had ever been run against anything. A red
            * result is as much a fabrication as a green one, and arguably a
            * more convincing one, because it looks like evidence of rigour.
            */}
          <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
            No test has been run. Golden tests would need an agent that executes, which needs a model and somewhere
            to run it — decisions D3 and D1.
          </p>
        </div>
      )}

      {tab === 'Runs' && (
        <div className="rounded-2xl border border-line bg-surface p-5 text-[13px] leading-relaxed text-fg-muted">
          There is no run history: no agent has executed on this deployment. Scheduled work that does run is under{' '}
          <button onClick={() => navigate('/app/scheduled-jobs')} className="font-semibold text-accent hover:underline">
            Scheduled Jobs
          </button>
          .
        </div>
      )}
    </div>
  )
}
