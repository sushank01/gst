import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import type { Calendar } from './calendar.ts'
import { localParts } from '../jobs/cron.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Attendance: clock events and the settled day.
 *
 * Worked time is DERIVED from punches, never typed in. A punch is an interval
 * with a start and an optional end, and an employee may have at most one open
 * interval at a time — enforced by a partial unique index, so two devices
 * clocking the same person in cannot both succeed. "Forgot to clock out" then
 * shows up as a visible open row that somebody must close, rather than as a
 * silently missing day or a guessed eight hours.
 *
 * A day is settled by summing the intervals that fall in it and comparing them
 * to the shift. Settling is idempotent: running it again recomputes the same
 * numbers rather than adding to them.
 */

export type PunchRow = {
  id: string
  employeeId: string
  punchedInAt: string
  punchedOutAt: string | null
  minutes: number | null
}

const MINUTE = 60_000

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / MINUTE))
}

async function employeeOf(db: Db, ctx: TenantContext, employeeId: string): Promise<{ id: string; status: string }> {
  const { rows } = await db.query<{ id: string; status: string }>(
    'select id, status from hr_employees where id = $1 and tenant_id = $2 and archived_at is null',
    [employeeId, ctx.tenantId],
  )
  if (!rows[0]) throw notFound('That employee')
  return rows[0]
}

/**
 * Clocks someone in.
 *
 * Refused if they are already clocked in — the alternative is two overlapping
 * intervals, and no honest way to decide which one the day's hours came from.
 */
export async function punchIn(
  ctx: TenantContext,
  employeeId: string,
  input: { at?: Date; source?: string; note?: string | null } = {},
): Promise<PunchRow> {
  ctx.require('record.create')
  const at = input.at ?? ctx.now

  return ctx.db.transaction(async (tx) => {
    const employee = await employeeOf(tx, ctx, employeeId)
    if (employee.status === 'exited') throw unprocessable('employee_exited', 'That employee has left.')

    const { rows: open } = await tx.query<{ punched_in_at: Date }>(
      'select punched_in_at from hr_attendance_punches where employee_id = $1 and punched_out_at is null',
      [employeeId],
    )
    if (open[0]) {
      throw conflict(`Already clocked in at ${new Date(open[0].punched_in_at).toISOString()}. Clock out first.`)
    }

    // A punch that starts before the last one ended would interleave with it.
    const { rows: last } = await tx.query<{ punched_out_at: Date | null }>(
      'select punched_out_at from hr_attendance_punches where employee_id = $1 order by punched_in_at desc limit 1',
      [employeeId],
    )
    if (last[0]?.punched_out_at && new Date(last[0].punched_out_at).getTime() > at.getTime()) {
      throw unprocessable('punch_overlaps', 'That clock-in is before the previous clock-out.')
    }

    const { rows } = await tx.query<{ id: string }>(
      `insert into hr_attendance_punches (tenant_id, employee_id, punched_in_at, source, in_note)
       values ($1,$2,$3,$4,$5) returning id`,
      [ctx.tenantId, employeeId, at, input.source ?? 'web', input.note ?? null],
    )
    return { id: rows[0].id, employeeId, punchedInAt: at.toISOString(), punchedOutAt: null, minutes: null }
  })
}

export async function punchOut(
  ctx: TenantContext,
  employeeId: string,
  input: { at?: Date; note?: string | null } = {},
): Promise<PunchRow> {
  ctx.require('record.update')
  const at = input.at ?? ctx.now

  return ctx.db.transaction(async (tx) => {
    const { rows: open } = await tx.query<{ id: string; punched_in_at: Date }>(
      `select id, punched_in_at from hr_attendance_punches
        where employee_id = $1 and tenant_id = $2 and punched_out_at is null for update`,
      [employeeId, ctx.tenantId],
    )
    if (!open[0]) throw unprocessable('not_clocked_in', 'That employee is not clocked in.')

    const start = new Date(open[0].punched_in_at)
    if (at.getTime() <= start.getTime()) throw unprocessable('punch_ordering', 'A clock-out must come after its clock-in.')

    await tx.query('update hr_attendance_punches set punched_out_at = $2, out_note = $3 where id = $1', [
      open[0].id,
      at,
      input.note ?? null,
    ])
    return {
      id: open[0].id,
      employeeId,
      punchedInAt: start.toISOString(),
      punchedOutAt: at.toISOString(),
      minutes: minutesBetween(start, at),
    }
  })
}

