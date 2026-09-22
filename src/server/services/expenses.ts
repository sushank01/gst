import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { decimalText, toDecimal, toMinor } from './sales.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Expenses, reports and reimbursement.
 *
 * Money leaves the business at the end of this pipeline, so the design is
 * shaped by the ways it leaves twice. An expense belongs to at most one
 * report; a card line matches at most one expense; a report is paid at most
 * once. All three are unique indexes rather than checks in a handler, because
 * the handler is the part that gets retried.
 *
 * Conversion is recorded, not recomputed. Each expense stores its own amount
 * and currency, the rate applied, and the resulting base amount. Re-deriving a
 * conversion later at a different rate is how a total stops reconciling with
 * the lines under it.
 */

export type ExpenseRow = {
  id: string
  employeeId: string
  reportId: string | null
  categoryId: string | null
  spentOn: string
  merchant: string | null
  description: string | null
  amount: string
  currency: string
  fxRate: string
  baseAmount: string
  baseCurrency: string
  receiptFileId: string | null
  reimbursable: boolean
  policyFlags: PolicyFlag[]
  version: number
}

export type PolicyFlag = { code: string; message: string }

export type ReportRow = {
  id: string
  reference: string
  employeeId: string
  title: string
  currency: string
  status: string
  currentLevel: number
  approvalRound: number
  totalAmount: string
  approvedAmount: string | null
  policyFlags: PolicyFlag[]
  reimbursedAt: string | null
  version: number
}

type Raw = Record<string, unknown>

const day = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, 10) : (value as Date).toISOString().slice(0, 10)

const mapExpense = (row: Raw): ExpenseRow => ({
  id: row.id as string,
  employeeId: row.employee_id as string,
  reportId: (row.report_id as string) ?? null,
  categoryId: (row.category_id as string) ?? null,
  spentOn: day(row.spent_on),
  merchant: (row.merchant as string) ?? null,
  description: (row.description as string) ?? null,
  amount: decimalText(row.amount) as string,
  currency: row.currency as string,
  fxRate: decimalText(row.fx_rate) as string,
  baseAmount: decimalText(row.base_amount) as string,
  baseCurrency: row.base_currency as string,
  receiptFileId: (row.receipt_file_id as string) ?? null,
  reimbursable: row.reimbursable as boolean,
  policyFlags: (row.policy_flags as PolicyFlag[]) ?? [],
  version: row.version as number,
})

const mapReport = (row: Raw): ReportRow => ({
  id: row.id as string,
  reference: row.reference as string,
  employeeId: row.employee_id as string,
  title: row.title as string,
  currency: row.currency as string,
  status: row.status as string,
  currentLevel: row.current_level as number,
  approvalRound: row.approval_round as number,
  totalAmount: decimalText(row.total_amount) as string,
  approvedAmount: decimalText(row.approved_amount),
  policyFlags: (row.policy_flags as PolicyFlag[]) ?? [],
  reimbursedAt: row.reimbursed_at ? new Date(row.reimbursed_at as string).toISOString() : null,
  version: row.version as number,
})

/** The editable states. Anything else has been sent for somebody to act on. */
const DRAFTABLE = new Set(['draft', 'rejected'])

async function nextReference(tx: Db, ctx: TenantContext, prefix: string, table: 'te_expense_reports' | 'te_travel_requests' | 'te_reimbursement_runs'): Promise<string> {
  /*
   * Counting existing rows under a lock rather than keeping a sequence table:
   * these documents are low-volume and per-tenant, and the lock is on the
   * tenant row so two concurrent creates serialise. A gap-free number is not
   * required here, only a unique one.
   */
  await tx.query('select 1 from tenants where id = $1 for update', [ctx.tenantId])
  const year = ctx.now.getUTCFullYear()
  const { rows } =
    table === 'te_expense_reports'
      ? await tx.query<{ n: string }>('select count(*)::text as n from te_expense_reports where tenant_id = $1', [ctx.tenantId])
      : table === 'te_travel_requests'
        ? await tx.query<{ n: string }>('select count(*)::text as n from te_travel_requests where tenant_id = $1', [ctx.tenantId])
        : await tx.query<{ n: string }>('select count(*)::text as n from te_reimbursement_runs where tenant_id = $1', [ctx.tenantId])
  return `${prefix}-${year}-${String(Number(rows[0].n) + 1).padStart(4, '0')}`
}

