import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * People: the employee record, its employment history and the org vocabulary.
 *
 * Two decisions shape everything here.
 *
 * First, employment is a history. Hiring opens a position row; a transfer or a
 * promotion closes it and opens the next. The employee row carries the CURRENT
 * values as a convenience for lists, but the positions are the record — so
 * "what was this person's department in March" has an answer, and a correction
 * to today does not rewrite last year.
 *
 * Second, a manager chain must stay a tree. Setting a manager walks the chain
 * before it commits, because a cycle turns every org-chart query and every
 * approval route into an infinite loop.
 */

export type EmployeeRow = {
  id: string
  employeeNo: string
  userId: string | null
  fullName: string
  preferredName: string | null
  workEmail: string | null
  phone: string | null
  status: string
  employmentType: string | null
  joinedOn: string | null
  confirmedOn: string | null
  probationEndsOn: string | null
  exitedOn: string | null
  departmentId: string | null
  departmentName: string | null
  designationId: string | null
  designationName: string | null
  locationId: string | null
  locationName: string | null
  managerId: string | null
  managerName: string | null
  archivedAt: string | null
  version: number
}

type Raw = Record<string, unknown>

const day = (value: unknown): string | null =>
  value === null || value === undefined ? null : typeof value === 'string' ? value.slice(0, 10) : (value as Date).toISOString().slice(0, 10)

function mapEmployee(row: Raw): EmployeeRow {
  return {
    id: row.id as string,
    employeeNo: row.employee_no as string,
    userId: (row.user_id as string) ?? null,
    fullName: row.full_name as string,
    preferredName: (row.preferred_name as string) ?? null,
    workEmail: (row.work_email as string) ?? null,
    phone: (row.phone as string) ?? null,
    status: row.status as string,
    employmentType: (row.employment_type as string) ?? null,
    joinedOn: day(row.joined_on),
    confirmedOn: day(row.confirmed_on),
    probationEndsOn: day(row.probation_ends_on),
    exitedOn: day(row.exited_on),
    departmentId: (row.department_id as string) ?? null,
    departmentName: (row.department_name as string) ?? null,
    designationId: (row.designation_id as string) ?? null,
    designationName: (row.designation_name as string) ?? null,
    locationId: (row.location_id as string) ?? null,
    locationName: (row.location_name as string) ?? null,
    managerId: (row.manager_id as string) ?? null,
    managerName: (row.manager_name as string) ?? null,
    archivedAt: row.archived_at ? new Date(row.archived_at as string).toISOString() : null,
    version: row.version as number,
  }
}

const EMPLOYEE_SELECT = `e.*, d.name as department_name, g.name as designation_name,
         l.name as location_name, m.full_name as manager_name
    from hr_employees e
    left join hr_departments d on d.id = e.department_id
    left join hr_designations g on g.id = e.designation_id
    left join hr_locations l on l.id = e.location_id
    left join hr_employees m on m.id = e.manager_id`

/* ---------------------------- org vocabulary ----------------------------- */

export type VocabularyKind = 'department' | 'designation' | 'location'

/*
 * Three statements rather than one with the table name interpolated. The
 * `kind` is a closed union so a lookup would in fact be safe — but a statement
 * whose text is assembled at runtime has to be reasoned about every time
 * somebody reads it, and these do not.
 */
const VOCABULARY_LIST = {
  department: {
    all: 'select id, name from hr_departments where tenant_id = $1 order by lower(name)',
    live: 'select id, name from hr_departments where tenant_id = $1 and archived_at is null order by lower(name)',
  },
  designation: {
    all: 'select id, name from hr_designations where tenant_id = $1 order by lower(name)',
    live: 'select id, name from hr_designations where tenant_id = $1 and archived_at is null order by lower(name)',
  },
  location: {
    all: 'select id, name from hr_locations where tenant_id = $1 order by lower(name)',
    live: 'select id, name from hr_locations where tenant_id = $1 and archived_at is null order by lower(name)',
  },
} as const

const VOCABULARY_CLASH = {
  department: 'select 1 from hr_departments where tenant_id = $1 and lower(name) = lower($2)',
  designation: 'select 1 from hr_designations where tenant_id = $1 and lower(name) = lower($2)',
  location: 'select 1 from hr_locations where tenant_id = $1 and lower(name) = lower($2)',
} as const

