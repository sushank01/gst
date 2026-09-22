import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { decimalText, toDecimal, toMinor } from './sales.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Sales customers and accounts receivable.
 *
 * A customer is a `party` with commercial terms attached, not a second name
 * string: the CRM account and the POS customer are the same record, so
 * renaming one renames both. The prototype stored a customer name on each
 * document, which is how a rename leaves last quarter's invoices addressed to
 * the old company.
 *
 * The receivable figures are derived from the documents and their payments on
 * every read. An outstanding balance kept as a column drifts the first time a
 * payment is recorded and a trigger does not fire.
 */

export type CustomerRow = {
  id: string
  partyId: string
  name: string
  email: string | null
  code: string | null
  currency: string
  creditLimit: string | null
  paymentTermsDays: number
  taxId: string | null
  taxRegion: string | null
  groupId: string | null
  groupName: string | null
  active: boolean
  version: number
}

type Raw = Record<string, unknown>

const mapCustomer = (row: Raw): CustomerRow => ({
  id: row.id as string,
  partyId: row.party_id as string,
  name: row.name as string,
  email: (row.email as string) ?? null,
  code: (row.code as string) ?? null,
  currency: row.currency as string,
  creditLimit: decimalText(row.credit_limit),
  paymentTermsDays: row.payment_terms_days as number,
  taxId: (row.tax_id as string) ?? null,
  taxRegion: (row.tax_region as string) ?? null,
  groupId: (row.group_id as string) ?? null,
  groupName: (row.group_name as string) ?? null,
  active: row.active as boolean,
  version: row.version as number,
})

const SELECT = `c.*, p.name, p.email, g.name as group_name
    from sales_customers c
    join parties p on p.id = c.party_id
    left join customer_groups g on g.id = c.group_id`

export async function createCustomer(
  ctx: TenantContext,
  input: {
    name: string
    currency: string
    email?: string | null
    code?: string | null
    groupId?: string | null
    creditLimit?: string | null
    paymentTermsDays?: number
    taxId?: string | null
    taxRegion?: string | null
    partyId?: string | null
  },
): Promise<CustomerRow> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    if (input.code) {
      const { rows: clash } = await tx.query('select 1 from sales_customers where tenant_id = $1 and lower(code) = lower($2)', [
        ctx.tenantId,
        input.code,
      ])
      if (clash[0]) throw unprocessable('duplicate_code', `Customer code ${input.code} is already in use.`)
    }

    /*
     * Reuse the party when one is named, so a CRM account becoming a billing
     * customer stays one record. Otherwise create the organisation here.
     */
    let partyId = input.partyId ?? null
    if (partyId) {
      const { rows } = await tx.query('select 1 from parties where id = $1 and tenant_id = $2', [partyId, ctx.tenantId])
      if (!rows[0]) throw notFound('That account')
      const { rows: taken } = await tx.query('select 1 from sales_customers where tenant_id = $1 and party_id = $2', [
        ctx.tenantId,
        partyId,
      ])
      if (taken[0]) throw conflict('That account is already a customer.')
    } else {
      const { rows } = await tx.query<{ id: string }>(
        `insert into parties (tenant_id, kind, name, created_by) values ($1, 'organisation', $2, $3) returning id`,
        [ctx.tenantId, input.name, ctx.userId],
      )
      partyId = rows[0].id
    }

    /*
     * The email lives on the party, beside the name, because the CRM account
     * and the billing customer are one record. The clash is checked here so a
     * second customer at the same address is a 422 the form can show, rather
     * than the unique index surfacing as an unhandled 500.
     */
    if (input.email?.trim()) {
      const { rows: clash } = await tx.query(
        `select 1 from parties
          where tenant_id = $1 and lower(email) = lower($2) and id <> $3
            and archived_at is null and merged_into is null`,
        [ctx.tenantId, input.email.trim(), partyId],
      )
      if (clash[0]) throw unprocessable('duplicate_email', `${input.email.trim()} already belongs to another account.`)
      await tx.query('update parties set email = $2, updated_at = $3 where id = $1', [partyId, input.email.trim(), ctx.now])
    }

    const { rows } = await tx.query<{ id: string }>(
      `insert into sales_customers
         (tenant_id, company_id, party_id, code, group_id, currency, credit_limit, payment_terms_days, tax_id, tax_region)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [
        ctx.tenantId,
        ctx.companyId,
        partyId,
        input.code ?? null,
        input.groupId ?? null,
        input.currency.toUpperCase(),
        input.creditLimit ?? null,
        input.paymentTermsDays ?? 0,
        input.taxId ?? null,
        input.taxRegion ?? null,
      ],
    )
    await recordAudit(tx, ctx, { action: 'sales.customer_created', resource: 'sales_customer', resourceId: rows[0].id })
    return readCustomerOn(tx, ctx, rows[0].id)
  })
}

async function readCustomerOn(db: TenantContext['db'], ctx: TenantContext, customerId: string): Promise<CustomerRow> {
  const { rows } = await db.query<Raw>(`select ${SELECT} where c.id = $1 and c.tenant_id = $2`, [customerId, ctx.tenantId])
  if (!rows[0]) throw notFound('That customer')
  return mapCustomer(rows[0])
}

export async function readCustomer(ctx: TenantContext, customerId: string): Promise<CustomerRow> {
  ctx.require('record.read')
  return readCustomerOn(ctx.db, ctx, customerId)
}

export async function listCustomers(
  ctx: TenantContext,
  options: { q?: string; groupId?: string; activeOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<{ rows: CustomerRow[]; total: number }> {
  ctx.require('record.read')
  const filters = ['c.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.groupId) add('c.group_id = $?', options.groupId)
  if (options.activeOnly) filters.push('c.active')
  if (options.q?.trim()) {
    params.push(`%${options.q.trim().toLowerCase()}%`)
    const index = params.length
    // The directory promises a search by name, email or tax ID, so all three
    // are matched here — a promise the browser used to keep over one page.
    filters.push(
      `(lower(p.name) like $${index} or lower(coalesce(c.code,'')) like $${index}
        or lower(coalesce(p.email,'')) like $${index} or lower(coalesce(c.tax_id,'')) like $${index})`,
    )
  }
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from sales_customers c join parties p on p.id = c.party_id where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Raw>(
    `select ${SELECT} where ${where} order by p.name limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return { total: Number(counted[0].n), rows: rows.map(mapCustomer) }
}

