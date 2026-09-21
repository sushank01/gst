'use client'

import { useState } from 'react'
import { useSearchParams } from '../lib/router'
import type { ReactNode } from 'react'

/**
 * App shell for an enterprise app that navigates through a grouped side column
 * rather than a horizontal tab bar (HR & People Ops uses this shape).
 * The selected page lives in `?tab=`, matching the live product's URLs.
 */

export type SideNavItem = { id: string; icon: string; label: string }
export type SideNavGroup = { id: string; label: string; items: SideNavItem[] }

export function AppSideChrome({
  icon,
  tone,
  name,
  blurb,
  version = 'v1.0.0',
  trialDaysLeft,
  groups,
  defaultPage,
  children,
}: {
  icon: string
  tone: string
  name: string
  blurb: string
  version?: string
  trialDaysLeft: number
  groups: SideNavGroup[]
  defaultPage: string
  children: (page: string) => ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const [collapsed, setCollapsed] = useState<string[]>([])

  const known = groups.flatMap((group) => group.items.map((item) => item.id))
  const requested = params.get('tab') ?? defaultPage
  const active = known.includes(requested) ? requested : defaultPage

  return (
    <div className="pt-2">
      <header className="flex flex-wrap items-start justify-between gap-4 pb-5">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl text-white ${tone}`}
          >
            {icon}
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{name}</h1>
            <p className="mt-1 text-[14px] text-fg-muted">{blurb}</p>
            <p className="mt-0.5 text-[13px] text-fg-muted">{version}</p>
          </div>
        </div>

        <span className="rounded-full bg-warn-muted px-3.5 py-1.5 text-[13px] font-medium text-warn">
          Trial · {trialDaysLeft} days left
        </span>
      </header>

      <div className="grid gap-0 border-t border-line lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label={`${name} sections`} className="border-line py-5 pr-5 lg:border-r">
          {groups.map((group) => {
            const isOpen = !collapsed.includes(group.id)
            return (
              <div key={group.id} className="mb-3">
                <button
                  onClick={() =>
                    setCollapsed((prev) =>
                      prev.includes(group.id) ? prev.filter((id) => id !== group.id) : [...prev, group.id],
                    )
                  }
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold tracking-[0.1em] text-fg-muted uppercase"
                >
                  <span aria-hidden className="text-[10px]">
                    {isOpen ? '⌄' : '›'}
                  </span>
                  {group.label}
                </button>

                {isOpen && (
                  <ul className="mt-0.5 space-y-0.5">
                    {group.items.map((item) => {
                      const isActive = item.id === active
                      return (
                        <li key={item.id}>
                          <button
                            onClick={() => setParams(item.id === defaultPage ? {} : { tab: item.id }, { replace: true })}
                            aria-current={isActive ? 'page' : undefined}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition ${
                              isActive ? 'bg-accent/10 font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2'
                            }`}
                          >
                            <span aria-hidden className="w-4 shrink-0 text-center text-[13px]">
                              {item.icon}
                            </span>
                            {item.label}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </nav>

        <div className="min-w-0 py-5 lg:pl-8">{children(active)}</div>
      </div>
    </div>
  )
}

/** Pill group a page uses for its own sub-views, right-aligned beside the title. */
export function SubTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: string[]
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          aria-pressed={value === tab}
          className={`rounded-lg px-3.5 py-1.5 text-[14px] font-medium transition ${
            value === tab ? 'bg-accent/10 text-accent' : 'text-fg-2 hover:bg-surface-2'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