export type RecordExpenseInput = {
  employeeId: string
  spentOn: string
  amount: string
  currency: string
  baseCurrency: string
  /** Required when the currencies differ; ignored when they match. */
  fxRate?: string
  categoryId?: string | null
  merchant?: string | null
  description?: string | null
  receiptFileId?: string | null
  reimbursable?: boolean
}

/** Decimal places kept for an amount, matching numeric(18,4). */
const AMOUNT_SCALE = 4n
/** Decimal places kept for an FX rate, matching numeric(18,8). */
const RATE_SCALE = 8n

/** Parses a decimal string into integer units at `scale` decimal places, half-up. */
function scaled(value: string, scale: bigint): bigint {
  const trimmed = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) throw unprocessable('bad_number', `${value} is not a number.`)
  const negative = trimmed.startsWith('-')
  const [whole, fraction = ''] = trimmed.replace('-', '').split('.')
  const places = Number(scale)
  const kept = fraction.slice(0, places).padEnd(places, '0')
  const next = fraction[places]
  let units = BigInt(whole + kept)
  if (next && Number(next) >= 5) units += 1n
  return negative ? -units : units
}

/**
 * Converts an amount at a stated rate, in integer units.
 *
 * The rate keeps EIGHT decimals, because that is what the column stores and
 * what a rate feed publishes. Rounding it to four first — which a shared
 * four-decimal helper would do — turns 0.33335 into 0.3333 and quietly changes
 * what somebody is paid. Exported because the figure it produces is the one
 * the approval chain and the payout both use; a second implementation would
 * eventually disagree with this one.
 */
export function convert(amount: string, fxRate: string): string {
  const units = scaled(amount, AMOUNT_SCALE) * scaled(fxRate, RATE_SCALE)
  // The product carries AMOUNT_SCALE + RATE_SCALE decimals; bring it back to
  // AMOUNT_SCALE, rounding half up on the first digit dropped.
  const divisor = 10n ** RATE_SCALE
  const quotient = units / divisor
  const remainder = units % divisor
  return toDecimal(remainder * 2n >= divisor ? quotient + 1n : quotient)
}

