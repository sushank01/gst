'use client'

import { useState } from 'react'
import { useWorkspace } from '../../../lib/workspace'
import type { LegendEntry } from '../../../lib/hrData'

/**
 * The attendance calendar: a Monday-first month grid with the status legend the
 * live app shows, weekend chips, and month / week / day / list view modes.
 */
export function AttendanceCalendar({
  note,
  select,
  legend,
}: {
  note: string
  select: string
  legend: LegendEntry[]
}) {
  const { appRecords } = useWorkspace()
  const [cursor, setCursor] = useState(() => new Date())
  const [view, setView] = useState('month')

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const today = new Date()

  // Monday-first: shift Sunday (0) to the end of the week.
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)

  const cells = Array.from({ length: Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7) * 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })

  const shift = (delta: number) => setCursor(new Date(year, month + delta, 1))
  // The picker offers whoever has actually been added under HR → Employees.
  const employees = appRecords['hr.employees'] ?? []
  const [who, setWho] = useState(select)
  const isThisMonth = year === today.getFullYear() && month === today.getMonth()

  return (
    <div className="space-y-5">
      <p className="max-w-4xl text-[15px] leading-relaxed text-fg-2">
        Who actually worked — attendance recorded per day, including work from home, absences and unpaid days. For who
        is <em>booked off</em>, use Leaves → Calendar.
        <span className="sr-only">{note}</span>
      </p>

      <select
        aria-label={select}
        value={who}
        onChange={(event) => setWho(event.target.value)}
        className="w-full max-w-sm rounded-xl border border-line bg-surface py-3 pr-8 pl-4 text-[15px] text-fg-2 transition hover:bg-surface-2 focus:border-accent focus:outline-none"
      >
        {[select, ...employees.map((item) => item.title)].map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => shift(-1)}
              aria-label="Previous month"
              className="rounded-lg border border-line px-2.5 py-1.5 text-fg-2 transition hover:bg-surface-2"
            >
              ‹
            </button>
            <button
              onClick={() => shift(1)}
              aria-label="Next month"
              className="rounded-lg border border-line px-2.5 py-1.5 text-fg-2 transition hover:bg-surface-2"
            >
              ›
            </button>
            <button
              onClick={() => setCursor(new Date())}
              disabled={isThisMonth}
              className="ml-1.5 rounded-lg px-3 py-1.5 text-[14px] text-fg-muted transition hover:bg-surface-2 disabled:opacity-50"
            >
              today
            </button>
          </div>

          <h3 className="text-xl font-semibold">
            {cursor.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
          </h3>

          <div className="flex overflow-hidden rounded-xl border border-line">
            {['month', 'week', 'day', 'list'].map((option) => (
              <button
                key={option}
                onClick={() => setView(option)}
                aria-pressed={view === option}
                className={`px-3.5 py-1.5 text-[14px] transition ${
                  view === option ? 'bg-accent/10 font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
          {legend.map((entry) => (
            <li key={entry.label} className="flex items-center gap-1.5 text-[13px] text-fg-2">
              <span aria-hidden className={`h-2 w-2 rounded-full ${entry.tone}`} />
              {entry.label}
            </li>
          ))}
        </ul>

        {view === 'month' ? (
          <div className="mt-5 overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-7 border-b border-line bg-surface-2/60">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="py-2.5 text-center text-[13px] font-medium text-fg-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {cells.map((date, index) => {
                const inMonth = date.getMonth() === month
                const isToday = date.toDateString() === today.toDateString()
                const isWeekend = date.getDay() === 0 || date.getDay() === 6

                return (
                  <div
                    key={index}
                    className={`min-h-[6.5rem] border-r border-b border-line p-2 last:border-r-0 ${
                      isToday ? 'bg-accent/10' : ''
                    }`}
                  >
                    <p
                      className={`text-right text-[14px] ${
                        isToday ? 'font-semibold text-accent' : inMonth ? 'text-fg' : 'text-fg-muted'
                      }`}
                    >
                      {date.getDate()}
                    </p>
                    {isWeekend && (
                      <p className="mt-1.5 flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[12px] text-fg-2">
                        <span aria-hidden>▦</span> Weekend
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="py-16 text-center text-[15px] text-fg-muted">
            No attendance recorded — nothing to show in {view} view.
          </p>
        )}
      </section>
    </div>
  )
}
