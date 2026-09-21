'use client'

import { Link } from '../../../lib/router'
import { toolSlug, type LocatedTool, type SuiteTool } from '../../../lib/businessData'

/** The mint banner that heads both the suite home and every category page. */
export function SuiteBanner({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl bg-accent-muted px-8 py-8 text-fg">{children}</section>
}

export function CreditChip({ cost }: { cost: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-2">
      <span aria-hidden className="text-fg-muted">
        ⛃
      </span>
      ~{cost} AI Credits
    </span>
  )
}

/** One tool in the grid. The whole card is the link, so the target is the card. */
export function ToolCard({ tool }: { tool: SuiteTool | LocatedTool }) {
  return (
    <Link
      to={`/app/business/tool/${toolSlug(tool.name)}`}
      className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition hover:border-accent hover:bg-surface-2"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="text-[15px] font-semibold">{tool.name}</span>
        <CreditChip cost={tool.cost} />
      </span>
      <span className="mt-2 text-[13px] leading-relaxed text-fg-muted">{tool.blurb}</span>
    </Link>
  )
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 text-[14px] text-fg-2 transition hover:text-accent">
      <span aria-hidden>←</span>
      {label}
    </Link>
  )
}
