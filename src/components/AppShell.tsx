'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from '../lib/router'
import { AppSidebar } from './AppSidebar'
import { CopilotDock } from './CopilotDock'
import { ThemeSwitch } from './ThemeSwitch'
import { useWorkspace } from '../lib/workspace'

function TopBar() {
  const { unreadCount } = useWorkspace()

  return (
    <div className="pointer-events-none sticky top-0 z-20 flex justify-end px-6 py-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-1.5 shadow-sm">
        <ThemeSwitch compact />
        <NavLink
          to="/app/inbox"
          aria-label={`Inbox — ${unreadCount} unread notifications`}
          className="relative grid h-8 w-8 place-items-center rounded-full text-fg-2 transition hover:bg-surface-2"
        >
          🔔
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[9px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </NavLink>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  // The rail is permanent: an app no longer collapses it on entry. Collapsing
  // is the user's own choice, made with the chevron under the logo.
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="app-surface flex min-h-dvh bg-bg">
      <div className="sticky top-0 hidden h-dvh lg:block">
        <AppSidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((prev) => !prev)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* Keying on the path restarts the entrance animation on every navigation. */}
        <main key={pathname} className="app-enter min-w-0 flex-1 px-6 pb-14">
          {children}
        </main>
      </div>

      <CopilotDock />
    </div>
  )
}