const UPDATABLE = {
  code: 'code = ',
  groupId: 'group_id = ',
  creditLimit: 'credit_limit = ',
  paymentTermsDays: 'payment_terms_days = ',
  taxId: 'tax_id = ',
  taxRegion: 'tax_region = ',
  active: 'active = ',
} as const

export async function updateCustomer(
  ctx: TenantContext,
  customerId: string,
  input: { version: number; name?: string } & Partial<Record<keyof typeof UPDATABLE, unknown>>,
): Promise<CustomerRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number; party_id: string }>(
      'select version, party_id from sales_customers where id = $1 and tenant_id = $2 for update',
      [customerId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That customer')
    if (rows[0].version !== input.version) throw conflict('Someone else changed this customer.', rows[0].version)

    // The name lives on the party, so renaming here renames the CRM account too
    // — which is the point of sharing the record.
    if (input.name?.trim()) {
      await tx.query('update parties set name = $2, updated_at = $3 where id = $1', [rows[0].party_id, input.name.trim(), ctx.now])
    }

    const sets: string[] = []
    const params: unknown[] = [customerId, ctx.tenantId, ctx.now]
    for (const [key, assignment] of Object.entries(UPDATABLE)) {
      const value = (input as Record<string, unknown>)[key]
      if (value === undefined) continue
      params.push(value)
      sets.push(assignment + `$${params.length}`)
    }
    if (sets.length) {
      await tx.query(
        `update sales_customers set ${sets.join(', ')}, version = version + 1, updated_at = $3 where id = $1 and tenant_id = $2`,
        params as never[],
      )
    }
    await recordAudit(tx, ctx, { action: 'sales.customer_updated', resource: 'sales_customer', resourceId: customerId })
    return readCustomerOn(tx, ctx, customerId)
  })
}

/* ------------------------- accounts receivable --------------------------- */

export type AgingBucket = { label: string; amount: string; count: number }

export type Aging = {
  asOf: string
  /** The currency every figure below is in. Null when nothing is outstanding. */
  currency: string | null
  /** Currencies outstanding but NOT counted here. Never converted, never summed in. */
  otherCurrencies: string[]
  buckets: AgingBucket[]
  total: string
}

/*
 * The standard buckets. A document with no due date sits in `Not due` rather
 * than being counted as current — guessing a due date from the issue date
 * would age invoices that were never given terms.
 */
const BUCKETS: { label: string; from: number; to: number | null }[] = [
  { label: 'Current', from: -Infinity, to: 0 },
  { label: '1–30', from: 1, to: 30 },
  { label: '31–60', from: 31, to: 60 },
  { label: '61–90', from: 61, to: 90 },
  { label: '90+', from: 91, to: null },
]

