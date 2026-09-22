'use client'

import { useRef, useState } from 'react'
import { Button } from '../../../components/ui'
import { chatModels, chatSuggestions } from '../../../lib/businessData'
import { NoModelConnected } from '../../../components/NotBuilt'
import { Icon } from '../../../components/Icon'
import { BackLink } from './shared'

type Message = { id: string; role: 'user' | 'assistant'; text: string }

/** One chat turn costs the same as the AI Chat Assistant tool it wraps. */

export default function BusinessChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [model, setModel] = useState(chatModels[0])
  const [systemOpen, setSystemOpen] = useState(false)
  const [system, setSystem] = useState('')
  const composer = useRef<HTMLTextAreaElement>(null)

  /**
   * Keeps what was typed and says nothing came back.
   *
   * The previous version spent a credit, waited 650ms and appended a reply
   * that echoed the question back — "<model> answered '<prompt>'. This rebuild
   * simulates the reply" — beneath a footer reading "AI can make mistakes.
   * Please verify important information." A simulated answer under a caution
   * about answers being wrong is the worst possible arrangement: it borrows
   * the credibility of the warning.
   */
  function send(text: string) {
    const prompt = text.trim()
    if (!prompt) return
    setDraft('')
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text: prompt }])
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send(draft)
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-5xl flex-col pt-2">
      <header className="flex flex-wrap items-center gap-4">
        <BackLink to="/app/business" label="Back" />
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-white">
          <Icon name="message" size={18} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[16px] font-semibold">AI chat</h1>
          <p className="text-[13px] text-fg-muted">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            aria-label="Model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="rounded-xl border border-line bg-surface py-2 pr-8 pl-3.5 text-[13px] text-fg-2 transition hover:bg-surface-2 focus:border-accent focus:outline-none"
          >
            {chatModels.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSystemOpen((prev) => !prev)}
            aria-expanded={systemOpen}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 transition hover:bg-surface-2"
          >
            <Icon name="settings" size={15} />
            System
            <span aria-hidden className="text-fg-muted">
              ⌄
            </span>
          </button>
          <Button
            variant="accent"
            className="!py-2 !text-[13px]"
            onClick={() => {
              setMessages([])
              setDraft('')
              composer.current?.focus()
            }}
          >
            + New Chat
          </Button>
        </div>
      </header>

      {systemOpen && (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <label htmlFor="system-prompt" className="text-[13px] font-medium">
            System prompt
          </label>
          <textarea
            id="system-prompt"
            value={system}
            onChange={(event) => setSystem(event.target.value)}
            rows={3}
            placeholder="Set the assistant's role, tone and constraints for this conversation."
            className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 font-mono text-[13px] focus:border-accent focus:outline-none"
          />
        </div>
      )}

      <div className="flex flex-1 flex-col justify-center py-10">
        {messages.length ? (
          <ul className="space-y-4">
            {messages.map((message) => (
              <li
                key={message.id}
                className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <p
                  className={`max-w-[42rem] rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${
                    message.role === 'user'
                      ? 'bg-accent text-white'
                      : 'border border-line bg-surface text-fg-2'
                  }`}
                >
                  {message.text}
                </p>
              </li>
            ))}
            {/* No "Thinking…" bubble: nothing is thinking. */}
          </ul>
        ) : (
          <div className="text-center">
            <span className="mx-auto grid h-[72px] w-[72px] place-items-center rounded-2xl bg-accent-muted text-accent">
              <Icon name="sparkles" size={30} />
            </span>
            <h2 className="mt-5 text-[24px] font-bold tracking-tight">Start a conversation</h2>
            <p className="mt-2 text-[15px] text-fg-muted">
              Chat with AI. Ask questions, write content, analyze data, and more.
            </p>

            <ul className="mx-auto mt-8 grid max-w-4xl gap-4 text-left sm:grid-cols-2">
              {chatSuggestions.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    onClick={() => send(suggestion)}
                    className="h-full w-full rounded-2xl border border-line bg-surface px-5 py-4 text-left text-[14px] leading-relaxed text-fg-2 transition hover:border-accent hover:bg-surface-2"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 bg-bg pt-2 pb-4">
        <div className="relative">
          <textarea
            ref={composer}
            value={draft}
            rows={1}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type your message... (Shift+Enter for new line)"
            aria-label="Message"
            className="w-full resize-none rounded-2xl border border-line bg-surface py-3.5 pr-14 pl-5 text-[14px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => send(draft)}
            disabled={!draft.trim()}
            aria-label="Send message"
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-xl px-2.5 py-1.5 text-[16px] text-accent transition disabled:text-fg-muted"
          >
            ➤
          </button>
        </div>
        <div className="mx-auto mt-3 max-w-2xl">
          <NoModelConnected what="Chat" />
        </div>
      </div>
    </div>
  )
}