async function policyFlagsFor(
  db: Db,
  ctx: TenantContext,
  input: { employeeId: string; categoryId?: string | null; spentOn: string; merchant?: string | null; amount: string; baseAmount: string; receiptFileId?: string | null; excludeExpenseId?: string },
): Promise<PolicyFlag[]> {
  const flags: PolicyFlag[] = []

  if (input.categoryId) {
    const { rows } = await db.query<{ name: string; limit_amount: string | null; receipt_required_above: string | null }>(
      'select name, limit_amount::text as limit_amount, receipt_required_above::text as receipt_required_above from te_expense_categories where id = $1 and tenant_id = $2',
      [input.categoryId, ctx.tenantId],
    )
    const category = rows[0]
    if (category) {
      if (category.limit_amount !== null && toMinor(input.baseAmount) > toMinor(category.limit_amount)) {
        flags.push({ code: 'over_category_limit', message: `Above the ${category.name} limit of ${category.limit_amount}.` })
      }
      if (
        category.receipt_required_above !== null &&
        toMinor(input.baseAmount) > toMinor(category.receipt_required_above) &&
        !input.receiptFileId
      ) {
        flags.push({ code: 'receipt_missing', message: `A receipt is required above ${category.receipt_required_above}.` })
      }
    }
  }

  // Same person, same day, same merchant, same amount: usually one bill
  // claimed twice. Flagged rather than blocked — two identical fares happen.
  if (input.merchant) {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from te_expenses
        where tenant_id = $1 and employee_id = $2 and spent_on = $3
          and lower(coalesce(merchant,'')) = lower($4) and amount = $5
          and ($6::uuid is null or id <> $6)`,
      [ctx.tenantId, input.employeeId, input.spentOn, input.merchant, input.amount, input.excludeExpenseId ?? null],
    )
    if (Number(rows[0].n) > 0) {
      flags.push({ code: 'possible_duplicate', message: 'An identical expense was already recorded for that day.' })
    }
  }
  return flags
}

export async function recordExpense(ctx: TenantContext, input: RecordExpenseInput): Promise<ExpenseRow> {
  ctx.require('record.create')

  const currency = input.currency.toUpperCase()
  const baseCurrency = input.baseCurrency.toUpperCase()
  const sameCurrency = currency === baseCurrency
  // A conversion with no stated rate would have to be invented. Refusing is
  // the only honest option: a wrong rate is a wrong reimbursement.
  if (!sameCurrency && !input.fxRate) throw unprocessable('fx_rate_required', `State the rate used to convert ${currency} to ${baseCurrency}.`)
  const fxRate = sameCurrency ? '1' : input.fxRate!
  const baseAmount = sameCurrency ? input.amount : convert(input.amount, fxRate)

  return ctx.db.transaction(async (tx) => {
    const { rows: employee } = await tx.query('select 1 from hr_employees where id = $1 and tenant_id = $2 and archived_at is null', [
      input.employeeId,
      ctx.tenantId,
    ])
    if (!employee[0]) throw notFound('That employee')

    const flags = await policyFlagsFor(tx, ctx, { ...input, baseAmount })
    const { rows } = await tx.query<Raw>(
      `insert into te_expenses
         (tenant_id, employee_id, category_id, spent_on, merchant, description, amount, currency,
          fx_rate, base_amount, base_currency, receipt_file_id, reimbursable, policy_flags, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       returning *`,
      [
        ctx.tenantId,
        input.employeeId,
        input.categoryId ?? null,
        input.spentOn,
        input.merchant ?? null,
        input.description ?? null,
        input.amount,
        currency,
        fxRate,
        baseAmount,
        baseCurrency,
        input.receiptFileId ?? null,
        input.reimbursable ?? true,
        JSON.stringify(flags),
        ctx.userId,
      ],
    )
    return mapExpense(rows[0])
  })
}

export async function listExpenses(
  ctx: TenantContext,
  options: { employeeId?: string; reportId?: string | null; unfiled?: boolean; from?: string; to?: string; limit?: number } = {},
): Promise<ExpenseRow[]> {
  ctx.require('record.read')
  const filters = ['e.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.employeeId) add('e.employee_id = $?', options.employeeId)
  if (options.reportId) add('e.report_id = $?', options.reportId)
  if (options.unfiled) filters.push('e.report_id is null')
  if (options.from) add('e.spent_on >= $?', options.from)
  if (options.to) add('e.spent_on <= $?', options.to)
  params.push(Math.min(options.limit ?? 100, 500))
  const where = filters.join(' and ')

  const { rows } = await ctx.db.query<Raw>(
    `select e.* from te_expenses e where ${where} order by e.spent_on desc, e.created_at desc limit $${params.length}`,
    params as never[],
  )
  return rows.map(mapExpense)
}

export async function openReport(
  ctx: TenantContext,
  input: { employeeId: string; title: string; currency: string; travelRequestId?: string | null },
): Promise<ReportRow> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    const { rows: employee } = await tx.query('select 1 from hr_employees where id = $1 and tenant_id = $2 and archived_at is null', [
      input.employeeId,
      ctx.tenantId,
    ])
    if (!employee[0]) throw notFound('That employee')

    const reference = await nextReference(tx, ctx, 'EXP', 'te_expense_reports')
    const { rows } = await tx.query<Raw>(
      `insert into te_expense_reports (tenant_id, company_id, reference, employee_id, title, travel_request_id, currency, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [
        ctx.tenantId,
        ctx.companyId,
        reference,
        input.employeeId,
        input.title,
        input.travelRequestId ?? null,
        input.currency.toUpperCase(),
        ctx.userId,
      ],
    )
    return mapReport(rows[0])
  })
}

