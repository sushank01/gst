'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from '../lib/router'
import { Dialog } from './Dialog'
import { AppSidebar } from './AppSidebar'
import { CopilotDock } from './CopilotDock'
import { ThemeSwitch } from './ThemeSwitch'
import { useNotifications } from '../lib/useNotifications'

function TopBar({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  /*
   * `undefined` until the server answers, which is not the same as zero. A
   * badge rendered as 0 while the request is in flight asserts there is
   * nothing waiting, which it does not yet know.
   */
  const { unread } = useNotifications()
  const label = unread === undefined ? 'Inbox' : `Inbox — ${unread} unread notification${unread === 1 ? '' : 's'}`

  return (
    <div className="pointer-events-none sticky top-0 z-20 flex justify-between px-6 py-4 lg:justify-end">
      <button type="button" onClick={onOpenNavigation} className="pointer-events-auto rounded-xl border border-line bg-surface px-3 text-sm lg:hidden" aria-label="Open workspace navigation">☰ Menu</button>
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-1.5 shadow-sm">
        <ThemeSwitch compact />
        <NavLink
          to="/app/inbox"
          aria-label={label}
          className="relative grid h-8 w-8 place-items-center rounded-full text-fg-2 transition hover:bg-surface-2"
        >
          🔔
          {unread !== undefined && unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[9px] font-bold text-white">
              {unread}
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
  const [mobileNavigation, setMobileNavigation] = useState(false)

  return (
    <div className="app-surface flex min-h-dvh bg-bg">
      <div className="sticky top-0 hidden h-dvh lg:block">
        <AppSidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((prev) => !prev)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenNavigation={() => setMobileNavigation(true)} />
        {/* Keying on the path restarts the entrance animation on every navigation. */}
        <main key={pathname} className="app-enter min-w-0 flex-1 px-6 pb-14">
          {children}
        </main>
      </div>

      {mobileNavigation && <Dialog title="Workspace navigation" onClose={() => setMobileNavigation(false)}>
        <div onClick={(event) => { if ((event.target as Element).closest('a')) setMobileNavigation(false) }}>
          <AppSidebar embedded collapsed={false} onToggleCollapsed={() => setMobileNavigation(false)} />
        </div>
      </Dialog>}
      <CopilotDock />
    </div>
  )
}
