'use client'

import { useState } from 'react'
import { Link, useSearchParams } from '../../../lib/router'
import { Icon } from '../../../components/Icon'
import { marketApps } from '../../../lib/appData'
import { teTabs } from '../../../lib/travelExpenseData'
import { useInstallations } from '../../../lib/useInstallations'
import type { Entitlement } from '../../../lib/useWorkspaceSummary'
import {
  AgencyReviewPane,
  ApprovalInboxPane,
  CardsPane,
  DashboardPane,
  ExpenseReportsPane,
  ReimbursementsPane,
  ReportsPane,
  TravelPane,
} from './panes'
import { SettingsPane } from './settings'

const app = marketApps.find((item) => item.code === 'TE')

/**
 * The plan's own countdown, which is null when there is no trial.
 *
 * Two things a bare `trialDaysLeft` gets wrong. A subscription that converted
 * to a paid plan keeps the date its trial ended on, so counting days off it
 * puts a "Trial" badge on a workspace that is paying — the status is what says
 * whether this is a trial. And the count is floored at zero, so a trial that
 * ends tonight and one that ended last March both arrive as 0; the end date is
 * what separates them.
 */
function TrialPill({ entitlement }: { entitlement: Entitlement | undefined }) {
  // The clock is read once, when this mounts, rather than on every render: a
  // pill that changed its mind halfway through a session would be worse than
  // one that is a few minutes stale.
  const [now] = useState(() => Date.now())
  const daysLeft = entitlement?.trialDaysLeft
  if (entitlement?.status !== 'trialing' || daysLeft === null || daysLeft === undefined) return null

  const endsAt = entitlement.trialEndsAt ? new Date(entitlement.trialEndsAt) : null
  const over = endsAt !== null && endsAt.getTime() <= now

  return (
    <span
      className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${
        over ? 'bg-surface-2 text-fg-muted' : 'bg-warn-muted text-warn'
      }`}
    >
      {over ? 'Trial ended' : `Trial · ${daysLeft === 0 ? 'last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}`}
    </span>
  )
}

export default function TravelExpense() {
  const [params, setParams] = useSearchParams()
  const { apps, entitlement, loading, error } = useInstallations()
  const tab = teTabs.find((item) => item.id === params.get('tab'))?.id ?? 'dashboard'
  const installed = apps.find((item) => item.code === 'TE')?.status

  // Whether the app is installed is the server's answer, so until it arrives
  // the screen says it is asking rather than showing the "not installed" page
  // to somebody who has installed it.
  if (loading) {
    return (
      <div role="status" className="mx-auto max-w-2xl pt-10 text-center text-[14px] text-fg-muted">
        Loading this workspace…
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-2xl pt-10 text-center">
        <h1 className="text-[20px] font-bold tracking-tight">We could not check this workspace&apos;s apps</h1>
        <p className="mt-2 text-[14px] text-fg-muted">{error.message}</p>
      </div>
    )
  }

  if (!app || !installed) {
    return (
      <div className="mx-auto max-w-2xl pt-2">
        <h1 className="text-[22px] font-bold tracking-tight">Travel &amp; Expense is not installed</h1>
        <p className="mt-2 text-[14px] text-fg-muted">
          Install it from the marketplace and its records, agents and reports appear here.
        </p>
        <Link to="/app/marketplace" className="mt-5 inline-block text-[13px] font-medium text-accent hover:underline">
          Browse marketplace →
        </Link>
      </div>
    )
  }

  return (
    <div className="pt-2">
      <header className="flex flex-wrap items-start gap-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-white">
          <Icon name="file-text" size={22} />
        </span>
        <div className="min-w-[18rem] flex-1">
          <h1 className="text-[24px] font-bold tracking-tight">{app.name}</h1>
          {/* What these tabs actually do. Receipt capture has no control
              anywhere in this app — an expense carries a receipt id the server
              will store and nothing here can produce one — and a per-diem has
              nowhere to be recorded at all, so neither is advertised. */}
          <p className="mt-1 max-w-4xl text-[14px] leading-relaxed text-fg-2">
            Expense claims, corporate-card reconciliation, travel requests and reimbursement runs. Raise a claim,
            submit it, have it approved, and record it as reimbursed.
          </p>
        </div>
        <TrialPill entitlement={entitlement} />
      </header>

      <nav aria-label="Travel & Expense" className="mt-5 flex flex-wrap gap-1 border-b border-line pb-3">
        {teTabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setParams(item.id === 'dashboard' ? {} : { tab: item.id })}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] transition ${
              tab === item.id ? 'bg-accent font-semibold text-white' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            <Icon name={item.icon} size={16} />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Keying on the tab replays the entrance animation as you move across them. */}
      <div key={tab} className="app-enter mt-5">
        {tab === 'dashboard' && <DashboardPane />}
        {tab === 'expense_reports' && <ExpenseReportsPane />}
        {tab === 'cards' && <CardsPane />}
        {tab === 'reimbursements' && <ReimbursementsPane />}
        {tab === 'travel' && <TravelPane />}
        {tab === 'agency_review' && <AgencyReviewPane />}
        {tab === 'approval_inbox' && <ApprovalInboxPane />}
        {tab === 'reports' && <ReportsPane />}
        {tab === 'settings' && <SettingsPane />}
      </div>
    </div>
  )
}