async function recomputeReportTotal(tx: Db, ctx: TenantContext, reportId: string): Promise<string> {
  const { rows } = await tx.query<{ total: string }>(
    `select coalesce(sum(base_amount), 0)::text as total from te_expenses where report_id = $1 and reimbursable`,
    [reportId],
  )
  await tx.query('update te_expense_reports set total_amount = $2, updated_at = $3 where id = $1', [reportId, rows[0].total, ctx.now])
  return rows[0].total
}

/**
 * Files an expense onto a report.
 *
 * The partial unique index is not what protects this one — `report_id` is a
 * plain column — so the check is explicit: an expense that already belongs to
 * a report is refused rather than silently moved, because silently moving it
 * changes a total on a claim somebody may already have approved.
 */
export async function attachExpense(ctx: TenantContext, reportId: string, expenseId: string): Promise<ReportRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows: report } = await tx.query<Raw>('select * from te_expense_reports where id = $1 and tenant_id = $2 for update', [
      reportId,
      ctx.tenantId,
    ])
    if (!report[0]) throw notFound('That report')
    if (!DRAFTABLE.has(report[0].status as string)) throw conflict(`That report is ${report[0].status} and cannot be changed.`)

    const { rows: expense } = await tx.query<{ report_id: string | null; employee_id: string; currency: string; base_currency: string }>(
      'select report_id, employee_id, currency, base_currency from te_expenses where id = $1 and tenant_id = $2 for update',
      [expenseId, ctx.tenantId],
    )
    if (!expense[0]) throw notFound('That expense')
    if (expense[0].report_id && expense[0].report_id !== reportId) {
      throw conflict('That expense is already on another report.')
    }
    if (expense[0].employee_id !== report[0].employee_id) {
      throw unprocessable('wrong_employee', 'That expense belongs to a different person.')
    }
    if (expense[0].base_currency !== report[0].currency) {
      throw unprocessable(
        'currency_mismatch',
        `That expense converts to ${expense[0].base_currency}, but the report is in ${report[0].currency as string}.`,
      )
    }

    await tx.query('update te_expenses set report_id = $2, updated_at = $3 where id = $1', [expenseId, reportId, ctx.now])
    const total = await recomputeReportTotal(tx, ctx, reportId)
    return { ...mapReport(report[0]), totalAmount: total }
  })
}

export async function detachExpense(ctx: TenantContext, reportId: string, expenseId: string): Promise<ReportRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows: report } = await tx.query<Raw>('select * from te_expense_reports where id = $1 and tenant_id = $2 for update', [
      reportId,
      ctx.tenantId,
    ])
    if (!report[0]) throw notFound('That report')
    if (!DRAFTABLE.has(report[0].status as string)) throw conflict(`That report is ${report[0].status} and cannot be changed.`)

    const { rowCount } = await tx.query('update te_expenses set report_id = null, updated_at = $3 where id = $1 and report_id = $2', [
      expenseId,
      reportId,
      ctx.now,
    ])
    if (!rowCount) throw notFound('That expense on this report')
    const total = await recomputeReportTotal(tx, ctx, reportId)
    return { ...mapReport(report[0]), totalAmount: total }
  })
}

/** How many approval levels a given amount has to clear. */
async function levelsFor(db: Db, ctx: TenantContext, scope: 'expense' | 'travel', amount: string): Promise<number[]> {
  const { rows } = await db.query<{ level: number; threshold: string }>(
    'select level, threshold::text as threshold from te_approval_levels where tenant_id = $1 and scope = $2 order by level',
    [ctx.tenantId, scope],
  )
  const minor = toMinor(amount)
  return rows.filter((row) => minor >= toMinor(row.threshold)).map((row) => row.level)
}

