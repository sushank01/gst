import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Timesheets and overtime.
 *
 * The rule that matters is that approval is final. A timesheet that can be
 * edited after it is approved is not evidence of anything — it is a number
 * somebody can change after payroll has read it. So entries are writable only
 * while the sheet is a draft, and an approved sheet is locked.
 *
 * Totals are recomputed from the entries on every write. A stored total that
 * is incremented alongside inserts drifts the first time an insert fails.
 */

export type TimesheetRow = {
  id: string
  employeeId: string
  periodStart: string
  periodEnd: string
  status: string
  totalMinutes: number
  version: number
}

export type TimesheetEntryRow = {
  id: string
  workedOn: string
  minutes: number
  projectCode: string | null
  task: string | null
  billable: boolean
  note: string | null
}

const iso = (value: Date | string): string => (typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10))

type Raw = Record<string, unknown>

const mapSheet = (row: Raw): TimesheetRow => ({
  id: row.id as string,
  employeeId: row.employee_id as string,
  periodStart: iso(row.period_start as Date),
  periodEnd: iso(row.period_end as Date),
  status: row.status as string,
  totalMinutes: row.total_minutes as number,
  version: row.version as number,
})

/** The editable states. Everything else is a record, not a draft. */
const EDITABLE = new Set(['draft', 'rejected'])

async function sheetForUpdate(tx: Db, ctx: TenantContext, timesheetId: string): Promise<Raw> {
  const { rows } = await tx.query<Raw>('select * from hr_timesheets where id = $1 and tenant_id = $2 for update', [
    timesheetId,
    ctx.tenantId,
  ])
  if (!rows[0]) throw notFound('That timesheet')
  return rows[0]
}

async function recomputeTotal(tx: Db, ctx: TenantContext, timesheetId: string): Promise<number> {
  const { rows } = await tx.query<{ total: string }>(
    'select coalesce(sum(minutes), 0)::text as total from hr_timesheet_entries where timesheet_id = $1',
    [timesheetId],
  )
  const total = Number(rows[0].total)
  await tx.query('update hr_timesheets set total_minutes = $2, updated_at = $3 where id = $1', [timesheetId, total, ctx.now])
  return total
}

export async function openTimesheet(
  ctx: TenantContext,
  input: { employeeId: string; periodStart: string; periodEnd: string },
): Promise<TimesheetRow> {
  ctx.require('record.create')
  if (input.periodEnd < input.periodStart) throw unprocessable('bad_period', 'The period ends before it starts.')

  return ctx.db.transaction(async (tx) => {
    const { rows: employee } = await tx.query('select 1 from hr_employees where id = $1 and tenant_id = $2 and archived_at is null', [
      input.employeeId,
      ctx.tenantId,
    ])
    if (!employee[0]) throw notFound('That employee')

    const { rows: existing } = await tx.query<Raw>(
      'select * from hr_timesheets where employee_id = $1 and period_start = $2',
      [input.employeeId, input.periodStart],
    )
    // Opening the same period twice returns the sheet that is already there.
    // Two sheets for one week is two sets of hours for the same days.
    if (existing[0]) return mapSheet(existing[0])

    const { rows } = await tx.query<Raw>(
      `insert into hr_timesheets (tenant_id, employee_id, period_start, period_end) values ($1,$2,$3,$4) returning *`,
      [ctx.tenantId, input.employeeId, input.periodStart, input.periodEnd],
    )
    return mapSheet(rows[0])
  })
}

export type EntryInput = {
  workedOn: string
  minutes: number
  projectCode?: string | null
  task?: string | null
  billable?: boolean
  note?: string | null
}

/**
 * Adds a line.
 *
 * Refused once the sheet has left draft, and refused if the day's total would
 * pass 24 hours — a day with 30 hours on it is a typo or a fraud, and either
 * way it should not reach payroll.
 */
