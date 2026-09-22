'use client'

import { StatCard } from '../../components/StatCard'

import { Link } from '../../lib/router'
import { builderTiles, jumpCards, marketApps, pendingApprovals, quickTools } from '../../lib/appData'
import { useWorkspace } from '../../lib/workspace'
import { CountUp } from '../../components/CountUp'

/** Cards below the context tabs on the Overview dashboard. */

function Stat(props: Omit<React.ComponentProps<typeof StatCard>, 'variant'>) {
  return <StatCard {...props} variant="dashboard" />
}

function MeterCard({
  title,
  blurb,
  icon,
  value,
  unit,
  pct,
  linkLabel,
  to,
}: {
  title: string
  blurb: string
  icon: string
  value: string
  unit: string
  pct: number
  linkLabel: string
  to: string
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <p className="mt-0.5 text-[12px] text-fg-muted">{blurb}</p>
        </div>
        <span aria-hidden className="text-accent">
          {icon}
        </span>
      </div>

      <p className="mt-5 text-3xl font-bold">
        {value} <span className="text-[13px] font-normal text-fg-muted">{unit}</span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>

      <Link to={to} className="mt-4 inline-block text-[13px] font-medium text-accent hover:underline">
        {linkLabel} →
      </Link>
    </div>
  )
}

const ranges = ['This month', '30 days', 'Today', 'All time'] as const
export type RunsRange = (typeof ranges)[number]

