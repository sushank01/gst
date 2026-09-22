'use client'

import type { ReactNode } from 'react'
import { Link } from '../lib/router'

/**
 * A surface that is deliberately not built, and says so.
 *
 * This exists because the alternative is worse. A screen with no backend that
 * keeps its own state in the browser looks like it works: the record appears,
 * the toggle stays flipped, and the data is gone on the next device. Several
 * screens here were doing exactly that, and one of them — the compliance
 * register — was asserting legal positions nobody had established.
 *
 * So: say what is missing, say what has to happen first, and take no input
 * that cannot be acted on. Somebody reading this should be able to tell in one
 * sentence whether the feature is coming, blocked, or absent by choice.
 */
export function NotBuilt({
  title,
  because,
  needs,
  children,
}: {
  title: string
  /** Why it is not here — plain, specific, and true. */
  because: ReactNode
  /** What would have to happen first. Optional: some things are simply absent. */
  needs?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-muted">
          ◌
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-fg-2">{because}</p>
          {needs && <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-fg-muted">{needs}</p>}
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </section>
  )
}

/**
 * The same, for a feature waiting on a decision rather than on work.
 *
 * The decisions are recorded in `docs/implementation/decisions.md`; naming the
 * one that applies is more useful than "coming soon", because it tells the
 * reader the blocker is a choice somebody has to make rather than an engineer
 * who has not got round to it.
 */
export function AwaitingDecision({
  title,
  decision,
  because,
  children,
}: {
  title: string
  /** D1..D5, as recorded in the decision log. */
  decision: 'D1' | 'D2' | 'D3' | 'D4' | 'D5'
  because: ReactNode
  children?: ReactNode
}) {
  const WHAT: Record<string, string> = {
    D1: 'where scheduled and long-running work executes',
    D2: 'which applications are released',
    D3: 'which external providers are connected, and under what contract',
    D4: 'prices, credit economics and the legal position',
    D5: 'how people outside the workspace are identified',
  }

  return (
    <NotBuilt
      title={title}
      because={because}
      needs={
        <>
          This is waiting on a decision, not on engineering: <strong>{decision}</strong> — {WHAT[decision]}. Until it
          is made, building this would mean guessing, and a guess here is indistinguishable from a working feature
          until it costs somebody something.
        </>
      }
    >
      {children}
    </NotBuilt>
  )
}

/** A link back to something that does work, so the page is not a dead end. */
export function ElsewhereLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-[13px] font-medium text-accent hover:underline">
      {children} →
    </Link>
  )
}

/**
 * The banner every surface that would call a model shows instead.
 *
 * All of them shared one shape before this: accept a prompt, wait a few
 * hundred milliseconds, and render a paragraph beginning "On the live platform
 * this runs against…" — several of them alongside a latency of
 * `1200 + Math.random() * 900` ms, a token count of `input.length / 3 + 180`,
 * and a credit cost, all presented as measured. One of them charged the credit.
 *
 * A fabricated completion is the most convincing kind of lie a product can
 * tell, because it arrives in the shape the reader is expecting. So these
 * surfaces keep their editors and their settings — those are real choices
 * somebody may want to make in advance — and refuse to produce output.
 */
export function NoModelConnected({ what = 'This' }: { what?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-4 py-3.5">
      <p className="text-[13px] leading-relaxed text-fg-2">
        <strong className="font-semibold text-fg">{what} needs a model, and none is connected.</strong> No provider
        credential exists on this deployment (decision D3), so nothing here can produce a completion.
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
        What you write is kept as written. Nothing is sent anywhere, no credits are spent, and no response is
        invented to fill the space.
      </p>
    </div>
  )
}