export async function submitReport(ctx: TenantContext, reportId: string, version: number): Promise<ReportRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Raw>('select * from te_expense_reports where id = $1 and tenant_id = $2 for update', [
      reportId,
      ctx.tenantId,
    ])
    const report = rows[0]
    if (!report) throw notFound('That report')
    if (report.version !== version) throw conflict('Someone else changed this report.', report.version as number)
    if (!DRAFTABLE.has(report.status as string)) throw unprocessable('not_draft', `That report is already ${report.status}.`)

    const total = await recomputeReportTotal(tx, ctx, reportId)
    if (toMinor(total) <= 0n) throw unprocessable('empty_report', 'Add at least one reimbursable expense before submitting.')

    // The report carries up the flags its lines raised, so an approver sees
    // "three receipts missing" on the claim rather than having to open each line.
    const { rows: flagged } = await tx.query<{ policy_flags: PolicyFlag[] }>(
      'select policy_flags from te_expenses where report_id = $1',
      [reportId],
    )
    const flags = flagged.flatMap((row) => row.policy_flags ?? [])

    const levels = await levelsFor(tx, ctx, 'expense', total)
    const firstLevel = levels[0] ?? 1
    /*
     * Resubmitting a rejected claim starts a new approval round. The earlier
     * round's decisions stay on record; they simply no longer apply, because
     * the amount they approved is not the amount now being claimed.
     */
    const round = (report.approval_round as number) + (report.status === 'rejected' ? 1 : 0)
    await tx.query(
      `update te_expense_reports
          set status = 'submitted', submitted_at = $2, current_level = $3, policy_flags = $4,
              approval_round = $5, version = version + 1, updated_at = $2
        where id = $1`,
      [reportId, ctx.now, firstLevel, JSON.stringify(flags), round],
    )
    await recordAudit(tx, ctx, {
      action: 'expense.report_submitted',
      resource: 'expense_report',
      resourceId: reportId,
      detail: { total, currency: report.currency, flags: flags.length },
    })
    const { rows: after } = await tx.query<Raw>('select * from te_expense_reports where id = $1', [reportId])
    return mapReport(after[0])
  })
}

/**
 * Records one approval decision.
 *
 * `te_approval_key` makes a level decidable exactly once, so a double-click
 * cannot advance the report two levels. The report reaches `approved` only
 * after every level its amount requires has approved it.
 */
export async function decideReport(
  ctx: TenantContext,
  reportId: string,
  input: { decision: 'approved' | 'rejected'; version: number; note?: string | null; approvedAmount?: string },
): Promise<ReportRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Raw>('select * from te_expense_reports where id = $1 and tenant_id = $2 for update', [
      reportId,
      ctx.tenantId,
    ])
    const report = rows[0]
    if (!report) throw notFound('That report')
    if (report.version !== input.version) throw conflict('Someone else decided this report.', report.version as number)
    if (report.status !== 'submitted') throw unprocessable('not_submitted', `That report is ${report.status}, not awaiting a decision.`)

    const level = report.current_level as number
    const round = report.approval_round as number
    const { rowCount } = await tx.query(
      `insert into te_approvals (tenant_id, subject_kind, subject_id, round, level, decision, decided_by, decided_at, note)
       values ($1,'expense_report',$2,$3,$4,$5,$6,$7,$8)
       on conflict (subject_kind, subject_id, round, level) do nothing`,
      [ctx.tenantId, reportId, round, level, input.decision, ctx.userId, ctx.now, input.note ?? null],
    )
    if (!rowCount) throw conflict(`Level ${level} has already been decided.`)

    if (input.decision === 'rejected') {
      await tx.query(
        `update te_expense_reports set status = 'rejected', decided_at = $2, version = version + 1, updated_at = $2 where id = $1`,
        [reportId, ctx.now],
      )
    } else {
      const levels = await levelsFor(tx, ctx, 'expense', decimalText(report.total_amount) ?? '0')
      const remaining = levels.filter((candidate) => candidate > level)
      if (remaining.length) {
        await tx.query(
          'update te_expense_reports set current_level = $2, version = version + 1, updated_at = $3 where id = $1',
          [reportId, remaining[0], ctx.now],
        )
      } else {
        await tx.query(
          `update te_expense_reports
              set status = 'approved', approved_amount = $2, decided_at = $3, version = version + 1, updated_at = $3
            where id = $1`,
          [reportId, input.approvedAmount ?? (decimalText(report.total_amount) as string), ctx.now],
        )
      }
    }
    await recordAudit(tx, ctx, {
      action: `expense.report_${input.decision}`,
      resource: 'expense_report',
      resourceId: reportId,
      detail: { level, round },
    })
    const { rows: after } = await tx.query<Raw>('select * from te_expense_reports where id = $1', [reportId])
    return mapReport(after[0])
  })
}