const VOCABULARY_ARCHIVE = {
  department: 'update hr_departments set archived_at = $3 where id = $1 and tenant_id = $2 and archived_at is null',
  designation: 'update hr_designations set archived_at = $3 where id = $1 and tenant_id = $2 and archived_at is null',
  location: 'update hr_locations set archived_at = $3 where id = $1 and tenant_id = $2 and archived_at is null',
} as const

export async function listVocabulary(
  ctx: TenantContext,
  kind: VocabularyKind,
  includeArchived = false,
): Promise<{ id: string; name: string }[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{ id: string; name: string }>(
    VOCABULARY_LIST[kind][includeArchived ? 'all' : 'live'],
    [ctx.tenantId],
  )
  return rows
}

export async function createVocabulary(
  ctx: TenantContext,
  kind: VocabularyKind,
  input: { name: string; code?: string | null; parentId?: string | null; timezone?: string; calendarId?: string | null },
): Promise<{ id: string; name: string }> {
  ctx.require('settings.manage')

  const { rows: clash } = await ctx.db.query(VOCABULARY_CLASH[kind], [ctx.tenantId, input.name])
  if (clash[0]) throw unprocessable('duplicate_name', `${input.name} already exists.`)

  if (kind === 'department') {
    const { rows } = await ctx.db.query<{ id: string; name: string }>(
      'insert into hr_departments (tenant_id, name, code, parent_id) values ($1,$2,$3,$4) returning id, name',
      [ctx.tenantId, input.name, input.code ?? null, input.parentId ?? null],
    )
    return rows[0]
  }
  if (kind === 'location') {
    const { rows } = await ctx.db.query<{ id: string; name: string }>(
      'insert into hr_locations (tenant_id, name, timezone, calendar_id) values ($1,$2,$3,$4) returning id, name',
      [ctx.tenantId, input.name, input.timezone ?? 'UTC', input.calendarId ?? null],
    )
    return rows[0]
  }
  const { rows } = await ctx.db.query<{ id: string; name: string }>(
    'insert into hr_designations (tenant_id, name, grade) values ($1,$2,$3) returning id, name',
    [ctx.tenantId, input.name, input.code ?? null],
  )
  return rows[0]
}

/* -------------------------------- employees ------------------------------- */

/** The next employee number, allocated under a row lock so two hires cannot share one. */
export async function nextEmployeeNo(tx: Db, ctx: TenantContext): Promise<string> {
  await tx.query('insert into hr_employee_sequences (tenant_id) values ($1) on conflict do nothing', [ctx.tenantId])
  const { rows } = await tx.query<{ prefix: string; next_value: string; padding: number }>(
    'select prefix, next_value::text, padding from hr_employee_sequences where tenant_id = $1 for update',
    [ctx.tenantId],
  )
  await tx.query('update hr_employee_sequences set next_value = next_value + 1, updated_at = $2 where tenant_id = $1', [
    ctx.tenantId,
    ctx.now,
  ])
  return `${rows[0].prefix}-${rows[0].next_value.padStart(rows[0].padding, '0')}`
}

export type HireInput = {
  fullName: string
  employeeNo?: string
  userId?: string | null
  preferredName?: string | null
  workEmail?: string | null
  personalEmail?: string | null
  phone?: string | null
  dateOfBirth?: string | null
  employmentType?: string | null
  joinedOn: string
  probationEndsOn?: string | null
  departmentId?: string | null
  designationId?: string | null
  locationId?: string | null
  managerId?: string | null
  status?: 'pre_joining' | 'probation' | 'active'
}

/**
 * Hires someone: the employee record and its first position, in one transaction.
 *
 * A record without an opening position would have no history at all, which is
 * the thing this module exists to keep.
 */
