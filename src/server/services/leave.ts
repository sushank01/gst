import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { localParts } from '../jobs/cron.ts'
import type { Calendar } from './calendar.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Leave: entitlement, requests and the balance ledger.
 *
 * The balance is a SUM OF ENTRIES, never a stored counter. That is the whole
 * design, and it is what the prototype got wrong: it kept a number and
 * decremented it in the browser, so a double-click took the days twice, a
 * cancelled request added them back with no trace, and nobody could answer
 * "where did my two days go".
 *
 * Every effect on a balance carries a `once_key` with a unique index behind it.
 * Approving the same request twice writes one deduction. Cancelling writes a
 * visible restoration rather than editing the deduction away. The history is
 * append-only, so the balance can always be re-derived and explained.
 */

export type LeaveTypeRow = {
  id: string
  name: string
  code: string
  accrualDays: string
  accrualPeriod: string
  allowNegative: boolean
  requiresApproval: boolean
  countsWeekends: boolean
  countsHolidays: boolean
}

export type LeaveBalance = {
  leaveTypeId: string
  code: string
  name: string
  year: number
  accrued: string
  taken: string
  /** What is left after approved leave and any pending requests are honoured. */
  available: string
  pending: string
}

export type LeaveRequestRow = {
  id: string
  employeeId: string
  leaveTypeId: string
  startsOn: string
  endsOn: string
  dayCount: string
  status: string
  reason: string | null
  decisionNote: string | null
  version: number
}

const DAY_MS = 86_400_000

const iso = (date: Date): string => date.toISOString().slice(0, 10)

type Raw = Record<string, unknown>

function mapRequest(row: Raw): LeaveRequestRow {
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    leaveTypeId: row.leave_type_id as string,
    startsOn: iso(new Date(row.starts_on as string)),
    endsOn: iso(new Date(row.ends_on as string)),
    dayCount: String(row.day_count),
    status: row.status as string,
    reason: (row.reason as string) ?? null,
    decisionNote: (row.decision_note as string) ?? null,
    version: row.version as number,
  }
}

export async function createLeaveType(
  ctx: TenantContext,
  input: {
    name: string
    code: string
    accrualDays?: string
    accrualPeriod?: 'monthly' | 'quarterly' | 'yearly' | 'none'
    maxBalanceDays?: string | null
    allowNegative?: boolean
    requiresApproval?: boolean
    countsWeekends?: boolean
    countsHolidays?: boolean
  },
): Promise<LeaveTypeRow> {
  ctx.require('settings.manage')
  const { rows: clash } = await ctx.db.query('select 1 from hr_leave_types where tenant_id = $1 and lower(code) = lower($2)', [
    ctx.tenantId,
    input.code,
  ])
  if (clash[0]) throw unprocessable('duplicate_code', `Leave code ${input.code} already exists.`)

  const { rows } = await ctx.db.query<Raw>(
    `insert into hr_leave_types
       (tenant_id, name, code, accrual_days, accrual_period, max_balance_days, allow_negative,
        requires_approval, counts_weekends, counts_holidays)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning id, name, code, accrual_days::text as accrual_days, accrual_period, allow_negative,
               requires_approval, counts_weekends, counts_holidays`,
    [
      ctx.tenantId,
      input.name,
      input.code,
      input.accrualDays ?? '0',
      input.accrualPeriod ?? 'yearly',
      input.maxBalanceDays ?? null,
      input.allowNegative ?? false,
      input.requiresApproval ?? true,
      input.countsWeekends ?? false,
      input.countsHolidays ?? false,
    ],
  )
  return {
    id: rows[0].id as string,
    name: rows[0].name as string,
    code: rows[0].code as string,
    accrualDays: String(rows[0].accrual_days),
    accrualPeriod: rows[0].accrual_period as string,
    allowNegative: rows[0].allow_negative as boolean,
    requiresApproval: rows[0].requires_approval as boolean,
    countsWeekends: rows[0].counts_weekends as boolean,
    countsHolidays: rows[0].counts_holidays as boolean,
  }
}

