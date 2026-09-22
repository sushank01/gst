'use client'

import { useState } from 'react'
import { NavLink, useLocation, useSearchParams } from '../lib/router'
import { useAuth } from '../lib/auth'
import { useWorkspace } from '../lib/workspace'
import { administerGroup, allNavLeaves, analyzeGroup, buildGroup, runGroup, toolsGroup, workspaceGroup } from '../lib/appNav'
import type { NavGroup, NavLeaf } from '../lib/appNav'
import { marketApps } from '../lib/appData'
import { Icon } from './Icon'

const leafPath = (to: string) => to.split('?')[0]
const under = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`)

/**
 * Highlighting rules, in the order they matter:
 * `/app` must not stay lit for every child; the most specific path wins over its
 * parent (Chat over All Tools); and where several items share a path and differ
 * only by query, the one whose query is on screen wins.
 */
function isActive(item: NavLeaf, pathname: string, search: string) {
  const path = leafPath(item.to)
  if (path === '/app') return pathname === '/app'
  if (!under(pathname, path)) return false

  const deeper = allNavLeaves.some((other) => {
    const otherPath = leafPath(other.to)
    return otherPath.length > path.length && under(pathname, otherPath)
  })
  if (deeper) return false

  const current = search.replace(/^\?/, '')
  const sibling = allNavLeaves.find((other) => {
    const [otherPath, otherQuery] = other.to.split('?')
    return otherPath === path && otherQuery && otherQuery === current
  })
  return sibling ? sibling.to === item.to : !item.to.includes('?')
}

/** Installed apps use the same line set as the rest of the rail, keyed by app code. */
const appIcons: Record<string, string> = {
  CRM: 'building',
  HR: 'users',
  SUP: 'headset',
  ITAM: 'server',
  PP: 'grid',
  PM: 'network',
  P2P: 'briefcase',
  INV: 'bag',
  POS: 'bag',
  PAY: 'briefcase',
  CTR: 'file-text',
  IDP: 'file-text',
  TE: 'plug',
}

/**
 * An installed app keeps its marketplace colour in the rail, so the hue you
 * clicked Install on is the hue you navigate back to.
 */
const appTones: Record<string, string> = {
  'bg-blue-500': 'blue',
  'bg-emerald-500': 'emerald',
  'bg-emerald-600': 'emerald',
  'bg-indigo-500': 'indigo',
  'bg-orange-500': 'orange',
  'bg-pink-500': 'pink',
  'bg-sky-400': 'sky',
  'bg-sky-500': 'sky',
  'bg-teal-600': 'teal',
  'bg-violet-500': 'violet',
  'bg-violet-600': 'violet',
}

/** Apps that have a purpose-built surface rather than the generic portal. */
const appRoutes: Record<string, string> = {
  CRM: '/app/crm',
  HR: '/app/hr',
  TE: '/app/travel-expense',
  SUP: '/app/support-ticketing',
  ITAM: '/app/asset-management',
  PP: '/app/pitch-pilot',
  POS: '/app/sales-pos',
}

function Item({ item, collapsed }: { item: NavLeaf; collapsed: boolean }) {
  const { pathname } = useLocation()
  // The rail is the one place that distinguishes two items sharing a path.
  const [params] = useSearchParams()
  const search = params.toString() ? `?${params.toString()}` : ''
  const active = isActive(item, pathname, search)

  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={`relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] ${
        active
          ? 'bg-accent-muted font-semibold text-accent before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-accent'
          : 'text-fg-2 hover:bg-surface-2'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <Icon
        name={item.icon}
        size={15}
        className={`shrink-0 ${active ? 'text-accent' : `nav-${item.tone ?? 'slate'}`}`}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && (
            <span className="shrink-0 rounded-md bg-ok-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-ok">
              {item.badge}
            </span>
          )}
          {item.chevron && (
            <span aria-hidden className="text-[11px] text-fg-muted">
              ›
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function Group({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mt-3.5 first:mt-0">
      {group.label && !collapsed && (
        <button
          onClick={() => group.collapsible && setOpen((prev) => !prev)}
          aria-expanded={open}
          className="flex w-full items-center justify-between px-2.5 py-1 text-[10px] font-semibold tracking-[0.09em] text-fg-muted uppercase"
        >
          {group.label}
          {group.collapsible && (
            <span aria-hidden className="text-[10px]">
              {open ? '⌄' : '›'}
            </span>
          )}
        </button>
      )}
      {(open || collapsed) && (
        <div className="mt-0.5 space-y-px">
          {group.items.map((item) => (
            <Item key={item.to} item={item} collapsed={collapsed} />
          ))}
        </div>
      )}
    </div>
  )
}

export function AppSidebar({
  collapsed,
  onToggleCollapsed,
  embedded = false,
}: {
  embedded?: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const { session } = useAuth()
  const { installed, trialDaysLeft } = useWorkspace()

  const installedApps = marketApps
    .filter((app) => installed.includes(app.code))
    .sort((a, b) => a.name.localeCompare(b.name))
  const enterpriseGroup: NavGroup = {
    id: 'enterprise',
    items: installedApps.map((app) => ({
      label: app.name,
      to: appRoutes[app.code] ?? `/app/${app.code.toLowerCase()}`,
      icon: appIcons[app.code] ?? 'briefcase',
      tone: appTones[app.tone] ?? 'slate',
    })),
  }

  return (
    <aside
      className={`relative flex shrink-0 flex-col border-r border-line bg-surface transition-[width] ${
        embedded ? 'h-[65dvh] w-full' : collapsed ? 'h-dvh w-[60px]' : 'h-dvh w-[208px]'
      }`}
    >
      <div className={`px-3 pt-4 pb-2.5 text-center ${collapsed ? 'px-2' : ''}`}>
        <div className="mx-auto grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-emerald-400 text-[13px] font-bold text-white shadow-[0_6px_18px_-8px_rgb(var(--accent))]">
          A
        </div>
        {!collapsed && (
          <>
            <p className="mt-2 text-[13.5px] font-semibold">Apragya AI</p>
            <p className="mt-0.5 text-[10px] leading-snug text-fg-muted">AI Operating System for Business</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-fg-2">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn" />
              Trial · {trialDaysLeft}d
            </span>
          </>
        )}
      </div>

      <button
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="mx-auto mb-1.5 grid h-5 w-5 place-items-center rounded-full border border-line bg-surface text-[10px] text-fg-muted transition hover:text-fg"
      >
        {collapsed ? '›' : '‹'}
      </button>

      <nav aria-label="Workspace" className="flex-1 overflow-y-auto border-t border-line px-1.5 py-2.5">
        <Group group={workspaceGroup} collapsed={collapsed} />

        <div className="mt-3.5">
          {!collapsed && (
            <p className="px-2.5 py-1 text-[10px] font-semibold tracking-[0.09em] text-fg-muted uppercase">Apps</p>
          )}
          {!collapsed && (
            <p className="px-2.5 pt-1.5 pb-0.5 text-[9.5px] font-semibold tracking-[0.08em] text-fg-muted uppercase">
              Enterprise Apps
            </p>
          )}
          {enterpriseGroup.items.length ? (
            <div className="space-y-px">
              {enterpriseGroup.items.map((item) => (
                <Item key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          ) : (
            !collapsed && (
              <NavLink
                to="/app/marketplace"
                className="block px-2.5 py-2 text-[11.5px] leading-snug text-fg-muted transition hover:text-accent"
              >
                No apps installed yet — browse the marketplace →
              </NavLink>
            )
          )}
        </div>

        <Group group={buildGroup} collapsed={collapsed} />
        <Group group={runGroup} collapsed={collapsed} />
        <Group group={toolsGroup} collapsed={collapsed} />
        <Group group={analyzeGroup} collapsed={collapsed} />
        <Group group={administerGroup} collapsed={collapsed} />
      </nav>

      <NavLink
        to="/app/account"
        className={`flex items-center gap-2.5 border-t border-line px-3 py-2.5 transition hover:bg-surface-2 ${
          collapsed ? 'justify-center px-2' : ''
        }`}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
          {session?.user.fullName
            .split(' ')
            .map((part) => part[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'ME'}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium">{session?.user.fullName}</span>
              <span className="block text-[10px] text-fg-muted">Org Admin</span>
            </span>
            <span aria-hidden className="text-fg-muted">
              ›
            </span>
          </>
        )}
      </NavLink>
    </aside>
  )
}
