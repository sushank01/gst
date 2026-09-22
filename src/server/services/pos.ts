import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { decimalText, nextReference, toDecimal, toMinor } from './sales.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * The till: shifts, sales, tenders and cash variance.
 *
 * The property that matters is that CASH IS RECONCILED, NOT ASSERTED. A shift
 * closes by counting what is in the drawer and comparing it with what the
 * tenders say should be there; the expected figure is summed from the sale
 * rows at close, never typed in and never stored as a running total that an
 * insert could miss. A variance is a fact about the count, and above the
 * policy threshold it must carry a reason.
 *
 * One open till per cashier, enforced by a partial unique index. Two open
 * tills for one person means two drawers nobody can attribute a shortfall to.
 */

export type ShiftRow = {
  id: string
  cashierUserId: string
  currency: string
  openingFloat: string
  openedAt: string
  closedAt: string | null
  countedCash: string | null
  expectedCash: string | null
  variance: string | null
  varianceReason: string | null
  version: number
}

type Raw = Record<string, unknown>

const mapShift = (row: Raw): ShiftRow => ({
  id: row.id as string,
  cashierUserId: row.cashier_user_id as string,
  currency: row.currency as string,
  openingFloat: decimalText(row.opening_float) as string,
  openedAt: new Date(row.opened_at as string).toISOString(),
  closedAt: row.closed_at ? new Date(row.closed_at as string).toISOString() : null,
  countedCash: decimalText(row.counted_cash),
  expectedCash: decimalText(row.expected_cash),
  variance: decimalText(row.variance),
  varianceReason: (row.variance_reason as string) ?? null,
  version: row.version as number,
})

