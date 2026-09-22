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

const SELECT = `c.*, p.name, g.name as group_name
    from sales_customers c
    join parties p on p.id = c.party_id
    left join customer_groups g on g.id = c.group_id`

export async function createCustomer(
  ctx: TenantContext,
  input: {
    name: string
    currency: string
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
    filters.push(`(lower(p.name) like $${index} or lower(coalesce(c.code,'')) like $${index})`)
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
  currency: string | null
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

  const { rows } = await ctx.db.query<{ due_on: Date | null; outstanding: string; currency: string }>(
    `select due_on, (grand_total - paid_total)::text as outstanding, currency
       from sales_documents
      where tenant_id = $1 and kind = 'invoice' and posted_at is not null
        and grand_total > paid_total
        and ($2::char(3) is null or currency = $2)`,
    [ctx.tenantId, currency?.toUpperCase() ?? null],
  )

  const totals = new Map<string, { amount: bigint; count: number }>()
  for (const entry of [...BUCKETS.map((bucket) => bucket.label), 'Not due']) {
    totals.set(entry, { amount: 0n, count: 0 })
  }

  let total = 0n
  for (const row of rows) {
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
    currency: currency?.toUpperCase() ?? rows[0]?.currency ?? null,
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
