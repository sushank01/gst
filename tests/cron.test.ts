import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCron, isValidCron, isValidTimezone, nextOccurrence, occurrencesBetween, zonedTimeToUtc, localParts,
} from '../src/server/jobs/cron.ts'

const at = (iso: string) => new Date(iso)
const next = (cron: string, tz: string, from: string) => nextOccurrence(cron, tz, at(from))?.toISOString()

test('parses the five fields, ranges, steps, lists and names', () => {
  assert.deepEqual(parseCron('0 * * * *').minute.values, [0])
  assert.deepEqual(parseCron('0,30 * * * *').minute.values, [0, 30])
  assert.deepEqual(parseCron('*/15 * * * *').minute.values, [0, 15, 30, 45])
  assert.deepEqual(parseCron('0 9-11 * * *').hour.values, [9, 10, 11])
  assert.deepEqual(parseCron('0 0 * jan *').month.values, [1])
  assert.deepEqual(parseCron('0 0 * * mon').dayOfWeek.values, [1])
  assert.deepEqual(parseCron('0 0 * * 7').dayOfWeek.values, [0], 'both 0 and 7 mean Sunday')
  assert.equal(parseCron('@daily').hour.values[0], 0)
  assert.equal(parseCron('* * * * *').minute.any, true)
})

test('rejects malformed expressions instead of guessing', () => {
  for (const bad of ['', '* * * *', '* * * * * *', '60 * * * *', '* 24 * * *', '0 0 32 * *', '0 0 * 13 *', 'nonsense']) {
    assert.equal(isValidCron(bad), false, `${bad} must be rejected`)
  }
  assert.equal(isValidCron('*/5 9-17 * * 1-5'), true)
})

test('unknown timezones are rejected', () => {
  assert.equal(isValidTimezone('Europe/London'), true)
  assert.equal(isValidTimezone('Mars/Olympus'), false)
  assert.throws(() => nextOccurrence('0 9 * * *', 'Mars/Olympus', new Date()), /Unknown timezone/)
})

test('hourly and daily schedules in UTC', () => {
  assert.equal(next('0 * * * *', 'UTC', '2026-03-10T10:15:00Z'), '2026-03-10T11:00:00.000Z')
  assert.equal(next('0 9 * * *', 'UTC', '2026-03-10T10:15:00Z'), '2026-03-11T09:00:00.000Z')
  assert.equal(next('30 14 * * *', 'UTC', '2026-03-10T14:29:00Z'), '2026-03-10T14:30:00.000Z')
})

test('the occurrence is strictly after the given instant', () => {
  assert.equal(next('0 * * * *', 'UTC', '2026-03-10T11:00:00Z'), '2026-03-10T12:00:00.000Z')
})

test('a local 09:00 tracks the zone across DST, not a fixed UTC hour', () => {
  // London: GMT in winter, BST (UTC+1) in summer.
  assert.equal(next('0 9 * * *', 'Europe/London', '2026-01-15T00:00:00Z'), '2026-01-15T09:00:00.000Z')
  assert.equal(next('0 9 * * *', 'Europe/London', '2026-07-15T00:00:00Z'), '2026-07-15T08:00:00.000Z')

  // India has no DST and a half-hour offset — a common source of off-by-30 bugs.
  assert.equal(next('0 9 * * *', 'Asia/Kolkata', '2026-01-15T00:00:00Z'), '2026-01-15T03:30:00.000Z')
  assert.equal(next('0 9 * * *', 'Asia/Kolkata', '2026-07-15T00:00:00Z'), '2026-07-15T03:30:00.000Z')
})