export async function openShift(
  ctx: TenantContext,
  input: { currency: string; openingFloat?: string; warehouse?: string | null; cashierUserId?: string },
): Promise<ShiftRow> {
  ctx.require('record.create')
  const cashier = input.cashierUserId ?? ctx.userId
  // Opening a till for somebody else is a supervisor action, not a self-service one.
  if (input.cashierUserId && input.cashierUserId !== ctx.userId) ctx.require('settings.manage')

  return ctx.db.transaction(async (tx) => {
    const { rows: member } = await tx.query('select 1 from memberships where tenant_id = $1 and user_id = $2 and status = $3', [
      ctx.tenantId,
      cashier,
      'active',
    ])
    if (!member[0]) throw notFound('That cashier')

    const { rows: open } = await tx.query<{ opened_at: Date }>(
      'select opened_at from pos_shifts where tenant_id = $1 and cashier_user_id = $2 and closed_at is null',
      [ctx.tenantId, cashier],
    )
    if (open[0]) {
      throw conflict(`A till opened at ${new Date(open[0].opened_at).toISOString()} is still open. Close it first.`)
    }

    const { rows } = await tx.query<Raw>(
      `insert into pos_shifts (tenant_id, company_id, cashier_user_id, currency, opening_float, warehouse, opened_at)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [
        ctx.tenantId,
        ctx.companyId,
        cashier,
        input.currency.toUpperCase(),
        input.openingFloat ?? '0',
        input.warehouse ?? null,
        ctx.now,
      ],
    )
    await recordAudit(tx, ctx, { action: 'pos.shift_opened', resource: 'pos_shift', resourceId: rows[0].id as string })
    return mapShift(rows[0])
  })
}

export type TenderInput = { method: 'cash' | 'card' | 'upi' | 'voucher' | 'loyalty' | 'other'; amount: string; reference?: string | null }

/**
 * Records a sale against the open till.
 *
 * The tenders must add up to the sale total. A sale whose payment lines do not
 * match what was charged cannot be reconciled at close, and the difference
 * would surface as an unexplained cash variance hours later.
 */
export async function recordSale(
  ctx: TenantContext,
  input: { shiftId: string; total: string; currency: string; customerId?: string | null; documentId?: string | null; tenders: TenderInput[] },
): Promise<{ saleId: string; reference: string }> {
  ctx.require('record.create')
  if (!input.tenders.length) throw unprocessable('no_tender', 'A sale needs at least one payment line.')

  const total = toMinor(input.total)
  const tendered = input.tenders.reduce((sum, tender) => sum + toMinor(tender.amount), 0n)
  if (tendered !== total) {
    throw unprocessable(
      'tender_mismatch',
      `The payment lines come to ${toDecimal(tendered)} but the sale is ${toDecimal(total)}.`,
    )
  }

  return ctx.db.transaction(async (tx) => {
    const { rows: shift } = await tx.query<{ currency: string; closed_at: Date | null }>(
      'select currency, closed_at from pos_shifts where id = $1 and tenant_id = $2 for update',
      [input.shiftId, ctx.tenantId],
    )
    if (!shift[0]) throw notFound('That till')
    if (shift[0].closed_at) throw conflict('That till is closed.')
    if (shift[0].currency !== input.currency.toUpperCase()) {
      throw unprocessable('currency_mismatch', `That till takes ${shift[0].currency}.`)
    }

    const reference = await nextReference(tx, ctx, 'pos_sale')
    const { rows } = await tx.query<{ id: string }>(
      `insert into pos_sales (tenant_id, shift_id, document_id, reference, customer_id, total, currency, sold_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [
        ctx.tenantId,
        input.shiftId,
        input.documentId ?? null,
        reference,
        input.customerId ?? null,
        input.total,
        input.currency.toUpperCase(),
        ctx.now,
      ],
    )
    for (const tender of input.tenders) {
      await tx.query('insert into pos_sale_tenders (tenant_id, sale_id, method, amount, reference) values ($1,$2,$3,$4,$5)', [
        ctx.tenantId,
        rows[0].id,
        tender.method,
        tender.amount,
        tender.reference ?? null,
      ])
    }
    return { saleId: rows[0].id, reference }
  })
}

/** Voids a sale. The row stays: a voided sale is evidence, a deleted one is a gap. */
export async function voidSale(ctx: TenantContext, saleId: string, reason: string): Promise<void> {
  ctx.require('record.delete')

  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ voided_at: Date | null; shift_id: string }>(
      'select voided_at, shift_id from pos_sales where id = $1 and tenant_id = $2 for update',
      [saleId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That sale')
    if (rows[0].voided_at) throw conflict('That sale is already voided.')

    const { rows: shift } = await tx.query<{ closed_at: Date | null }>('select closed_at from pos_shifts where id = $1', [
      rows[0].shift_id,
    ])
    // Voiding after close would change a reconciled figure retrospectively.
    if (shift[0]?.closed_at) throw conflict('That till is closed. Raise a credit note instead.')

    await tx.query('update pos_sales set voided_at = $2, void_reason = $3 where id = $1', [saleId, ctx.now, reason])
    await recordAudit(tx, ctx, { action: 'pos.sale_voided', resource: 'pos_sale', resourceId: saleId, detail: { reason } })
  })
}

export type ShiftTotals = {
  sales: number
  gross: string
  byMethod: Record<string, string>
  expectedCash: string
}

/**
 * What the till should hold, summed from the sale tenders.
 *
 * Voided sales are excluded, and only cash counts towards the drawer — card
 * and UPI never reach it. The opening float is added because it was in the
 * drawer before trading started.
 */
export async function shiftTotals(db: Db, ctx: TenantContext, shiftId: string, openingFloat: string): Promise<ShiftTotals> {
  const { rows } = await db.query<{ method: string; amount: string; n: string }>(
    `select t.method, coalesce(sum(t.amount), 0)::text as amount, count(*)::text as n
       from pos_sale_tenders t
       join pos_sales s on s.id = t.sale_id
      where s.shift_id = $1 and s.tenant_id = $2 and s.voided_at is null
      group by t.method`,
    [shiftId, ctx.tenantId],
  )
  const { rows: counted } = await db.query<{ n: string; total: string }>(
    `select count(*)::text as n, coalesce(sum(total), 0)::text as total
       from pos_sales where shift_id = $1 and tenant_id = $2 and voided_at is null`,
    [shiftId, ctx.tenantId],
  )

  const byMethod: Record<string, string> = {}
  let cash = 0n
  for (const row of rows) {
    byMethod[row.method] = row.amount
    if (row.method === 'cash') cash += toMinor(row.amount)
  }
  return {
    sales: Number(counted[0].n),
    gross: counted[0].total,
    byMethod,
    expectedCash: toDecimal(cash + toMinor(openingFloat)),
  }
}

