import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  confirmEmployee, createVocabulary, employmentHistory, exitEmployee, hireEmployee,
  linkEmployeeAccount, listEmployees, readEmployee, selfEmployee, transferEmployee,
} from '../src/server/services/hr.ts'
import { standardWeek } from '../src/server/services/calendar.ts'
import {
  attendanceBetween, closeAbandonedPunches, openPunch, punchIn, punchOut, settleDay,
} from '../src/server/services/attendance.ts'
import {
  cancelLeave, createLeaveType, decideLeave, grantLeave, leaveBalances, leaveDaysBetween,
  leaveLedger, requestLeave,
} from '../src/server/services/leave.ts'
import {
  addEntry, decideOvertime, decideTimesheet, listEntries, openTimesheet, removeEntry,
  requestOvertime, submitTimesheet,
} from '../src/server/services/timesheets.ts'

async function workspace() {
  const db = await freshDb()
  const c = clock()
  const hrUser = await seedUser(db, { email: 'hr@example.com', fullName: 'HR Lead' })
  const staffUser = await seedUser(db, { email: 'sam@example.com', fullName: 'Sam Staff' })
  const outsider = await seedUser(db, { email: 'out@example.com', fullName: 'Outsider' })
  const acme = await createTenantWithOwner(db, hrUser, { name: 'Acme' }, c.now(), 'r1')
  const rival = await createTenantWithOwner(db, outsider, { name: 'Rival' }, c.now(), 'r2')

  // The staff account is a real member, so it can be linked to an employee.
  await db.query(
    `insert into memberships (tenant_id, user_id, role, status) values ($1, $2, 'member', 'active')`,
    [acme.tenantId, staffUser],
  )

  const ctxFor = async (userId: string, tenantId: string) => {
    const { token } = await createSession(db, { userId, tenantId }, c.now())
    return withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))
  }
  return {
    db,
    c,
    hrUser,
    staffUser,
    outsider,
    ctx: await ctxFor(hrUser, acme.tenantId),
    staffCtx: await ctxFor(staffUser, acme.tenantId),
    rivalCtx: await ctxFor(outsider, rival.tenantId),
  }
}

const HIRE = { fullName: 'Ada Lovelace', joinedOn: '2026-01-05', workEmail: 'ada@acme.test' }

/* --------------------------------- people --------------------------------- */

test('hiring allocates an employee number and opens a position in one transaction', async () => {
  const { db, ctx } = await workspace()
  const first = await hireEmployee(ctx, HIRE)
  const second = await hireEmployee(ctx, { fullName: 'Grace Hopper', joinedOn: '2026-02-01' })

  assert.equal(first.employeeNo, 'EMP-0001')
  assert.equal(second.employeeNo, 'EMP-0002')
  assert.equal(first.status, 'active')

  const history = await employmentHistory(ctx, first.id)
  assert.equal(history.length, 1, 'an employee without a position has no history at all')
  assert.equal(history[0].effectiveFrom, '2026-01-05')
  assert.equal(history[0].effectiveTo, null, 'the current position is open-ended')
  await db.close()
})

test('a duplicate work email or employee number is refused', async () => {
  const { db, ctx } = await workspace()
  await hireEmployee(ctx, HIRE)
  await assert.rejects(() => hireEmployee(ctx, { ...HIRE, fullName: 'Impostor' }), /already belongs/i)
  await assert.rejects(
    () => hireEmployee(ctx, { fullName: 'X', joinedOn: '2026-01-05', employeeNo: 'emp-0001' }),
    /already in use/i,
  )
  await db.close()
})

