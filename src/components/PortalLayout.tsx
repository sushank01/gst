'use client'

import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from '../lib/router'
import type { AppPortal } from '../lib/appNav'

/**
 * Second navigation column for an installed app — the middle pane the live app
 * shows between the workspace sidebar and the content area.
 */
export function PortalLayout({ portal, children }: { portal: AppPortal; children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] gap-0">
      <nav
        aria-label={`${portal.name} sections`}
        className="hidden w-[240px] shrink-0 border-r border-line py-2 pr-4 md:block"
      >
        <Link to="/app" className="mb-5 inline-flex items-center gap-2 text-[13px] text-fg-muted hover:text-fg">
          ← Back to apps
        </Link>

        <div className="mb-5 flex items-center gap-3">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${portal.accent} text-base text-white`}
          >
            {portal.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{portal.name}</p>
            <p className="text-[11px] text-fg-muted">{portal.subtitle}</p>
          </div>
        </div>

        <ul className="space-y-0.5">
          {portal.items.map((item) => {
            const active = item.to === portal.items[0].to ? pathname === item.to : pathname.startsWith(item.to)
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition ${
                    active ? 'bg-accent/10 font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2'
                  }`}
                >
                  <span aria-hidden className="w-4 shrink-0 text-center text-[13px]">
                    {item.icon}
                  </span>
                  {item.label}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 md:pl-6">{children}</div>
    </div>
  )
}