export async function hireEmployee(ctx: TenantContext, input: HireInput): Promise<EmployeeRow> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    const employeeNo = input.employeeNo?.trim() || (await nextEmployeeNo(tx, ctx))

    const { rows: clash } = await tx.query('select 1 from hr_employees where tenant_id = $1 and lower(employee_no) = lower($2)', [
      ctx.tenantId,
      employeeNo,
    ])
    if (clash[0]) throw unprocessable('duplicate_employee_no', `Employee number ${employeeNo} is already in use.`)

    if (input.workEmail) {
      const { rows: mail } = await tx.query('select 1 from hr_employees where tenant_id = $1 and lower(work_email) = lower($2)', [
        ctx.tenantId,
        input.workEmail,
      ])
      if (mail[0]) throw unprocessable('duplicate_work_email', `${input.workEmail} already belongs to another employee.`)
    }

    if (input.userId) await assertMember(tx, ctx, input.userId)
    if (input.managerId) await assertEmployee(tx, ctx, input.managerId)

    const status = input.status ?? (input.probationEndsOn ? 'probation' : 'active')
    const { rows } = await tx.query<{ id: string }>(
      `insert into hr_employees
         (tenant_id, company_id, employee_no, user_id, full_name, preferred_name, work_email, personal_email,
          phone, date_of_birth, status, employment_type, joined_on, probation_ends_on,
          department_id, designation_id, location_id, manager_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       returning id`,
      [
        ctx.tenantId,
        ctx.companyId,
        employeeNo,
        input.userId ?? null,
        input.fullName,
        input.preferredName ?? null,
        input.workEmail ?? null,
        input.personalEmail ?? null,
        input.phone ?? null,
        input.dateOfBirth ?? null,
        status,
        input.employmentType ?? null,
        input.joinedOn,
        input.probationEndsOn ?? null,
        input.departmentId ?? null,
        input.designationId ?? null,
        input.locationId ?? null,
        input.managerId ?? null,
        ctx.userId,
      ],
    )
    const employeeId = rows[0].id

    await tx.query(
      `insert into hr_positions
         (tenant_id, employee_id, department_id, designation_id, location_id, manager_id, employment_type, effective_from, reason, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'hire',$9)`,
      [
        ctx.tenantId,
        employeeId,
        input.departmentId ?? null,
        input.designationId ?? null,
        input.locationId ?? null,
        input.managerId ?? null,
        input.employmentType ?? null,
        input.joinedOn,
        ctx.userId,
      ],
    )
    await logEmployment(tx, ctx, employeeId, { kind: 'hired', toValue: status, effectiveOn: input.joinedOn })
    await recordAudit(tx, ctx, {
      action: 'hr.employee_hired',
      resource: 'employee',
      resourceId: employeeId,
      detail: { employeeNo },
    })
    return readEmployeeOn(tx, ctx, employeeId)
  })
}

async function assertMember(tx: Db, ctx: TenantContext, userId: string): Promise<void> {
  const { rows } = await tx.query('select 1 from memberships where tenant_id = $1 and user_id = $2 and status = $3', [
    ctx.tenantId,
    userId,
    'active',
  ])
  if (!rows[0]) throw notFound('That person')
}

async function assertEmployee(tx: Db, ctx: TenantContext, employeeId: string): Promise<void> {
  const { rows } = await tx.query('select 1 from hr_employees where id = $1 and tenant_id = $2', [employeeId, ctx.tenantId])
  if (!rows[0]) throw notFound('That employee')
}

