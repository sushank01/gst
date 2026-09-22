'use client'

import { Link, NavLink, useLocation } from '../../../lib/router'
import { Icon } from '../../../components/Icon'
import { marketApps } from '../../../lib/appData'
import { pitchNav } from '../../../lib/pitchData'
import { useWorkspace } from '../../../lib/workspace'
import { AwaitingDecision, ElsewhereLink } from '../../../components/NotBuilt'
import {
  Analytics,
  ExtractionSchema,
  KnowledgeBase,
  NewRfp,
  PitchDashboard,
  RfpInbox,
  Templates,
} from './panes'
import BrandKitPane from './BrandKit'

const app = marketApps.find((item) => item.code === 'PP')
const base = '/app/pitch-pilot'

/** The app's own sections, keyed by the path segment that selects them. */
const panes: Record<string, () => React.ReactElement> = {
  '': PitchDashboard,
  inbox: RfpInbox,
  new: NewRfp,
  kb: KnowledgeBase,
  templates: Templates,
  schema: ExtractionSchema,
  brand: BrandKitPane,
  analytics: Analytics,
}

export default function PitchPilot() {
  const { installed, rfps } = useWorkspace()
  const { pathname } = useLocation()
  const section = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1).split('/')[0] : ''
  const Pane = panes[section] ?? PitchDashboard

  if (!app || !installed.includes('PP')) {
    return (
      <div className="mx-auto max-w-3xl pt-2">
        <AwaitingDecision
          title="Pitch Pilot is not available on this deployment"
          decision="D2"
          because={
            <>
              It is in the catalogue, but nothing is built behind it: no RFP extraction, no knowledge index and no
              deck rendering. Installing it would give you an empty shell, so the marketplace refuses rather than
              letting you try.
            </>
          }
        >
          <ElsewhereLink to="/app/marketplace">See what can be installed</ElsewhereLink>
        </AwaitingDecision>
      </div>
    )
  }

  return (
    // Pitch Pilot carries its own indigo palette and its own left rail.
    <div className="pitch-pilot -mx-6 -mt-2">
      <div className="flex min-h-[calc(100dvh-8rem)]">
        <aside className="hidden w-[16rem] shrink-0 border-r border-line lg:block">
          <div className="px-5 py-4">
            <Link to="/app" className="text-[13px] text-fg-2 transition hover:text-accent">
              ← Back to apps
            </Link>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-white">
                <Icon name="grid" size={18} />
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{app.name}</span>
                <span className="mt-0.5 block text-[12px] text-fg-muted">RFP → Deck</span>
              </span>
            </div>
          </div>

          <nav aria-label="Pitch Pilot" className="border-t border-line px-3 py-4">
            {pitchNav.map((group) => (
              <div key={group.group} className="mt-5 first:mt-0">
                <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.1em] text-fg-muted uppercase">
                  {group.group}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const to = item.id ? `${base}/${item.id}` : base
                    const active = pathname === to
                    return (
                      <li key={item.id}>
                        <NavLink
                          to={to}
                          className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-[13.5px] transition ${
                            active ? 'bg-accent-muted font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2'
                          }`}
                        >
                          <Icon name={item.icon} size={16} />
                          <span className="flex-1">{item.label}</span>
                          {item.badge && rfps.length > 0 && (
                            <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white">
                              {rfps.length}
                            </span>
                          )}
                        </NavLink>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <div key={pathname} className="app-enter min-w-0 flex-1 px-6 py-6">
          <Pane />
        </div>
      </div>
    </div>
  )
}