export function RunsRangeFilter({ value, onChange }: { value: RunsRange; onChange: (next: RunsRange) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-[13px] text-fg-muted">Runs range</span>
      <div className="flex gap-1.5">
        {ranges.map((range) => (
          <button
            key={range}
            onClick={() => onChange(range)}
            aria-pressed={value === range}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition ${
              value === range
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-line text-fg-2 hover:bg-surface-2'
            }`}
          >
            {range}
          </button>
        ))}
      </div>
      <input type="date" aria-label="Range start" className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg-2" />
      <span aria-hidden className="text-fg-muted">
        →
      </span>
      <input type="date" aria-label="Range end" className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg-2" />
    </div>
  )
}

export function OverviewPanel({ range }: { range: RunsRange }) {
  const { installed, appQuota, creditsUsed, creditsTotal, runs, artifacts, approvals } = useWorkspace()

  // Only undecided reviews are still "pending" — Approvals is the source of truth.
  const pendingReviews = pendingApprovals.filter((item) => !approvals[item.id]).length

  const since = (() => {
    const now = new Date()
    if (range === 'Today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (range === 'This month') return new Date(now.getFullYear(), now.getMonth(), 1)
    if (range === '30 days') return new Date(now.getTime() - 30 * 86_400_000)
    return new Date(0)
  })()

  const runsInRange = runs.filter((run) => new Date(run.startedAt) >= since)
  const agents = marketApps.filter((app) => installed.includes(app.code)).flatMap((app) => app.agents)
  const creditPct = Math.round((creditsUsed / creditsTotal) * 100)

  const outcomes = [
    { label: 'Succeeded', value: runsInRange.filter((run) => run.status === 'success').length, tone: 'text-ok' },
    { label: 'Paused', value: runsInRange.filter((run) => run.status === 'needs-review').length, tone: 'text-warn' },
    { label: 'Running', value: 0, tone: 'text-accent' },
    { label: 'Failed', value: runsInRange.filter((run) => run.status === 'failed').length, tone: 'text-bad' },
    { label: 'Cancelled', value: 0, tone: 'text-fg-muted' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Stat label="Apps installed" value={String(installed.length)} sub={`${appQuota - installed.length} slots remaining`} />
        <Stat label="Total agents" value={String(agents.length)} sub={`${agents.length} active`} />
        <Stat
          label="Runs"
          value={String(runsInRange.length)}
          sub={`${range.toLowerCase()} · 0 active now`}
        />
        <Stat label="Pending reviews" value={String(pendingReviews)} sub="HITL approvals needed" />
        <Stat label="Queue" value="0" sub="0 queued · 0 processing" />
        <Stat
          label="AI Credits usage"
          value={`${creditPct}%`}
          sub={`${creditsUsed.toLocaleString()} / ${creditsTotal.toLocaleString()}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <MeterCard
          title="Plan & Billing"
          blurb="Upgrade for more capacity"
          icon="💳"
          value={String(installed.length)}
          unit={`/ ${appQuota} app slots`}
          pct={(installed.length / appQuota) * 100}
          linkLabel="View plan details"
          to="/app/account"
        />
        <MeterCard
          title="Members"
          blurb="Active users in your org"
          icon="👥"
          value="1"
          unit="/ 1 seats"
          pct={100}
          linkLabel="Invite members"
          to="/app/account"
        />
        <MeterCard
          title="Org AI Credits Pool"
          blurb="AI Credits for chat, agent runs, codegen"
          icon="⚡"
          value={creditsTotal.toLocaleString()}
          unit="AI Credits"
          pct={creditPct}
          linkLabel="Allocate Credits"
          to="/app/account"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-line bg-surface p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Recent Executions</h3>
            <Link to="/app/runs" className="text-[13px] font-medium text-accent hover:underline">
              View all →
            </Link>
          </div>

          {runsInRange.length ? (
            <ul className="mt-4 divide-y divide-line">
              {runsInRange.slice(0, 5).map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-4 py-3 text-[13px]">
                  <span className="min-w-0 truncate font-medium">{run.agent}</span>
                  <span className="shrink-0 text-fg-muted">
                    {run.credits}c · {(run.ms / 1000).toFixed(1)}s · {run.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-16 text-center text-[13px] text-fg-muted">
              No runs yet — fire a use case from the Apps section.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="text-[15px] font-semibold">Quick Actions</h3>
          <ul className="mt-4 space-y-3">
            {[
              { icon: '✦', label: 'Open Vibe Studio', to: '/app/build/vibe-studio' },
              { icon: '🛍', label: 'Browse marketplace', to: '/app/marketplace' },
              { icon: '📈', label: 'Check observability', to: '/app/runs' },
              { icon: '👤', label: 'Invite a teammate', to: '/app/account' },
            ].map((action) => (
              <li key={action.label}>
                <Link
                  to={action.to}
                  className="flex items-center gap-2.5 text-[14px] font-medium text-accent hover:underline"
                >
                  <span aria-hidden>{action.icon}</span>
                  {action.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="text-[15px] font-semibold">Your builders</h3>
          <p className="mt-0.5 text-[12px] text-fg-muted">Where you create on Apragya</p>
          <ul className="mt-4 grid gap-3 min-[420px]:grid-cols-2">
            {builderTiles.map((tile) => (
              <li key={tile.name}>
                <Link
                  to={tile.to}
                  className="block h-full rounded-xl border border-line p-4 transition hover:border-accent/60"
                >
                  <span aria-hidden className="text-accent">
                    {tile.icon}
                  </span>
                  <p className="mt-2.5 text-[13px] font-semibold">{tile.name}</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">{tile.blurb}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold">Workspace activity</h3>
              <p className="mt-0.5 text-[12px] text-fg-muted">Latest across agents, pipelines, and reviews</p>
            </div>
            <Link to="/app/runs" className="shrink-0 text-[13px] font-medium text-accent hover:underline">
              View all →
            </Link>
          </div>

          {runsInRange.length || artifacts.length ? (
            <ul className="mt-4 space-y-3 text-[13px]">
              {artifacts.slice(0, 2).map((artifact) => (
                <li key={artifact.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">Built {artifact.name}</span>
                  <span className="shrink-0 text-fg-muted">v{artifact.version}</span>
                </li>
              ))}
              {runsInRange.slice(0, 3).map((run) => (
                <li key={run.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">Ran {run.agent}</span>
                  <span className="shrink-0 text-fg-muted">{run.credits}c</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-14 text-center text-[13px] leading-relaxed text-fg-muted">
              No activity yet.
              <br />
              Run an agent or build a canvas to see it here.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold">AI Credits this month</h3>
              <p className="mt-0.5 text-[12px] text-fg-muted">Plan-pool usage</p>
            </div>
            <Link to="/app/account" className="shrink-0 text-[13px] font-medium text-accent hover:underline">
              Details →
            </Link>
          </div>

          <p className="mt-6 text-3xl font-bold">
            {creditsUsed.toLocaleString()}{' '}
            <span className="text-[13px] font-normal text-fg-muted">/ {creditsTotal.toLocaleString()}</span>
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${creditPct}%` }} />
          </div>
          <p className="mt-3 text-[12px] text-fg-muted">{100 - creditPct}% remaining.</p>
        </section>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold">AI Tools — Quick access</h3>
            <p className="mt-0.5 text-[12px] text-fg-muted">Productivity tools to jump straight into</p>
          </div>
          <Link to="/app/business" className="shrink-0 text-[13px] font-medium text-accent hover:underline">
            All tools →
          </Link>
        </div>

        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {quickTools.map((tool) => (
            <li key={tool.name}>
              <Link
                to={tool.to}
                className="grid place-items-center gap-2 rounded-xl border border-line py-5 transition hover:border-accent/60"
              >
                <span aria-hidden className="text-lg text-accent">
                  {tool.icon}
                </span>
                <span className="text-[13px] font-medium">{tool.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {jumpCards.map((card) => (
          <li key={card.name}>
            <Link
              to={card.to}
              className="flex h-full items-center gap-3 rounded-2xl border border-line bg-surface p-5 transition hover:border-accent/60"
            >
              <span aria-hidden className="text-lg text-accent">
                {card.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{card.name}</span>
                <span className="block text-[12px] text-fg-muted">{card.blurb}</span>
              </span>
              <span aria-hidden className="text-fg-muted">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-[15px] font-semibold">Execution Status Breakdown</h3>
        <p className="mt-0.5 text-[12px] text-fg-muted">Recent agent runs aggregated by outcome</p>

        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {outcomes.map((outcome) => (
            <li key={outcome.label} className="text-center">
              <p className={`text-3xl font-bold ${outcome.tone}`}>
                <CountUp value={outcome.value} />
              </p>
              <p className="mt-1 text-[12px] text-fg-muted">{outcome.label}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** Per-app dashboards behind the CRM and HR tabs. */
export function AppMetricsPanel({ app }: { app: 'CRM' | 'HR' }) {
  const metrics =
    app === 'CRM'
      ? [
          { label: 'Deals won', value: 'US$0' },
          { label: 'New leads', value: '0' },
          { label: 'Open pipeline', value: 'US$0' },
          { label: 'Win rate', value: '0.0%' },
        ]
      : [
          { label: 'Active headcount', value: '0' },
          { label: 'Joiners', value: '0' },
          { label: 'Leavers', value: '0' },
          { label: 'Attrition', value: '0.0%' },
        ]

  return (
    <div>
      <p className="mb-5 text-[13px] text-fg-muted">
        Amounts in USD. Last updated {new Date().toLocaleString('en-GB')}.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">{metric.label}</p>
            <p className="mt-2.5 text-3xl font-bold">
              <CountUp value={metric.value} />
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