/**
 * Grants an entitlement. Idempotent per (employee, type, year, reason).
 *
 * The annual opening balance must not double if the grant job runs twice, so
 * the once-key carries the year and the reason rather than a timestamp.
 */
export async function grantLeave(
  ctx: TenantContext,
  input: { employeeId: string; leaveTypeId: string; year: number; days: string; reason: string },
): Promise<{ granted: boolean }> {
  ctx.require('settings.manage')
  const onceKey = `grant:${input.employeeId}:${input.leaveTypeId}:${input.year}:${input.reason}`

  const { rowCount } = await ctx.db.query(
    `insert into hr_leave_entries
       (tenant_id, employee_id, leave_type_id, period_year, kind, days, note, once_key, actor_user_id)
     values ($1,$2,$3,$4,'grant',$5,$6,$7,$8)
     on conflict (tenant_id, once_key) do nothing`,
    [ctx.tenantId, input.employeeId, input.leaveTypeId, input.year, input.days, input.reason, onceKey, ctx.userId],
  )
  return { granted: rowCount > 0 }
}

/** The balance, computed from the ledger. Never read from a stored total. */
export async function leaveBalances(ctx: TenantContext, employeeId: string, year: number): Promise<LeaveBalance[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{
    leave_type_id: string
    code: string
    name: string
    credited: string
    debited: string
    pending: string
  }>(
    `select t.id as leave_type_id, t.code, t.name,
            coalesce(sum(e.days) filter (where e.kind in ('accrual','grant','restoration','adjustment')), 0)::text as credited,
            coalesce(sum(e.days) filter (where e.kind in ('deduction','encashment','lapse')), 0)::text as debited,
            coalesce((select sum(r.day_count) from hr_leave_requests r
                       where r.employee_id = $1 and r.leave_type_id = t.id and r.status = 'submitted'), 0)::text as pending
       from hr_leave_types t
       left join hr_leave_entries e
         on e.leave_type_id = t.id and e.employee_id = $1 and e.period_year = $3
      where t.tenant_id = $2 and t.archived_at is null
      group by t.id, t.code, t.name
      order by t.name`,
    [employeeId, ctx.tenantId, year],
  )
  return rows.map((row) => {
    const accrued = Number(row.credited)
    const taken = Number(row.debited)
    const pending = Number(row.pending)
    return {
      leaveTypeId: row.leave_type_id,
      code: row.code,
      name: row.name,
      year,
      accrued: accrued.toFixed(2),
      taken: taken.toFixed(2),
      pending: pending.toFixed(2),
      // Pending requests are held against the balance, so somebody cannot
      // submit five separate requests that each look affordable on their own.
      available: (accrued - taken - pending).toFixed(2),
    }
  })
}

/**
 * The individual days a request covers, honouring the type's own rules.
 *
 * A week off across a public holiday is not five days of leave unless the type
 * says holidays count. Deriving this from (end - start) is the classic way to
 * charge somebody for a bank holiday.
 */
export function leaveDaysBetween(
  startsOn: string,
  endsOn: string,
  type: Pick<LeaveTypeRow, 'countsWeekends' | 'countsHolidays'>,
  calendar: Calendar | null,
  halfDay = false,
): { leaveOn: string; portion: number }[] {
  const start = new Date(`${startsOn}T00:00:00Z`)
  const end = new Date(`${endsOn}T00:00:00Z`)
  if (end.getTime() < start.getTime()) throw unprocessable('bad_period', 'The end date is before the start date.')

  const days: { leaveOn: string; portion: number }[] = []
  for (let at = start.getTime(); at <= end.getTime(); at += DAY_MS) {
    const date = new Date(at)
    const on = iso(date)
    if (!type.countsHolidays && calendar?.holidays.has(on)) continue
    if (!type.countsWeekends && calendar) {
      const weekday = localParts(date, calendar.timezone).weekday
      const works = calendar.hours.some((hour) => hour.weekday === weekday)
      if (!works) continue
    }
    days.push({ leaveOn: on, portion: 1 })
  }
  if (halfDay) {
    if (days.length !== 1) throw unprocessable('half_day_range', 'A half day covers a single date.')
    days[0].portion = 0.5
  }
  return days
}

