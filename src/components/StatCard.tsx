import type { ReactNode } from 'react'

/** One KPI tile with the three intentional density treatments used by the app. */
export function StatCard({ label, value, sub, mono, currency, variant = 'standard' }: {
  label: string; value: ReactNode; sub?: string; mono?: boolean; currency?: string
  variant?: 'standard' | 'pos' | 'dashboard'
}) {
  const labels = {
    standard: 'text-[13px] text-fg-2',
    pos: 'text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase',
    dashboard: 'text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase',
  }
  const values = {
    standard: 'mt-2 text-[26px] leading-none font-bold',
    pos: 'mt-2.5 text-[24px] leading-none font-bold',
    dashboard: 'mt-2.5 text-3xl font-bold',
  }
  return <div className="rounded-2xl border border-line bg-surface p-5">
    <p className={labels[variant]}>{label}</p>
    <p className={`${values[variant]} ${mono ? 'font-mono' : ''}`}>
      {currency && <span className="mr-1.5 text-[14px] font-medium text-fg-muted">{currency}</span>}{value}
    </p>
    {sub && <p className={`${variant === 'dashboard' ? 'mt-1.5' : 'mt-2.5'} text-[12px] text-fg-muted`}>{sub}</p>}
  </div>
}