export async function agingReport(ctx: TenantContext, asOf: Date, currency?: string): Promise<Aging> {
  ctx.require('record.read')
  const on = asOf.toISOString().slice(0, 10)

  /*
   * Every open invoice, in every currency — the requested one is picked out
   * below rather than in the `where` clause. Filtering here would mean asking
   * for dollars and being told, truthfully, "USD 500 outstanding" while three
   * thousand in rupees goes unmentioned: the report cannot name what it never
   * fetched. The row ceiling is the same either way, since the unfiltered call
   * reads all of them regardless.
   */
  const { rows } = await ctx.db.query<{ due_on: Date | null; outstanding: string; currency: string }>(
    `select due_on, (grand_total - paid_total)::text as outstanding, currency
       from sales_documents
      where tenant_id = $1 and kind = 'invoice' and posted_at is not null
        and grand_total > paid_total`,
    [ctx.tenantId],
  )

  const totals = new Map<string, { amount: bigint; count: number }>()
  for (const entry of [...BUCKETS.map((bucket) => bucket.label), 'Not due']) {
    totals.set(entry, { amount: 0n, count: 0 })
  }

  /*
   * One currency is aged, and the rest are named rather than added in. A
   * receivables total of "USD 90,000" when a third of it is in rupees is not a
   * number anybody can chase, and labelling that sum with whichever invoice the
   * query happened to return first makes it worse than useless. Unasked, the
   * currency with the most open invoices wins — ties alphabetically, so the
   * answer does not move about between calls.
   */
  const present = new Map<string, number>()
  for (const row of rows) present.set(row.currency, (present.get(row.currency) ?? 0) + 1)
  const chosen =
    currency?.toUpperCase() ??
    [...present.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ??
    null
  const otherCurrencies = [...present.keys()].filter((code) => code !== chosen).sort()

  let total = 0n
  for (const row of rows) {
    if (row.currency !== chosen) continue
    const amount = toMinor(row.outstanding)
    total += amount
    let label = 'Not due'
    if (row.due_on) {
      const days = Math.floor((new Date(on).getTime() - new Date(row.due_on).getTime()) / 86_400_000)
      label = BUCKETS.find((bucket) => days >= bucket.from && (bucket.to === null || days <= bucket.to))?.label ?? '90+'
    }
    const bucket = totals.get(label)!
    bucket.amount += amount
    bucket.count += 1
  }

  return {
    asOf: on,
    currency: chosen,
    otherCurrencies,
    buckets: [...totals].map(([label, bucket]) => ({ label, amount: toDecimal(bucket.amount), count: bucket.count })),
    total: toDecimal(total),
  }
}

export type Debtor = { customerId: string; name: string; outstanding: string; overdue: string; currency: string }

/** Who owes the most, and how much of it is late. */
export async function topDebtors(ctx: TenantContext, limit = 5): Promise<Debtor[]> {
  ctx.require('record.read')
  const today = ctx.now.toISOString().slice(0, 10)
  const { rows } = await ctx.db.query<{
    customer_id: string
    name: string
    currency: string
    outstanding: string
    overdue: string
  }>(
    `select d.customer_id, p.name, d.currency,
            sum(d.grand_total - d.paid_total)::text as outstanding,
            coalesce(sum(d.grand_total - d.paid_total) filter (where d.due_on is not null and d.due_on < $2), 0)::text as overdue
       from sales_documents d
       join sales_customers c on c.id = d.customer_id
       join parties p on p.id = c.party_id
      where d.tenant_id = $1 and d.kind = 'invoice' and d.posted_at is not null
        and d.grand_total > d.paid_total
      group by d.customer_id, p.name, d.currency
      order by sum(d.grand_total - d.paid_total) desc
      limit $3`,
    [ctx.tenantId, today, Math.min(limit, 50)],
  )
  return rows.map((row) => ({
    customerId: row.customer_id,
    name: row.name,
    currency: row.currency,
    outstanding: row.outstanding,
    overdue: row.overdue,
  }))
}

export type OrderToCash = {
  currency: string | null
  quoted: string
  ordered: string
  delivered: string
  invoiced: string
  collected: string
}

/**
 * The order-to-cash funnel, by document kind.
 *
 * Only posted documents count. A draft invoice is not revenue and a draft
 * quote is not a quotation anybody received.
 */
export async function orderToCash(ctx: TenantContext, from: string, to: string): Promise<OrderToCash> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{ kind: string; total: string; currency: string }>(
    `select kind, coalesce(sum(grand_total), 0)::text as total, min(currency) as currency
       from sales_documents
      where tenant_id = $1 and posted_at is not null and posted_at >= $2::date and posted_at < ($3::date + 1)
      group by kind`,
    [ctx.tenantId, from, to],
  )
  const byKind = new Map(rows.map((row) => [row.kind, row.total]))

  const { rows: paid } = await ctx.db.query<{ total: string }>(
    `select coalesce(sum(amount), 0)::text as total from customer_payments
      where tenant_id = $1 and received_on >= $2::date and received_on <= $3::date`,
    [ctx.tenantId, from, to],
  )

  return {
    currency: rows[0]?.currency ?? null,
    quoted: byKind.get('quotation') ?? '0',
    ordered: byKind.get('order') ?? '0',
    delivered: byKind.get('delivery') ?? '0',
    invoiced: byKind.get('invoice') ?? '0',
    collected: paid[0].total,
  }
}