export async function openPunch(ctx: TenantContext, employeeId: string): Promise<PunchRow | null> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{ id: string; punched_in_at: Date }>(
    'select id, punched_in_at from hr_attendance_punches where employee_id = $1 and tenant_id = $2 and punched_out_at is null',
    [employeeId, ctx.tenantId],
  )
  if (!rows[0]) return null
  return {
    id: rows[0].id,
    employeeId,
    punchedInAt: new Date(rows[0].punched_in_at).toISOString(),
    punchedOutAt: null,
    minutes: null,
  }
}

export type SettledDay = {
  employeeId: string
  attendanceOn: string
  status: string
  workedMinutes: number
  overtimeMinutes: number
  lateMinutes: number
}

type ShiftRow = { id: string; starts_minute: number; ends_minute: number; break_minutes: number; grace_minutes: number; weekdays: number[] }

async function shiftFor(db: Db, ctx: TenantContext, employeeId: string, on: string): Promise<ShiftRow | null> {
  const { rows } = await db.query<ShiftRow>(
    `select s.id, s.starts_minute, s.ends_minute, s.break_minutes, s.grace_minutes, s.weekdays
       from hr_shift_assignments a
       join hr_shifts s on s.id = a.shift_id
      where a.employee_id = $1 and a.tenant_id = $2
        and a.effective_from <= $3 and (a.effective_to is null or a.effective_to >= $3)
      order by a.effective_from desc limit 1`,
    [employeeId, ctx.tenantId, on],
  )
  return rows[0] ?? null
}

/**
 * Settles one day from the punches that fall in it.
 *
 * Idempotent by construction: the row is upserted with recomputed values, so
 * re-running the settlement — from a retried job, or from an administrator
 * pressing the button again — produces the same numbers rather than doubling
 * them. Leave and holidays win over an empty day, so a public holiday is not
 * reported as absence.
 */