test('spring forward: a job at a local time that does not exist still runs', () => {
  // 2026-03-29, London clocks jump 01:00 → 02:00, so 01:30 never happens.
  assert.equal(zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 1, minute: 30 }, 'Europe/London'), null)

  // The day before is a normal 01:30 GMT.
  assert.equal(next('30 1 * * *', 'Europe/London', '2026-03-28T00:00:00Z'), '2026-03-28T01:30:00.000Z')

  // On the gap day it runs at the first instant that exists — 02:00 local —
  // rather than being skipped for that day.
  const acrossGap = nextOccurrence('30 1 * * *', 'Europe/London', at('2026-03-28T12:00:00Z'))
  assert.equal(acrossGap?.toISOString(), '2026-03-29T01:00:00.000Z')
  assert.equal(localParts(acrossGap, 'Europe/London').hour, 2, 'runs at 02:00 local, just after the gap')

  // And it resumes normally the following day.
  assert.equal(next('30 1 * * *', 'Europe/London', '2026-03-29T12:00:00Z'), '2026-03-30T00:30:00.000Z')
})

test('fall back: an hourly job runs once per real hour, not twice at the repeat', () => {
  // 2026-10-25, London clocks go back 02:00 → 01:00, so 01:xx local happens twice.
  const window = occurrencesBetween('0 * * * *', 'Europe/London', at('2026-10-25T00:00:00Z'), at('2026-10-25T05:00:00Z'))
  const iso = window.map((d) => d.toISOString())
  assert.equal(new Set(iso).size, iso.length, 'no duplicate instants')
  // Each successive occurrence is exactly one real hour later.
  for (let i = 1; i < window.length; i += 1) {
    assert.equal(window[i].getTime() - window[i - 1].getTime(), 3_600_000, 'one real hour apart')
  }
})

test('day-of-month and weekday are OR-ed when both are restricted', () => {
  // "1st of the month, or any Monday" — requiring both would never fire.
  const first = nextOccurrence('0 0 1 * mon', 'UTC', at('2026-03-03T00:00:00Z'))
  assert.equal(first?.toISOString(), '2026-03-09T00:00:00.000Z', 'the next Monday')
  const monthStart = nextOccurrence('0 0 1 * mon', 'UTC', at('2026-03-29T00:00:00Z'))
  assert.equal(monthStart?.toISOString(), '2026-03-30T00:00:00.000Z', 'Monday 30 March comes first')
})

test('month-end schedules skip months without that day', () => {
  const feb = nextOccurrence('0 0 31 * *', 'UTC', at('2026-01-31T12:00:00Z'))
  assert.equal(feb?.toISOString(), '2026-03-31T00:00:00.000Z', 'February has no 31st')
})

test('29 February is found in the next leap year rather than scanned forever', () => {
  const leap = nextOccurrence('0 0 29 2 *', 'UTC', at('2026-03-01T00:00:00Z'))
  assert.equal(leap?.toISOString(), '2028-02-29T00:00:00.000Z')
})

test('weekday business-hours schedules skip the weekend', () => {
  // 2026-03-07 is a Saturday.
  const monday = nextOccurrence('0 9 * * 1-5', 'UTC', at('2026-03-07T00:00:00Z'))
  assert.equal(monday?.toISOString(), '2026-03-09T09:00:00.000Z')
})

test('occurrencesBetween is bounded and ordered', () => {
  const list = occurrencesBetween('*/10 * * * *', 'UTC', at('2026-03-10T00:00:00Z'), at('2026-03-10T01:00:00Z'))
  assert.deepEqual(
    list.map((d) => d.toISOString().slice(11, 16)),
    ['00:10', '00:20', '00:30', '00:40', '00:50', '01:00'],
  )
  const capped = occurrencesBetween('* * * * *', 'UTC', at('2026-03-10T00:00:00Z'), at('2026-03-20T00:00:00Z'), 5)
  assert.equal(capped.length, 5, 'a long outage cannot produce an unbounded burst')
})

test('localParts reads the wall clock in the target zone', () => {
  const parts = localParts(at('2026-07-15T08:00:00Z'), 'Europe/London')
  assert.equal(parts.hour, 9, 'BST is UTC+1')
  assert.equal(parts.weekday, 3, 'Wednesday')
  assert.equal(localParts(at('2026-07-15T00:00:00Z'), 'UTC').hour, 0, 'midnight reads as 0, not 24')
})
