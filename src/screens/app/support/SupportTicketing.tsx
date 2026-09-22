'use client'

import { useState } from 'react'
import { NavGroup } from '../../../components/NavGroup'
import { Link, useSearchParams } from '../../../lib/router'
import { Icon } from '../../../components/Icon'
import { marketApps } from '../../../lib/appData'
import { supportNav } from '../../../lib/supportData'
import { useAppState, useInstallations } from '../../../lib/useInstallations'
import type { Entitlement } from '../../../lib/useWorkspaceSummary'
import {
  CannedRepliesPane,
  KnowledgeBasePane,
  MyRequestsPane,
  RoutingRulesPane,
  SlaPoliciesPane,
  SupportDashboard,
  SupportReportsPane,
  TicketsPane,
} from './panes'
import { SupportSettingsPane } from './settings'

const app = marketApps.find((item) => item.code === 'SUP')
const allItems = supportNav.flatMap((group) => group.items)

const panes: Record<string, () => React.ReactElement | null> = {
  dashboard: SupportDashboard,
  tickets: TicketsPane,
  knowledge_base: KnowledgeBasePane,
  my_requests: MyRequestsPane,
  sla_policies: SlaPoliciesPane,
  canned_responses: CannedRepliesPane,
  routing_rules: RoutingRulesPane,
  reports: SupportReportsPane,
  settings: SupportSettingsPane,
}

/**
 * The trial pill, from `subscriptions.trial_ends_at` rather than a constant.
 *
 * `trialDaysLeft` is floored at zero, so a trial that ended last March and one
 * that ends tonight both arrive as 0 — reading that as "last day" would leave
 * an expired workspace being told it still has a day, indefinitely. The end
 * date settles which it is; no trial at all shows no pill.
 */
function TrialPill({ entitlement }: { entitlement: Entitlement | undefined }) {
  // Read once, not on every render: a clock consulted during render makes the
  // pill's wording depend on when React happened to re-run this.
  const [now] = useState(() => Date.now())

  const daysLeft = entitlement?.trialDaysLeft
  if (daysLeft === null || daysLeft === undefined) return null

  const endsAt = entitlement?.trialEndsAt ? new Date(entitlement.trialEndsAt) : null
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

export default function SupportTicketing() {
  const [params, setParams] = useSearchParams()
  const { entitlement, loading, error } = useInstallations()
  const { status } = useAppState('SUP')
  const section = allItems.find((item) => item.id === params.get('tab'))?.id ?? 'dashboard'

  // The installation answer comes from the server, so it has a loading state
  // and a failure state. Treating "not loaded yet" as "not installed" would
  // flash the marketplace pitch at somebody who already has the app.
  if (loading) {
    return (
      <p className="mx-auto max-w-2xl pt-8 text-center text-[14px] text-fg-muted" role="status">
        Loading your applications…
      </p>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl pt-8 text-center" role="alert">
        <Icon name="alert-triangle" size={28} className="mx-auto text-warn" />
        <p className="mt-3 text-[14px] text-fg-2">
          We could not check whether this application is installed. {error.message}
        </p>
      </div>
    )
  }

  if (!app || !(status === 'installed' || status === 'disabled')) {
    return (
      <div className="mx-auto max-w-2xl pt-2">
        <h1 className="text-[22px] font-bold tracking-tight">Support &amp; Ticketing is not installed</h1>
        <p className="mt-2 text-[14px] text-fg-muted">
          Install it from the marketplace and its tickets, articles and agents appear here.
        </p>
        <Link to="/app/marketplace" className="mt-5 inline-block text-[13px] font-medium text-accent hover:underline">
          Browse marketplace →
        </Link>
      </div>
    )
  }

  const Pane = panes[section] ?? SupportDashboard
  const select = (id: string) => setParams(id === 'dashboard' ? {} : { tab: id })

  return (
    <div className="pt-2">
      <header className="flex flex-wrap items-start gap-5 border-b border-line pb-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pink-500 text-white">
          <Icon name="headset" size={22} />
        </span>
        <div className="min-w-[18rem] flex-1">
          <h1 className="text-[20px] font-bold tracking-tight">{app.name}</h1>
          {/* What this deployment does, not what the catalogue advertises.
              "Ticket routing" had its own pane saying nothing stores or
              evaluates a routing rule here, so the header promised something
              the app itself denies two clicks away. */}
          <p className="mt-1 max-w-4xl text-[13.5px] leading-relaxed text-fg-2">
            Tickets with SLA clocks measured in working time, escalation rules you run by hand, canned replies and a
            knowledge base. Nothing routes a ticket automatically, and email and chat intake are not connected.
          </p>
        </div>
        <TrialPill entitlement={entitlement} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Support & Ticketing" className="border-r border-line py-5 pr-4">
          {supportNav.map((group) => (
            <NavGroup
              key={group.group}
              group={group.group}
              items={group.items}
              active={section}
              onSelect={select}
            />
          ))}
        </nav>

        {/* Keying on the section replays the entrance animation as you move down the rail. */}
        <div key={section} className="app-enter py-5">
          <Pane />
        </div>
      </div>
    </div>
  )
}
