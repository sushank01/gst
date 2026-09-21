'use client'

import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../../lib/workspace'

const models = ['Claude Sonnet 4', 'Claude Opus 4', 'GPT-4o', 'Gemini Pro']

/** Saved prompts the team can reach for, as the Templates control offers. */
const templates = [
  {
    name: 'Invoice reviewer',
    system: 'You are an accounts-payable reviewer. Be precise and cite the field you relied on.',
    user: 'Review invoice {{invoice_number}} from {{supplier}} against PO {{po_number}}. Flag any mismatch over {{threshold}}.',
  },
  {
    name: 'Lead qualifier',
    system: 'You qualify inbound leads using BANT. Answer only with the scored fields.',
    user: 'Score this lead on fit, intent and urgency:\n\n{{lead}}',
  },
  {
    name: 'Clause summariser',
    system: 'You are a contracts analyst. Summarise in plain language, no legal advice.',
    user: 'Summarise the liability and termination clauses in:\n\n{{contract_text}}',
  },
]

type Result = { model: string; text: string; ms: number; tokens: number; credits: number }

export default function PromptLab() {
  const { spend, creditsLeft } = useWorkspace()

  const [model, setModel] = useState(models[0])
  const [temperature, setTemperature] = useState(2)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [system, setSystem] = useState('')
  const [user, setUser] = useState('')
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const templatesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!templatesOpen) return
    const onDown = (event: MouseEvent) => {
      if (!templatesRef.current?.contains(event.target as Node)) setTemplatesOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [templatesOpen])

  const variables = [...new Set([...system, ...user].join('').match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [])]

  async function run() {
    if (!user.trim() || running) return
    setRunning(true)
    setResult(null)

    await new Promise((resolve) => setTimeout(resolve, 900))
    const credits = 3
    const funded = spend(credits)

    setResult({
      model,
      ms: 1200 + Math.round(Math.random() * 900),
      tokens: Math.round(user.length / 3) + 180,
      credits: funded ? credits : 0,
      text: funded
        ? `On the live platform this runs against ${model} at temperature ${temperature}, capped at ${maxTokens} tokens, and returns the completion here.\n\nEverything you try in the Lab costs the same AI Credits per call as any other model use — the discipline of iterating here is what keeps production spend down. When a prompt works, save it to the library and Vibe Studio and Agent Studio builds can reach for it.`
        : 'Your AI Credits pool is empty for this cycle. An admin can top up or raise your per-user allocation.',
    })
    setRunning(false)
  }

  return (
    <div className="-mx-6 -mt-2 flex min-h-[calc(100dvh-5rem)] flex-col xl:flex-row">
      <section className="flex min-w-0 flex-1 flex-col border-line xl:border-r">
        <div className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-3.5">
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            aria-label="Model"
            className="rounded-xl border border-line bg-surface px-3 py-2 text-[14px] text-fg focus:border-accent focus:outline-none"
          >
            {models.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>

          <label className="flex items-center gap-2.5 text-[13px] text-fg-2">
            Temp:
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
              className="h-1.5 w-24 accent-[#0d9488]"
            />
            <span className="w-6 text-fg-muted">{temperature}</span>
          </label>

          <label className="flex items-center gap-2.5 text-[13px] text-fg-2">
            Tokens:
            <input
              type="number"
              value={maxTokens}
              onChange={(event) => setMaxTokens(Number(event.target.value))}
              className="w-24 rounded-xl border border-line bg-surface px-3 py-2 text-[14px] focus:border-accent focus:outline-none"
            />
          </label>

          <div ref={templatesRef} className="relative ml-auto">
            <button
              onClick={() => setTemplatesOpen((prev) => !prev)}
              aria-expanded={templatesOpen}
              className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-medium text-fg-2 transition hover:bg-surface-2"
            >
              <span aria-hidden>✦</span>
              Templates
            </button>

            {templatesOpen && (
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-line bg-surface p-2 shadow-xl">
                {templates.map((template) => (
                  <button
                    key={template.name}
                    onClick={() => {
                      setSystem(template.system)
                      setUser(template.user)
                      setTemplatesOpen(false)
                    }}
                    className="block w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2"
                  >
                    <span className="block text-[14px] font-medium">{template.name}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-fg-muted">{template.user}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={run}
            disabled={!user.trim() || running}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {running ? (
              <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <span aria-hidden>▷</span>
            )}
            Run
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-5">
          <div>
            <label htmlFor="system-prompt" className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">
              System prompt
            </label>
            <textarea
              id="system-prompt"
              value={system}
              onChange={(event) => setSystem(event.target.value)}
              rows={4}
              placeholder="You are a helpful assistant..."
              className="mt-2 w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 font-mono text-[14px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <label htmlFor="user-prompt" className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">
              User prompt
            </label>
            <textarea
              id="user-prompt"
              value={user}
              onChange={(event) => setUser(event.target.value)}
              placeholder="Enter your prompt here... Use {{variable}} for placeholders."
              className="mt-2 min-h-[16rem] w-full flex-1 resize-none rounded-xl border border-line bg-surface px-4 py-3 font-mono text-[14px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-fg-muted">
            <span>
              Tip: Use <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">{'{{variable}}'}</code> for
              dynamic placeholders
            </span>
            {variables.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                Detected:
                {variables.map((variable) => (
                  <code key={variable} className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-accent">
                    {variable}
                  </code>
                ))}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="flex w-full min-w-0 flex-col border-t border-line xl:w-[42%] xl:border-t-0">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">Response</h2>
          {result && (
            <span className="text-[12px] text-fg-muted">
              {result.model} · {(result.ms / 1000).toFixed(1)}s · {result.tokens} tokens · {result.credits} credits
            </span>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {running ? (
            <p className="py-20 text-center text-[14px] text-fg-muted">Running against {model}…</p>
          ) : result ? (
            <>
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-fg-2">{result.text}</p>
              <p className="mt-6 text-[12px] text-fg-muted">
                {creditsLeft.toLocaleString()} credits left this cycle.
              </p>
            </>
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div>
                <span
                  aria-hidden
                  className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-xl text-fg-muted"
                >
                  ✦
                </span>
                <p className="mt-5 text-lg font-medium text-fg-2">Enter a prompt and click Run</p>
                <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-fg-muted">
                  Test prompts against multiple models, compare responses, and save templates for reuse.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