/**
 * Closes the till against a counted amount.
 *
 * The expected figure is computed here from the tenders, so it cannot have
 * drifted from the sales. The variance is `counted - expected`: negative is
 * short. Above the policy's threshold a reason is required, because "the
 * drawer was £40 light" with no explanation is the beginning of a loss nobody
 * investigated.
 */
export async function closeShift(
  ctx: TenantContext,
  shiftId: string,
  input: { countedCash: string; reason?: string | null; version: number },
): Promise<ShiftRow & { totals: ShiftTotals }> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Raw>('select * from pos_shifts where id = $1 and tenant_id = $2 for update', [
      shiftId,
      ctx.tenantId,
    ])
    const shift = rows[0]
    if (!shift) throw notFound('That till')
    if (shift.closed_at) throw conflict('That till is already closed.')
    if (shift.version !== input.version) throw conflict('Someone else changed this till.', shift.version as number)

    const totals = await shiftTotals(tx, ctx, shiftId, decimalText(shift.opening_float) ?? '0')
    const variance = toMinor(input.countedCash) - toMinor(totals.expectedCash)

    const { rows: policy } = await tx.query<{ reason_required_above: string }>(
      'select reason_required_above::text as reason_required_above from cash_variance_policies where tenant_id = $1',
      [ctx.tenantId],
    )
    // With no policy configured the default is the migration's: any variance
    // of one unit or more needs a reason. Silence is not the safe default here.
    const threshold = toMinor(policy[0]?.reason_required_above ?? '1')
    const magnitude = variance < 0n ? -variance : variance
    if (magnitude >= threshold && !input.reason?.trim()) {
      throw unprocessable(
        'variance_reason_required',
        `The drawer is ${toDecimal(variance)} against expected ${totals.expectedCash}. Record why before closing.`,
      )
    }

    await tx.query(
      `update pos_shifts
          set closed_at = $2, counted_cash = $3, expected_cash = $4, variance = $5,
              variance_reason = $6, closed_by = $7, version = version + 1
        where id = $1`,
      [
        shiftId,
        ctx.now,
        input.countedCash,
        totals.expectedCash,
        toDecimal(variance),
        input.reason ?? null,
        ctx.userId,
      ],
    )
    await recordAudit(tx, ctx, {
      action: 'pos.shift_closed',
      resource: 'pos_shift',
      resourceId: shiftId,
      detail: { variance: toDecimal(variance), expected: totals.expectedCash, counted: input.countedCash },
    })
    const { rows: after } = await tx.query<Raw>('select * from pos_shifts where id = $1', [shiftId])
    return { ...mapShift(after[0]), totals }
  })
}

export async function readShift(ctx: TenantContext, shiftId: string): Promise<ShiftRow & { totals: ShiftTotals }> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>('select * from pos_shifts where id = $1 and tenant_id = $2', [shiftId, ctx.tenantId])
  if (!rows[0]) throw notFound('That till')
  return {
    ...mapShift(rows[0]),
    totals: await shiftTotals(ctx.db, ctx, shiftId, decimalText(rows[0].opening_float) ?? '0'),
  }
}

export type ShiftListRow = ShiftRow & {
  /** The cashier's name, joined here so a list does not need N member lookups. */
  cashierName: string | null
  totals: ShiftTotals
}

/**
 * Tills, with the cashier's name and the tenders each one took.
 *
 * Both are joined and aggregated in this one call on purpose. A shift row on
 * its own carries a user id and no takings, so a dashboard built from it
 * either shows a uuid where a name belongs or fires a request per row — and
 * resolving the name through the members endpoint would need a permission a
 * cashier may not hold, so the manager's dashboard would simply be empty for
 * the people it is about.
 *
 * `closedFrom` / `closedTo` select tills closed inside a window, which is what
 * a "last 30 days" figure actually means; an open till has no close date and
 * is excluded by them.
 */
