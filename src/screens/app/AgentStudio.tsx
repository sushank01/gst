'use client'

import { useState } from 'react'
import { useNavigate } from '../../lib/router'
import { Button } from '../../components/ui'
import { PageHeader } from '../../components/PageHeader'
import { marketApps } from '../../lib/appData'
import { useWorkspace } from '../../lib/workspace'

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
  const { installed, recordRun } = useWorkspace()
  const [tab, setTab] = useState<(typeof tabs)[number]>('Canvas')
  const [selected, setSelected] = useState(canvasNodes[2].id)
  const [running, setRunning] = useState(false)

  const agents = marketApps
    .filter((app) => installed.includes(app.code))
    .flatMap((app) => app.agents.map((agent) => ({ agent, app: app.name })))
  const primary = agents[0]

  async function testRun() {
    setRunning(true)
    await new Promise((resolve) => setTimeout(resolve, 900))
    recordRun({ agent: primary?.agent ?? 'Untitled agent', source: 'Agent Studio test' })
    setRunning(false)
    navigate('/app/runs')
  }

  const node = canvasNodes.find((item) => item.id === selected)!

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Agent Studio"
        title="Hand-tune every step. See it run."
        blurb="The visual canvas for authoring, testing, and shipping agents. Every node, tool call, and guardrail is inspectable."
        action={
          <Button onClick={testRun} loading={running}>
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

            <dl className="mt-4 space-y-3 text-[13px]">
              <div>
                <dt className="text-xs text-fg-muted">Model</dt>
                <dd>Auto-routed · best for task</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Guardrails</dt>
                <dd>Content filter · approval cap</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">On failure</dt>
                <dd>Pause for human review</dd>
              </div>
            </dl>

            <p className="mt-5 text-[11px] leading-relaxed text-fg-muted">
              Deploy publishes an immutable snapshot. In-flight runs finish on the previous version; new runs pick up
              the new one.
            </p>
          </aside>
        </div>
      )}

      {tab === 'Tests' && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Golden tests</h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            Catch regressions before they ship. Tests run as part of the build gate.
          </p>
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
            {[
              { name: 'Scores a high-fit inbound lead above 0.8', status: 'pass' },
              { name: 'Routes enterprise leads to the named rep', status: 'pass' },
              { name: 'Pauses when the deal value exceeds the cap', status: 'pass' },
              { name: 'Rejects a lead with no contactable email', status: 'fail' },
            ].map((test) => (
              <li key={test.name} className="flex items-center justify-between px-4 py-3 text-[13px]">
                <span>{test.name}</span>
                <span className={test.status === 'pass' ? 'text-accent' : 'text-red-600'}>
                  {test.status === 'pass' ? '✓ pass' : '✕ fail'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'Runs' && (
        <div className="rounded-2xl border border-line bg-surface p-5 text-[13px] text-fg-muted">
          Run history lives in the{' '}
          <button onClick={() => navigate('/app/runs')} className="font-semibold text-accent hover:underline">
            Runs
          </button>{' '}
          surface, where every execution can be replayed step by step.
        </div>
      )}
    </div>
  )
}
