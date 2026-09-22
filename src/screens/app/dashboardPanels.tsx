'use client'

import { StatCard } from '../../components/StatCard'

import { Link } from '../../lib/router'
import { builderTiles, jumpCards, quickTools } from '../../lib/appData'
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

/*
 * The range filter above this panel now only governs the credit figures,
 * which are a running total rather than a window — so the panel no longer
 * takes it. Keeping the prop would imply the numbers change when it does.
 */
export function OverviewPanel() {
  /*
   * Installed apps and credits come from the server, so this row cannot
   * disagree with the plan card above it or with the marketplace.
   */
  const { entitlement } = useInstallations()
  const { data: report } = useOverview()



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
        {/* A "Runs" count over agent executions that never happen is a zero
            reported as a measurement. Scheduled jobs are the work that does
            run, and they have their own screen. */}
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

          <p className="py-16 text-center text-[13px] leading-relaxed text-fg-muted">
            No agent has executed on this deployment — no model is connected. Scheduled work that does run is under{' '}
            <Link to="/app/scheduled-jobs" className="font-medium text-accent hover:underline">
              Scheduled Jobs
            </Link>
            .
          </p>
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

        {/* "Workspace activity — latest across agents, pipelines, and
            reviews" listed built artifacts and agent runs. Neither exists:
            the artifacts were localStorage objects and the runs never ran. */}

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

      {/* "Execution Status Breakdown — recent agent runs aggregated by
          outcome" showed five counts, of which two were hard-coded zeroes and
          three counted runs that never happened. */}
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