async function typeOf(db: Db, ctx: TenantContext, leaveTypeId: string): Promise<LeaveTypeRow> {
  const { rows } = await db.query<Raw>(
    `select id, name, code, accrual_days::text as accrual_days, accrual_period, allow_negative,
            requires_approval, counts_weekends, counts_holidays
       from hr_leave_types where id = $1 and tenant_id = $2 and archived_at is null`,
    [leaveTypeId, ctx.tenantId],
  )
  if (!rows[0]) throw notFound('That leave type')
  return {
    id: rows[0].id as string,
    name: rows[0].name as string,
    code: rows[0].code as string,
    accrualDays: String(rows[0].accrual_days),
    accrualPeriod: rows[0].accrual_period as string,
    allowNegative: rows[0].allow_negative as boolean,
    requiresApproval: rows[0].requires_approval as boolean,
    countsWeekends: rows[0].counts_weekends as boolean,
    countsHolidays: rows[0].counts_holidays as boolean,
  }
}

export type RequestLeaveInput = {
  employeeId: string
  leaveTypeId: string
  startsOn: string
  endsOn: string
  halfDay?: boolean
  reason?: string | null
}

/**
 * Submits a leave request.
 *
 * Refused if any of its days is already spoken for by another live request —
 * overlapping leave is how the same absence gets counted twice — and refused if
 * the balance cannot cover it, unless the type explicitly allows going
 * negative.
 */
export async function requestLeave(ctx: TenantContext, input: RequestLeaveInput, calendar: Calendar | null): Promise<LeaveRequestRow> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    const { rows: employee } = await tx.query<{ status: string }>(
      'select status from hr_employees where id = $1 and tenant_id = $2 and archived_at is null',
      [input.employeeId, ctx.tenantId],
    )
    if (!employee[0]) throw notFound('That employee')
    if (employee[0].status === 'exited') throw unprocessable('employee_exited', 'That employee has left.')

    const type = await typeOf(tx, ctx, input.leaveTypeId)
    const days = leaveDaysBetween(input.startsOn, input.endsOn, type, calendar, input.halfDay)
    if (!days.length) throw unprocessable('no_working_days', 'That period contains no working days.')

    const dayCount = days.reduce((total, day) => total + day.portion, 0)

    // Any live request already covering one of these dates.
    const { rows: clash } = await tx.query<{ leave_on: Date }>(
      `select d.leave_on from hr_leave_request_days d
         join hr_leave_requests r on r.id = d.request_id
        where d.employee_id = $1 and r.status in ('submitted','approved')
          and d.leave_on = any($2::date[])
        limit 1`,
      [input.employeeId, days.map((day) => day.leaveOn)],
    )
    if (clash[0]) {
      throw conflict(`Leave is already booked for ${iso(new Date(clash[0].leave_on))}.`)
    }

    if (!type.allowNegative) {
      const year = new Date(`${input.startsOn}T00:00:00Z`).getUTCFullYear()
      const balances = await leaveBalancesOn(tx, ctx, input.employeeId, year)
      const balance = balances.find((entry) => entry.leaveTypeId === type.id)
      if (!balance || Number(balance.available) < dayCount) {
        throw unprocessable(
          'insufficient_balance',
          `Only ${balance?.available ?? '0.00'} day(s) of ${type.name} are available.`,
        )
      }
    }

    const status = type.requiresApproval ? 'submitted' : 'approved'
    const { rows } = await tx.query<Raw>(
      `insert into hr_leave_requests
         (tenant_id, employee_id, leave_type_id, starts_on, ends_on, day_count, half_day, reason, status, created_by,
          decided_by, decided_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning *`,
      [
        ctx.tenantId,
        input.employeeId,
        input.leaveTypeId,
        input.startsOn,
        input.endsOn,
        dayCount.toFixed(2),
        Boolean(input.halfDay),
        input.reason ?? null,
        status,
        ctx.userId,
        status === 'approved' ? ctx.userId : null,
        status === 'approved' ? ctx.now : null,
      ],
    )
    const requestId = rows[0].id as string

    for (const day of days) {
      await tx.query(
        'insert into hr_leave_request_days (tenant_id, request_id, employee_id, leave_on, portion) values ($1,$2,$3,$4,$5)',
        [ctx.tenantId, requestId, input.employeeId, day.leaveOn, day.portion],
      )
    }

    // A type that needs no approval is deducted now, through the same ledger
    // path an approval would use — one code path, one set of guarantees.
    if (status === 'approved') await deduct(tx, ctx, requestId, input.employeeId, type.id, input.startsOn, dayCount)

    await recordAudit(tx, ctx, {
      action: 'hr.leave_requested',
      resource: 'leave_request',
      resourceId: requestId,
      detail: { days: dayCount, type: type.code },
    })
    return mapRequest(rows[0])
  })
}