test('HISTORY: a transfer appends rather than overwriting what the job was', async () => {
  const { db, ctx } = await workspace()
  const engineering = await createVocabulary(ctx, 'department', { name: 'Engineering' })
  const platform = await createVocabulary(ctx, 'department', { name: 'Platform' })
  const employee = await hireEmployee(ctx, { ...HIRE, departmentId: engineering.id })

  const moved = await transferEmployee(ctx, employee.id, {
    effectiveFrom: '2026-04-01',
    departmentId: platform.id,
    reason: 'internal move',
    version: employee.version,
  })
  assert.equal(moved.departmentName, 'Platform')

  const history = await employmentHistory(ctx, employee.id)
  assert.equal(history.length, 2)
  assert.deepEqual(
    history.map((row) => [row.departmentName, row.effectiveFrom, row.effectiveTo]),
    [
      ['Platform', '2026-04-01', null],
      ['Engineering', '2026-01-05', '2026-03-31'],
    ],
    'the old position closes the day before the new one starts — no gap, no overlap',
  )
  await db.close()
})

test('a reporting line that loops back on itself is refused', async () => {
  const { db, ctx } = await workspace()
  const boss = await hireEmployee(ctx, { fullName: 'Boss', joinedOn: '2026-01-01' })
  const mid = await hireEmployee(ctx, { fullName: 'Mid', joinedOn: '2026-01-01', managerId: boss.id })
  const junior = await hireEmployee(ctx, { fullName: 'Junior', joinedOn: '2026-01-01', managerId: mid.id })

  await assert.rejects(
    () => transferEmployee(ctx, boss.id, { effectiveFrom: '2026-05-01', managerId: junior.id, reason: 'oops', version: boss.version }),
    /loops back/i,
    'boss -> junior -> mid -> boss would spin forever in every org query',
  )
  await assert.rejects(
    () => transferEmployee(ctx, mid.id, { effectiveFrom: '2026-05-01', managerId: mid.id, reason: 'oops', version: mid.version }),
    /report to themselves/i,
  )
  await db.close()
})

test('confirmation moves someone off probation exactly once', async () => {
  const { db, ctx } = await workspace()
  const employee = await hireEmployee(ctx, { ...HIRE, probationEndsOn: '2026-04-05' })
  assert.equal(employee.status, 'probation')

  const confirmed = await confirmEmployee(ctx, employee.id, '2026-04-05', employee.version)
  assert.equal(confirmed.status, 'active')
  assert.equal(confirmed.confirmedOn, '2026-04-05')

  await assert.rejects(() => confirmEmployee(ctx, employee.id, '2026-05-01', confirmed.version), /already confirmed/i)
  await db.close()
})

test('an exit closes the position, keeps the record and refuses to orphan reports', async () => {
  const { db, ctx } = await workspace()
  const boss = await hireEmployee(ctx, { fullName: 'Boss', joinedOn: '2026-01-01' })
  const report = await hireEmployee(ctx, { fullName: 'Report', joinedOn: '2026-01-01', managerId: boss.id })

  await assert.rejects(
    () => exitEmployee(ctx, boss.id, { exitedOn: '2026-06-30', reason: 'resigned', version: boss.version }),
    /direct report/i,
    'leaving people with no manager silently breaks every approval that routes through them',
  )

  await transferEmployee(ctx, report.id, { effectiveFrom: '2026-06-01', managerId: null, reason: 'reassigned', version: report.version })
  const gone = await exitEmployee(ctx, boss.id, { exitedOn: '2026-06-30', reason: 'resigned', version: boss.version })
  assert.equal(gone.status, 'exited')
  assert.equal(gone.exitedOn, '2026-06-30')

  // The record survives; it is not deleted.
  assert.equal((await readEmployee(ctx, boss.id)).fullName, 'Boss')
  const history = await employmentHistory(ctx, boss.id)
  assert.equal(history[0].effectiveTo, '2026-06-30', 'the last position closes on the exit date')
  await db.close()
})

test('SELF-SERVICE: the portal resolves a real linked profile, and only one', async () => {
  const { db, ctx, staffCtx, staffUser } = await workspace()
  assert.equal(await selfEmployee(staffCtx), null, 'unlinked means unlinked, not a fabricated profile')

  const employee = await hireEmployee(ctx, { fullName: 'Sam Staff', joinedOn: '2026-01-05' })
  await linkEmployeeAccount(ctx, employee.id, staffUser)

  const mine = await selfEmployee(staffCtx)
  assert.equal(mine?.id, employee.id)

  const other = await hireEmployee(ctx, { fullName: 'Someone Else', joinedOn: '2026-01-05' })
  await assert.rejects(() => linkEmployeeAccount(ctx, other.id, staffUser), /already linked/i)
  await db.close()
})