export async function readReport(ctx: TenantContext, reportId: string): Promise<ReportRow & { expenses: ExpenseRow[] }> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>('select * from te_expense_reports where id = $1 and tenant_id = $2', [
    reportId,
    ctx.tenantId,
  ])
  if (!rows[0]) throw notFound('That report')
  return { ...mapReport(rows[0]), expenses: await listExpenses(ctx, { reportId }) }
}

export async function listReports(
  ctx: TenantContext,
  options: { employeeId?: string; status?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: ReportRow[]; total: number }> {
  ctx.require('record.read')
  const filters = ['r.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.employeeId) add('r.employee_id = $?', options.employeeId)
  if (options.status) add('r.status = $?', options.status)
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from te_expense_reports r where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Raw>(
    `select r.* from te_expense_reports r where ${where} order by r.created_at desc limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return { total: Number(counted[0].n), rows: rows.map(mapReport) }
}

/* ----------------------------- reconciliation ----------------------------- */

export async function importCardTransactions(
  ctx: TenantContext,
  lines: { externalRef: string; postedOn: string; merchant: string; amount: string; currency: string; employeeId?: string | null; cardLast4?: string | null }[],
): Promise<{ imported: number; duplicates: number }> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    let imported = 0
    for (const line of lines) {
      // The provider's own id is the key, so re-importing a statement adds
      // nothing rather than doubling every line on it.
      const { rowCount } = await tx.query(
        `insert into te_card_transactions (tenant_id, employee_id, card_last4, posted_on, merchant, amount, currency, external_ref)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (tenant_id, external_ref) do nothing`,
        [
          ctx.tenantId,
          line.employeeId ?? null,
          line.cardLast4 ?? null,
          line.postedOn,
          line.merchant,
          line.amount,
          line.currency.toUpperCase(),
          line.externalRef,
        ],
      )
      if (rowCount) imported += 1
    }
    return { imported, duplicates: lines.length - imported }
  })
}

/** Ties a card line to the expense that claims it. One each, both ways. */
export async function matchCardTransaction(ctx: TenantContext, transactionId: string, expenseId: string): Promise<void> {
  ctx.require('record.update')

  await ctx.db.transaction(async (tx) => {
    const { rows: transaction } = await tx.query<{ matched_expense_id: string | null }>(
      'select matched_expense_id from te_card_transactions where id = $1 and tenant_id = $2 for update',
      [transactionId, ctx.tenantId],
    )
    if (!transaction[0]) throw notFound('That card transaction')
    if (transaction[0].matched_expense_id) throw conflict('That transaction is already matched.')

    const { rows: expense } = await tx.query('select 1 from te_expenses where id = $1 and tenant_id = $2', [expenseId, ctx.tenantId])
    if (!expense[0]) throw notFound('That expense')

    const { rows: taken } = await tx.query('select 1 from te_card_transactions where matched_expense_id = $1', [expenseId])
    if (taken[0]) throw conflict('That expense is already matched to another transaction.')

    await tx.query(
      'update te_card_transactions set matched_expense_id = $2, matched_at = $3, matched_by = $4 where id = $1',
      [transactionId, expenseId, ctx.now, ctx.userId],
    )
  })
}

export async function unmatchedTransactions(
  ctx: TenantContext,
): Promise<{ id: string; postedOn: string; merchant: string; amount: string; currency: string }[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>(
    `select id, posted_on, merchant, amount::text as amount, currency from te_card_transactions
      where tenant_id = $1 and matched_expense_id is null order by posted_on desc limit 500`,
    [ctx.tenantId],
  )
  return rows.map((row) => ({
    id: row.id as string,
    postedOn: day(row.posted_on),
    merchant: row.merchant as string,
    amount: decimalText(row.amount) as string,
    currency: row.currency as string,
  }))
}

/* ------------------------------ reimbursement ----------------------------- */

export type RunSummary = { runId: string; reference: string; paid: number; skipped: number; total: string }

/**
 * Pays approved reports.
 *
 * `te_reimbursement_once` is the guarantee: a report can appear in one
 * reimbursement item, ever. Running this twice, or twice at once, pays each
 * report once and reports the rest as skipped. The prototype's equivalent
 * re-paid every approved report on every click.
 */
export async function runReimbursement(
  ctx: TenantContext,
  input: { currency: string; reportIds?: string[] },
): Promise<RunSummary> {
  ctx.require('record.create')
  const currency = input.currency.toUpperCase()

  return ctx.db.transaction(async (tx) => {
    const reference = await nextReference(tx, ctx, 'RMB', 'te_reimbursement_runs')
    const { rows: run } = await tx.query<{ id: string }>(
      'insert into te_reimbursement_runs (tenant_id, reference, currency, created_by) values ($1,$2,$3,$4) returning id',
      [ctx.tenantId, reference, currency, ctx.userId],
    )
    const runId = run[0].id

    const { rows: candidates } = input.reportIds?.length
      ? await tx.query<{ id: string; approved_amount: string; total_amount: string }>(
          `select id, approved_amount::text as approved_amount, total_amount::text as total_amount
             from te_expense_reports
            where tenant_id = $1 and currency = $2 and status = 'approved' and id = any($3::uuid[])
            order by created_at for update`,
          [ctx.tenantId, currency, input.reportIds],
        )
      : await tx.query<{ id: string; approved_amount: string; total_amount: string }>(
          `select id, approved_amount::text as approved_amount, total_amount::text as total_amount
             from te_expense_reports
            where tenant_id = $1 and currency = $2 and status = 'approved'
            order by created_at for update`,
          [ctx.tenantId, currency],
        )

    let paid = 0
    let skipped = 0
    let total = 0n
    for (const report of candidates) {
      const amount = report.approved_amount ?? report.total_amount
      const { rowCount } = await tx.query(
        `insert into te_reimbursement_items (tenant_id, run_id, report_id, amount)
         values ($1,$2,$3,$4) on conflict (report_id) do nothing`,
        [ctx.tenantId, runId, report.id, amount],
      )
      if (!rowCount) {
        // Already paid by an earlier run. Skipped, not paid again.
        skipped += 1
        continue
      }
      await tx.query(
        `update te_expense_reports set status = 'reimbursed', reimbursed_at = $2, version = version + 1, updated_at = $2 where id = $1`,
        [report.id, ctx.now],
      )
      total += toMinor(amount)
      paid += 1
    }

    const totalDecimal = toDecimal(total)
    await tx.query('update te_reimbursement_runs set total_amount = $2, status = $3, paid_at = $4 where id = $1', [
      runId,
      totalDecimal,
      paid > 0 ? 'paid' : 'draft',
      paid > 0 ? ctx.now : null,
    ])
    await recordAudit(tx, ctx, {
      action: 'expense.reimbursement_run',
      resource: 'reimbursement_run',
      resourceId: runId,
      detail: { paid, skipped, total: totalDecimal, currency },
    })
    return { runId, reference, paid, skipped, total: totalDecimal }
  })
}