/** The balance query, runnable inside an open transaction. */
async function leaveBalancesOn(db: Db, ctx: TenantContext, employeeId: string, year: number): Promise<LeaveBalance[]> {
  const scoped: TenantContext = { ...ctx, db }
  return leaveBalances(scoped, employeeId, year)
}

async function deduct(
  tx: Db,
  ctx: TenantContext,
  requestId: string,
  employeeId: string,
  leaveTypeId: string,
  startsOn: string,
  days: number,
): Promise<void> {
  const year = new Date(`${startsOn}T00:00:00Z`).getUTCFullYear()
  await tx.query(
    `insert into hr_leave_entries
       (tenant_id, employee_id, leave_type_id, period_year, kind, days, request_id, note, once_key, actor_user_id)
     values ($1,$2,$3,$4,'deduction',$5,$6,$7,$8,$9)
     on conflict (tenant_id, once_key) do nothing`,
    [
      ctx.tenantId,
      employeeId,
      leaveTypeId,
      year,
      days.toFixed(2),
      requestId,
      'approved leave',
      `deduct:${requestId}`,
      ctx.userId,
    ],
  )
}

/**
 * Approves or rejects a request.
 *
 * The deduction's once-key is the request id, so however many times this runs —
 * a double-click, a retried job, two approvers racing — the balance moves once.
 */
export async function decideLeave(
  ctx: TenantContext,
  requestId: string,
  input: { decision: 'approved' | 'rejected'; version: number; note?: string | null },
): Promise<LeaveRequestRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Raw>(
      'select * from hr_leave_requests where id = $1 and tenant_id = $2 for update',
      [requestId, ctx.tenantId],
    )
    const request = rows[0]
    if (!request) throw notFound('That leave request')
    if (request.version !== input.version) throw conflict('Someone else decided this request.', request.version as number)
    if (request.status !== 'submitted') throw unprocessable('already_decided', `That request is already ${request.status}.`)

    await tx.query(
      `update hr_leave_requests set status = $3, decided_by = $4, decided_at = $5, decision_note = $6,
              version = version + 1, updated_at = $5
        where id = $1 and tenant_id = $2`,
      [requestId, ctx.tenantId, input.decision, ctx.userId, ctx.now, input.note ?? null],
    )

    if (input.decision === 'approved') {
      await deduct(
        tx,
        ctx,
        requestId,
        request.employee_id as string,
        request.leave_type_id as string,
        iso(new Date(request.starts_on as string)),
        Number(request.day_count),
      )
    }
    await recordAudit(tx, ctx, {
      action: `hr.leave_${input.decision}`,
      resource: 'leave_request',
      resourceId: requestId,
      detail: { days: Number(request.day_count) },
    })
    const { rows: after } = await tx.query<Raw>('select * from hr_leave_requests where id = $1', [requestId])
    return mapRequest(after[0])
  })
}

