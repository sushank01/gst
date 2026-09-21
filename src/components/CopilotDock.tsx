'use client'

import { useEffect, useState } from 'react'
import { useWorkspace } from '../lib/workspace'

/** The floating AI Copilot the live app pins to the bottom-right of every page. */
export function CopilotDock() {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const { spend, setFlag, creditsLeft } = useWorkspace()
  const [thread, setThread] = useState<{ role: 'you' | 'copilot'; text: string }[]>([
    {
      role: 'copilot',
      text: 'Ask questions or take actions in plain English — "how many credits are left?", "install the Contracts app", "who approved invoice 4821?"',
    },
  ])

  // Surfaces elsewhere ("Open Copilot" in an app's settings) raise the dock
  // without having to own its state.
  useEffect(() => {
    const open = () => setOpen(true)
    window.addEventListener('apragya:copilot', open)
    return () => window.removeEventListener('apragya:copilot', open)
  }, [])

  function ask() {
    const text = question.trim()
    if (!text) return
    setQuestion('')
    setFlag('usedCopilot')
    setThread((prev) => [...prev, { role: 'you', text }])

    const funded = spend(2)
    setThread((prev) => [
      ...prev,
      {
        role: 'copilot',
        text: funded
          ? `On “${text}” — in the live product I answer from your tenant's records and can take the action for you. Anything I change is audit-logged under your name, and consequential actions pause for your approval first.`
          : 'Your AI Credits pool is empty for this cycle. Allocate more from Manage plan, or ask an admin to top up.',
      },
    ])
  }

  return (
    <>
      {open && (
        <aside className="fixed right-6 bottom-24 z-50 flex h-[440px] w-[350px] flex-col rounded-2xl border border-line bg-surface shadow-2xl">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold">AI Copilot</p>
              <p className="text-[11px] text-fg-muted">{creditsLeft.toLocaleString()} credits left</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close Copilot" className="text-fg-muted hover:text-fg">
              ✕
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {thread.map((message, index) => (
              <p
                key={index}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                  message.role === 'you' ? 'ml-auto bg-accent text-white' : 'bg-surface-2 text-fg-2'
                }`}
              >
                {message.text}
              </p>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              ask()
            }}
            className="flex gap-2 border-t border-line p-3"
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask or instruct…"
              aria-label="Ask the AI Copilot"
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-fg focus:border-accent focus:outline-none"
            />
            <button type="submit" className="rounded-xl bg-accent px-3 text-white" aria-label="Send">
              ➤
            </button>
          </form>
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
