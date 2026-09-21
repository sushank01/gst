'use client'

import { useState } from 'react'
import { Link, useNavigate } from '../../lib/router'
import { useAuth } from '../../lib/auth'
import { useWorkspace } from '../../lib/workspace'
import { marketApps } from '../../lib/appData'
import { AppMetricsPanel, OverviewPanel, RunsRangeFilter } from './dashboardPanels'
import type { RunsRange } from './dashboardPanels'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function TwoFactorBanner() {
  const { twoFactor, setTwoFactor } = useWorkspace()
  if (twoFactor !== 'pending') return null

  return (
    <section className="flex flex-wrap items-start gap-4 rounded-2xl border border-warn/30 bg-warn-muted/40 p-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warn/15 text-warn">🛡</span>
      <div className="min-w-[16rem] flex-1">
        <h2 className="text-[15px] font-semibold text-warn">Add a second factor to your account</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-fg-2">
          Admin accounts are the biggest target for takeover attempts. Enabling two-factor auth takes about 60 seconds
          and blocks every stolen-password attack we see.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setTwoFactor('on')}
          className="rounded-xl bg-warn px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
        >
          Turn on now
        </button>
        <button
          onClick={() => setTwoFactor('snoozed')}
          className="rounded-xl border border-line bg-surface px-4 py-2 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
        >
          ✕ Remind me later
        </button>
      </div>
    </section>
  )
}

