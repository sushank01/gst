'use client'

import { useCallback, useState } from 'react'
import { Link, useNavigate } from '../../lib/router'
import { useAuth } from '../../lib/auth'
import { useWorkspace } from '../../lib/workspace'
import { marketApps } from '../../lib/appData'
import { useApps } from '../../lib/useWorkspaceSummary'
import { api } from '../../lib/api'
import { useResource } from '../../lib/useResource'
import { WorkspaceSummary } from './WorkspaceSummary'
import { AppMetricsPanel, OverviewPanel } from './dashboardPanels'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * The second-factor prompt.
 *
 * "Turn on now" used to set a workspace flag to 'on' and dismiss the banner.
 * No enrolment happened: no secret was generated, no device was registered,
 * no challenge was ever required at sign-in. Somebody could click it, see the
 * warning disappear, and reasonably believe their account was protected —
 * which is the single most dangerous thing a security control can do.
 *
 * Enrolment needs a second factor to enrol WITH, which is decision D3. Until
 * then the banner says what is true and offers nothing to click.
 */
function TwoFactorBanner() {
  return (
    <section className="flex flex-wrap items-start gap-4 rounded-2xl border border-line bg-surface p-5">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-muted">
        🛡
      </span>
      <div className="min-w-[16rem] flex-1">
        <h2 className="text-[15px] font-semibold">Two-factor authentication is not available yet</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-fg-2">
          Your account is protected by its password alone. Enrolling a second factor needs a delivery channel or an
          authenticator this deployment can verify against, and none is configured — so there is nothing here to
          turn on, and nothing that would pretend to.
        </p>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-fg-muted">
          What does protect the account today: passwords are stored with scrypt, sign-in locks out after eight
          failures, sessions are opaque values checked against the database on every request, and entering a
          workspace issues a fresh token.
        </p>
      </div>
    </section>
  )
}

function TrialCard() {
  const { data, loading, error } = useApps()

  if (loading) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5" aria-busy="true">
        <p className="text-[13px] text-fg-muted">Loading your plan…</p>
      </section>
    )
  }
  if (error || !data) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-[13px] text-fg-2">Your plan details could not be loaded right now.</p>
      </section>
    )
  }

  const { entitlement } = data
  const installed = data.apps.filter((app) => app.status && app.status !== 'uninstalled').length

  return (
    <section className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-accent">
          ✦
        </span>
        <div>
          <p className="text-[15px] font-semibold">{entitlement.planName ?? 'No plan'}</p>
          <p className="flex items-center gap-1.5 text-[12px] text-fg-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn" />
            {entitlement.status ?? 'Not subscribed'}
          </p>
        </div>
      </div>

      {/* Null means there is no trial, which is not the same as a trial ending today. */}
      {entitlement.trialDaysLeft !== null && (
        <p className="flex items-center gap-2 text-[13px] text-fg-2">
          <span aria-hidden>📅</span>
          {entitlement.trialDaysLeft === 0
            ? 'Your trial has ended'
            : `${entitlement.trialDaysLeft} day${entitlement.trialDaysLeft === 1 ? '' : 's'} left in trial`}
        </p>
      )}

      <p className="text-[13px] text-fg-2">
        Apps{' '}
        <span className="font-semibold">
          {installed}
          {entitlement.appQuota === null ? '' : ` / ${entitlement.appQuota}`}
        </span>{' '}
        {entitlement.appQuota === null && <span className="text-fg-muted">no limit recorded</span>}
      </p>

      <Link to="/app/account" className="ml-auto text-[13px] font-medium text-accent hover:underline">
        Manage plan →
      </Link>
    </section>
  )
}

/**
 * Getting started.
 *
 * The old list had five items and three of them could never be ticked:
 * "Create your first agent", "Allocate credits to yourself" and "Try the AI
 * Copilot" all needed a model nobody has connected. A checklist that sticks at
 * forty per cent for ever is not encouragement, it is a standing reproach for
 * something the reader cannot do.
 *
 * What remains is what the server can confirm: apps installed, and somebody
 * else in the workspace. Both are checked against real rows rather than a
 * flag the browser sets when you click.
 */
function Checklist() {
  const navigate = useNavigate()
  const { dismissedChecklist, setFlag } = useWorkspace()
  const apps = useApps()
  const members = useResource<{ members: { userId: string }[] }>(
    'members:checklist',
    useCallback((signal) => api.get<{ members: { userId: string }[] }>('/members', undefined, signal), []),
  )

  if (dismissedChecklist) return null
  // Nothing is claimed complete or incomplete until both answers are in.
  if (apps.loading || members.loading || apps.error || members.error) return null

  const installed = (apps.data?.apps ?? []).filter((app) => app.status && app.status !== 'uninstalled').length
  const teammates = (members.data?.members ?? []).length

  const tasks = [
    {
      id: 'app',
      icon: '🗂',
      name: 'Install an application',
      blurb: 'CRM, HR, Support, Sales — the ones that are built.',
      done: installed > 0,
      to: '/app/marketplace',
    },
    {
      id: 'invite',
      icon: '👤',
      name: 'Invite a teammate',
      blurb: 'They join your workspace with a role you choose.',
      done: teammates > 1,
      to: '/app/account',
    },
  ]
  const complete = tasks.filter((task) => task.done).length
  if (complete === tasks.length) return null

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
        <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
          ✦
        </span>
        <h2 className="text-[15px] font-semibold">Get your workspace going</h2>
      </div>
      <p className="mt-2 text-[13px] text-fg-muted">
        {complete} of {tasks.length} done. Each one ticks off from your records, not from clicking here.
      </p>

      <ul className="mt-5 space-y-2.5">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              onClick={() => navigate(task.to)}
              className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition ${
                task.done ? 'border-ok/30 bg-ok-muted/40' : 'border-line bg-surface hover:border-accent/50'
              }`}
            >
              <span
                aria-hidden
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] ${
                  task.done ? 'bg-ok text-white' : 'border-2 border-line text-fg-muted'
                }`}
              >
                {task.done ? '✓' : '○'}
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
          <WorkspaceSummary />
          <OverviewPanel />
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
