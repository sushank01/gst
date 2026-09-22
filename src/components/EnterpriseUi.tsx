'use client'

import { Icon } from './Icon'

/** The dashed panel every empty Travel & Expense list falls back to. */
export function EmptyBlock({ title, blurb, icon }: { title: string; blurb?: string; icon?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <Icon name={icon} size={26} className="mx-auto text-fg-muted" />}
      <p className={`text-[15px] text-fg-2 ${icon ? 'mt-3' : ''}`}>{title}</p>
      {blurb && <p className="mt-2 text-[13px] text-fg-muted">{blurb}</p>}
    </div>
  )
}

export function Panel({
  title,
  icon,
  blurb,
  action,
  children,
}: {
  title?: string
  icon?: string
  blurb?: React.ReactNode
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          {title && (
            <h2 className="flex items-center gap-2.5 text-[17px] font-semibold">
              {icon && <Icon name={icon} size={18} className="text-accent" />}
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {blurb && <div className="mt-2 text-[14px] leading-relaxed text-fg-muted">{blurb}</div>}
      {children && <div className="mt-5">{children}</div>}
    </section>
  )
}

export { StatCard as Stat } from './StatCard'

export const inputClass =
  'mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none'

export { Dialog } from './Dialog'

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] text-fg-2">{children}</span>
}
