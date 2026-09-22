'use client'

import { Link, useSearchParams } from '../../../lib/router'
import { Icon } from '../../../components/Icon'
import { marketApps } from '../../../lib/appData'
import { teTabs } from '../../../lib/travelExpenseData'
import { useWorkspace } from '../../../lib/workspace'
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

export default function TravelExpense() {
  const [params, setParams] = useSearchParams()
  const { installed, trialDaysLeft } = useWorkspace()
  const tab = (teTabs.find((item) => item.id === params.get('tab'))?.id ?? 'dashboard')

  if (!app || !installed.includes('TE')) {
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
          <p className="mt-1 max-w-4xl text-[14px] leading-relaxed text-fg-2">
            Expense reports with receipt capture, travel requests, per-diem, corporate cards, and reimbursements.
            Submit → approve → reimburse on one platform.
          </p>
          <p className="mt-1 text-[13px] text-fg-muted">v1.0.0</p>
        </div>
        <span className="rounded-full bg-warn-muted px-3.5 py-1.5 text-[13px] font-medium text-warn">
          Trial · {trialDaysLeft} days left
        </span>
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