function TrialCard() {
  const { trialDaysLeft, creditsUsed, creditsTotal, installed, appQuota } = useWorkspace()
  const pct = Math.min(100, Math.round((creditsUsed / creditsTotal) * 100))

  return (
    <section className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-accent">
          ✦
        </span>
        <div>
          <p className="text-[15px] font-semibold">Trial</p>
          <p className="flex items-center gap-1.5 text-[12px] text-fg-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn" />
            Trial
          </p>
        </div>
      </div>

      <p className="flex items-center gap-2 text-[13px] text-fg-2">
        <span aria-hidden>📅</span>
        {trialDaysLeft} days left in trial
      </p>

      <div className="min-w-[14rem]">
        <div className="flex items-baseline justify-between gap-6 text-[13px]">
          <span className="flex items-center gap-2 text-fg-2">
            <span aria-hidden>🪙</span>
            AI Credits
          </span>
          <span className="font-medium">
            {creditsUsed.toLocaleString()} / {creditsTotal.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-400" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <p className="text-[13px] text-fg-2">
        Apps <span className="font-semibold">{installed.length} / {appQuota}</span>{' '}
        <span className="text-fg-muted">+ 2 included</span>
      </p>

      <Link to="/app/account" className="ml-auto text-[13px] font-medium text-accent hover:underline">
        Manage plan →
      </Link>
    </section>
  )
}

function Checklist() {
  const navigate = useNavigate()
  const { checklist, checklistDone, dismissedChecklist, setFlag } = useWorkspace()
  if (dismissedChecklist) return null

  const pct = Math.round((checklistDone / checklist.length) * 100)

  return (
    <section className="relative rounded-2xl border border-line bg-gradient-to-br from-accent/5 via-surface to-fuchsia-500/5 p-6">
      <button
        onClick={() => setFlag('dismissedChecklist')}
        aria-label="Dismiss the getting-started checklist"
        className="absolute top-5 right-5 text-fg-muted transition hover:text-fg"
      >
        ✕
      </button>

      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">✦</span>
        <h2 className="text-[15px] font-semibold">Get the most out of Apragya</h2>
      </div>
      <p className="mt-2 text-[13px] text-fg-muted">
        A few quick wins to get your team running. Tasks tick off automatically as you go.
      </p>

      <div className="mt-5 flex items-center justify-between text-[12px] text-fg-muted">
        <span>
          {checklistDone} of {checklist.length} complete
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-fuchsia-500" style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-5 space-y-2.5">
        {checklist.map((task) => (
          <li key={task.id}>
            <button
              onClick={() => {
                if (task.action === 'allocate') setFlag('creditsAllocated')
                else if (task.action === 'invite') setFlag('invitedTeammate')
                else if (task.to) navigate(task.to)
              }}
              className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition ${
                task.done
                  ? 'border-ok/30 bg-ok-muted/40'
                  : 'border-line bg-surface hover:border-accent/50'
              }`}
            >
              <span
                aria-hidden
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] ${
                  task.done ? 'bg-ok text-white' : 'border-2 border-bad/40 text-bad'
                }`}
              >
                {task.done ? '✓' : '◉'}
              </span>
              <span aria-hidden className="text-sm">
                {task.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[14px] font-medium ${task.done ? 'text-ok line-through' : ''}`}>
                  {task.name}
                </span>
                <span className="block text-[12px] text-fg-muted">{task.blurb}</span>
              </span>
              <span aria-hidden className="text-fg-muted">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

const periods = ['Today', 'MTD', 'QTD', 'YTD'] as const

/**
 * The context tabs sit inside the dashboard and swap the panel beneath them:
 * Overview shows workspace-wide metrics, each app tab shows that app's own.
 */
function DashboardTabs() {
  const { installed } = useWorkspace()
  const navigate = useNavigate()
  const apps = marketApps.filter((app) => installed.includes(app.code) && (app.code === 'CRM' || app.code === 'HR'))

  const [tab, setTab] = useState<'overview' | 'CRM' | 'HR'>('overview')
  const [range, setRange] = useState<RunsRange>('This month')
  const [period, setPeriod] = useState<(typeof periods)[number]>('MTD')

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTab('overview')}
          aria-pressed={tab === 'overview'}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition ${
            tab === 'overview' ? 'bg-accent text-white' : 'text-fg-2 hover:bg-surface-2'
          }`}
        >
          <span aria-hidden>▦</span> Overview
        </button>

        {apps.map((app) => {
          const code = app.code as 'CRM' | 'HR'
          return (
            <button
              key={app.code}
              onClick={() => setTab(code)}
              aria-pressed={tab === code}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition ${
                tab === code ? 'bg-accent text-white' : 'text-fg-2 hover:bg-surface-2'
              }`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${code === 'CRM' ? 'bg-sky-500' : 'bg-violet-500'}`} />
              {app.name}
            </button>
          )
        })}

        <div className="ml-auto flex items-center gap-1.5">
          {tab !== 'overview' && (
            <div className="mr-2 flex overflow-hidden rounded-lg border border-line">
              {periods.map((item) => (
                <button
                  key={item}
                  onClick={() => setPeriod(item)}
                  aria-pressed={period === item}
                  className={`px-2.5 py-1.5 text-[12px] font-medium transition ${
                    period === item ? 'bg-accent text-white' : 'text-fg-2 hover:bg-surface-2'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
          {[
            { icon: '📈', label: 'Open observability', run: () => navigate('/app/runs') },
            { icon: '🔔', label: 'Alert settings', run: () => navigate('/app/inbox') },
            { icon: '🖨', label: 'Print dashboard', run: () => window.print() },
          ].map((action) => (
            <button
              key={action.label}
              onClick={action.run}
              aria-label={action.label}
              title={action.label}
              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-[12px] text-fg-2 transition hover:border-accent hover:bg-surface-2"
            >
              {action.icon}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' ? (
        <>
          <RunsRangeFilter value={range} onChange={setRange} />
          <OverviewPanel range={range} />
        </>
      ) : (
        <AppMetricsPanel app={tab} />
      )}
    </section>
  )
}

export default function Overview() {
  const { session } = useAuth()
  const firstName = session?.user.fullName.split(' ')[0] ?? 'there'

  return (
    <div className="mx-auto max-w-6xl space-y-5 pt-2">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          {greeting()}, <span className="brand-gradient-text">{firstName}</span>
        </h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          Everything across your workspace — apps, runs, approvals, spend — in one place.
        </p>
      </header>

      <TwoFactorBanner />
      <TrialCard />
      <Checklist />
      <DashboardTabs />
    </div>
  )
}
