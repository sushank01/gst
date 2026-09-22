'use client'

import { useMemo, useState } from 'react'
import { Action } from '../../../components/AppChrome'
import { formatMinutes, useAttendance, useCalendars, useEmployees } from './useHr'
import type { AttendanceDay } from './useHr'

/**
 * The attendance calendar: a Monday-first month grid over settled days.
 *
 * Three things the transcribed screen asserted are gone. It never issued a
 * request, so every promised status was unreachable; it decided the weekend
 * from `getDay()`, which is confidently wrong for any workspace that does not
 * work Monday to Friday; and its other views said "no attendance recorded"
 * without ever having asked.
 *
 * What is drawn now comes from `GET /hr/attendance` and the tenant's own
 * working calendar. A day only has a row once it has been SETTLED from its
 * clock events — an unsettled day is blank here and is not called absence,
 * because nobody has worked out yet what it was.
 */

/** The statuses a settled day can carry, and how each one is drawn. */
const STATUS_TONES: Record<string, { label: string; dot: string; chip: string }> = {
  present: { label: 'Present', dot: 'bg-emerald-600', chip: 'tone-emerald' },
  half_day: { label: 'Half day', dot: 'bg-amber-300', chip: 'tone-amber' },
  leave: { label: 'Paid leave', dot: 'bg-teal-500', chip: 'tone-sky' },
  on_duty: { label: 'On duty', dot: 'bg-sky-400', chip: 'tone-sky' },
  absent: { label: 'Absent', dot: 'bg-rose-800', chip: 'tone-rose' },
  holiday: { label: 'Holiday', dot: 'bg-slate-800', chip: 'tone-slate' },
  weekly_off: { label: 'Weekly off', dot: 'bg-sky-200', chip: 'tone-slate' },
}

const iso = (date: Date) => date.toISOString().slice(0, 10)

