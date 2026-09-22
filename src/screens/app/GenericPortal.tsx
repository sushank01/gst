'use client'

import { Link, useParams } from '../../lib/router'
import { marketApps } from '../../lib/appData'
import { agentsByAppCode } from '../../lib/agentCatalog'
import { useWorkspace } from '../../lib/workspace'
import { EmptyPanel, PanelHeader } from './PortalPanel'
import { NotBuilt } from '../../components/NotBuilt'

/**
 * Landing surface for an installed app that has no bespoke portal yet.
 * Keeps every sidebar entry live instead of dead-ending on an unbuilt route.
 */
export default function GenericPortal() {
  const { slug = '' } = useParams()
  const { installed, recordRun } = useWorkspace()

  const app = marketApps.find((item) => item.code.toLowerCase() === slug.toLowerCase())

  if (!app || !installed.includes(app.code)) {
    return (
      <div className="mx-auto max-w-4xl pt-2">
        <PanelHeader title="App not installed" blurb="This app is not part of your tenant yet." />
        <EmptyPanel
          icon="📦"
          title="Nothing to show"
          blurb="Install it from the marketplace and its records and agents will appear here."
        />
        <Link to="/app/marketplace" className="mt-5 inline-block text-[13px] font-medium text-accent hover:underline">
          Browse marketplace →
        </Link>
      </div>
    )
  }

  const agents = agentsByAppCode.get(app.code) ?? []

  return (
    <div className="mx-auto max-w-5xl pt-2">
      <div className="mb-6 flex items-center gap-3">
        <span aria-hidden className={`grid h-11 w-11 place-items-center rounded-xl text-lg text-white ${app.tone}`}>
          {app.icon}
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{app.name}</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            {app.kind} · {app.category} · {agents.length} bundled agents
          </p>
        </div>
      </div>

      <p className="max-w-2xl text-[14px] leading-relaxed text-fg-2">{app.blurb}</p>

      {/*
        * The four tiles that stood here read Records 0, Runs this month 0 and
        * Pending reviews 0 — literals, animated by CountUp so an absent
        * measurement arrived looking like a measured one. This application has
        * no implementation behind it, so there is nothing to count, and saying
        * that is more useful than counting to zero.
        */}
      <div className="mt-6">
        <NotBuilt
          title={`${app.name} is in the catalogue, not on this deployment`}
          because={
            <>
              Nothing is stored for this application yet, so there are no records to show and no figures to report.
              It appears here because the marketplace lists it.
            </>
          }
          needs={<>Which applications are released is decision D2.</>}
        />
      </div>

      {agents.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">Bundled agents</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {agents.map((agent) => (
              <li key={agent.name} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{agent.name}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">{agent.blurb}</p>
                  </div>
                  <button
                    onClick={() => recordRun({ agent: agent.name, source: app.name })}
                    className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-fg-2 transition hover:bg-surface-2"
                  >
                    Run
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <EmptyPanel
        icon={app.icon}
        title="No records yet"
        blurb="Create a record, or install sample data from the marketplace, and the bound agents fire on it."
      />
    </div>
  )
}
