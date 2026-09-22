/**
 * Five-field cron with real IANA timezone support.
 *
 * "Every day at 09:00 Europe/London" is a different UTC instant in summer and
 * winter. Storing only a UTC time silently shifts a customer's schedule twice a
 * year, so occurrences are computed in the schedule's own zone and converted.
 *
 * The two awkward DST cases are handled explicitly rather than left to chance:
 *   * a local time that does not exist (clocks jump forward) runs at the first
 *     instant after the gap, so a 02:30 job still runs on the spring-forward day
 *   * a local time that happens twice (clocks go back) runs once, on the first
 *     occurrence, so nothing is billed or emailed twice
 *
 * No dependency: `Intl.DateTimeFormat` already knows every zone and its rules.
 */

export type CronField = { values: number[]; any: boolean }
export type CronSpec = {
  minute: CronField
  hour: CronField
  dayOfMonth: CronField
  month: CronField
  dayOfWeek: CronField
}

const RANGES: Record<keyof CronSpec, [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 6],
}

const NAMED: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function parseField(raw: string, field: keyof CronSpec): CronField {
  const [min, max] = RANGES[field]
  const text = raw.trim().toLowerCase()
  if (!text) throw new Error(`Empty ${field} in cron expression.`)
  if (text === '*') return { values: [], any: true }

  const values = new Set<number>()
  for (const part of text.split(',')) {
    const [range, stepText] = part.split('/')
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid step in ${field}: ${part}`)

    let from = min
    let to = max
    if (range !== '*') {
      const [startText, endText] = range.split('-')
      from = toNumber(startText, field)
      to = endText === undefined ? (stepText === undefined ? from : max) : toNumber(endText, field)
    }
    if (from < min || to > max || from > to) throw new Error(`Out of range ${field}: ${part}`)
    for (let value = from; value <= to; value += step) values.add(value)
  }
  return { values: [...values].sort((a, b) => a - b), any: false }
}

function toNumber(text: string, field: keyof CronSpec): number {
  if (field === 'month') {
    const index = MONTHS.indexOf(text)
    if (index >= 0) return index + 1
  }
  if (field === 'dayOfWeek') {
    const index = DAYS.indexOf(text)
    if (index >= 0) return index
    // Both 0 and 7 mean Sunday in common cron dialects.
    if (text === '7') return 0
  }
  const value = Number(text)
  if (!Number.isInteger(value)) throw new Error(`Invalid ${field}: ${text}`)
  return value
}

export function parseCron(expression: string): CronSpec {
  const normalised = NAMED[expression.trim().toLowerCase()] ?? expression
  const parts = normalised.trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error(`Expected 5 cron fields (minute hour day month weekday), got ${parts.length}.`)
  }
  return {
    minute: parseField(parts[0], 'minute'),
    hour: parseField(parts[1], 'hour'),
    dayOfMonth: parseField(parts[2], 'dayOfMonth'),
    month: parseField(parts[3], 'month'),
    dayOfWeek: parseField(parts[4], 'dayOfWeek'),
  }
}

export function isValidCron(expression: string): boolean {
  try {
    parseCron(expression)
    return true
  } catch {
    return false
  }
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

const partsFormatter = (timezone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  })

/** The wall-clock reading in `timezone` at a given instant. */
export function localParts(instant: Date, timezone: string): LocalParts {
  const parts = partsFormatter(timezone).formatToParts(instant)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '0'
  const weekdayName = (parts.find((part) => part.type === 'weekday')?.value ?? 'Sun').slice(0, 3).toLowerCase()
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    // Intl renders midnight as 24 in some locales/zones under hour12: false.
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: Math.max(0, DAYS.indexOf(weekdayName)),
  }
}

/** Offset in minutes that `timezone` is ahead of UTC at `instant`. */
function offsetMinutes(instant: Date, timezone: string): number {
  const parts = localParts(instant, timezone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  // Seconds are dropped by the formatter, so compare on whole minutes.
  return Math.round((asUtc - Math.floor(instant.getTime() / 60_000) * 60_000) / 60_000)
}

/**
 * The UTC instant for a wall-clock time in `timezone`.
 *
 * Returns null when that local time does not exist (a spring-forward gap) —
 * callers decide what to do rather than getting a plausible wrong answer.
 */
export function zonedTimeToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timezone: string,
): Date | null {
  const naive = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute)
  // Two passes converge because the offset only depends on the instant, and the
  // first guess is already within an hour of it.
  let instant = new Date(naive - offsetMinutes(new Date(naive), timezone) * 60_000)
  instant = new Date(naive - offsetMinutes(instant, timezone) * 60_000)

  const check = localParts(instant, timezone)
  const matches =
    check.year === local.year &&
    check.month === local.month &&
    check.day === local.day &&
    check.hour === local.hour &&
    check.minute === local.minute
  return matches ? instant : null
}


const MINUTE = 60_000
const DAY_MS = 86_400_000
/** Four years of days: enough to reach the next 29 February from any start. */
const MAX_SCAN_DAYS = 366 * 4

/** Candidate minutes-of-day this spec allows, ascending. */
function minutesOfDay(spec: CronSpec): number[] {
  const hours = spec.hour.any ? range(0, 23) : spec.hour.values
  const minutes = spec.minute.any ? range(0, 59) : spec.minute.values
  const out: number[] = []
  for (const hour of hours) for (const minute of minutes) out.push(hour * 60 + minute)
  return out.sort((a, b) => a - b)
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index)

/** Does this calendar day satisfy month / day-of-month / weekday? */
function dayMatches(spec: CronSpec, parts: LocalParts): boolean {
  const ok = (field: CronField, value: number) => field.any || field.values.includes(value)
  if (!ok(spec.month, parts.month)) return false

  /*
   * Classic cron semantics: when day-of-month and weekday are both restricted,
   * a match on *either* counts. Requiring both would silently stop "1st of the
   * month, or any Monday" from ever firing.
   */
  const domRestricted = !spec.dayOfMonth.any
  const dowRestricted = !spec.dayOfWeek.any
  const domMatch = ok(spec.dayOfMonth, parts.day)
  const dowMatch = ok(spec.dayOfWeek, parts.weekday)
  if (domRestricted && dowRestricted) return domMatch || dowMatch
  return domMatch && dowMatch
}

/**
 * Resolves a local wall-clock time to the instant it should run at.
 *
 * Normal times convert directly. A time inside a spring-forward gap does not
 * exist, so the job runs at the first instant after the gap rather than being
 * skipped for the day. An ambiguous time (autumn fall-back happens twice) runs
 * at the *earlier* of the two, so nothing is billed or emailed twice.
 */
function resolveLocal(
  day: { year: number; month: number; day: number },
  minuteOfDay: number,
  timezone: string,
): Date | null {
  const hour = Math.floor(minuteOfDay / 60)
  const minute = minuteOfDay % 60
  const exact = zonedTimeToUtc({ ...day, hour, minute }, timezone)
  if (exact) {
    // Two instants can read as the same wall clock; take the earlier one.
    const earlier = new Date(exact.getTime() - 3_600_000)
    const readsSame = (() => {
      const parts = localParts(earlier, timezone)
      return parts.year === day.year && parts.month === day.month && parts.day === day.day &&
        parts.hour === hour && parts.minute === minute
    })()
    return readsSame ? earlier : exact
  }

  // Inside a gap: walk forward to the first minute that exists.
  for (let step = 1; step <= 180; step += 1) {
    const total = minuteOfDay + step
    if (total >= 24 * 60) return null
    const candidate = zonedTimeToUtc({ ...day, hour: Math.floor(total / 60), minute: total % 60 }, timezone)
    if (candidate) return candidate
  }
  return null
}

/**
 * The first occurrence strictly after `after`.
 *
 * Scans day by day in the target zone, then only the minutes the spec allows
 * within a matching day. A naive minute-by-minute scan is obviously correct but
 * took 28 seconds to find the next 29 February; this finds it in milliseconds
 * while still being evaluated entirely in the schedule's own timezone.
 */
export function nextOccurrence(
  expression: string,
  timezone: string,
  after: Date,
  maxDays = MAX_SCAN_DAYS,
): Date | null {
  const spec = parseCron(expression)
  if (!isValidTimezone(timezone)) throw new Error(`Unknown timezone: ${timezone}`)

  const candidates = minutesOfDay(spec)
  const floor = Math.floor(after.getTime() / MINUTE) * MINUTE

  // Start from the local day containing `after`, and step by local calendar day.
  let probe = new Date(floor)
  for (let dayIndex = 0; dayIndex <= maxDays; dayIndex += 1) {
    const parts = localParts(probe, timezone)
    if (dayMatches(spec, parts)) {
      const day = { year: parts.year, month: parts.month, day: parts.day }
      for (const minuteOfDay of candidates) {
        const instant = resolveLocal(day, minuteOfDay, timezone)
        if (instant && instant.getTime() > floor) return instant
      }
    }
    /*
     * Advance to roughly midday of the next local day. Midday avoids landing
     * inside a DST transition, which could otherwise skip or repeat a day.
     */
    const midday = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0)
    probe = new Date(midday + DAY_MS)
  }
  return null
}

/**
 * Every occurrence in `(after, until]`, capped.
 *
 * Used by a dispatcher that was down: it catches up bounded work rather than
 * either losing the runs or firing hundreds at once.
 */
export function occurrencesBetween(
  expression: string,
  timezone: string,
  after: Date,
  until: Date,
  cap = 100,
): Date[] {
  const out: Date[] = []
  let cursor = after
  while (out.length < cap) {
    const next = nextOccurrence(expression, timezone, cursor)
    if (!next || next.getTime() > until.getTime()) break
    out.push(next)
    cursor = next
  }
  return out
}

/** Human description of the next few runs, for the schedule UI. */
export function describeUpcoming(expression: string, timezone: string, from: Date, count = 3): string[] {
  const out: string[] = []
  let cursor = from
  for (let index = 0; index < count; index += 1) {
    const next = nextOccurrence(expression, timezone, cursor)
    if (!next) break
    out.push(next.toISOString())
    cursor = next
  }
  return out
}
