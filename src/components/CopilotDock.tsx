'use client'

import { useEffect, useState } from 'react'
import { Link } from '../lib/router'
import { useOverview } from '../lib/useWorkspaceSummary'

/**
 * The AI Copilot dock.
 *
 * There is no model behind this. No provider credential exists — decision D3
 * in `docs/implementation/decisions.md` — so the dock says so and takes no
 * input it cannot act on.
 *
 * What it replaced is worth naming. The previous version accepted a question,
 * SPENT TWO CREDITS, and replied with a sentence describing what the live
 * product would do. That is the worst shape a stub can take: it charged for a
 * non-answer, it left a plausible transcript, and nothing on screen said the
 * answer was not real. An empty dock that explains itself is more useful than
 * a convincing one that is lying.
 *
 * The credit figure is real, from the ledger, because that part exists.
 */
export function CopilotDock() {
  const [open, setOpen] = useState(false)
  const { data } = useOverview()

  // Surfaces elsewhere ("Open Copilot" in an app's settings) raise the dock
  // without having to own its state.
  useEffect(() => {
    const raise = () => setOpen(true)
    window.addEventListener('apragya:copilot', raise)
    return () => window.removeEventListener('apragya:copilot', raise)
  }, [])

  return (
    <>
      {open && (
        <aside className="fixed right-6 bottom-24 z-50 flex w-[350px] flex-col rounded-2xl border border-line bg-surface shadow-2xl">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold">AI Copilot</p>
              <p className="text-[11px] text-fg-muted">
                {data ? `${data.credits.available.toLocaleString()} credits available` : 'Not connected'}
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close Copilot" className="text-fg-muted hover:text-fg">
              ✕
            </button>
          </header>

          <div className="space-y-3 p-4">
            <p className="rounded-2xl bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-fg-2">
              The Copilot is not connected to a model on this deployment, so it cannot answer questions or take
              actions yet.
            </p>
            <p className="text-[12px] leading-relaxed text-fg-muted">
              Everything it would need is in place — your records, the audit trail, the credit ledger and the
              approval steps for consequential actions. What is missing is a provider credential.
            </p>
            <Link to="/app/account" className="inline-block text-[13px] font-medium text-accent hover:underline">
              Manage plan and credits →
            </Link>
          </div>
        </aside>
      )}

      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Hide AI Copilot' : 'Open AI Copilot'}
        className="fixed right-6 bottom-20 z-50 grid h-14 w-14 place-items-center rounded-full bg-accent text-xl text-white shadow-lg transition hover:scale-105"
      >
        {open ? '✕' : '✨'}
      </button>
    </>
  )
}
