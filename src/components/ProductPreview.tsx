'use client'

import { useEffect, useState } from 'react'
import { CountUp } from './CountUp'
/**
 * A scaled-down rendering of the workspace, built in markup rather than a
 * screenshot so it stays theme-aware and sharp at any size. Shown in the hero
 * because the fastest way to explain a product is to let people see it.
 */
export function ProductPreview() {
  const rail = ['▦', '👤', '🛍', '📖', '🏢', '👥', '✦', '⊕']

  /*
   * The checklist ticks itself off and starts over. A still screenshot says the
   * product exists; a checklist finishing says what using it is like — and it
   * gives the eye a reason to stay on the hero a beat longer.
   */
  const [done, setDone] = useState(1)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setDone((prev) => (prev >= 3 ? 1 : prev + 1)), 2200)
    return () => clearInterval(timer)
  }, [])

  const stats = [
    { label: 'Credits', value: '1,000' },
    { label: 'Apps', value: '2 / 5' },
    { label: 'Agents', value: '50+' },
  ]

  const tasks = ['Install an enterprise app', 'Create your first agent', 'Invite a teammate']

  return (
    <div
      aria-hidden
      /* Leans a few degrees towards the cursor — enough to feel like an object. */
      className="tilt edge overflow-hidden rounded-2xl shadow-2xl"
    >
      {/* window chrome */}
      <div className="flex items-center gap-1.5 border-b border-line bg-surface-2/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-3 rounded-md bg-surface px-2.5 py-0.5 text-[10px] text-fg-muted">
          apragya.ai/dashboard
        </span>
      </div>

      <div className="flex bg-surface">
        <div className="flex w-11 shrink-0 flex-col items-center gap-2.5 border-r border-line py-3">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-accent to-emerald-400 text-[9px] font-bold text-white">
            A
          </span>
          {rail.map((icon, index) => (
            <span
              key={index}
              className={`grid h-6 w-6 place-items-center rounded-lg text-[9px] ${
                index === 0 ? 'bg-accent/15 text-accent' : 'text-fg-muted'
              }`}
            >
              {icon}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 p-4">
          <p className="text-[13px] font-bold tracking-tight">
            Good morning, <span className="brand-gradient-text">Priya</span>
          </p>
          <p className="mt-0.5 text-[9px] text-fg-muted">
            Everything across your workspace — apps, runs, approvals, spend.
          </p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-line p-2">
                <p className="text-[12px] font-bold">
                  <CountUp value={stat.value} />
                </p>
                <p className="text-[8px] text-fg-muted">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-lg border border-line p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-semibold">Get the most out of Apragya</p>
              <p className="text-[8px] text-fg-muted">{done} of 5</p>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-fuchsia-500 transition-[width] duration-700 ease-out"
                style={{ width: `${(done / 5) * 100}%` }}
              />
            </div>

            <ul className="mt-2.5 space-y-1.5">
              {tasks.map((task, index) => {
                const ticked = index < done
                return (
                  <li key={task} className="flex items-center gap-2">
                    <span
                      className={`grid h-3 w-3 shrink-0 place-items-center rounded-full text-[6px] transition-colors duration-500 ${
                        ticked ? 'bg-ok text-white' : 'border border-fg-muted/50 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span
                      className={`text-[9px] transition-colors duration-500 ${
                        ticked ? 'text-fg-muted line-through' : 'text-fg-2'
                      }`}
                    >
                      {task}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {['Pipeline flow', 'Recent runs'].map((panel) => (
              <div key={panel} className="rounded-lg border border-line p-2">
                <p className="text-[8px] font-semibold">{panel}</p>
                <div className="mt-1.5 space-y-1">
                  {[70, 45, 30].map((width, index) => (
                    <span key={index} className="block h-1.5 rounded-full bg-surface-2" style={{ width: `${width}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