export async function addEntry(ctx: TenantContext, timesheetId: string, input: EntryInput): Promise<TimesheetRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const sheet = await sheetForUpdate(tx, ctx, timesheetId)
    if (!EDITABLE.has(sheet.status as string)) {
      throw conflict(`That timesheet is ${sheet.status} and cannot be edited.`)
    }
    const start = iso(sheet.period_start as Date)
    const end = iso(sheet.period_end as Date)
    if (input.workedOn < start || input.workedOn > end) {
      throw unprocessable('outside_period', `${input.workedOn} is outside ${start} to ${end}.`)
    }

    const { rows: sameDay } = await tx.query<{ total: string }>(
      'select coalesce(sum(minutes), 0)::text as total from hr_timesheet_entries where timesheet_id = $1 and worked_on = $2',
      [timesheetId, input.workedOn],
    )
    if (Number(sameDay[0].total) + input.minutes > 1440) {
      throw unprocessable('day_over_24h', `${input.workedOn} would exceed 24 hours.`)
    }

    await tx.query(
      `insert into hr_timesheet_entries (tenant_id, timesheet_id, worked_on, minutes, project_code, task, billable, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        ctx.tenantId,
        timesheetId,
        input.workedOn,
        input.minutes,
        input.projectCode ?? null,
        input.task ?? null,
        input.billable ?? false,
        input.note ?? null,
      ],
    )
    const total = await recomputeTotal(tx, ctx, timesheetId)
    return { ...mapSheet(sheet), totalMinutes: total }
  })
}

export async function removeEntry(ctx: TenantContext, timesheetId: string, entryId: string): Promise<TimesheetRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const sheet = await sheetForUpdate(tx, ctx, timesheetId)
    if (!EDITABLE.has(sheet.status as string)) throw conflict(`That timesheet is ${sheet.status} and cannot be edited.`)

    const { rowCount } = await tx.query('delete from hr_timesheet_entries where id = $1 and timesheet_id = $2', [entryId, timesheetId])
    if (!rowCount) throw notFound('That entry')
    const total = await recomputeTotal(tx, ctx, timesheetId)
    return { ...mapSheet(sheet), totalMinutes: total }
  })
}

export async function listEntries(ctx: TenantContext, timesheetId: string): Promise<TimesheetEntryRow[]> {
  ctx.require('record.read')
  const { rows: sheet } = await ctx.db.query('select 1 from hr_timesheets where id = $1 and tenant_id = $2', [timesheetId, ctx.tenantId])
  if (!sheet[0]) throw notFound('That timesheet')

  const { rows } = await ctx.db.query<Raw>(
    'select * from hr_timesheet_entries where timesheet_id = $1 order by worked_on, created_at',
    [timesheetId],
  )
  return rows.map((row) => ({
    id: row.id as string,
    workedOn: iso(row.worked_on as Date),
    minutes: row.minutes as number,
    projectCode: (row.project_code as string) ?? null,
    task: (row.task as string) ?? null,
    billable: row.billable as boolean,
    note: (row.note as string) ?? null,
  }))
}

export async function submitTimesheet(ctx: TenantContext, timesheetId: string, version: number): Promise<TimesheetRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const sheet = await sheetForUpdate(tx, ctx, timesheetId)
    if (sheet.version !== version) throw conflict('Someone else changed this timesheet.', sheet.version as number)
    if (!EDITABLE.has(sheet.status as string)) throw unprocessable('not_editable', `That timesheet is already ${sheet.status}.`)

    const total = await recomputeTotal(tx, ctx, timesheetId)
    // An empty sheet submitted for approval is a request to approve nothing.
    if (total === 0) throw unprocessable('empty_timesheet', 'Add at least one entry before submitting.')

    await tx.query(
      `update hr_timesheets set status = 'submitted', submitted_at = $2, version = version + 1, updated_at = $2 where id = $1`,
      [timesheetId, ctx.now],
    )
    await recordAudit(tx, ctx, {
      action: 'hr.timesheet_submitted',
      resource: 'timesheet',
      resourceId: timesheetId,
      detail: { totalMinutes: total },
    })
    const { rows } = await tx.query<Raw>('select * from hr_timesheets where id = $1', [timesheetId])
    return mapSheet(rows[0])
  })
}

/**
 * Approves or rejects. Approval locks the sheet for good.
 *
 * A rejection returns it to an editable state so the person can fix it —
 * rejecting into a locked state would leave them with a permanent wrong sheet
 * and no way to correct it.
 */
export async function decideTimesheet(
  ctx: TenantContext,
  timesheetId: string,
  input: { decision: 'approved' | 'rejected'; version: number; note?: string | null },
): Promise<TimesheetRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const sheet = await sheetForUpdate(tx, ctx, timesheetId)
    if (sheet.version !== input.version) throw conflict('Someone else decided this timesheet.', sheet.version as number)
    if (sheet.status !== 'submitted') throw unprocessable('not_submitted', `That timesheet is ${sheet.status}, not submitted.`)

    await tx.query(
      `update hr_timesheets set status = $2, decided_by = $3, decided_at = $4, decision_note = $5,
              version = version + 1, updated_at = $4
        where id = $1`,
      [timesheetId, input.decision, ctx.userId, ctx.now, input.note ?? null],
    )
    await recordAudit(tx, ctx, {
      action: `hr.timesheet_${input.decision}`,
      resource: 'timesheet',
      resourceId: timesheetId,
      detail: { totalMinutes: sheet.total_minutes },
    })
    const { rows } = await tx.query<Raw>('select * from hr_timesheets where id = $1', [timesheetId])
    return mapSheet(rows[0])
  })
}

/* -------------------------------- overtime -------------------------------- */

export type OvertimeRow = {
  id: string
  employeeId: string
  workedOn: string
  minutes: number
  status: string
  version: number
}

const mapOvertime = (row: Raw): OvertimeRow => ({
  id: row.id as string,
  employeeId: row.employee_id as string,
  workedOn: iso(row.worked_on as Date),
  minutes: row.minutes as number,
  status: row.status as string,
  version: row.version as number,
})

/** One live claim per person per day — the index says so, not just this check. */
export async function requestOvertime(
  ctx: TenantContext,
  input: { employeeId: string; workedOn: string; minutes: number; reason?: string | null },
): Promise<OvertimeRow> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    const { rows: employee } = await tx.query('select 1 from hr_employees where id = $1 and tenant_id = $2 and archived_at is null', [
      input.employeeId,
      ctx.tenantId,
    ])
    if (!employee[0]) throw notFound('That employee')

    const { rows: live } = await tx.query<{ status: string }>(
      `select status from hr_overtime_requests
        where employee_id = $1 and worked_on = $2 and status in ('submitted','approved')`,
      [input.employeeId, input.workedOn],
    )
    if (live[0]) throw conflict(`Overtime for ${input.workedOn} is already ${live[0].status}.`)

    const { rows } = await tx.query<Raw>(
      `insert into hr_overtime_requests (tenant_id, employee_id, worked_on, minutes, reason) values ($1,$2,$3,$4,$5) returning *`,
      [ctx.tenantId, input.employeeId, input.workedOn, input.minutes, input.reason ?? null],
    )
    return mapOvertime(rows[0])
  })
}

export async function decideOvertime(
  ctx: TenantContext,
  overtimeId: string,
  input: { decision: 'approved' | 'rejected'; version: number },
): Promise<OvertimeRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Raw>('select * from hr_overtime_requests where id = $1 and tenant_id = $2 for update', [
      overtimeId,
      ctx.tenantId,
    ])
    if (!rows[0]) throw notFound('That overtime claim')
    if (rows[0].version !== input.version) throw conflict('Someone else decided this claim.', rows[0].version as number)
    if (rows[0].status !== 'submitted') throw unprocessable('already_decided', `That claim is already ${rows[0].status}.`)

    await tx.query(
      'update hr_overtime_requests set status = $2, decided_by = $3, decided_at = $4, version = version + 1, updated_at = $4 where id = $1',
      [overtimeId, input.decision, ctx.userId, ctx.now],
    )
    await recordAudit(tx, ctx, {
      action: `hr.overtime_${input.decision}`,
      resource: 'overtime',
      resourceId: overtimeId,
      detail: { minutes: rows[0].minutes },
    })
    const { rows: after } = await tx.query<Raw>('select * from hr_overtime_requests where id = $1', [overtimeId])
    return mapOvertime(after[0])
  })
}