export async function settleDay(
  ctx: TenantContext,
  employeeId: string,
  attendanceOn: string,
  calendar?: Calendar | null,
): Promise<SettledDay> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    await employeeOf(tx, ctx, employeeId)

    const dayStart = new Date(`${attendanceOn}T00:00:00Z`)
    const dayEnd = new Date(dayStart.getTime() + 86_400_000)

    /*
     * Intervals are clipped to the day, so an overnight shift contributes its
     * hours to the day they were actually worked in rather than all landing on
     * the clock-in date.
     */
    const { rows: punches } = await tx.query<{ punched_in_at: Date; punched_out_at: Date | null }>(
      `select punched_in_at, punched_out_at from hr_attendance_punches
        where employee_id = $1 and tenant_id = $2
          and punched_in_at < $4 and coalesce(punched_out_at, $4) > $3`,
      [employeeId, ctx.tenantId, dayStart, dayEnd],
    )
    let worked = 0
    for (const punch of punches) {
      if (!punch.punched_out_at) continue // still open: not yet time worked
      const from = new Date(Math.max(new Date(punch.punched_in_at).getTime(), dayStart.getTime()))
      const to = new Date(Math.min(new Date(punch.punched_out_at).getTime(), dayEnd.getTime()))
      worked += minutesBetween(from, to)
    }

    const { rows: leave } = await tx.query<{ request_id: string; portion: string }>(
      `select d.request_id, d.portion::text as portion
         from hr_leave_request_days d
         join hr_leave_requests r on r.id = d.request_id
        where d.employee_id = $1 and d.leave_on = $2 and r.status = 'approved'`,
      [employeeId, attendanceOn],
    )

    const shift = await shiftFor(tx, ctx, employeeId, attendanceOn)
    const weekday = localParts(dayStart, calendar?.timezone ?? 'UTC').weekday
    const isHoliday = calendar?.holidays?.has(attendanceOn) ?? false
    /*
     * A shift's own weekdays decide the week off when one is assigned. With no
     * shift we fall back to the working calendar; with neither, we do not guess
     * — an unconfigured workspace reports absence, not an invented weekend.
     */
    const isWeeklyOff = shift
      ? shift.weekdays.length > 0 && !shift.weekdays.includes(weekday)
      : Boolean(calendar) && !calendar!.hours.some((hour) => hour.weekday === weekday)

    let status: SettledDay['status']
    if (worked > 0) status = 'present'
    else if (leave[0]) status = Number(leave[0].portion) < 1 ? 'half_day' : 'leave'
    else if (isHoliday) status = 'holiday'
    else if (isWeeklyOff) status = 'weekly_off'
    else status = 'absent'
    if (worked > 0 && leave[0] && Number(leave[0].portion) < 1) status = 'half_day'

    let late = 0
    let overtime = 0
    if (shift) {
      const scheduled = Math.max(0, shift.ends_minute - shift.starts_minute - shift.break_minutes)
      if (worked > scheduled) overtime = worked - scheduled
      const first = punches
        .map((punch) => new Date(punch.punched_in_at))
        .filter((at) => at >= dayStart && at < dayEnd)
        .sort((a, b) => a.getTime() - b.getTime())[0]
      if (first) {
        const minuteOfDay = first.getUTCHours() * 60 + first.getUTCMinutes()
        const allowed = shift.starts_minute + shift.grace_minutes
        if (minuteOfDay > allowed) late = minuteOfDay - allowed
      }
    }

    await tx.query(
      `insert into hr_attendance_days
         (tenant_id, employee_id, attendance_on, status, worked_minutes, overtime_minutes, late_minutes, shift_id, leave_request_id, settled_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (employee_id, attendance_on) do update
         set status = excluded.status,
             worked_minutes = excluded.worked_minutes,
             overtime_minutes = excluded.overtime_minutes,
             late_minutes = excluded.late_minutes,
             shift_id = excluded.shift_id,
             leave_request_id = excluded.leave_request_id,
             settled_at = excluded.settled_at`,
      [
        ctx.tenantId,
        employeeId,
        attendanceOn,
        status,
        worked,
        overtime,
        late,
        shift?.id ?? null,
        leave[0]?.request_id ?? null,
        ctx.now,
      ],
    )
    return { employeeId, attendanceOn, status, workedMinutes: worked, overtimeMinutes: overtime, lateMinutes: late }
  })
}

export async function attendanceBetween(
  ctx: TenantContext,
  employeeId: string,
  from: string,
  to: string,
): Promise<SettledDay[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{
    attendance_on: Date
    status: string
    worked_minutes: number
    overtime_minutes: number
    late_minutes: number
  }>(
    `select attendance_on, status, worked_minutes, overtime_minutes, late_minutes
       from hr_attendance_days
      where employee_id = $1 and tenant_id = $2 and attendance_on between $3 and $4
      order by attendance_on`,
    [employeeId, ctx.tenantId, from, to],
  )
  return rows.map((row) => ({
    employeeId,
    attendanceOn: new Date(row.attendance_on).toISOString().slice(0, 10),
    status: row.status,
    workedMinutes: row.worked_minutes,
    overtimeMinutes: row.overtime_minutes,
    lateMinutes: row.late_minutes,
  }))
}

/**
 * Closes punches left open past a cut-off.
 *
 * They are closed at the shift end, not at "now" — crediting somebody with the
 * hours between their forgotten clock-out and the moment an administrator
 * noticed would be inventing time. Each closure is noted so it is visibly a
 * correction rather than a real punch.
 */