/* ---------------------------- customer groups ---------------------------- */

/**
 * Segments a customer belongs to.
 *
 * Chosen from this list on the customer record rather than typed, which is the
 * whole point of the table: a report grouped by segment cannot split across
 * "Regulars" and "regulars". Deleting is archiving — `sales_customers.group_id`
 * points here, and erasing a group would silently unsegment its customers.
 */
export type CustomerGroup = { id: string; name: string; discountPercent: string; customers: number }

export async function listCustomerGroups(ctx: TenantContext): Promise<CustomerGroup[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{ id: string; name: string; discount_percent: string; n: string }>(
    `select g.id, g.name, g.discount_percent::text as discount_percent,
            count(c.id)::text as n
       from customer_groups g
       left join sales_customers c on c.group_id = g.id
      where g.tenant_id = $1 and g.archived_at is null
      group by g.id, g.name, g.discount_percent
      order by g.name`,
    [ctx.tenantId],
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    discountPercent: row.discount_percent,
    customers: Number(row.n),
  }))
}

export async function createCustomerGroup(
  ctx: TenantContext,
  input: { name: string; discountPercent?: string },
): Promise<CustomerGroup> {
  ctx.require('settings.manage')
  const { rows: clash } = await ctx.db.query(
    'select 1 from customer_groups where tenant_id = $1 and lower(name) = lower($2) and archived_at is null',
    [ctx.tenantId, input.name],
  )
  if (clash[0]) throw unprocessable('duplicate_name', `There is already a group called ${input.name}.`)

  const { rows } = await ctx.db.query<{ id: string; name: string; discount_percent: string }>(
    `insert into customer_groups (tenant_id, name, discount_percent) values ($1,$2,$3)
     returning id, name, discount_percent::text as discount_percent`,
    [ctx.tenantId, input.name, input.discountPercent ?? '0'],
  )
  await recordAudit(ctx.db, ctx, {
    action: 'sales.customer_group_created',
    resource: 'customer_group',
    resourceId: rows[0].id,
    detail: { name: rows[0].name },
  })
  return { id: rows[0].id, name: rows[0].name, discountPercent: rows[0].discount_percent, customers: 0 }
}

export async function archiveCustomerGroup(ctx: TenantContext, groupId: string): Promise<void> {
  ctx.require('settings.manage')
  const { rowCount } = await ctx.db.query(
    'update customer_groups set archived_at = $3 where id = $1 and tenant_id = $2 and archived_at is null',
    [groupId, ctx.tenantId, ctx.now],
  )
  if (rowCount === 0) throw notFound('That group')
  await recordAudit(ctx.db, ctx, { action: 'sales.customer_group_archived', resource: 'customer_group', resourceId: groupId })
}

/* --------------------------- loyalty programmes -------------------------- */

/**
 * How points accrue and what they are worth.
 *
 * Deactivating rather than deleting: `loyalty_entries.programme_id` points
 * here, and a customer's accrued points must still say which scheme granted
 * them after the scheme is withdrawn.
 */
export type LoyaltyProgramme = {
  id: string
  name: string
  pointsPerUnit: string
  pointValue: string
  currency: string
  active: boolean
}

const mapProgramme = (row: Raw): LoyaltyProgramme => ({
  id: row.id as string,
  name: row.name as string,
  pointsPerUnit: decimalText(row.points_per_unit) as string,
  pointValue: decimalText(row.point_value) as string,
  currency: row.currency as string,
  active: row.active as boolean,
})

export async function listLoyaltyProgrammes(ctx: TenantContext, includeInactive = false): Promise<LoyaltyProgramme[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>(
    `select id, name, points_per_unit, point_value, currency, active
       from loyalty_programmes where tenant_id = $1 and ($2 or active) order by name`,
    [ctx.tenantId, includeInactive],
  )
  return rows.map(mapProgramme)
}

