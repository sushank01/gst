'use client'

import { useMemo, useState } from 'react'
import { Link } from '../../lib/router'
import { agentGroups, groupTones, totalEnterpriseAgents } from '../../lib/agentCatalog'
import type { CatalogAgent } from '../../lib/agentCatalog'
import { marketApps } from '../../lib/appData'
import { useWorkspace } from '../../lib/workspace'
import { NoModelConnected } from '../../components/NotBuilt'

/*
 * Four of the seven filters that stood here — Business Solution Agents,
 * Agents, Workflows, Automations — always rendered the same empty panel:
 * nothing could ever match them. A tab that can never have content is a
 * promise the product does not keep. "Recent Runs" went with them, because
 * every run it listed carried the same six-step sample trace.
 */
const filters = [
  { id: 'all', icon: '', label: 'All' },
  { id: 'enterprise', icon: '', label: 'Enterprise Agents' },
] as const

type FilterId = (typeof filters)[number]['id']

function AgentCard({
  agent,
  appName,
  installed,
}: {
  agent: CatalogAgent
  appName: string
  installed: boolean
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
              Not runnable yet
            </span>
            <button
              disabled
              title="No model is connected on this deployment"
              className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-fg-muted opacity-50"
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
  const { installed } = useWorkspace()
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')

  const appByCode = new Map(marketApps.map((app) => [app.code, app]))
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

        {/* A catalogue count, labelled as one. It used to read "N Enterprise
            agents" as though the workspace had them; these are designs, and
            none of them can run on this deployment. */}
        <span className="rounded-full bg-surface-2 px-3.5 py-1.5 text-[13px] font-medium text-fg-2">
          {totalEnterpriseAgents} in the catalogue
        </span>
      </header>

      <div className="mt-6">
        <NoModelConnected what="Running an agent" />
      </div>

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
        ) : (
          <EmptyFilter label={filters.find((item) => item.id === filter)?.label ?? 'items'} />
        )}
      </div>
    </div>
  )
}
