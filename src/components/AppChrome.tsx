'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from '../lib/router'

/**
 * Header + horizontal tab bar an enterprise app renders inside the workspace shell.
 * The active tab lives in `?tab=` so a view is linkable, as on the live product.
 */

export type ChromeTab = { id: string; icon: string; label: string }

export function AppChrome({
  icon,
  tone,
  name,
  blurb,
  version = 'v1.0.0',
  trialDaysLeft,
  tabs,
  children,
}: {
  icon: string
  tone: string
  name: string
  blurb: string
  version?: string
  trialDaysLeft: number
  tabs: readonly ChromeTab[]
  children: (tab: string) => ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab') ?? tabs[0].id
  const active = tabs.some((tab) => tab.id === requested) ? requested : tabs[0].id

  return (
    <div className="pt-2">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span aria-hidden className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl text-white ${tone}`}>
            {icon}
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <p className="mt-1 text-[14px] text-fg-muted">{blurb}</p>
            <p className="mt-0.5 text-[13px] text-fg-muted">{version}</p>
          </div>
        </div>

        <span className="rounded-full bg-warn-muted px-3.5 py-1.5 text-[13px] font-medium text-warn">
          Trial · {trialDaysLeft} days left
        </span>
      </header>

      <nav aria-label={`${name} sections`} className="mt-5 flex flex-wrap gap-1 border-b border-line pb-3">
        {tabs.map((tab) => {
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              onClick={() => setParams(tab.id === tabs[0].id ? {} : { tab: tab.id }, { replace: true })}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-medium transition ${
                isActive ? 'bg-accent text-white' : 'text-fg-2 hover:bg-surface-2'
              }`}
            >
              <span aria-hidden className="text-[13px]">
                {tab.icon}
              </span>
              {tab.label}
            </button>
          )
        })}
      </nav>

      <div className="pt-6 pb-4">{children(active)}</div>
    </div>
  )
}

/* ------------------------- shared panel primitives ------------------------- */

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2.5">{children}</div>
}

export function Chip({
  children,
  active,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
        active ? 'bg-accent text-white' : 'bg-surface-2 text-fg-2 hover:bg-line'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * A real filter dropdown. `label` is both the accessible name and the
 * "everything" option, so a toolbar reads the same as the live product while
 * the control actually opens and holds a choice.
 */
export function Select({ label, options = [], value: controlled, onChange }: { label: string; options?: readonly string[]; value?: string; onChange?: (value: string) => void }) {
  const [local, setLocal] = useState(label)
  const value = controlled ?? local
  const setValue = (next: string) => { setLocal(next); onChange?.(next) }

  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className="rounded-xl border border-line bg-surface py-2 pr-8 pl-3.5 text-[13px] text-fg-2 transition hover:bg-surface-2 focus:border-accent focus:outline-none"
    >
      {[label, ...options.filter((option) => option !== label)].map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  )
}

export function SearchBox({ placeholder, value, onChange }: { placeholder: string; value?: string; onChange?: (value: string) => void }) {
  return (
    <div className="relative min-w-[12rem] flex-1">
      <span aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted">
        ⌕
      </span>
      <input
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        aria-label={placeholder}
        className="w-full rounded-xl border border-line bg-surface py-2 pr-3 pl-8 text-[13px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
      />
    </div>
  )
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: readonly string[]
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-line">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`px-3 py-2 text-[13px] font-medium transition ${
            value === option ? 'bg-accent text-white' : 'bg-surface text-fg-2 hover:bg-surface-2'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

export function Action({
  children,
  variant = 'outline',
  onClick,
}: {
  children: ReactNode
  variant?: 'solid' | 'outline'
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-[13px] font-semibold transition ${
        variant === 'solid'
          ? 'bg-accent text-white hover:opacity-90'
          : 'border border-line bg-surface text-fg-2 hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  )
}

export function BigEmpty({
  icon,
  title,
  blurb,
  action,
}: {
  icon: string
  title: string
  blurb: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-20 text-center">
      <span
        aria-hidden
        className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent-muted text-2xl text-accent"
      >
        {icon}
      </span>
      <p className="mt-6 text-2xl font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-fg-muted">{blurb}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-6 ${className}`}>{children}</section>
}