export async function closeAbandonedPunches(ctx: TenantContext, olderThan: Date): Promise<{ closed: number }> {
  ctx.require('settings.manage')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; employee_id: string; punched_in_at: Date }>(
      `select id, employee_id, punched_in_at from hr_attendance_punches
        where tenant_id = $1 and punched_out_at is null and punched_in_at < $2 for update`,
      [ctx.tenantId, olderThan],
    )
    let closed = 0
    for (const punch of rows) {
      const start = new Date(punch.punched_in_at)
      const shift = await shiftFor(tx, ctx, punch.employee_id, start.toISOString().slice(0, 10))
      const endMinute = shift ? shift.ends_minute : 0
      const closeAt = shift
        ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()) + endMinute * MINUTE)
        : start
      // Never before the clock-in; a shift that ended before they arrived means
      // zero worked minutes, not negative ones.
      const settledAt = closeAt.getTime() > start.getTime() ? closeAt : new Date(start.getTime() + MINUTE)
      await tx.query(
        `update hr_attendance_punches set punched_out_at = $2, out_note = $3 where id = $1`,
        [punch.id, settledAt, 'closed automatically: no clock-out recorded'],
      )
      closed += 1
    }
    if (closed) {
      await recordAudit(tx, ctx, { action: 'hr.punches_auto_closed', resource: 'attendance', detail: { closed } })
    }
    return { closed }
  })
}

export type AttendanceDayRow = SettledDay & {
  employeeName: string
  departmentName: string | null
}

export type AttendanceTotals = { days: number; workedMinutes: number; overtimeMinutes: number }

export type AttendanceAcrossOptions = {
  from: string
  to: string
  employeeId?: string
  departmentId?: string
  status?: string
  /** Only days that carry at least this much overtime — the overtime report. */
  minOvertimeMinutes?: number
  limit?: number
  offset?: number
}

/**
 * Settled days across the tenant.
 *
 * `attendanceBetween` answers for one person; a calendar showing "everyone" and
 * an overtime report over a range need the whole org, and they need the totals
 * for the WHOLE filter rather than for the page that happens to be loaded —
 * otherwise "total overtime in range" changes when you turn the page.
 *
 * Only settled days exist here. A day that was punched but never settled has
 * no row, which is why the screens say "not settled" rather than "absent".
 */
export async function attendanceAcross(
  ctx: TenantContext,
  options: AttendanceAcrossOptions,
): Promise<{ rows: AttendanceDayRow[]; total: number; totals: AttendanceTotals }> {
  ctx.require('record.read')

  const filters = ['a.tenant_id = $1', 'a.attendance_on between $2 and $3']
  const params: unknown[] = [ctx.tenantId, options.from, options.to]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.employeeId) add('a.employee_id = $?', options.employeeId)
  if (options.departmentId) add('e.department_id = $?', options.departmentId)
  if (options.status) add('a.status = $?', options.status)
  if (options.minOvertimeMinutes !== undefined) add('a.overtime_minutes >= $?', options.minOvertimeMinutes)
  const where = filters.join(' and ')

  const from = `from hr_attendance_days a join hr_employees e on e.id = a.employee_id`

  const { rows: summary } = await ctx.db.query<{ n: string; worked: string; overtime: string }>(
    `select count(*)::text as n,
            coalesce(sum(a.worked_minutes), 0)::text as worked,
            coalesce(sum(a.overtime_minutes), 0)::text as overtime
       ${from} where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 100, 500), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<{
    employee_id: string
    employee_name: string
    department_name: string | null
    attendance_on: Date
    status: string
    worked_minutes: number
    overtime_minutes: number
    late_minutes: number
  }>(
    `select a.employee_id, e.full_name as employee_name, d.name as department_name,
            a.attendance_on, a.status, a.worked_minutes, a.overtime_minutes, a.late_minutes
       ${from}
       left join hr_departments d on d.id = e.department_id
      where ${where}
      order by a.attendance_on desc, e.full_name
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )

  return {
    total: Number(summary[0].n),
    totals: {
      days: Number(summary[0].n),
      workedMinutes: Number(summary[0].worked),
      overtimeMinutes: Number(summary[0].overtime),
    },
    rows: rows.map((row) => ({
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      departmentName: row.department_name,
      attendanceOn: new Date(row.attendance_on).toISOString().slice(0, 10),
      status: row.status,
      workedMinutes: row.worked_minutes,
      overtimeMinutes: row.overtime_minutes,
      lateMinutes: row.late_minutes,
    })),
  }
}