export async function listShifts(
  ctx: TenantContext,
  options: {
    open?: boolean
    closed?: boolean
    cashierUserId?: string
    closedFrom?: string
    closedTo?: string
    limit?: number
    offset?: number
  } = {},
): Promise<{ rows: ShiftListRow[]; total: number; cashiers: number }> {
  ctx.require('record.read')
  const filters = ['s.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.open) filters.push('s.closed_at is null')
  if (options.closed) filters.push('s.closed_at is not null')
  if (options.cashierUserId) add('s.cashier_user_id = $?', options.cashierUserId)
  if (options.closedFrom) add('s.closed_at >= $?::date', options.closedFrom)
  if (options.closedTo) add('s.closed_at < ($?::date + 1)', options.closedTo)
  const where = filters.join(' and ')

  // Counted separately so the figure beside the list is the number of matching
  // tills, not the number this page happened to load.
  const { rows: counted } = await ctx.db.query<{ n: string; cashiers: string }>(
    `select count(*)::text as n, count(distinct s.cashier_user_id)::text as cashiers
       from pos_shifts s where ${where}`,
    params as never[],
  )

  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Raw>(
    `select s.*, u.full_name
       from pos_shifts s
       left join users u on u.id = s.cashier_user_id
      where ${where}
      order by s.opened_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )

  const ids = rows.map((row) => row.id as string)
  const tenders = new Map<string, Record<string, string>>()
  const sales = new Map<string, { sales: number; gross: string }>()
  if (ids.length) {
    const { rows: byMethod } = await ctx.db.query<{ shift_id: string; method: string; amount: string }>(
      `select sale.shift_id, t.method, coalesce(sum(t.amount), 0)::text as amount
         from pos_sale_tenders t
         join pos_sales sale on sale.id = t.sale_id
        where sale.tenant_id = $1 and sale.voided_at is null and sale.shift_id = any($2::uuid[])
        group by sale.shift_id, t.method`,
      [ctx.tenantId, ids],
    )
    for (const row of byMethod) {
      const entry = tenders.get(row.shift_id) ?? {}
      entry[row.method] = row.amount
      tenders.set(row.shift_id, entry)
    }
    const { rows: counts } = await ctx.db.query<{ shift_id: string; n: string; total: string }>(
      `select shift_id, count(*)::text as n, coalesce(sum(total), 0)::text as total
         from pos_sales where tenant_id = $1 and voided_at is null and shift_id = any($2::uuid[])
        group by shift_id`,
      [ctx.tenantId, ids],
    )
    for (const row of counts) sales.set(row.shift_id, { sales: Number(row.n), gross: row.total })
  }

  return {
    total: Number(counted[0].n),
    cashiers: Number(counted[0].cashiers),
    rows: rows.map((row) => {
      const shift = mapShift(row)
      const byMethod = tenders.get(shift.id) ?? {}
      const counts = sales.get(shift.id) ?? { sales: 0, gross: '0.0000' }
      return {
        ...shift,
        cashierName: (row.full_name as string) ?? null,
        totals: {
          ...counts,
          byMethod,
          expectedCash: toDecimal(toMinor(byMethod.cash ?? '0') + toMinor(shift.openingFloat)),
        },
      }
    }),
  }
}

/* ---------------------------- cash variance policy ------------------------ */

export type VariancePolicy = {
  reasonRequiredAbove: string
  amberWorstShift: string
  redWorstShift: string
  amberAverage: string
  redAverage: string
  /**
   * When the policy was last written, and the token a write must carry back.
   * Null means no row exists and the figures above are the defaults `closeShift`
   * falls back to. `cash_variance_policies` has no version column, so the
   * timestamp is what turns a concurrent edit into a conflict.
   */
  updatedAt: string | null
}

const VARIANCE_DEFAULTS: Omit<VariancePolicy, 'updatedAt'> = {
  reasonRequiredAbove: '1.0000',
  amberWorstShift: '1.0000',
  redWorstShift: '5.0000',
  amberAverage: '0.5000',
  redAverage: '2.0000',
}

type PolicyRow = {
  reason_required_above: string
  amber_worst_shift: string
  red_worst_shift: string
  amber_average: string
  red_average: string
  updated_at: Date
}

const POLICY_SELECT = `reason_required_above::text as reason_required_above,
       amber_worst_shift::text as amber_worst_shift, red_worst_shift::text as red_worst_shift,
       amber_average::text as amber_average, red_average::text as red_average, updated_at`

const mapPolicy = (row: PolicyRow): VariancePolicy => ({
  reasonRequiredAbove: row.reason_required_above,
  amberWorstShift: row.amber_worst_shift,
  redWorstShift: row.red_worst_shift,
  amberAverage: row.amber_average,
  redAverage: row.red_average,
  updatedAt: new Date(row.updated_at).toISOString(),
})

/**
 * The thresholds the till enforces.
 *
 * This is deliberately its own table and not an app-settings document:
 * `closeShift` reads `reason_required_above` from here, so a threshold saved
 * anywhere else would show on the settings screen and change nothing at the
 * drawer.
 */
export async function readVariancePolicy(ctx: TenantContext): Promise<VariancePolicy> {
  ctx.require('settings.read')
  const { rows } = await ctx.db.query<PolicyRow>(
    `select ${POLICY_SELECT} from cash_variance_policies where tenant_id = $1`,
    [ctx.tenantId],
  )
  return rows[0] ? mapPolicy(rows[0]) : { ...VARIANCE_DEFAULTS, updatedAt: null }
}

export async function writeVariancePolicy(
  ctx: TenantContext,
  input: Omit<VariancePolicy, 'updatedAt'> & { updatedAt: string | null },
): Promise<VariancePolicy> {
  ctx.require('settings.manage')
  // The table's own check constraint enforces red >= amber; saying it here
  // first turns it into a message a form can show rather than a 500.
  if (toMinor(input.redWorstShift) < toMinor(input.amberWorstShift)) {
    throw unprocessable('red_below_amber', 'The red worst-shift figure must be at least the amber one.')
  }
  if (toMinor(input.redAverage) < toMinor(input.amberAverage)) {
    throw unprocessable('red_below_amber', 'The red average must be at least the amber average.')
  }

  const values = [
    input.reasonRequiredAbove,
    input.amberWorstShift,
    input.redWorstShift,
    input.amberAverage,
    input.redAverage,
  ]

  if (input.updatedAt === null) {
    const { rows } = await ctx.db.query<PolicyRow>(
      `insert into cash_variance_policies
         (tenant_id, reason_required_above, amber_worst_shift, red_worst_shift, amber_average, red_average, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (tenant_id) do nothing returning ${POLICY_SELECT}`,
      [ctx.tenantId, ...values, ctx.now],
    )
    if (!rows[0]) throw conflict('Someone else set a variance policy while you were editing.')
    await recordAudit(ctx.db, ctx, {
      action: 'pos.variance_policy_updated',
      resource: 'cash_variance_policy',
      resourceId: ctx.tenantId,
    })
    return mapPolicy(rows[0])
  }

  const { rows } = await ctx.db.query<PolicyRow>(
    `update cash_variance_policies
        set reason_required_above = $3, amber_worst_shift = $4, red_worst_shift = $5,
            amber_average = $6, red_average = $7, updated_at = $8
      where tenant_id = $1 and updated_at = $2::timestamptz
      returning ${POLICY_SELECT}`,
    [ctx.tenantId, input.updatedAt, ...values, ctx.now],
  )
  if (!rows[0]) throw conflict('Someone else changed the variance policy while you were editing.')
  await recordAudit(ctx.db, ctx, {
    action: 'pos.variance_policy_updated',
    resource: 'cash_variance_policy',
    resourceId: ctx.tenantId,
  })
  return mapPolicy(rows[0])
}

/**
 * Cash variance across closed tills, against the policy's bands.
 *
 * Reports the worst single shift and the average, because a steady small
 * shortfall and one large one are different problems and a single average
 * hides the first inside the second. The per-band counts are computed here
 * too: the thresholds live beside the policy the till enforces, so a manager's
 * scorecard and the drawer cannot disagree about what counts as red.
 */
export async function varianceReport(
  ctx: TenantContext,
  options: { from?: string; to?: string } = {},
): Promise<{
  shifts: number
  cashiers: number
  worst: string
  average: string
  total: string
  band: 'green' | 'amber' | 'red'
  byBand: { green: number; amber: number; red: number }
  bands: { amberWorstShift: string; redWorstShift: string; amberAverage: string; redAverage: string }
  unexplained: number
}> {
  ctx.require('record.read')

  const { rows: policy } = await ctx.db.query<{
    amber_worst_shift: string
    red_worst_shift: string
    amber_average: string
    red_average: string
  }>(
    `select amber_worst_shift::text as amber_worst_shift, red_worst_shift::text as red_worst_shift,
            amber_average::text as amber_average, red_average::text as red_average
       from cash_variance_policies where tenant_id = $1`,
    [ctx.tenantId],
  )
  const bands = policy[0] ?? {
    amber_worst_shift: VARIANCE_DEFAULTS.amberWorstShift,
    red_worst_shift: VARIANCE_DEFAULTS.redWorstShift,
    amber_average: VARIANCE_DEFAULTS.amberAverage,
    red_average: VARIANCE_DEFAULTS.redAverage,
  }

  const { rows } = await ctx.db.query<{
    n: string
    cashiers: string
    worst: string | null
    total: string
    unexplained: string
    red: string
    amber: string
    green: string
  }>(
    `select count(*)::text as n,
            count(distinct cashier_user_id)::text as cashiers,
            max(abs(variance))::text as worst,
            coalesce(sum(variance), 0)::text as total,
            count(*) filter (where abs(variance) > 0 and coalesce(variance_reason, '') = '')::text as unexplained,
            count(*) filter (where abs(variance) >= $4)::text as red,
            count(*) filter (where abs(variance) >= $5 and abs(variance) < $4)::text as amber,
            count(*) filter (where abs(variance) < $5)::text as green
       from pos_shifts
      where tenant_id = $1 and closed_at is not null
        and ($2::date is null or closed_at >= $2::date)
        and ($3::date is null or closed_at < ($3::date + 1))`,
    [ctx.tenantId, options.from ?? null, options.to ?? null, bands.red_worst_shift, bands.amber_worst_shift],
  )
  const shifts = Number(rows[0].n)
  const worst = rows[0].worst ?? '0'

  // An average over no shifts is not zero; it is undefined, and reported as a
  // green band with zero shifts so nobody reads it as "no variance observed".
  const average = shifts === 0 ? 0n : toMinor(rows[0].total) / BigInt(shifts)
  const averageMagnitude = average < 0n ? -average : average
  const worstMinor = toMinor(worst)

  let band: 'green' | 'amber' | 'red' = 'green'
  if (shifts > 0) {
    if (worstMinor >= toMinor(bands.red_worst_shift) || averageMagnitude >= toMinor(bands.red_average)) band = 'red'
    else if (worstMinor >= toMinor(bands.amber_worst_shift) || averageMagnitude >= toMinor(bands.amber_average)) band = 'amber'
  }

  return {
    shifts,
    cashiers: Number(rows[0].cashiers),
    worst: toDecimal(worstMinor),
    average: toDecimal(average),
    total: rows[0].total,
    band,
    byBand: { green: Number(rows[0].green), amber: Number(rows[0].amber), red: Number(rows[0].red) },
    bands: {
      amberWorstShift: bands.amber_worst_shift,
      redWorstShift: bands.red_worst_shift,
      amberAverage: bands.amber_average,
      redAverage: bands.red_average,
    },
    unexplained: Number(rows[0].unexplained),
  }
}