test('ISOLATION: employees never cross workspaces', async () => {
  const { db, ctx, rivalCtx } = await workspace()
  const employee = await hireEmployee(ctx, HIRE)

  await assert.rejects(() => readEmployee(rivalCtx, employee.id), /That employee/)
  await assert.rejects(
    () => transferEmployee(rivalCtx, employee.id, { effectiveFrom: '2026-05-01', reason: 'steal', version: employee.version }),
    /That employee/,
  )
  assert.equal((await listEmployees(rivalCtx, {})).total, 0)
  await db.close()
})

/* ------------------------------- attendance ------------------------------- */

async function withShift() {
  const context = await workspace()
  const employee = await hireEmployee(context.ctx, HIRE)
  const { rows } = await context.db.query<{ id: string }>(
    `insert into hr_shifts (tenant_id, name, starts_minute, ends_minute, break_minutes, weekdays, grace_minutes)
     values ($1, 'General', 540, 1080, 60, '{1,2,3,4,5}', 10) returning id`,
    [context.ctx.tenantId],
  )
  await context.db.query(
    'insert into hr_shift_assignments (tenant_id, employee_id, shift_id, effective_from) values ($1,$2,$3,$4)',
    [context.ctx.tenantId, employee.id, rows[0].id, '2026-01-05'],
  )
  return { ...context, employee, shiftId: rows[0].id }
}

test('a second clock-in without a clock-out is refused', async () => {
  const { db, ctx, employee } = await withShift()
  await punchIn(ctx, employee.id, { at: new Date('2026-01-05T09:00:00Z') })
  await assert.rejects(
    () => punchIn(ctx, employee.id, { at: new Date('2026-01-05T09:05:00Z') }),
    /already clocked in/i,
    'two open intervals leave no honest way to total the day',
  )
  assert.ok(await openPunch(ctx, employee.id))
  await db.close()
})

