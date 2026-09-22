import { localParts, zonedTimeToUtc } from '../jobs/cron.ts'

/**
 * Business-hours arithmetic.
 *
 * An SLA that counts wall-clock time is wrong out of hours: a four-hour target
 * started at 17:00 on Friday is not breached at 21:00. These two functions are
 * what make "four working hours" mean four working hours, in the calendar's own
 * timezone, skipping weekends and holidays.
 */

export type BusinessHour = { weekday: number; opensMinute: number; closesMinute: number }

export type Calendar = {
  timezone: string
  hours: BusinessHour[]
  /** ISO dates (YYYY-MM-DD) in the calendar's own timezone. */
  holidays: Set<string>
}

const DAY_MS = 86_400_000
const MINUTE_MS = 60_000

const isoDate = (parts: { year: number; month: number; day: number }) =>
  `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`

/** Open windows on the calendar day containing `instant`, in minutes-of-day. */
function windowsFor(instant: Date, calendar: Calendar): { parts: ReturnType<typeof localParts>; windows: BusinessHour[] } {
  const parts = localParts(instant, calendar.timezone)
  if (calendar.holidays.has(isoDate(parts))) return { parts, windows: [] }
  const windows = calendar.hours
    .filter((hour) => hour.weekday === parts.weekday)
    .sort((a, b) => a.opensMinute - b.opensMinute)
  return { parts, windows }
}

/** The UTC instant for a minute-of-day on the local date of `reference`. */
function instantAt(reference: { year: number; month: number; day: number }, minuteOfDay: number, timezone: string): Date {
  const resolved = zonedTimeToUtc(
    { ...reference, hour: Math.floor(minuteOfDay / 60) % 24, minute: minuteOfDay % 60 },
    timezone,
  )
  // A DST gap can swallow an opening minute; fall back to the next valid one.
  if (resolved) return resolved
  for (let step = 1; step <= 120; step += 1) {
    const next = zonedTimeToUtc(
      { ...reference, hour: Math.floor((minuteOfDay + step) / 60) % 24, minute: (minuteOfDay + step) % 60 },
      timezone,
    )
    if (next) return next
  }
  return new Date(NaN)
}

/**
 * Working minutes between two instants. Negative when `to` is before `from`.
 *
 * Walks day by day rather than minute by minute — a year-long span must not
 * cost half a million iterations.
 */
export function businessMinutesBetween(from: Date, to: Date, calendar: Calendar, maxDays = 400): number {
  if (to.getTime() === from.getTime()) return 0
  if (to.getTime() < from.getTime()) return -businessMinutesBetween(to, from, calendar, maxDays)

  let total = 0
  /*
   * The day pointer sits at local midday — far from any DST transition, so
   * "the next day" is always the next day. The clipping bounds come from
   * `from`/`to` separately: using the pointer as the lower bound would clip
   * away every morning after the first, which is exactly the bug this shape
   * avoids.
   */
  let dayPointer = from
  const lastDay = isoDate(localParts(to, calendar.timezone))

  for (let day = 0; day <= maxDays; day += 1) {
    const { parts, windows } = windowsFor(dayPointer, calendar)
    for (const window of windows) {
      const opens = instantAt(parts, window.opensMinute, calendar.timezone)
      const closes = instantAt(parts, window.closesMinute, calendar.timezone)
      const start = Math.max(opens.getTime(), from.getTime())
      const end = Math.min(closes.getTime(), to.getTime())
      if (end > start) total += Math.round((end - start) / MINUTE_MS)
    }
    if (isoDate(parts) >= lastDay) break
    dayPointer = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0) + DAY_MS)
  }
  return total
}

/**
 * The instant `minutes` of working time after `from`.
 *
 * This is what an SLA due date is: start the clock at 17:00 Friday with a
 * four-hour target and the deadline lands on Monday morning, not Friday night.
 */
export function addBusinessMinutes(from: Date, minutes: number, calendar: Calendar, maxDays = 400): Date {
  if (minutes <= 0) return from
  let remaining = minutes
  let dayPointer = from

  for (let day = 0; day <= maxDays; day += 1) {
    const { parts, windows } = windowsFor(dayPointer, calendar)
    for (const window of windows) {
      const opens = instantAt(parts, window.opensMinute, calendar.timezone)
      const closes = instantAt(parts, window.closesMinute, calendar.timezone)
      // Only the first day is clipped by `from`; later days open normally.
      const start = Math.max(opens.getTime(), from.getTime())
      if (closes.getTime() <= start) continue
      const available = Math.round((closes.getTime() - start) / MINUTE_MS)
      if (available >= remaining) return new Date(start + remaining * MINUTE_MS)
      remaining -= available
    }
    dayPointer = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0) + DAY_MS)
  }
  // A calendar with no open hours at all would otherwise loop forever.
  return new Date(from.getTime() + minutes * MINUTE_MS)
}

/** Monday–Friday, 09:00–17:00, no holidays. The default when none is configured. */
export const standardWeek = (timezone = 'UTC'): Calendar => ({
  timezone,
  hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensMinute: 9 * 60, closesMinute: 17 * 60 })),
  holidays: new Set(),
})
