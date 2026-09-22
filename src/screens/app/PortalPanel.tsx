'use client'

import { EmptyState } from '../../components/PageHeader'
import type { ReactNode } from 'react'

/** Shared building blocks for the portal sub-pages. */

export function Notice({ tone = 'warn', title, children }: { tone?: 'warn' | 'info'; title: string; children: ReactNode }) {
  const styles =
    tone === 'warn' ? 'border-warn/30 bg-warn-muted/40 text-warn' : 'border-line bg-surface text-fg'
  return (
    <section className={`flex items-start gap-3 rounded-2xl border p-5 ${styles}`}>
      <span aria-hidden className="text-base">
        ⚠
      </span>
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-fg-2">{children}</p>
      </div>
    </section>
  )
}

export function PanelHeader({ title, blurb, action }: { title: string; blurb: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] text-fg-muted">{blurb}</p>
      </div>
      {action}
    </header>
  )
}

export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[32rem] text-left text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => (
            <tr key={index} className="transition hover:bg-surface-2">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={`px-4 py-3 ${cellIndex === 0 ? 'font-medium' : 'text-fg-2'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EmptyPanel(props: { icon: string; title: string; blurb: string }) {
  return <EmptyState {...props} spacing="roomy" />
}