export async function createLoyaltyProgramme(
  ctx: TenantContext,
  input: { name: string; currency: string; pointsPerUnit?: string; pointValue?: string },
): Promise<LoyaltyProgramme> {
  ctx.require('settings.manage')
  const { rows: clash } = await ctx.db.query(
    'select 1 from loyalty_programmes where tenant_id = $1 and lower(name) = lower($2) and active',
    [ctx.tenantId, input.name],
  )
  if (clash[0]) throw unprocessable('duplicate_name', `There is already a programme called ${input.name}.`)

  const { rows } = await ctx.db.query<Raw>(
    `insert into loyalty_programmes (tenant_id, name, points_per_unit, point_value, currency)
     values ($1,$2,$3,$4,$5) returning id, name, points_per_unit, point_value, currency, active`,
    [ctx.tenantId, input.name, input.pointsPerUnit ?? '1', input.pointValue ?? '0.01', input.currency.toUpperCase()],
  )
  await recordAudit(ctx.db, ctx, {
    action: 'sales.loyalty_programme_created',
    resource: 'loyalty_programme',
    resourceId: rows[0].id as string,
    detail: { name: input.name },
  })
  return mapProgramme(rows[0])
}

export async function deactivateLoyaltyProgramme(ctx: TenantContext, programmeId: string): Promise<void> {
  ctx.require('settings.manage')
  const { rowCount } = await ctx.db.query(
    'update loyalty_programmes set active = false where id = $1 and tenant_id = $2 and active',
    [programmeId, ctx.tenantId],
  )
  if (rowCount === 0) throw notFound('That programme')
  await recordAudit(ctx.db, ctx, {
    action: 'sales.loyalty_programme_deactivated',
    resource: 'loyalty_programme',
    resourceId: programmeId,
  })
}

/* ------------------------------ revenue series --------------------------- */

export type RevenueBucket = { bucket: string; amount: string; invoices: number }

export type RevenueSeries = {
  from: string
  to: string
  bucket: 'day' | 'month'
  /** The currency every figure below is in. Null when nothing was invoiced. */
  currency: string | null
  /** Currencies present in the range but NOT summed here. Never converted. */
  otherCurrencies: string[]
  total: string
  invoices: number
  buckets: RevenueBucket[]
}

/**
 * Posted invoice value over time.
 *
 * `orderToCash` answers one aggregate per kind and cannot produce a series, so
 * a dashboard asking for "the last thirty days" had nothing to draw and drew a
 * single number under a daily-total heading instead.
 *
 * Money in two currencies is not added up. One currency is reported — the one
 * most invoices were raised in, or the one asked for — and the rest are named
 * so the screen can say what it is not showing rather than quietly summing
 * dollars into rupees.
 */
export async function revenueSeries(
  ctx: TenantContext,
  options: { from: string; to: string; bucket?: 'day' | 'month'; currency?: string },
): Promise<RevenueSeries> {
  ctx.require('record.read')
  const bucket = options.bucket ?? 'month'

  const { rows: currencies } = await ctx.db.query<{ currency: string; n: string }>(
    `select currency, count(*)::text as n from sales_documents
      where tenant_id = $1 and kind = 'invoice' and posted_at is not null
        and posted_at >= $2::date and posted_at < ($3::date + 1)
      group by currency order by count(*) desc, currency`,
    [ctx.tenantId, options.from, options.to],
  )
  const chosen = options.currency?.toUpperCase() ?? currencies[0]?.currency ?? null
  const others = currencies.map((row) => row.currency).filter((code) => code !== chosen)

  if (!chosen) {
    return { from: options.from, to: options.to, bucket, currency: null, otherCurrencies: [], total: '0.0000', invoices: 0, buckets: [] }
  }

  const { rows } = await ctx.db.query<{ bucket: string; amount: string; n: string }>(
    `select to_char(date_trunc($4::text, posted_at at time zone 'UTC'), 'YYYY-MM-DD') as bucket,
            coalesce(sum(grand_total), 0)::text as amount,
            count(*)::text as n
       from sales_documents
      where tenant_id = $1 and kind = 'invoice' and posted_at is not null
        and posted_at >= $2::date and posted_at < ($3::date + 1) and currency = $5
      group by 1 order by 1`,
    [ctx.tenantId, options.from, options.to, bucket, chosen],
  )

  let total = 0n
  let invoices = 0
  for (const row of rows) {
    total += toMinor(row.amount)
    invoices += Number(row.n)
  }
  return {
    from: options.from,
    to: options.to,
    bucket,
    currency: chosen,
    otherCurrencies: others,
    total: toDecimal(total),
    invoices,
    buckets: rows.map((row) => ({ bucket: row.bucket, amount: row.amount, invoices: Number(row.n) })),
  }
}