/**
 * Cancels a request and gives the days back.
 *
 * The restoration is its own ledger entry with its own once-key, so the
 * deduction stays visible. Erasing it would leave a balance nobody can explain.
 */
export async function cancelLeave(ctx: TenantContext, requestId: string, version: number): Promise<LeaveRequestRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Raw>('select * from hr_leave_requests where id = $1 and tenant_id = $2 for update', [
      requestId,
      ctx.tenantId,
    ])
    const request = rows[0]
    if (!request) throw notFound('That leave request')
    if (request.version !== version) throw conflict('Someone else changed this request.', request.version as number)
    if (request.status === 'cancelled') throw unprocessable('already_cancelled', 'That request is already cancelled.')
    if (request.status === 'rejected') throw unprocessable('not_cancellable', 'A rejected request cannot be cancelled.')

    const wasApproved = request.status === 'approved'
    await tx.query(
      `update hr_leave_requests set status = 'cancelled', version = version + 1, updated_at = $3
        where id = $1 and tenant_id = $2`,
      [requestId, ctx.tenantId, ctx.now],
    )

    if (wasApproved) {
      const year = new Date(request.starts_on as string).getUTCFullYear()
      await tx.query(
        `insert into hr_leave_entries
           (tenant_id, employee_id, leave_type_id, period_year, kind, days, request_id, note, once_key, actor_user_id)
         values ($1,$2,$3,$4,'restoration',$5,$6,$7,$8,$9)
         on conflict (tenant_id, once_key) do nothing`,
        [
          ctx.tenantId,
          request.employee_id as string,
          request.leave_type_id as string,
          year,
          Number(request.day_count).toFixed(2),
          requestId,
          'cancelled leave returned',
          `restore:${requestId}`,
          ctx.userId,
        ],
      )
    }
    await recordAudit(tx, ctx, { action: 'hr.leave_cancelled', resource: 'leave_request', resourceId: requestId })
    const { rows: after } = await tx.query<Raw>('select * from hr_leave_requests where id = $1', [requestId])
    return mapRequest(after[0])
  })
}

export async function listLeaveRequests(
  ctx: TenantContext,
  options: { employeeId?: string; status?: string; from?: string; to?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: LeaveRequestRow[]; total: number }> {
  ctx.require('record.read')
  const filters = ['r.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.employeeId) add('r.employee_id = $?', options.employeeId)
  if (options.status) add('r.status = $?', options.status)
  if (options.from) add('r.ends_on >= $?', options.from)
  if (options.to) add('r.starts_on <= $?', options.to)
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from hr_leave_requests r where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Raw>(
    `select r.* from hr_leave_requests r where ${where}
      order by r.starts_on desc limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return { total: Number(counted[0].n), rows: rows.map(mapRequest) }
}

export type LedgerEntry = { kind: string; days: string; note: string | null; createdAt: string }

/** Why the balance is what it is. Append-only, so it always reconciles. */
export async function leaveLedger(
  ctx: TenantContext,
  employeeId: string,
  leaveTypeId: string,
  year: number,
): Promise<LedgerEntry[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{ kind: string; days: string; note: string | null; created_at: Date }>(
    `select kind, days::text as days, note, created_at from hr_leave_entries
      where employee_id = $1 and leave_type_id = $2 and period_year = $3 and tenant_id = $4
      order by created_at, id`,
    [employeeId, leaveTypeId, year, ctx.tenantId],
  )
  return rows.map((row) => ({
    kind: row.kind,
    days: row.days,
    note: row.note,
    createdAt: new Date(row.created_at).toISOString(),
  }))
}
