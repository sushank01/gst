'use client'

import { useState } from 'react'
import { Link, useSearchParams } from '../../../lib/router'
import { Icon } from '../../../components/Icon'
import { marketApps } from '../../../lib/appData'
import { gatedSections, supportNav } from '../../../lib/supportData'
import { useWorkspace } from '../../../lib/workspace'
import {
  CannedRepliesPane,
  KnowledgeBasePane,
  MyRequestsPane,
  PlanGate,
  SupportDashboard,
  SupportReportsPane,
  TicketsPane,
} from './panes'
import { SupportSettingsPane } from './settings'

const app = marketApps.find((item) => item.code === 'SUP')
const allItems = supportNav.flatMap((group) => group.items)

const panes: Record<string, () => React.ReactElement> = {
  dashboard: SupportDashboard,
  tickets: TicketsPane,
  knowledge_base: KnowledgeBasePane,
  my_requests: MyRequestsPane,
  canned_responses: CannedRepliesPane,
  reports: SupportReportsPane,
  settings: SupportSettingsPane,
}

/** A collapsible group header, as the live left column has. */
function NavGroup({
  group,
  items,
  active,
  onSelect,
}: {
  group: string
  items: typeof supportNav[number]['items']
  active: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mt-4 first:mt-0">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2 pb-1.5 text-[11px] font-semibold tracking-[0.1em] text-accent uppercase"
      >
        <span aria-hidden className="text-[9px]">
          {open ? '⌄' : '›'}
        </span>
        {group}
      </button>
      {open && (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onSelect(item.id)}
                aria-current={active === item.id ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-left text-[13.5px] transition ${
                  active === item.id ? 'bg-accent-muted font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2'
                }`}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function SupportTicketing() {
  const [params, setParams] = useSearchParams()
  const { installed, trialDaysLeft } = useWorkspace()
  const section = allItems.find((item) => item.id === params.get('tab'))?.id ?? 'dashboard'

  if (!app || !installed.includes('SUP')) {
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

  const gated = gatedSections[section]
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
          <p className="mt-1 max-w-4xl text-[13.5px] leading-relaxed text-fg-2">
            Enterprise helpdesk with SLA management, ticket routing, canned responses, and CSAT.
          </p>
          <p className="mt-1 text-[13px] text-fg-muted">v1.0.0</p>
        </div>
        <span className="rounded-full bg-warn-muted px-3.5 py-1.5 text-[13px] font-medium text-warn">
          Trial · {trialDaysLeft} days left
        </span>
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
          {gated ? <PlanGate feature={gated} onBack={() => select('dashboard')} /> : <Pane />}
        </div>
      </div>
    </div>
  )
}
