'use client'

import { Icon } from '../../../components/Icon'

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

/** A KPI tile. Amounts are monospaced so columns of figures line up. */
export function Stat({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-[13px] text-fg-2">{label}</p>
      <p className={`mt-2 text-[26px] leading-none font-bold ${mono ? 'font-mono' : ''}`}>{value}</p>
      {sub && <p className="mt-2.5 text-[12px] text-fg-muted">{sub}</p>}
    </div>
  )
}

export const inputClass =
  'mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none'

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-fg-muted transition hover:text-fg">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] text-fg-2">{children}</span>
}