test('CONCURRENCY: two devices clocking the same person in cannot both win', async () => {
  const { db, ctx, employee } = await withShift()
  const results = await Promise.allSettled([
    punchIn(ctx, employee.id, { at: new Date('2026-01-05T09:00:00Z') }),
    punchIn(ctx, employee.id, { at: new Date('2026-01-05T09:00:01Z') }),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)

  const { rows } = await db.query<{ n: string }>(
    'select count(*)::text as n from hr_attendance_punches where employee_id = $1 and punched_out_at is null',
    [employee.id],
  )
  assert.equal(rows[0].n, '1')
  await db.close()
})

test('clocking out when not clocked in, or before clocking in, is refused', async () => {
  const { db, ctx, employee } = await withShift()
  await assert.rejects(() => punchOut(ctx, employee.id), /not clocked in/i)
  await punchIn(ctx, employee.id, { at: new Date('2026-01-05T09:00:00Z') })
  await assert.rejects(() => punchOut(ctx, employee.id, { at: new Date('2026-01-05T08:00:00Z') }), /must come after/i)
  await db.close()
})

test('a settled day sums its punches, and settling twice does not double them', async () => {
  const { db, ctx, employee } = await withShift()
  await punchIn(ctx, employee.id, { at: new Date('2026-01-05T09:05:00Z') })
  await punchOut(ctx, employee.id, { at: new Date('2026-01-05T13:00:00Z') })
  await punchIn(ctx, employee.id, { at: new Date('2026-01-05T14:00:00Z') })
  await punchOut(ctx, employee.id, { at: new Date('2026-01-05T18:00:00Z') })

  const first = await settleDay(ctx, employee.id, '2026-01-05', standardWeek('UTC'))
  assert.equal(first.status, 'present')
  assert.equal(first.workedMinutes, 235 + 240, '3h55 plus 4h')
  assert.equal(first.lateMinutes, 0, 'five minutes late is inside a ten-minute grace')
  assert.equal(first.overtimeMinutes, 0, '7h55 worked against an 8h shift')

  const again = await settleDay(ctx, employee.id, '2026-01-05', standardWeek('UTC'))
  assert.deepEqual(again, first, 'settlement recomputes; it never accumulates')

  const { rows } = await db.query<{ n: string }>(
    'select count(*)::text as n from hr_attendance_days where employee_id = $1 and attendance_on = $2',
    [employee.id, '2026-01-05'],
  )
  assert.equal(rows[0].n, '1')
  await db.close()
})

test('lateness and overtime are measured against the shift, not guessed', async () => {
  const { db, ctx, employee } = await withShift()
  await punchIn(ctx, employee.id, { at: new Date('2026-01-06T09:45:00Z') })
  await punchOut(ctx, employee.id, { at: new Date('2026-01-06T20:00:00Z') })

  const day = await settleDay(ctx, employee.id, '2026-01-06', standardWeek('UTC'))
  assert.equal(day.lateMinutes, 35, '09:45 against a 09:00 start with ten minutes of grace')
  assert.equal(day.workedMinutes, 615)
  assert.equal(day.overtimeMinutes, 615 - 480, 'beyond the eight scheduled hours')
  await db.close()
})

test('a weekend and a public holiday are not absence', async () => {
  const { db, ctx, employee } = await withShift()
  const calendar = { ...standardWeek('UTC'), holidays: new Set(['2026-01-26']) }

  assert.equal((await settleDay(ctx, employee.id, '2026-01-10', calendar)).status, 'weekly_off')
  assert.equal((await settleDay(ctx, employee.id, '2026-01-26', calendar)).status, 'holiday')
  assert.equal((await settleDay(ctx, employee.id, '2026-01-07', calendar)).status, 'absent', 'a working day with no punches is absence')
  await db.close()
})

test('an open punch contributes nothing until it is closed', async () => {
  const { db, ctx, employee } = await withShift()
  await punchIn(ctx, employee.id, { at: new Date('2026-01-05T09:00:00Z') })
  const day = await settleDay(ctx, employee.id, '2026-01-05', standardWeek('UTC'))
  assert.equal(day.workedMinutes, 0, 'time still being worked is not yet time worked')
  await db.close()
})

test('an abandoned punch is closed at the shift end, not at whenever somebody noticed', async () => {
  const { db, ctx, employee } = await withShift()
  await punchIn(ctx, employee.id, { at: new Date('2026-01-05T09:00:00Z') })

  const swept = await closeAbandonedPunches(ctx, new Date('2026-01-09T00:00:00Z'))
  assert.equal(swept.closed, 1)

  const day = await settleDay(ctx, employee.id, '2026-01-05', standardWeek('UTC'))
  assert.equal(day.workedMinutes, 540 - 0, 'closed at 18:00, the shift end — nine hours, not four days')
  assert.equal(await openPunch(ctx, employee.id), null)
  await db.close()
})

test('an overnight shift credits each day with the hours actually worked in it', async () => {
  const { db, ctx, employee } = await withShift()
  await punchIn(ctx, employee.id, { at: new Date('2026-01-07T22:00:00Z') })
  await punchOut(ctx, employee.id, { at: new Date('2026-01-08T06:00:00Z') })

  assert.equal((await settleDay(ctx, employee.id, '2026-01-07', standardWeek('UTC'))).workedMinutes, 120)
  assert.equal((await settleDay(ctx, employee.id, '2026-01-08', standardWeek('UTC'))).workedMinutes, 360)

  const week = await attendanceBetween(ctx, employee.id, '2026-01-07', '2026-01-08')
  assert.equal(week.reduce((total, day) => total + day.workedMinutes, 0), 480)
  await db.close()
})

/* ---------------------------------- leave --------------------------------- */

async function withLeave() {
  const context = await workspace()
  const employee = await hireEmployee(context.ctx, HIRE)
  const annual = await createLeaveType(context.ctx, { name: 'Annual leave', code: 'AL' })
  await grantLeave(context.ctx, {
    employeeId: employee.id,
    leaveTypeId: annual.id,
    year: 2026,
    days: '12',
    reason: 'opening balance 2026',
  })
  return { ...context, employee, annual }
}

test('a leave grant is idempotent, so the opening balance cannot double', async () => {
  const { db, ctx, employee, annual } = await withLeave()
  const second = await grantLeave(ctx, {
    employeeId: employee.id,
    leaveTypeId: annual.id,
    year: 2026,
    days: '12',
    reason: 'opening balance 2026',
  })
  assert.equal(second.granted, false)

  const balances = await leaveBalances(ctx, employee.id, 2026)
  assert.equal(balances[0].accrued, '12.00')
  await db.close()
})

test('leave days come from the working calendar, not from subtracting dates', () => {
  const type = { countsWeekends: false, countsHolidays: false }
  const calendar = { ...standardWeek('UTC'), holidays: new Set(['2026-01-26']) }

  // Mon 26 Jan (a holiday) to Fri 30 Jan: four working days, not five.
  const days = leaveDaysBetween('2026-01-26', '2026-01-30', type, calendar)
  assert.deepEqual(days.map((day) => day.leaveOn), ['2026-01-27', '2026-01-28', '2026-01-29', '2026-01-30'])

  // Across a weekend: Fri to Mon is two days off, not four.
  assert.equal(leaveDaysBetween('2026-01-09', '2026-01-12', type, calendar).length, 2)

  // A type that counts everything gets everything.
  assert.equal(leaveDaysBetween('2026-01-09', '2026-01-12', { countsWeekends: true, countsHolidays: true }, calendar).length, 4)
})

test('APPROVAL: approving twice deducts once', async () => {
  const { db, ctx, employee, annual } = await withLeave()
  const request = await requestLeave(
    ctx,
    { employeeId: employee.id, leaveTypeId: annual.id, startsOn: '2026-03-02', endsOn: '2026-03-04' },
    standardWeek('UTC'),
  )
  assert.equal(request.dayCount, '3.00')
  assert.equal(request.status, 'submitted')

  const approved = await decideLeave(ctx, request.id, { decision: 'approved', version: request.version })
  assert.equal(approved.status, 'approved')

  // A second approval at the old version is a conflict; even so, the ledger is
  // what guarantees the balance cannot move twice.
  await assert.rejects(() => decideLeave(ctx, request.id, { decision: 'approved', version: request.version }), /Someone else|already/i)
  await assert.rejects(() => decideLeave(ctx, request.id, { decision: 'approved', version: approved.version }), /already approved/i)

  const balances = await leaveBalances(ctx, employee.id, 2026)
  assert.equal(balances[0].taken, '3.00')
  assert.equal(balances[0].available, '9.00')

  const ledger = await leaveLedger(ctx, employee.id, annual.id, 2026)
  assert.equal(ledger.filter((entry) => entry.kind === 'deduction').length, 1, 'one deduction, however many approvals ran')
  await db.close()
})

test('OVERLAP: the same days cannot be booked twice', async () => {
  const { db, ctx, employee, annual } = await withLeave()
  await requestLeave(
    ctx,
    { employeeId: employee.id, leaveTypeId: annual.id, startsOn: '2026-03-02', endsOn: '2026-03-04' },
    standardWeek('UTC'),
  )
  await assert.rejects(
    () =>
      requestLeave(
        ctx,
        { employeeId: employee.id, leaveTypeId: annual.id, startsOn: '2026-03-04', endsOn: '2026-03-06' },
        standardWeek('UTC'),
      ),
    /already booked/i,
    'overlapping leave is the same absence counted twice',
  )
  await db.close()
})

test('the balance cannot be overdrawn, and pending requests are held against it', async () => {
  const { db, ctx, employee, annual } = await withLeave()
  await requestLeave(
    ctx,
    { employeeId: employee.id, leaveTypeId: annual.id, startsOn: '2026-03-02', endsOn: '2026-03-13' },
    standardWeek('UTC'),
  )
  const balances = await leaveBalances(ctx, employee.id, 2026)
  assert.equal(balances[0].pending, '10.00')
  assert.equal(balances[0].available, '2.00', 'a pending request is already spoken for')

  await assert.rejects(
    () =>
      requestLeave(
        ctx,
        { employeeId: employee.id, leaveTypeId: annual.id, startsOn: '2026-04-06', endsOn: '2026-04-10' },
        standardWeek('UTC'),
      ),
    /Only 2.00 day/,
    'five separate requests must not each look affordable on their own',
  )
  await db.close()
})

test('cancelling approved leave restores the days as a visible entry', async () => {
  const { db, ctx, employee, annual } = await withLeave()
  const request = await requestLeave(
    ctx,
    { employeeId: employee.id, leaveTypeId: annual.id, startsOn: '2026-03-02', endsOn: '2026-03-04' },
    standardWeek('UTC'),
  )
  const approved = await decideLeave(ctx, request.id, { decision: 'approved', version: request.version })
  const cancelled = await cancelLeave(ctx, request.id, approved.version)
  assert.equal(cancelled.status, 'cancelled')

  const balances = await leaveBalances(ctx, employee.id, 2026)
  assert.equal(balances[0].available, '12.00', 'the days come back')

  const ledger = await leaveLedger(ctx, employee.id, annual.id, 2026)
  assert.deepEqual(
    ledger.map((entry) => entry.kind),
    ['grant', 'deduction', 'restoration'],
    'the deduction stays visible — a balance nobody can explain is worse than a wrong one',
  )
  await db.close()
})

test('a rejected request takes nothing, and rejection is final', async () => {
  const { db, ctx, employee, annual } = await withLeave()
  const request = await requestLeave(
    ctx,
    { employeeId: employee.id, leaveTypeId: annual.id, startsOn: '2026-03-02', endsOn: '2026-03-04' },
    standardWeek('UTC'),
  )
  const rejected = await decideLeave(ctx, request.id, { decision: 'rejected', version: request.version, note: 'peak week' })
  assert.equal(rejected.status, 'rejected')
  assert.equal((await leaveBalances(ctx, employee.id, 2026))[0].available, '12.00')
  await assert.rejects(() => cancelLeave(ctx, request.id, rejected.version), /cannot be cancelled/i)
  await db.close()
})

test('approved leave shows on the attendance day rather than as absence', async () => {
  const { db, ctx, employee, annual } = await withLeave()
  const request = await requestLeave(
    ctx,
    { employeeId: employee.id, leaveTypeId: annual.id, startsOn: '2026-03-02', endsOn: '2026-03-02' },
    standardWeek('UTC'),
  )
  await decideLeave(ctx, request.id, { decision: 'approved', version: request.version })

  const day = await settleDay(ctx, employee.id, '2026-03-02', standardWeek('UTC'))
  assert.equal(day.status, 'leave')
  await db.close()
})

/* --------------------------- timesheets, overtime -------------------------- */

test('a timesheet totals its entries and is locked once approved', async () => {
  const { db, ctx } = await workspace()
  const employee = await hireEmployee(ctx, HIRE)
  const sheet = await openTimesheet(ctx, { employeeId: employee.id, periodStart: '2026-03-02', periodEnd: '2026-03-06' })

  await addEntry(ctx, sheet.id, { workedOn: '2026-03-02', minutes: 480, projectCode: 'APR-1' })
  const after = await addEntry(ctx, sheet.id, { workedOn: '2026-03-03', minutes: 420, billable: true })
  assert.equal(after.totalMinutes, 900, 'the total is recomputed, never incremented alongside the insert')

  const submitted = await submitTimesheet(ctx, sheet.id, sheet.version)
  assert.equal(submitted.status, 'submitted')
  await assert.rejects(() => addEntry(ctx, sheet.id, { workedOn: '2026-03-04', minutes: 60 }), /cannot be edited/i)

  const approved = await decideTimesheet(ctx, sheet.id, { decision: 'approved', version: submitted.version })
  assert.equal(approved.status, 'approved')
  await assert.rejects(
    () => addEntry(ctx, sheet.id, { workedOn: '2026-03-05', minutes: 60 }),
    /cannot be edited/i,
    'a sheet payroll has read must not be editable afterwards',
  )
  assert.equal((await listEntries(ctx, sheet.id)).length, 2)
  await db.close()
})

test('a rejected timesheet becomes editable again so it can be fixed', async () => {
  const { db, ctx } = await workspace()
  const employee = await hireEmployee(ctx, HIRE)
  const sheet = await openTimesheet(ctx, { employeeId: employee.id, periodStart: '2026-03-02', periodEnd: '2026-03-06' })
  await addEntry(ctx, sheet.id, { workedOn: '2026-03-02', minutes: 480 })
  const submitted = await submitTimesheet(ctx, sheet.id, sheet.version)
  const rejected = await decideTimesheet(ctx, sheet.id, { decision: 'rejected', version: submitted.version, note: 'split the project codes' })
  assert.equal(rejected.status, 'rejected')

  const entries = await listEntries(ctx, sheet.id)
  await removeEntry(ctx, sheet.id, entries[0].id)
  const fixed = await addEntry(ctx, sheet.id, { workedOn: '2026-03-02', minutes: 240, projectCode: 'A' })
  assert.equal(fixed.totalMinutes, 240)
  await db.close()
})

test('a day cannot hold more than 24 hours, and entries stay inside the period', async () => {
  const { db, ctx } = await workspace()
  const employee = await hireEmployee(ctx, HIRE)
  const sheet = await openTimesheet(ctx, { employeeId: employee.id, periodStart: '2026-03-02', periodEnd: '2026-03-06' })

  await addEntry(ctx, sheet.id, { workedOn: '2026-03-02', minutes: 1000 })
  await assert.rejects(() => addEntry(ctx, sheet.id, { workedOn: '2026-03-02', minutes: 500 }), /exceed 24 hours/i)
  await assert.rejects(() => addEntry(ctx, sheet.id, { workedOn: '2026-03-09', minutes: 60 }), /outside/i)
  await db.close()
})

test('an empty timesheet cannot be submitted, and one period yields one sheet', async () => {
  const { db, ctx } = await workspace()
  const employee = await hireEmployee(ctx, HIRE)
  const sheet = await openTimesheet(ctx, { employeeId: employee.id, periodStart: '2026-03-02', periodEnd: '2026-03-06' })
  await assert.rejects(() => submitTimesheet(ctx, sheet.id, sheet.version), /at least one entry/i)

  const again = await openTimesheet(ctx, { employeeId: employee.id, periodStart: '2026-03-02', periodEnd: '2026-03-06' })
  assert.equal(again.id, sheet.id, 'two sheets for one week is two sets of hours for the same days')
  await db.close()
})

test('one live overtime claim per person per day, decided once', async () => {
  const { db, ctx } = await workspace()
  const employee = await hireEmployee(ctx, HIRE)
  const claim = await requestOvertime(ctx, { employeeId: employee.id, workedOn: '2026-03-02', minutes: 120 })

  await assert.rejects(
    () => requestOvertime(ctx, { employeeId: employee.id, workedOn: '2026-03-02', minutes: 60 }),
    /already submitted/i,
  )

  const approved = await decideOvertime(ctx, claim.id, { decision: 'approved', version: claim.version })
  assert.equal(approved.status, 'approved')
  await assert.rejects(() => decideOvertime(ctx, claim.id, { decision: 'rejected', version: approved.version }), /already approved/i)
  await db.close()
})
