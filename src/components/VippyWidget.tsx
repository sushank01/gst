'use client'

import { useState } from 'react'

/** The "Ask Vippy anything" pill + bubble apragya.ai floats bottom-right. */
export function VippyWidget() {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [thread, setThread] = useState<{ role: 'you' | 'vippy'; text: string }[]>([
    { role: 'vippy', text: 'Hi — I can explain any part of the platform, or point you to the right page. What are you trying to do?' },
  ])

  function send() {
    const text = question.trim()
    if (!text) return
    setQuestion('')
    setThread((prev) => [
      ...prev,
      { role: 'you', text },
      {
        role: 'vippy',
        text: `On the live site Vippy answers “${text}” from Apragya's own docs. Once you're signed in, the same assistant answers from your tenant's data and can take actions for you.`,
      },
    ])
  }

  return (
    <>
      {open && (
        <aside className="fixed right-5 bottom-20 z-50 flex h-[400px] w-[330px] flex-col rounded-2xl border border-line bg-surface shadow-2xl">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold text-fg">✦ Vippy</span>
            <button onClick={() => setOpen(false)} aria-label="Close Vippy" className="text-fg-muted hover:text-fg">
              ✕
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {thread.map((message, index) => (
              <p
                key={index}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                  message.role === 'you' ? 'ml-auto bg-fg text-bg' : 'bg-surface-2 text-fg-2'
                }`}
              >
                {message.text}
              </p>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              send()
            }}
            className="flex gap-2 border-t border-line p-3"
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask Vippy anything"
              aria-label="Ask Vippy"
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-fg focus:border-accent focus:outline-none"
            />
            <button type="submit" className="rounded-xl bg-fg px-3 text-bg" aria-label="Send">
              ➤
            </button>
          </form>
        </aside>
      )}

      <div className="fixed right-5 bottom-5 z-50 flex items-center gap-2">
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="hidden rounded-full border border-line bg-surface px-3.5 py-2 text-[12px] text-fg-2 shadow-sm transition hover:border-accent sm:block"
          >
            ✦ Ask <span className="font-semibold text-accent">Vippy</span> anything
          </button>
        )}
        <button
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? 'Hide Vippy' : 'Open Vippy'}
          className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-accent to-emerald-500 text-lg text-white shadow-lg transition hover:scale-105"
        >
          {open ? '✕' : '💬'}
        </button>
      </div>
    </>
  )
}
