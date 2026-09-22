'use client'

import { StatCard } from '../../components/StatCard'

import { Link } from '../../lib/router'
import { builderTiles, jumpCards, quickTools } from '../../lib/appData'
import { useWorkspace } from '../../lib/workspace'
import { useInstallations } from '../../lib/useInstallations'
import { useOverview } from '../../lib/useWorkspaceSummary'
import { api } from '../../lib/api'
import { useResource } from '../../lib/useResource'
import { CountUp } from '../../components/CountUp'

/** Cards below the context tabs on the Overview dashboard. */

function Stat(props: Omit<React.ComponentProps<typeof StatCard>, 'variant'>) {
  return <StatCard {...props} variant="dashboard" />
}

const ranges = ['This month', '30 days', 'Today', 'All time'] as const
export type AppMetric = { label: string; value: string; hint?: string }

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
  const { runs, artifacts } = useWorkspace()
  /*
   * Installed apps and credits come from the server, so this row cannot
   * disagree with the plan card above it or with the marketplace.
   */
  const { entitlement } = useInstallations()
  const { data: report } = useOverview()

  const since = (() => {
    const now = new Date()
    if (range === 'Today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (range === 'This month') return new Date(now.getFullYear(), now.getMonth(), 1)
    if (range === '30 days') return new Date(now.getTime() - 30 * 86_400_000)
    return new Date(0)
  })()

  const runsInRange = runs.filter((run) => new Date(run.startedAt) >= since)

  const installedCount = entitlement ? entitlement.used : 0
  const quotaHint =
    entitlement?.appQuota === null || entitlement === undefined
      ? 'no limit recorded'
      : `${entitlement.remaining ?? 0} slot(s) remaining`

  const credits = report?.credits
  const creditsAvailable = credits ? credits.available.toLocaleString() : '—'
  const creditsHint = credits ? `${credits.used.toLocaleString()} of ${credits.granted.toLocaleString()} used` : 'loading'
  /*
   * A percentage of nothing is not zero per cent. With no credits granted the
   * bar is empty and says so, rather than showing "100% remaining" of a pool
   * that does not exist.
   */
  const creditPct = credits && credits.granted > 0 ? Math.round((credits.used / credits.granted) * 100) : null

  const outcomes = [
    { label: 'Succeeded', value: runsInRange.filter((run) => run.status === 'success').length, tone: 'text-ok' },
    { label: 'Paused', value: runsInRange.filter((run) => run.status === 'needs-review').length, tone: 'text-warn' },
    { label: 'Running', value: 0, tone: 'text-accent' },
    { label: 'Failed', value: runsInRange.filter((run) => run.status === 'failed').length, tone: 'text-bad' },
    { label: 'Cancelled', value: 0, tone: 'text-fg-muted' },
  ]

  return (
    <div className="space-y-5">
      {/*
        * Agent execution does not exist yet — there is no provider connected
        * (decision D3) — so the counts that used to sit here ("Total agents",
        * "Pending reviews", "Queue") described a subsystem that runs nothing.
        * They are gone rather than showing numbers derived from a catalogue.
        * The real workspace figures are in <WorkspaceSummary> above.
        */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Apps installed" value={String(installedCount)} sub={quotaHint} />
        <Stat label="Runs" value={String(runsInRange.length)} sub={`${range.toLowerCase()}`} />
        <Stat label="AI credits available" value={creditsAvailable} sub={creditsHint} />
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
            {credits ? credits.used.toLocaleString() : '—'}{' '}
            <span className="text-[13px] font-normal text-fg-muted">
              / {credits ? credits.granted.toLocaleString() : '—'}
            </span>
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${creditPct ?? 0}%` }} />
          </div>
          <p className="mt-3 text-[12px] text-fg-muted">
            {creditPct === null ? 'No credits have been granted to this workspace yet.' : `${100 - creditPct}% remaining.`}
          </p>
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

/**
 * Per-app dashboards behind the CRM and HR tabs.
 *
 * Every figure comes from the server. The prototype printed a fixed set of
 * zeroes — "Win rate 0.0%", "Attrition 0.0%" — under a "last updated" line
 * showing the current time, which reads as a measured result. Neither could be
 * derived from anything the product stored. The server now returns only the
 * metrics it can actually compute, and this renders what it returns.
 */
export function AppMetricsPanel({ app }: { app: 'CRM' | 'HR' }) {
  const { data, loading, error, canRetry, refetch } = useResource<{ metrics: AppMetric[] }>(
    `app-metrics:${app}`,
    (signal) => api.get<{ metrics: AppMetric[] }>(`/reports/apps/${app}`, undefined, signal),
  )

  if (loading) return <p className="text-[13px] text-fg-muted">Loading {app} figures…</p>

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-bad/30 bg-bad-muted/30 p-5">
        <p className="text-[13px] text-fg-2">{error?.message ?? 'These figures could not be loaded.'}</p>
        {canRetry && (
          <button onClick={refetch} className="mt-3 text-[13px] font-medium text-accent hover:underline">
            Try again
          </button>
        )}
      </div>
    )
  }

  if (!data.metrics.length) {
    return <p className="text-[13px] text-fg-muted">There are no figures for {app} yet.</p>
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">{metric.label}</p>
            <p className="mt-2.5 text-3xl font-bold">
              <CountUp value={metric.value} />
            </p>
            {metric.hint && <p className="mt-1.5 text-[12px] text-fg-muted">{metric.hint}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