/* --------------------------------- shifts --------------------------------- */

export type Shift = {
  id: string
  name: string
  startsMinute: number
  endsMinute: number
  breakMinutes: number
  graceMinutes: number
  /** 0 = Sunday. Empty means the shift runs every day. */
  weekdays: number[]
}

export type ShiftAssignment = {
  id: string
  employeeId: string
  employeeName: string
  shiftId: string
  shiftName: string
  effectiveFrom: string
  effectiveTo: string | null
}

export async function listShifts(ctx: TenantContext, includeArchived = false): Promise<Shift[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<ShiftRow & { name: string }>(
    `select id, name, starts_minute, ends_minute, break_minutes, grace_minutes, weekdays
       from hr_shifts
      where tenant_id = $1 ${includeArchived ? '' : 'and archived_at is null'}
      order by starts_minute, lower(name)`,
    [ctx.tenantId],
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    startsMinute: row.starts_minute,
    endsMinute: row.ends_minute,
    breakMinutes: row.break_minutes,
    graceMinutes: row.grace_minutes,
    weekdays: row.weekdays,
  }))
}

export type ShiftInput = {
  name: string
  startsMinute: number
  endsMinute: number
  breakMinutes?: number
  graceMinutes?: number
  weekdays?: number[]
}

/**
 * Defines a shift.
 *
 * Without one, `settleDay` has no scheduled length to compare a day against,
 * so late, short hours and overtime are not merely zero — they are unknowable.
 * The break is subtracted from the scheduled length, so a nine-hour day with an
 * hour's break is eight hours of work and not an hour of overtime.
 */
export async function createShift(ctx: TenantContext, input: ShiftInput): Promise<Shift> {
  ctx.require('settings.manage')
  if (input.endsMinute <= input.startsMinute) {
    throw unprocessable('shift_ordering', 'A shift must end after it starts.')
  }
  if ((input.breakMinutes ?? 0) >= input.endsMinute - input.startsMinute) {
    throw unprocessable('break_too_long', 'The break is longer than the shift.')
  }
  const weekdays = [...new Set(input.weekdays ?? [])].sort((a, b) => a - b)
  if (weekdays.some((weekday) => weekday < 0 || weekday > 6)) {
    throw unprocessable('bad_weekday', 'Weekdays run from 0 (Sunday) to 6 (Saturday).')
  }

  const { rows: clash } = await ctx.db.query('select 1 from hr_shifts where tenant_id = $1 and lower(name) = lower($2)', [
    ctx.tenantId,
    input.name,
  ])
  if (clash[0]) throw unprocessable('duplicate_name', `A shift called ${input.name} already exists.`)

  const { rows } = await ctx.db.query<ShiftRow & { name: string }>(
    `insert into hr_shifts (tenant_id, name, starts_minute, ends_minute, break_minutes, grace_minutes, weekdays)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning id, name, starts_minute, ends_minute, break_minutes, grace_minutes, weekdays`,
    [ctx.tenantId, input.name, input.startsMinute, input.endsMinute, input.breakMinutes ?? 0, input.graceMinutes ?? 0, weekdays],
  )
  return {
    id: rows[0].id,
    name: rows[0].name,
    startsMinute: rows[0].starts_minute,
    endsMinute: rows[0].ends_minute,
    breakMinutes: rows[0].break_minutes,
    graceMinutes: rows[0].grace_minutes,
    weekdays: rows[0].weekdays,
  }
}

