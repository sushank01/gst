'use client'

import { useMemo, useState } from 'react'
import { Link } from '../../lib/router'
import { agentGroups, groupTones, totalEnterpriseAgents } from '../../lib/agentCatalog'
import type { CatalogAgent } from '../../lib/agentCatalog'
import { marketApps } from '../../lib/appData'
import { useWorkspace } from '../../lib/workspace'

const filters = [
  { id: 'all', icon: '', label: 'All' },
  { id: 'business', icon: '🧩', label: 'Business Solution Agents' },
  { id: 'agents', icon: '', label: 'Agents' },
  { id: 'enterprise', icon: '', label: 'Enterprise Agents' },
  { id: 'workflows', icon: '', label: 'Workflows' },
  { id: 'automations', icon: '', label: 'Automations' },
  { id: 'runs', icon: '⏱', label: 'Recent Runs' },
] as const

type FilterId = (typeof filters)[number]['id']

function AgentCard({
  agent,
  appName,
  installed,
  runCount,
  onRun,
}: {
  agent: CatalogAgent
  appName: string
  installed: boolean
  runCount: number
  onRun: () => void
}) {
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-warn-muted/60 text-[14px]">
          🤖
        </span>
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
            agent.custom ? 'bg-accent/15 text-accent' : 'bg-warn-muted text-warn'
          }`}
        >
          {agent.custom ? 'CUSTOM' : 'ENTERPRISE'}
        </span>
      </div>

      <h3 className="mt-4 text-[15px] font-semibold">{agent.name}</h3>
      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-fg-muted">{agent.blurb}</p>

      <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-md bg-warn-muted/60 px-2 py-1 text-[11px] text-warn">
        <span aria-hidden>⛓</span>
        {appName}
      </span>

      <div className="mt-4 border-t border-line pt-3">
        {installed ? (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[12px] text-fg-muted">
              <span aria-hidden>◷</span>
              {runCount ? `${runCount} run${runCount === 1 ? '' : 's'}` : 'No runs yet'}
            </span>
            <button
              onClick={onRun}
              className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-fg-2 transition hover:bg-surface-2"
            >
              Run
            </button>
          </div>
        ) : (
          <p className="text-[12px] text-fg-muted italic">Ships with {appName} — install the app to run it</p>
        )}
      </div>
    </li>
  )
}

/** The Recent Runs filter reads real run history rather than a fixed empty state. */
function RecentRuns() {
  const { runs } = useWorkspace()

  if (!runs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-20 text-center">
        <span aria-hidden className="text-2xl text-fg-muted">
          ◷
        </span>
        <p className="mt-4 text-lg font-semibold">No recent runs yet</p>
        <p className="mx-auto mt-2 max-w-sm text-[14px] text-fg-muted">
          Run an agent from a card above and its trace lands here.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] font-semibold tracking-[0.1em] text-fg-muted uppercase">
          Recent runs ({runs.length})
        </p>
        <Link to="/app/runs" className="text-[13px] font-medium text-accent hover:underline">
          Full traces →
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {runs.map((run) => (
          <li key={run.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-[14rem] flex-1">
              <p className="text-[14px] font-medium">{run.agent}</p>
              <p className="mt-0.5 text-[12px] text-fg-muted">
                {run.source} · {new Date(run.startedAt).toLocaleTimeString()} · {run.id}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[12px]">
              <span className="rounded-lg bg-ok-muted px-2 py-0.5 font-medium text-ok">{run.status}</span>
              <span className="text-fg-muted">{run.credits} credits</span>
              <span className="text-fg-muted">{(run.ms / 1000).toFixed(1)}s</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function EmptyFilter({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-20 text-center">
      <span aria-hidden className="text-2xl text-fg-muted">
        📦
      </span>
      <p className="mt-4 text-lg font-semibold">No {label.toLowerCase()} yet</p>
      <p className="mx-auto mt-2 max-w-sm text-[14px] text-fg-muted">
        Build one in Agent Studio, or install an app that ships with them.
      </p>
      <Link to="/studio" className="mt-5 inline-block text-[13px] font-medium text-accent hover:underline">
        Open Agent Studio →
      </Link>
    </div>
  )
}

export default function AgentPortal() {
  const { installed, runs, recordRun } = useWorkspace()
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')

  const appByCode = new Map(marketApps.map((app) => [app.code, app]))
  const runsByAgent = useMemo(() => {
    const counts = new Map<string, number>()
    runs.forEach((run) => counts.set(run.agent, (counts.get(run.agent) ?? 0) + 1))
    return counts
  }, [runs])

  const needle = query.trim().toLowerCase()
  const groups = useMemo(
    () =>
      agentGroups
        .map((group) => ({
          ...group,
          agents: group.agents.filter((agent) =>
            needle ? `${agent.name} ${agent.blurb} ${group.name}`.toLowerCase().includes(needle) : true,
          ),
        }))
        .filter((group) => group.agents.length > 0),
    [needle],
  )

  const showEnterprise = filter === 'all' || filter === 'enterprise'

  return (
    <div className="mx-auto max-w-6xl pt-2">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <span aria-hidden className="text-accent">
              🚀
            </span>
            Agent Portal
          </h1>
          <p className="mt-2 text-[15px] text-fg-muted">
            Run business cases, agents, and workflows without developer help
          </p>
        </div>

        <span className="rounded-full bg-warn-muted px-3.5 py-1.5 text-[13px] font-medium text-warn">
          {totalEnterpriseAgents} Enterprise agents
        </span>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[18rem] flex-1">
          <span aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted">
            ⌕
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search business cases, agents, workflows, automations..."
            aria-label="Search the agent portal"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 text-[14px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </div>

        <nav aria-label="Filter" className="flex flex-wrap gap-1">
          {filters.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium transition ${
                filter === item.id ? 'bg-accent text-white' : 'text-fg-2 hover:bg-surface-2'
              }`}
            >
              {item.icon && <span aria-hidden>{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-8 pb-6">
        {showEnterprise ? (
          groups.length ? (
            <>
              <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-[0.1em] text-fg-muted uppercase">
                <span aria-hidden>⛓</span>
                Enterprise agents ({totalEnterpriseAgents})
                <span className="text-[11px] font-normal tracking-normal normal-case italic">
                  · bundled with enterprise apps
                </span>
              </p>

              <div className="mt-6 space-y-10">
                {groups.map((group) => {
                  const app = appByCode.get(group.code)
                  const isInstalled = app ? installed.includes(app.code) : false

                  return (
                    <section key={group.code}>
                      <div className="mb-4 flex items-center gap-3">
                        <span
                          aria-hidden
                          className={`grid h-7 w-7 place-items-center rounded-full text-[12px] font-semibold text-white ${
                            groupTones[group.code] ?? 'bg-accent'
                          }`}
                        >
                          {group.name.charAt(0)}
                        </span>
                        <h2 className="text-[15px] font-semibold">{group.name}</h2>
                        <span className="text-[13px] text-fg-muted">
                          {group.agents.length} agent{group.agents.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {group.agents.map((agent) => (
                          <AgentCard
                            key={agent.name}
                            agent={agent}
                            appName={group.name}
                            installed={isInstalled}
                            runCount={runsByAgent.get(agent.name) ?? 0}
                            onRun={() => recordRun({ agent: agent.name, source: group.name })}
                          />
                        ))}
                      </ul>
                    </section>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="py-20 text-center text-[14px] text-fg-muted">Nothing matches “{query}”.</p>
          )
        ) : filter === 'runs' ? (
          <RecentRuns />
        ) : (
          <EmptyFilter label={filters.find((item) => item.id === filter)?.label ?? 'items'} />
        )}
      </div>
    </div>
  )
}