export function AttendanceCalendar({ select }: { select: string }) {
  const [cursor, setCursor] = useState(() => new Date())
  const [view, setView] = useState('month')
  const [who, setWho] = useState('')

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const today = new Date()

  // Monday-first: shift Sunday (0) to the end of the week.
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)

  const cells = Array.from(
    { length: Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7) * 7 },
    (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    },
  )

  const employees = useEmployees({ limit: 200 })
  const calendars = useCalendars()
  const attendance = useAttendance({
    from: iso(new Date(Date.UTC(year, month, 1))),
    to: iso(new Date(Date.UTC(year, month + 1, 0))),
    employeeId: who || undefined,
    limit: 500,
  })

  /** Settled days indexed by date, so a cell is a lookup rather than a scan. */
  const byDate = useMemo(() => {
    const index = new Map<string, AttendanceDay[]>()
    for (const day of attendance.days) {
      const bucket = index.get(day.attendanceOn)
      if (bucket) bucket.push(day)
      else index.set(day.attendanceOn, [day])
    }
    return index
  }, [attendance.days])

  const calendar = calendars.defaultCalendar
  const workingWeekdays = useMemo(
    () => new Set(calendar?.hours.map((hour) => hour.weekday) ?? []),
    [calendar],
  )
  const holidays = useMemo(
    () => new Map((calendar?.holidays ?? []).map((holiday) => [holiday.observedOn, holiday.name])),
    [calendar],
  )

  const shift = (delta: number) => setCursor(new Date(year, month + delta, 1))
  const isThisMonth = year === today.getFullYear() && month === today.getMonth()

  /*
   * A month change keeps the previous month's rows in hand while the next
   * request is in flight. Those rows are keyed by their own dates, so they
   * match none of the new cells — the grid would draw a blank month, the legend
   * would describe the month you just left, and both would settle a moment
   * later. "Nothing was settled in March" is not something to say before March
   * has been asked about.
   */
  const settling = attendance.loading || attendance.refreshing
  const partial = !settling && attendance.total > attendance.days.length

  /** The statuses this month actually produced, so the key explains the grid. */
  const legendEntries = useMemo(() => {
    const seen = new Set(attendance.days.map((day) => day.status))
    return [...seen].map((status) => STATUS_TONES[status] ?? { label: status, dot: 'bg-slate-400', chip: 'tone-slate' })
  }, [attendance.days])
  const legend = settling ? [] : legendEntries

  return (
    <div className="space-y-5">
      {/*
        * The page spec carries a second copy of this sentence for screen
        * readers, and it does not match: it promises "work from home", which no
        * settled day can carry here. A reader who cannot see the grid was
        * getting the paragraph twice, the second time describing a calendar
        * that does not exist, so the spec's copy is not rendered.
        */}
      <p className="max-w-4xl text-[15px] leading-relaxed text-fg-2">
        Who actually worked — attendance recorded per day, including absences and unpaid days. For who is{' '}
        <em>booked off</em>, use Leaves → Calendar.
      </p>

      <div className="max-w-sm">
        <select
          aria-label={select}
          value={who}
          onChange={(event) => setWho(event.target.value)}
          className="w-full rounded-xl border border-line bg-surface py-3 pr-8 pl-4 text-[15px] text-fg-2 transition hover:bg-surface-2 focus:border-accent focus:outline-none"
        >
          {/* Options are keyed by employee id: attendance is addressed by id, and
              a picker keyed by display name cannot ask the server anything. */}
          <option value="">{select}</option>
          {employees.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName} · {employee.employeeNo}
            </option>
          ))}
        </select>

        {/* A picker that is short because its own request failed, or because it
            was capped, reads as "that colleague is not in this workspace". */}
        {employees.error ? (
          <p role="alert" className="mt-1.5 text-[12px] text-bad">
            {employees.denied
              ? 'You cannot see the employee directory, so this list is empty.'
              : 'The employee directory could not be loaded, so this list is empty.'}
          </p>
        ) : employees.total > employees.employees.length ? (
          <p className="mt-1.5 text-[12px] text-fg-muted">
            Showing the first {employees.employees.length} of {employees.total} employees.
          </p>
        ) : null}
      </div>

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

        {legend.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
            {legend.map((entry) => (
              <li key={entry.label} className="flex items-center gap-1.5 text-[13px] text-fg-2">
                <span aria-hidden className={`h-2 w-2 rounded-full ${entry.dot}`} />
                {entry.label}
              </li>
            ))}
          </ul>
        )}

        {!calendars.loading && !calendar && (
          <p className="mt-4 rounded-xl border border-warn/30 bg-warn-muted/40 px-4 py-3 text-[13px] text-warn">
            No working calendar is configured for this workspace, so non-working days and public holidays are not
            shaded. Settled days are still shown as they were recorded.
          </p>
        )}

        {partial && (
          <p className="mt-4 rounded-xl border border-warn/30 bg-warn-muted/40 px-4 py-3 text-[13px] text-warn">
            Showing {attendance.days.length} of {attendance.total} settled days this month. Pick a single employee for a
            complete grid.
          </p>
        )}

        {attendance.error ? (
          <div role="alert" className="mt-5 rounded-xl border border-bad/40 bg-bad-muted/30 px-6 py-10 text-center">
            <p className="text-[15px] font-medium text-fg">
              {attendance.denied
                ? 'You do not have access to attendance in this workspace.'
                : 'We could not load attendance for this month.'}
            </p>
            <p className="mt-1.5 text-[13px] text-fg-muted">{attendance.error.message}</p>
            {attendance.canRetry && (
              <div className="mt-4">
                <Action onClick={attendance.refetch}>Try again</Action>
              </div>
            )}
          </div>
        ) : settling ? (
          <p role="status" className="py-16 text-center text-[15px] text-fg-muted">
            Loading attendance for {cursor.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}…
          </p>
        ) : view === 'month' ? (
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
                const key = iso(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())))
                const settled = byDate.get(key) ?? []
                const holiday = holidays.get(key)
                // Only a configured calendar can say a day is non-working.
                const nonWorking = calendar ? !workingWeekdays.has(date.getDay()) : false

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

                    {holiday && (
                      <p className="mt-1.5 truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-[12px] text-fg-2" title={holiday}>
                        <span aria-hidden>★</span> {holiday}
                      </p>
                    )}
                    {!holiday && nonWorking && (
                      <p className="mt-1.5 flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[12px] text-fg-2">
                        <span aria-hidden>▦</span> Non-working
                      </p>
                    )}

                    {who
                      ? settled.map((day) => (
                          <p
                            key={day.employeeId}
                            className={`mt-1.5 rounded-md px-1.5 py-0.5 text-[12px] ${
                              STATUS_TONES[day.status]?.chip ?? 'tone-slate'
                            }`}
                          >
                            {STATUS_TONES[day.status]?.label ?? day.status}
                            {day.lateMinutes > 0 ? ` · ${formatMinutes(day.lateMinutes)} late` : ''}
                          </p>
                        ))
                      : settled.length > 0 && (
                          <p className="mt-1.5 rounded-md bg-surface-2 px-1.5 py-0.5 text-[12px] text-fg-2">
                            {settled.length} settled
                          </p>
                        )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : view === 'list' ? (
          attendance.days.length ? (
            <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line">
              {attendance.days.map((day) => (
                <li
                  key={`${day.employeeId}-${day.attendanceOn}`}
                  className="flex flex-wrap items-center gap-4 px-5 py-3 text-[14px]"
                >
                  <span className="min-w-[6rem] font-mono text-[13px]">{day.attendanceOn}</span>
                  <span className="min-w-[10rem] flex-1 font-medium">{day.employeeName}</span>
                  <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${STATUS_TONES[day.status]?.chip ?? 'tone-slate'}`}>
                    {STATUS_TONES[day.status]?.label ?? day.status}
                  </span>
                  <span className="font-mono text-[13px]">{formatMinutes(day.workedMinutes)}</span>
                  {day.overtimeMinutes > 0 && (
                    <span className="text-[12px] text-fg-muted">{formatMinutes(day.overtimeMinutes)} OT</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-16 text-center text-[15px] text-fg-muted">
              No attendance has been settled for {cursor.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}.
            </p>
          )
        ) : (
          // Saying "no attendance recorded" here would assert something nobody
          // checked; the week and day grids simply do not exist.
          <p className="py-16 text-center text-[15px] text-fg-muted">
            The {view} view is not available on this deployment. Use the month grid or the list.
          </p>
        )}
      </section>
    </div>
  )
}