export async function listShiftAssignments(
  ctx: TenantContext,
  options: { employeeId?: string; shiftId?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: ShiftAssignment[]; total: number }> {
  ctx.require('record.read')

  const filters = ['a.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  if (options.employeeId) {
    params.push(options.employeeId)
    filters.push(`a.employee_id = $${params.length}`)
  }
  if (options.shiftId) {
    params.push(options.shiftId)
    filters.push(`a.shift_id = $${params.length}`)
  }
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from hr_shift_assignments a where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<{
    id: string
    employee_id: string
    employee_name: string
    shift_id: string
    shift_name: string
    effective_from: Date
    effective_to: Date | null
  }>(
    `select a.id, a.employee_id, e.full_name as employee_name, a.shift_id, s.name as shift_name,
            a.effective_from, a.effective_to
       from hr_shift_assignments a
       join hr_employees e on e.id = a.employee_id
       join hr_shifts s on s.id = a.shift_id
      where ${where}
      order by a.effective_from desc, e.full_name
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )

  return {
    total: Number(counted[0].n),
    rows: rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      shiftId: row.shift_id,
      shiftName: row.shift_name,
      effectiveFrom: new Date(row.effective_from).toISOString().slice(0, 10),
      effectiveTo: row.effective_to ? new Date(row.effective_to).toISOString().slice(0, 10) : null,
    })),
  }
}

/**
 * Puts somebody on a shift from a date.
 *
 * The open assignment is closed the day before the new one starts rather than
 * deleted, because `settleDay` reads the assignment that covered the day it is
 * settling — rewriting history here would silently re-grade last month's
 * attendance against this month's shift.
 */
export async function assignShift(
  ctx: TenantContext,
  input: { employeeId: string; shiftId: string; effectiveFrom: string },
): Promise<ShiftAssignment> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    await employeeOf(tx, ctx, input.employeeId)
    const { rows: shift } = await tx.query<{ name: string }>('select name from hr_shifts where id = $1 and tenant_id = $2', [
      input.shiftId,
      ctx.tenantId,
    ])
    if (!shift[0]) throw notFound('That shift')

    const { rows: open } = await tx.query<{ id: string; effective_from: Date }>(
      `select id, effective_from from hr_shift_assignments
        where employee_id = $1 and tenant_id = $2 and effective_to is null for update`,
      [input.employeeId, ctx.tenantId],
    )
    if (open[0]) {
      const startedOn = new Date(open[0].effective_from).toISOString().slice(0, 10)
      if (input.effectiveFrom <= startedOn) {
        throw unprocessable(
          'assignment_overlaps',
          `Their current shift starts on ${startedOn}; a new one must begin after that.`,
        )
      }
      const endsOn = new Date(`${input.effectiveFrom}T00:00:00Z`)
      endsOn.setUTCDate(endsOn.getUTCDate() - 1)
      await tx.query('update hr_shift_assignments set effective_to = $2 where id = $1', [
        open[0].id,
        endsOn.toISOString().slice(0, 10),
      ])
    }

    const { rows } = await tx.query<{ id: string }>(
      `insert into hr_shift_assignments (tenant_id, employee_id, shift_id, effective_from)
       values ($1,$2,$3,$4) returning id`,
      [ctx.tenantId, input.employeeId, input.shiftId, input.effectiveFrom],
    )
    await recordAudit(tx, ctx, {
      action: 'hr.shift_assigned',
      resource: 'shift_assignment',
      resourceId: rows[0].id,
      detail: { employeeId: input.employeeId, shiftId: input.shiftId },
    })
    const { rows: named } = await tx.query<{ full_name: string }>('select full_name from hr_employees where id = $1', [
      input.employeeId,
    ])
    return {
      id: rows[0].id,
      employeeId: input.employeeId,
      employeeName: named[0].full_name,
      shiftId: input.shiftId,
      shiftName: shift[0].name,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
    }
  })
}
