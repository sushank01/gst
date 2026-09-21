'use client'

import { useRef, useState } from 'react'
import { Link } from '../../lib/router'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'
import { useWorkspace } from '../../lib/workspace'
import {
  studioGroups,
  studioModel,
  studioPrimary,
  studioPromptPlaceholder,
  templateCategories,
} from '../../lib/agentStudioData'

function Sidebar({ active, onSelect }: { active: string; onSelect: (label: string) => void }) {
  const { session } = useAuth()
  const [collapsed, setCollapsed] = useState<string[]>([])

  return (
    <aside className="flex h-dvh w-[250px] shrink-0 flex-col border-r border-line bg-surface/40">
      <div className="px-3 py-3">
        <Link
          to="/app/account"
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-surface-2"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-sky-500/30 text-[11px] font-semibold text-sky-200">
            {session?.user.fullName.charAt(0).toUpperCase() ?? 'S'}
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] text-fg">{session?.user.fullName}</span>
          <span aria-hidden className="text-fg-muted">
            ›
          </span>
        </Link>
      </div>

      <nav aria-label="Agent Studio" className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="space-y-1">
          {studioPrimary.map((item) => (
            <button
              key={item.label}
              onClick={() => onSelect(item.label)}
              aria-current={active === item.label ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition ${
                active === item.label
                  ? 'bg-accent/90 font-medium text-[#06231f]'
                  : 'text-fg-2 hover:bg-surface-2'
              }`}
            >
              <span aria-hidden className="w-4 text-center text-[13px]">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>

        <p className="mt-6 px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-fg-muted uppercase">
          Workspace
        </p>

        {studioGroups.map((group) => {
          const isOpen = !collapsed.includes(group.id)
          return (
            <div key={group.id} className="mt-3">
              <button
                onClick={() =>
                  setCollapsed((prev) =>
                    prev.includes(group.id) ? prev.filter((id) => id !== group.id) : [...prev, group.id],
                  )
                }
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-[15px] text-fg transition hover:bg-surface-2"
              >
                <span className="flex items-center gap-3">
                  <span aria-hidden className="w-4 text-center text-[13px] text-fg-muted">
                    {group.id === 'library' ? '▤' : group.id === 'data' ? '▧' : '◈'}
                  </span>
                  {group.label}
                </span>
                <span aria-hidden className="text-[11px] text-fg-muted">
                  {isOpen ? '⌄' : '›'}
                </span>
              </button>

              {isOpen && (
                <ul className="mt-0.5 space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.label}>
                      <button
                        onClick={() => onSelect(item.label)}
                        aria-current={active === item.label ? 'page' : undefined}
                        className={`flex w-full items-center gap-3 rounded-xl py-2 pr-3 pl-6 text-left text-[15px] transition ${
                          active === item.label ? 'bg-surface-2 text-accent' : 'text-fg-2 hover:bg-surface-2'
                        }`}
                      >
                        <span aria-hidden className="w-4 text-center text-[13px]">
                          {item.icon}
                        </span>
                        <span className="flex-1">{item.label}</span>
                        {item.badge && <span className="text-[12px] text-fg-muted">{item.badge}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      <Link
        to="/app/setup"
        className="flex items-center gap-3 border-t border-line px-6 py-3.5 text-[15px] text-fg-2 transition hover:bg-surface-2"
      >
        <span aria-hidden className="text-[13px]">
          ⚙
        </span>
        Settings
      </Link>
    </aside>
  )
}

function AgentHealth() {
  const { runs } = useWorkspace()
  const passing = runs.length ? Math.round((runs.filter((run) => run.status === 'success').length / runs.length) * 100) : 0
  const avgLatency = runs.length
    ? `${(runs.reduce((sum, run) => sum + run.ms, 0) / runs.length / 1000).toFixed(1)}s`
    : '—'

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Agent Health</h2>
          <p className="mt-1 text-[13px] text-fg-muted">Run reliability across your agents</p>
        </div>
        <span className="rounded-lg bg-surface-2 px-3 py-1.5 text-[12px] text-fg-2">Last 30 days</span>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-10">
        <div className="text-center">
          <span aria-hidden className="mx-auto mb-3 block h-2.5 w-2.5 rounded-full bg-accent" />
          <p className="text-3xl font-bold text-accent">{passing}%</p>
          <p className="mt-1 text-[12px] text-fg-muted">Runs passing</p>
        </div>

        <ul className="flex-1 space-y-4">
          {[
            { icon: '📈', tone: 'bg-sky-500/20 text-sky-300', label: 'Active agents', value: '1' },
            { icon: '✓', tone: 'bg-emerald-500/20 text-emerald-300', label: 'Successful runs', value: `${passing}%` },
            { icon: '🕐', tone: 'bg-orange-500/20 text-orange-300', label: 'Avg latency', value: avgLatency },
          ].map((row) => (
            <li key={row.label} className="flex items-center gap-3">
              <span aria-hidden className={`grid h-9 w-9 place-items-center rounded-xl text-[14px] ${row.tone}`}>
                {row.icon}
              </span>
              <span>
                <span className="block text-[13px] text-fg-muted">{row.label}</span>
                <span className="block text-lg font-semibold">{row.value}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function MiniCalendar() {
  const [cursor, setCursor] = useState(() => new Date())
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const today = new Date()

  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const cells = Array.from({ length: 35 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Previous month"
          className="rounded-lg px-2 py-1 text-fg-muted transition hover:bg-surface-2"
        >
          ‹
        </button>
        <h2 className="text-[15px] font-semibold">{cursor.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}</h2>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Next month"
          className="rounded-lg px-2 py-1 text-fg-muted transition hover:bg-surface-2"
        >
          ›
        </button>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-y-2 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
          <span key={index} className="text-[12px] text-fg-muted">
            {day}
          </span>
        ))}

        {cells.map((date, index) => {
          const inMonth = date.getMonth() === month
          const isToday = date.toDateString() === today.toDateString()
          return (
            <span
              key={index}
              className={`mx-auto grid h-8 w-8 place-items-center rounded-full text-[13px] ${
                isToday ? 'bg-accent font-semibold text-[#06231f]' : inMonth ? 'text-fg-2' : 'text-transparent'
              }`}
            >
              {date.getDate()}
            </span>
          )
        })}
      </div>
    </section>
  )
}

export default function AgentStudio() {
  const { session } = useAuth()
  const [active, setActive] = useState('Build')
  const [category, setCategory] = useState(templateCategories[0])
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [sent, setSent] = useState('')
  const [help, setHelp] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const { theme, toggle: toggleTheme } = useTheme()
  const { recordRun } = useWorkspace()

  const firstName = session?.user.fullName.split(' ')[0] ?? 'there'

  return (
    <div className="agent-studio flex min-h-dvh bg-bg text-fg">
      <div className="sticky top-0 hidden lg:block">
        <Sidebar active={active} onSelect={setActive} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-line px-5 py-3">
          <Link to="/app" aria-label="Back to workspace" className="text-fg-muted transition hover:text-fg">
            ←
          </Link>
          <span className="flex items-center gap-2 text-[15px] font-medium">
            <span aria-hidden className="text-accent">
              ✦
            </span>
            Apragya
          </span>

          <div className="relative ml-6 max-w-xl flex-1">
            <span aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted">
              ⌕
            </span>
            <input
              placeholder="Search agents, tables, logs..."
              aria-label="Search agents, tables, logs"
              className="w-full rounded-xl border border-line bg-surface py-2 pr-3 pl-9 text-[14px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="ml-auto flex items-center gap-2 text-fg-muted">
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="rounded-lg px-2 py-1 transition hover:bg-surface-2"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <button
              onClick={() => setHelp(true)}
              aria-label="Help"
              className="rounded-lg px-2 py-1 transition hover:bg-surface-2"
            >
              ?
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
          <h1 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            What should we get done, <span className="text-accent">{firstName}</span>?
          </h1>
          <p className="mt-3 text-center text-[15px] text-fg-muted">
            Describe an agent, or pick a starting point below.
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              const text = prompt.trim()
              if (!text) return
              // Building an agent is a run like any other, so it lands in Runs
              // and in the audit trail rather than vanishing.
              recordRun({ agent: text.slice(0, 60), source: 'Agent Studio' })
              setSent(`Sent to the builder — "${text.slice(0, 48)}${text.length > 48 ? '…' : ''}" is queued in Runs.`)
              setPrompt('')
              setAttachments([])
            }}
            className="mx-auto mt-8 max-w-2xl rounded-2xl border border-line bg-surface p-4 focus-within:border-accent"
          >
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={2}
              aria-label="Describe an agent"
              placeholder={studioPromptPlaceholder}
              className="w-full resize-none bg-transparent text-[15px] text-fg placeholder:text-fg-muted focus:outline-none"
            />
            <div className="mt-3 flex items-center gap-3">
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []).map((file) => file.name)
                  setAttachments((prev) => [...prev, ...picked])
                  event.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                aria-label="Add context"
                className="text-fg-muted transition hover:text-fg"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                aria-label="Attach a file"
                className="text-fg-muted transition hover:text-fg"
              >
                📎
              </button>
              <span className="text-[13px] text-fg-muted">{studioModel}</span>
              <button
                type="submit"
                aria-label="Send"
                disabled={!prompt.trim()}
                className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-fg-2 transition enabled:hover:bg-accent enabled:hover:text-[#06231f] disabled:opacity-50"
              >
                ↑
              </button>
            </div>
            {attachments.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {attachments.map((name, index) => (
                  <li
                    key={`${name}-${index}`}
                    className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1 text-[12px] text-fg-2"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, at) => at !== index))}
                      aria-label={`Remove ${name}`}
                      className="text-fg-muted transition hover:text-fg"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>

          {sent && (
            <p className="mx-auto mt-3 max-w-2xl text-center text-[13px] text-accent">
              {sent}{' '}
              <Link to="/app/runs" className="underline">
                Open Runs
              </Link>
            </p>
          )}

          {help && (
            <div
              role="dialog"
              aria-label="Agent Studio help"
              className="mx-auto mt-4 max-w-2xl rounded-2xl border border-line bg-surface p-5 text-[13px] leading-relaxed text-fg-2"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-[15px] font-semibold text-fg">How Agent Studio works</p>
                <button onClick={() => setHelp(false)} aria-label="Close help" className="text-fg-muted hover:text-fg">
                  ×
                </button>
              </div>
              <p className="mt-3">
                Describe the agent you want in the box above, or pick a template to prefill the prompt. Attachments
                become context the builder reads. Anything you send is queued in Runs, and every action it takes is
                recorded in the Audit Trail under your name.
              </p>
            </div>
          )}

          <section className="mt-16">
            <h2 className="text-2xl font-semibold tracking-tight">Start from a template</h2>
            <p className="mt-1.5 text-[14px] text-fg-muted">
              Pick a category, then a workflow to prefill your prompt.
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
              <ul className="space-y-3">
                {templateCategories.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setCategory(item)}
                      aria-pressed={category.id === item.id}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${
                        category.id === item.id
                          ? 'border-accent/60 bg-surface'
                          : 'border-line bg-surface/60 hover:bg-surface'
                      }`}
                    >
                      <span
                        aria-hidden
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/20 text-[15px] text-accent"
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">{item.name}</span>
                        <span className="block text-[13px] text-fg-muted">{item.count} templates</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="rounded-2xl border border-line bg-surface/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2.5 text-lg font-semibold">
                    <span
                      aria-hidden
                      className="grid h-8 w-8 place-items-center rounded-lg bg-accent/20 text-[14px] text-accent"
                    >
                      {category.icon}
                    </span>
                    {category.name}
                  </h3>
                  <span className="text-[12px] text-fg-muted">
                    {category.count} workflows · click one to prefill your prompt
                  </span>
                </div>

                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {category.workflows.map((workflow) => (
                    <li key={workflow.name}>
                      <button
                        onClick={() => setPrompt(workflow.name)}
                        className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3.5 text-left transition hover:border-accent/60"
                      >
                        <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[13px] ${workflow.tone}`}>
                          {workflow.icon}
                        </span>
                        <span className="truncate text-[15px]">{workflow.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <AgentHealth />
            <MiniCalendar />
          </div>

          <section className="mt-4 rounded-2xl border border-line bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Recent Activity</h2>
                <p className="mt-1 text-[13px] text-fg-muted">Runs per day across all agents</p>
              </div>
              <span className="rounded-lg bg-surface-2 px-3 py-1.5 text-[12px] text-fg-2">This week</span>
            </div>

            <div className="mt-8 grid grid-cols-7 gap-2 text-center">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                <div key={index} className="flex h-28 flex-col justify-end">
                  <span className="mt-2 text-[12px] text-fg-muted">{day}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
