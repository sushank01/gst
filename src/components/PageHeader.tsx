'use client'

import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  blurb,
  action,
}: {
  eyebrow: string
  title: string
  blurb: string
  action?: ReactNode
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-accent uppercase">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-fg-muted">{blurb}</p>
      </div>
      {action}
    </header>
  )
}

export function EmptyState({ icon, title, blurb, action, spacing = 'compact' }: { icon: string; title: string; blurb: string; action?: ReactNode; spacing?: 'compact' | 'roomy' }) {
  return (
    <div className={`rounded-2xl border border-dashed border-line bg-surface px-6 text-center ${spacing === 'roomy' ? 'py-14' : 'py-12'}`}>
      <span aria-hidden className="text-2xl">
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-fg-muted">{blurb}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}