async function logEmployment(
  tx: Db,
  ctx: TenantContext,
  employeeId: string,
  input: { kind: string; fromValue?: string | null; toValue?: string | null; effectiveOn?: string | null; note?: string | null },
): Promise<void> {
  await tx.query(
    `insert into hr_employment_events (tenant_id, employee_id, kind, from_value, to_value, effective_on, note, actor_user_id, occurred_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      ctx.tenantId,
      employeeId,
      input.kind,
      input.fromValue ?? null,
      input.toValue ?? null,
      input.effectiveOn ?? null,
      input.note ?? null,
      ctx.userId,
      ctx.now,
    ],
  )
}

async function readEmployeeOn(db: Db, ctx: TenantContext, employeeId: string): Promise<EmployeeRow> {
  const { rows } = await db.query<Raw>(`select ${EMPLOYEE_SELECT} where e.id = $1 and e.tenant_id = $2`, [employeeId, ctx.tenantId])
  if (!rows[0]) throw notFound('That employee')
  return mapEmployee(rows[0])
}

export async function readEmployee(ctx: TenantContext, employeeId: string): Promise<EmployeeRow> {
  ctx.require('record.read')
  return readEmployeeOn(ctx.db, ctx, employeeId)
}

export type ListEmployeeOptions = {
  q?: string
  status?: string
  departmentId?: string
  designationId?: string
  locationId?: string
  managerId?: string
  employmentType?: string
  /** Joined on or after / on or before — the directory's "Joined" range. */
  joinedFrom?: string
  joinedTo?: string
  includeArchived?: boolean
  limit?: number
  offset?: number
}

export async function listEmployees(
  ctx: TenantContext,
  options: ListEmployeeOptions = {},
): Promise<{ rows: EmployeeRow[]; total: number }> {
  ctx.require('record.read')
  const filters = ['e.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (!options.includeArchived) filters.push('e.archived_at is null')
  if (options.status) add('e.status = $?', options.status)
  if (options.departmentId) add('e.department_id = $?', options.departmentId)
  if (options.designationId) add('e.designation_id = $?', options.designationId)
  if (options.locationId) add('e.location_id = $?', options.locationId)
  if (options.managerId) add('e.manager_id = $?', options.managerId)
  if (options.employmentType) add('e.employment_type = $?', options.employmentType)
  if (options.joinedFrom) add('e.joined_on >= $?', options.joinedFrom)
  if (options.joinedTo) add('e.joined_on <= $?', options.joinedTo)
  if (options.q?.trim()) {
    params.push(`%${options.q.trim().toLowerCase()}%`)
    const index = params.length
    filters.push(`(lower(e.full_name) like $${index} or lower(e.employee_no) like $${index}
                   or lower(coalesce(e.work_email,'')) like $${index})`)
  }
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from hr_employees e where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Raw>(
    `select ${EMPLOYEE_SELECT} where ${where} order by e.full_name limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return { total: Number(counted[0].n), rows: rows.map(mapEmployee) }
}

/**
 * Walks up the manager chain to see whether `candidate` already reports to
 * `employeeId`. Making someone report to their own subordinate creates a cycle
 * that no org chart, approval route or recursive query can survive.
 */
async function wouldCycle(tx: Db, ctx: TenantContext, employeeId: string, candidateManagerId: string): Promise<boolean> {
  let cursor: string | null = candidateManagerId
  for (let hops = 0; cursor && hops < 200; hops += 1) {
    if (cursor === employeeId) return true
    const { rows }: { rows: { manager_id: string | null }[] } = await tx.query<{ manager_id: string | null }>(
      'select manager_id from hr_employees where id = $1 and tenant_id = $2',
      [cursor, ctx.tenantId],
    )
    cursor = rows[0]?.manager_id ?? null
  }
  return false
}

export type TransferInput = {
  effectiveFrom: string
  departmentId?: string | null
  designationId?: string | null
  locationId?: string | null
  managerId?: string | null
  employmentType?: string | null
  reason: string
  version: number
}

/**
 * A transfer, promotion or reporting change.
 *
 * Closes the open position the day before the new one starts and opens the
 * next. The employee row is updated to match so lists stay cheap, but the
 * position rows are what the history is read from.
 */
export async function transferEmployee(ctx: TenantContext, employeeId: string, input: TransferInput): Promise<EmployeeRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{
      version: number
      status: string
      department_id: string | null
      designation_id: string | null
      location_id: string | null
      manager_id: string | null
      employment_type: string | null
    }>(
      `select version, status, department_id, designation_id, location_id, manager_id, employment_type
         from hr_employees where id = $1 and tenant_id = $2 for update`,
      [employeeId, ctx.tenantId],
    )
    const current = rows[0]
    if (!current) throw notFound('That employee')
    if (current.version !== input.version) throw conflict('Someone else changed this record.', current.version)
    if (current.status === 'exited') throw unprocessable('employee_exited', 'That employee has left.')

    const managerId = input.managerId === undefined ? current.manager_id : input.managerId
    if (managerId) {
      if (managerId === employeeId) throw unprocessable('manager_cycle', 'Somebody cannot report to themselves.')
      await assertEmployee(tx, ctx, managerId)
      if (await wouldCycle(tx, ctx, employeeId, managerId)) {
        throw unprocessable('manager_cycle', 'That reporting line loops back on itself.')
      }
    }

    const next = {
      departmentId: input.departmentId === undefined ? current.department_id : input.departmentId,
      designationId: input.designationId === undefined ? current.designation_id : input.designationId,
      locationId: input.locationId === undefined ? current.location_id : input.locationId,
      managerId,
      employmentType: input.employmentType === undefined ? current.employment_type : input.employmentType,
    }

    // The previous position ends the day before the new one begins, so the two
    // never claim the same day and never leave a gap.
    const endsOn = new Date(`${input.effectiveFrom}T00:00:00Z`)
    endsOn.setUTCDate(endsOn.getUTCDate() - 1)
    await tx.query(
      'update hr_positions set effective_to = $3 where employee_id = $1 and tenant_id = $2 and effective_to is null',
      [employeeId, ctx.tenantId, endsOn.toISOString().slice(0, 10)],
    )
    await tx.query(
      `insert into hr_positions
         (tenant_id, employee_id, department_id, designation_id, location_id, manager_id, employment_type, effective_from, reason, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        ctx.tenantId,
        employeeId,
        next.departmentId,
        next.designationId,
        next.locationId,
        next.managerId,
        next.employmentType,
        input.effectiveFrom,
        input.reason,
        ctx.userId,
      ],
    )
    await tx.query(
      `update hr_employees set department_id = $3, designation_id = $4, location_id = $5, manager_id = $6,
              employment_type = $7, version = version + 1, updated_at = $8
        where id = $1 and tenant_id = $2`,
      [
        employeeId,
        ctx.tenantId,
        next.departmentId,
        next.designationId,
        next.locationId,
        next.managerId,
        next.employmentType,
        ctx.now,
      ],
    )
    await logEmployment(tx, ctx, employeeId, { kind: 'transferred', effectiveOn: input.effectiveFrom, note: input.reason })
    await recordAudit(tx, ctx, { action: 'hr.employee_transferred', resource: 'employee', resourceId: employeeId })
    return readEmployeeOn(tx, ctx, employeeId)
  })
}

/** Confirms someone out of probation. */
export async function confirmEmployee(ctx: TenantContext, employeeId: string, confirmedOn: string, version: number): Promise<EmployeeRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number; status: string }>(
      'select version, status from hr_employees where id = $1 and tenant_id = $2 for update',
      [employeeId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That employee')
    if (rows[0].version !== version) throw conflict('Someone else changed this record.', rows[0].version)
    if (rows[0].status === 'exited') throw unprocessable('employee_exited', 'That employee has left.')
    if (rows[0].status === 'active' ) throw unprocessable('already_confirmed', 'That employee is already confirmed.')

    await tx.query(
      `update hr_employees set status = 'active', confirmed_on = $3, version = version + 1, updated_at = $4
        where id = $1 and tenant_id = $2`,
      [employeeId, ctx.tenantId, confirmedOn, ctx.now],
    )
    await logEmployment(tx, ctx, employeeId, { kind: 'confirmed', fromValue: rows[0].status, toValue: 'active', effectiveOn: confirmedOn })
    await recordAudit(tx, ctx, { action: 'hr.employee_confirmed', resource: 'employee', resourceId: employeeId })
    return readEmployeeOn(tx, ctx, employeeId)
  })
}

export type ExitInput = { exitedOn: string; reason: string; version: number; note?: string | null }

/**
 * Records an exit.
 *
 * Closes the open position and refuses while the person still manages someone,
 * because an orphaned reporting line silently breaks every approval that
 * routes through them. It does NOT delete the record: an ex-employee's
 * attendance, leave and pay history must survive them leaving.
 */
export async function exitEmployee(ctx: TenantContext, employeeId: string, input: ExitInput): Promise<EmployeeRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number; status: string }>(
      'select version, status from hr_employees where id = $1 and tenant_id = $2 for update',
      [employeeId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That employee')
    if (rows[0].version !== input.version) throw conflict('Someone else changed this record.', rows[0].version)
    if (rows[0].status === 'exited') throw unprocessable('already_exited', 'That employee has already left.')

    const { rows: reports } = await tx.query<{ n: string }>(
      `select count(*)::text as n from hr_employees
        where manager_id = $1 and tenant_id = $2 and status <> 'exited' and archived_at is null`,
      [employeeId, ctx.tenantId],
    )
    if (Number(reports[0].n) > 0) {
      throw unprocessable('has_reports', `Reassign their ${reports[0].n} direct report(s) before recording the exit.`)
    }

    await tx.query(
      'update hr_positions set effective_to = $3 where employee_id = $1 and tenant_id = $2 and effective_to is null',
      [employeeId, ctx.tenantId, input.exitedOn],
    )
    await tx.query(
      `update hr_employees set status = 'exited', exited_on = $3, exit_reason = $4, version = version + 1, updated_at = $5
        where id = $1 and tenant_id = $2`,
      [employeeId, ctx.tenantId, input.exitedOn, input.reason, ctx.now],
    )
    await logEmployment(tx, ctx, employeeId, {
      kind: 'exited',
      fromValue: rows[0].status,
      toValue: 'exited',
      effectiveOn: input.exitedOn,
      note: input.note ?? input.reason,
    })
    await recordAudit(tx, ctx, {
      action: 'hr.employee_exited',
      resource: 'employee',
      resourceId: employeeId,
      detail: { reason: input.reason },
    })
    return readEmployeeOn(tx, ctx, employeeId)
  })
}

export type PositionRow = {
  departmentName: string | null
  designationName: string | null
  locationName: string | null
  managerName: string | null
  effectiveFrom: string
  effectiveTo: string | null
  reason: string | null
}

export async function employmentHistory(ctx: TenantContext, employeeId: string): Promise<PositionRow[]> {
  ctx.require('record.read')
  await readEmployee(ctx, employeeId)
  const { rows } = await ctx.db.query<Raw>(
    `select d.name as department_name, g.name as designation_name, l.name as location_name,
            m.full_name as manager_name, p.effective_from, p.effective_to, p.reason
       from hr_positions p
       left join hr_departments d on d.id = p.department_id
       left join hr_designations g on g.id = p.designation_id
       left join hr_locations l on l.id = p.location_id
       left join hr_employees m on m.id = p.manager_id
      where p.employee_id = $1 and p.tenant_id = $2
      order by p.effective_from desc`,
    [employeeId, ctx.tenantId],
  )
  return rows.map((row) => ({
    departmentName: (row.department_name as string) ?? null,
    designationName: (row.designation_name as string) ?? null,
    locationName: (row.location_name as string) ?? null,
    managerName: (row.manager_name as string) ?? null,
    effectiveFrom: day(row.effective_from) as string,
    effectiveTo: day(row.effective_to),
    reason: (row.reason as string) ?? null,
  }))
}

/**
 * The employee record behind the signed-in account, or null.
 *
 * This is what employee self-service resolves. The prototype's portal reported
 * "no linked profile" for everybody because there was no link to resolve; here
 * it is a real column with a unique index behind it.
 */
export async function selfEmployee(ctx: TenantContext): Promise<EmployeeRow | null> {
  const { rows } = await ctx.db.query<Raw>(`select ${EMPLOYEE_SELECT} where e.user_id = $1 and e.tenant_id = $2`, [
    ctx.userId,
    ctx.tenantId,
  ])
  return rows[0] ? mapEmployee(rows[0]) : null
}

/** Links a platform account to an employee record so they can use self-service. */
export async function linkEmployeeAccount(ctx: TenantContext, employeeId: string, userId: string | null): Promise<EmployeeRow> {
  ctx.require('member.manage')

  return ctx.db.transaction(async (tx) => {
    if (userId) {
      await assertMember(tx, ctx, userId)
      const { rows: taken } = await tx.query<{ id: string }>(
        'select id from hr_employees where tenant_id = $1 and user_id = $2 and id <> $3',
        [ctx.tenantId, userId, employeeId],
      )
      if (taken[0]) throw conflict('That account is already linked to another employee.')
    }
    const { rowCount } = await tx.query(
      'update hr_employees set user_id = $3, version = version + 1, updated_at = $4 where id = $1 and tenant_id = $2',
      [employeeId, ctx.tenantId, userId, ctx.now],
    )
    if (!rowCount) throw notFound('That employee')
    await recordAudit(tx, ctx, { action: 'hr.account_linked', resource: 'employee', resourceId: employeeId })
    return readEmployeeOn(tx, ctx, employeeId)
  })
}

/**
 * Retires a taxonomy entry.
 *
 * Archived, never deleted: employees, positions and requisitions still point
 * at the row, and removing it would either fail on the foreign key or blank
 * out the department somebody worked in. `listVocabulary` already hides
 * archived entries, so the list the screens show is the list you may still
 * choose from.
 */
export async function archiveVocabulary(ctx: TenantContext, kind: VocabularyKind, id: string): Promise<void> {
  ctx.require('settings.manage')

  const { rowCount } = await ctx.db.query(VOCABULARY_ARCHIVE[kind], [id, ctx.tenantId, ctx.now])
  // Already archived reads as absent, which is the same answer a second
  // Remove click deserves: the entry is gone from the list either way.
  if (!rowCount) throw notFound('That entry')
  await recordAudit(ctx.db, ctx, { action: 'hr.vocabulary_archived', resource: kind, resourceId: id })
}

/* --------------------------- lifecycle changes ---------------------------- */

export type LifecycleChange = {
  id: string
  employeeId: string
  employeeName: string
  effectiveFrom: string
  effectiveTo: string | null
  reason: string | null
  departmentFrom: string | null
  departmentTo: string | null
  designationFrom: string | null
  designationTo: string | null
  locationFrom: string | null
  locationTo: string | null
  managerFrom: string | null
  managerTo: string | null
}

/**
 * Every position change in the tenant, with what it changed FROM.
 *
 * The "from" side comes from the previous position of the same employee rather
 * than from a stored copy, so a correction to an old row cannot leave a
 * before/after pair that never existed.
 *
 * `kind` splits the two sub-tabs the screen shows. The schema records one
 * free-text reason, not a promotion/transfer enum, so 'promotion' means "the
 * reason says so" and 'transfer' means everything else. Partitioning it that
 * way rather than matching both words is deliberate: a change reasoned
 * "restructure" has to appear under one of the two tabs, not vanish between
 * them.
 */
export async function lifecycleChanges(
  ctx: TenantContext,
  options: { kind?: 'promotion' | 'transfer'; employeeId?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: LifecycleChange[]; total: number }> {
  ctx.require('record.read')

  const filters = ["r.reason is distinct from 'hire'"]
  const params: unknown[] = [ctx.tenantId]
  if (options.employeeId) {
    params.push(options.employeeId)
    filters.push(`r.employee_id = $${params.length}`)
  }
  if (options.kind === 'promotion') filters.push("lower(coalesce(r.reason, '')) like '%promotion%'")
  if (options.kind === 'transfer') filters.push("lower(coalesce(r.reason, '')) not like '%promotion%'")
  const where = filters.join(' and ')

  const ranked = `
    with ranked as (
      select p.*,
             lag(p.department_id)  over w as prev_department_id,
             lag(p.designation_id) over w as prev_designation_id,
             lag(p.location_id)    over w as prev_location_id,
             lag(p.manager_id)     over w as prev_manager_id
        from hr_positions p
       where p.tenant_id = $1
      window w as (partition by p.employee_id order by p.effective_from, p.created_at)
    )`

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `${ranked} select count(*)::text as n from ranked r where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Raw>(
    `${ranked}
     select r.id, r.employee_id, e.full_name as employee_name, r.effective_from, r.effective_to, r.reason,
            dn.name as department_to, dp.name as department_from,
            gn.name as designation_to, gp.name as designation_from,
            ln.name as location_to, lp.name as location_from,
            mn.full_name as manager_to, mp.full_name as manager_from
       from ranked r
       join hr_employees e on e.id = r.employee_id
       left join hr_departments  dn on dn.id = r.department_id
       left join hr_departments  dp on dp.id = r.prev_department_id
       left join hr_designations gn on gn.id = r.designation_id
       left join hr_designations gp on gp.id = r.prev_designation_id
       left join hr_locations    ln on ln.id = r.location_id
       left join hr_locations    lp on lp.id = r.prev_location_id
       left join hr_employees    mn on mn.id = r.manager_id
       left join hr_employees    mp on mp.id = r.prev_manager_id
      where ${where}
      order by r.effective_from desc, r.created_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )

  return {
    total: Number(counted[0].n),
    rows: rows.map((row) => ({
      id: row.id as string,
      employeeId: row.employee_id as string,
      employeeName: row.employee_name as string,
      effectiveFrom: day(row.effective_from) as string,
      effectiveTo: day(row.effective_to),
      reason: (row.reason as string) ?? null,
      departmentFrom: (row.department_from as string) ?? null,
      departmentTo: (row.department_to as string) ?? null,
      designationFrom: (row.designation_from as string) ?? null,
      designationTo: (row.designation_to as string) ?? null,
      locationFrom: (row.location_from as string) ?? null,
      locationTo: (row.location_to as string) ?? null,
      managerFrom: (row.manager_from as string) ?? null,
      managerTo: (row.manager_to as string) ?? null,
    })),
  }
}

/* ------------------------------- documents -------------------------------- */

export type EmployeeDocumentRow = {
  id: string
  employeeId: string
  employeeName: string
  fileId: string
  filename: string
  byteSize: number
  kind: string
  visibility: string
  validUntil: string | null
  uploadedAt: string
}

/**
 * HR-held employee documents.
 *
 * Expiry is returned as the date it is, not as an "expired" flag: the screen
 * decides what to highlight against the day it is rendered, and a flag
 * computed at query time would be stale the moment it was cached.
 */
export async function listEmployeeDocuments(
  ctx: TenantContext,
  options: { employeeId?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: EmployeeDocumentRow[]; total: number }> {
  ctx.require('record.read')

  const params: unknown[] = [ctx.tenantId]
  let where = 'd.tenant_id = $1'
  if (options.employeeId) {
    params.push(options.employeeId)
    where += ` and d.employee_id = $${params.length}`
  }

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from hr_employee_documents d where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Raw>(
    `select d.id, d.employee_id, e.full_name as employee_name, d.file_id, f.filename, f.byte_size,
            d.kind, d.visibility, d.valid_until, d.created_at
       from hr_employee_documents d
       join hr_employees e on e.id = d.employee_id
       join files f on f.id = d.file_id
      where ${where}
      order by d.created_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )

  return {
    total: Number(counted[0].n),
    rows: rows.map((row) => ({
      id: row.id as string,
      employeeId: row.employee_id as string,
      employeeName: row.employee_name as string,
      fileId: row.file_id as string,
      filename: row.filename as string,
      byteSize: Number(row.byte_size),
      kind: row.kind as string,
      visibility: row.visibility as string,
      validUntil: day(row.valid_until),
      uploadedAt: new Date(row.created_at as string).toISOString(),
    })),
  }
}

/* -------------------------------- overview -------------------------------- */

export type HrOverview = {
  headcount: number
  onProbation: number
  joinersThisMonth: number
  leaversThisMonth: number
  onLeaveToday: number
  byDepartment: { departmentId: string | null; name: string | null; headcount: number }[]
  pendingApprovals: { leave: number; timesheets: number; overtime: number }
  /** Figures this deployment cannot compute, and why. Rendered, never zeroed. */
  unavailable: { metric: string; reason: string }[]
}

/**
 * What the HR dashboard shows, computed from the rows the screens themselves read.
 *
 * Attrition and "onboardings in flight" are deliberately absent rather than
 * zero: nothing stores the denominator for the first, and there is no
 * onboarding model at all for the second. They are reported in `unavailable`
 * so the screen can say so instead of animating a 0 that looks measured.
 */
export async function hrOverview(ctx: TenantContext): Promise<HrOverview> {
  ctx.require('record.read')

  const monthStart = new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), 1)).toISOString().slice(0, 10)
  const monthEnd = new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
  const today = ctx.now.toISOString().slice(0, 10)

  const [people, departments, pending] = await Promise.all([
    ctx.db.query<{ headcount: string; probation: string; joiners: string; leavers: string; on_leave: string }>(
      `select
         count(*) filter (where status in ('active','probation','notice'))::text as headcount,
         count(*) filter (where status = 'probation')::text as probation,
         count(*) filter (where joined_on >= $2 and joined_on < $3)::text as joiners,
         count(*) filter (where exited_on >= $2 and exited_on < $3)::text as leavers,
         (select count(*) from hr_leave_request_days d
            join hr_leave_requests r on r.id = d.request_id
           where d.tenant_id = $1 and d.leave_on = $4 and r.status = 'approved')::text as on_leave
       from hr_employees where tenant_id = $1 and archived_at is null`,
      [ctx.tenantId, monthStart, monthEnd, today],
    ),
    // Left join from the employee, so people with no department are their own
    // visible bucket rather than quietly missing from the breakdown.
    ctx.db.query<{ department_id: string | null; name: string | null; n: string }>(
      `select e.department_id, d.name, count(*)::text as n
         from hr_employees e
         left join hr_departments d on d.id = e.department_id
        where e.tenant_id = $1 and e.archived_at is null and e.status in ('active','probation','notice')
        group by e.department_id, d.name
        order by count(*) desc, d.name nulls last`,
      [ctx.tenantId],
    ),
    ctx.db.query<{ leave: string; timesheets: string; overtime: string }>(
      `select
         (select count(*) from hr_leave_requests where tenant_id = $1 and status = 'submitted')::text as leave,
         (select count(*) from hr_timesheets where tenant_id = $1 and status = 'submitted')::text as timesheets,
         (select count(*) from hr_overtime_requests where tenant_id = $1 and status = 'submitted')::text as overtime`,
      [ctx.tenantId],
    ),
  ])

  return {
    headcount: Number(people.rows[0].headcount),
    onProbation: Number(people.rows[0].probation),
    joinersThisMonth: Number(people.rows[0].joiners),
    leaversThisMonth: Number(people.rows[0].leavers),
    onLeaveToday: Number(people.rows[0].on_leave),
    byDepartment: departments.rows.map((row) => ({
      departmentId: row.department_id,
      name: row.name,
      headcount: Number(row.n),
    })),
    pendingApprovals: {
      leave: Number(pending.rows[0].leave),
      timesheets: Number(pending.rows[0].timesheets),
      overtime: Number(pending.rows[0].overtime),
    },
    unavailable: [
      { metric: 'Attrition', reason: 'Nothing stores the average headcount a rate would be measured against.' },
      { metric: 'Open positions', reason: 'Recruitment is not available on this deployment.' },
      { metric: 'Onboardings in flight', reason: 'There is no onboarding model on this deployment.' },
    ],
  }
}
