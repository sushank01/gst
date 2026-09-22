import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Sales & POS.
 *
 * Three rules the prototype did not have:
 *
 *  * **Totals are computed from lines, server-side.** A client may not send a
 *    total; it is recalculated on every line change and on posting.
 *  * **Posting is a one-way door.** A posted document is immutable and is
 *    corrected by a credit note, never edited. "Posted" was a browser status
 *    string before.
 *  * **A subscription period can be billed once.** The old sweep raised a fresh
 *    invoice for every active subscription on every click.
 */

/** Decimal maths on strings, so money never touches a float. */
const SCALE = 4n
const pow10 = (n: bigint) => 10n ** n

/**
 * A numeric column's value as a decimal string.
 *
 * `pg` and PGlite return `numeric` as a string precisely so no value is lost
 * to a float, but a `select *` row is typed `unknown` and `String(x)` on an
 * unknown would happily stringify an object. This narrows explicitly, so a
 * column that is somehow not a number is a loud failure rather than the text
 * "[object Object]" reaching an invoice.
 */
export function decimalText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'bigint') return value.toString()
  throw new TypeError(`Expected a numeric column value, got ${typeof value}`)
}

export function toMinor(value: string | number): bigint {
  const text = String(value).trim()
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw unprocessable('invalid_amount', `"${value}" is not a valid amount.`)
  const negative = text.startsWith('-')
  const [whole, fraction = ''] = text.replace('-', '').split('.')
  const padded = (fraction + '0'.repeat(Number(SCALE))).slice(0, Number(SCALE))
  const minor = BigInt(whole) * pow10(SCALE) + BigInt(padded || '0')
  return negative ? -minor : minor
}

export function toDecimal(minor: bigint): string {
  const negative = minor < 0n
  const abs = negative ? -minor : minor
  const whole = abs / pow10(SCALE)
  const fraction = (abs % pow10(SCALE)).toString().padStart(Number(SCALE), '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/** Round half-up at 4dp, which is what a tax authority expects of a line. */
function mulPercent(minor: bigint, percent: string): bigint {
  const rate = toMinor(percent)
  const product = minor * rate
  const divisor = 100n * pow10(SCALE)
  const half = divisor / 2n
  return product >= 0n ? (product + half) / divisor : (product - half) / divisor
}

export type LineInput = {
  itemCode?: string | null
  description: string
  quantity: string
  unitPrice: string
  discountPercent?: string
  taxCategoryId?: string | null
  taxRatePercent?: string
}

export type ComputedLine = LineInput & {
  position: number
  lineSubtotal: string
  lineTax: string
  lineTotal: string
}

export type ComputedTotals = {
  lines: ComputedLine[]
  subtotal: string
  discountTotal: string
  taxTotal: string
  grandTotal: string
}

/**
 * The single place a money total is produced.
 *
 * Tax is computed per line on the discounted amount, then summed — summing
 * first and taxing once gives a different answer and is not what an invoice
 * line-by-line breakdown shows.
 */
export function computeTotals(lines: LineInput[]): ComputedTotals {
  let subtotal = 0n
  let discountTotal = 0n
  let taxTotal = 0n

  const computed = lines.map((line, index) => {
    const gross = (toMinor(line.quantity) * toMinor(line.unitPrice)) / pow10(SCALE)
    const discount = mulPercent(gross, line.discountPercent ?? '0')
    const net = gross - discount
    const tax = mulPercent(net, line.taxRatePercent ?? '0')

    subtotal += gross
    discountTotal += discount
    taxTotal += tax

    return {
      ...line,
      position: index + 1,
      lineSubtotal: toDecimal(net),
      lineTax: toDecimal(tax),
      lineTotal: toDecimal(net + tax),
    }
  })

  return {
    lines: computed,
    subtotal: toDecimal(subtotal),
    discountTotal: toDecimal(discountTotal),
    taxTotal: toDecimal(taxTotal),
    grandTotal: toDecimal(subtotal - discountTotal + taxTotal),
  }
}

const PREFIXES: Record<string, string> = {
  quotation: 'QT',
  order: 'SO',
  delivery: 'DN',
  invoice: 'INV',
  return: 'RMA',
  credit_note: 'CN',
  refund: 'RF',
  subscription: 'SUB',
}

/**
 * Takes the next document number under a row lock.
 *
 * Two invoices created at the same instant must not share a number; the lock is
 * what makes the sequence gapless rather than "usually unique".
 */
export async function nextReference(tx: Db, ctx: TenantContext, kind: string): Promise<string> {
  const prefix = PREFIXES[kind] ?? kind.slice(0, 3).toUpperCase()
  const { rows } = await tx.query<{ next_value: string; padding: number }>(
    `insert into document_sequences (tenant_id, company_id, kind, prefix, next_value)
     values ($1, $2, $3, $4, 2)
     on conflict (tenant_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), kind)
     do update set next_value = document_sequences.next_value + 1, updated_at = now()
     returning (case when document_sequences.next_value = 2 then 1 else document_sequences.next_value - 1 end)::text as next_value, padding`,
    [ctx.tenantId, ctx.companyId, kind, prefix],
  )
  const value = rows[0]?.next_value ?? '1'
  const padding = rows[0]?.padding ?? 4
  return `${prefix}-${value.padStart(padding, '0')}`
}

/**
 * The order-to-cash document kinds, exactly as the table's check constraint
 * lists them. Exported so the API boundary validates against the same list
 * instead of letting the database reject it as an unhandled 500.
 */
export const DOCUMENT_KINDS = [
  'quotation',
  'order',
  'delivery',
  'invoice',
  'return',
  'credit_note',
  'refund',
  'subscription',
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export type CreateDocumentInput = {
  kind: string
  customerId?: string | null
  sourceDocumentId?: string | null
  currency: string
  status?: string
  issuedOn?: string | null
  dueOn?: string | null
  notes?: string | null
  lines: LineInput[]
}

export type SalesDocument = {
  id: string
  kind: string
  reference: string
  customerId: string | null
  /** Joined from the party, so a list never has to print a uuid at somebody. */
  customerName: string | null
  status: string
  currency: string
  subtotal: string
  discountTotal: string
  taxTotal: string
  grandTotal: string
  paidTotal: string
  postedAt: string | null
  cancelledAt: string | null
  version: number
  lines: ComputedLine[]
}

export async function createDocument(ctx: TenantContext, input: CreateDocumentInput): Promise<SalesDocument> {
  ctx.require('record.create')
  if (!input.lines.length) throw unprocessable('empty_document', 'Add at least one line.')

  const totals = computeTotals(input.lines)

  return ctx.db.transaction(async (tx) => {
    const reference = await nextReference(tx, ctx, input.kind)
    const { rows } = await tx.query<{ id: string; version: number }>(
      `insert into sales_documents
         (tenant_id, company_id, kind, reference, customer_id, source_document_id, status, currency,
          subtotal, discount_total, tax_total, grand_total, issued_on, due_on, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       returning id, version`,
      [
        ctx.tenantId,
        ctx.companyId,
        input.kind,
        reference,
        input.customerId ?? null,
        input.sourceDocumentId ?? null,
        input.status ?? 'draft',
        input.currency.toUpperCase(),
        totals.subtotal,
        totals.discountTotal,
        totals.taxTotal,
        totals.grandTotal,
        input.issuedOn ?? null,
        input.dueOn ?? null,
        input.notes ?? null,
        ctx.userId,
      ],
    )
    const documentId = rows[0].id
    await insertLines(tx, ctx, documentId, totals.lines)
    await recordAudit(tx, ctx, {
      action: `sales.${input.kind}_created`,
      resource: 'sales_document',
      resourceId: documentId,
      detail: { reference, grandTotal: totals.grandTotal, currency: input.currency },
    })
    return {
      id: documentId,
      kind: input.kind,
      reference,
      customerId: input.customerId ?? null,
      customerName: null,
      status: input.status ?? 'draft',
      currency: input.currency.toUpperCase(),
      ...totals,
      paidTotal: '0.0000',
      postedAt: null,
      cancelledAt: null,
      version: rows[0].version,
      lines: totals.lines,
    }
  })
}

/* ------------------------------- reading -------------------------------- */

type DocumentRow = {
  id: string
  kind: string
  reference: string
  customer_id: string | null
  customer_name: string | null
  status: string
  currency: string
  subtotal: string
  discount_total: string
  tax_total: string
  grand_total: string
  paid_total: string
  posted_at: Date | null
  cancelled_at: Date | null
  version: number
}

function mapDocument(row: DocumentRow, lines: ComputedLine[]): SalesDocument {
  return {
    id: row.id,
    kind: row.kind,
    reference: row.reference,
    customerId: row.customer_id,
    customerName: row.customer_name,
    status: row.status,
    currency: row.currency,
    subtotal: row.subtotal,
    discountTotal: row.discount_total,
    taxTotal: row.tax_total,
    grandTotal: row.grand_total,
    paidTotal: row.paid_total ?? '0.0000',
    postedAt: row.posted_at ? new Date(row.posted_at).toISOString() : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
    version: row.version,
    lines,
  }
}

async function linesOf(ctx: TenantContext, documentId: string): Promise<ComputedLine[]> {
  const { rows } = await ctx.db.query<{
    position: number
    item_code: string | null
    description: string
    quantity: string
    unit_price: string
    discount_percent: string
    tax_category_id: string | null
    tax_rate_percent: string
    line_subtotal: string
    line_tax: string
    line_total: string
  }>(
    `select position, item_code, description, quantity, unit_price, discount_percent,
            tax_category_id, tax_rate_percent, line_subtotal, line_tax, line_total
       from sales_document_lines where document_id = $1 and tenant_id = $2 order by position`,
    [documentId, ctx.tenantId],
  )
  return rows.map((line) => ({
    position: line.position,
    itemCode: line.item_code,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unit_price,
    discountPercent: line.discount_percent,
    taxCategoryId: line.tax_category_id,
    taxRatePercent: line.tax_rate_percent,
    lineSubtotal: line.line_subtotal,
    lineTax: line.line_tax,
    lineTotal: line.line_total,
  }))
}

export async function readDocument(ctx: TenantContext, documentId: string): Promise<SalesDocument> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<DocumentRow>(
    `select d.id, d.kind, d.reference, d.customer_id, p.name as customer_name, d.status, d.currency,
            d.subtotal, d.discount_total, d.tax_total, d.grand_total, d.paid_total, d.posted_at,
            d.cancelled_at, d.version
       from sales_documents d
       left join sales_customers c on c.id = d.customer_id
       left join parties p on p.id = c.party_id
      where d.id = $1 and d.tenant_id = $2`,
    [documentId, ctx.tenantId],
  )
  // Not found rather than forbidden: a document in another tenant must not be
  // distinguishable from one that does not exist.
  if (!rows[0]) throw notFound('That document')
  return mapDocument(rows[0], await linesOf(ctx, documentId))
}

export type ListDocumentOptions = {
  kind?: string
  status?: string
  customerId?: string
  q?: string
  limit?: number
  offset?: number
}

/** One status's share of a filter: how many, worth how much, in which currencies. */
export type StatusRollup = { status: string; count: number; total: string; currencies: string[] }

/**
 * List view: totals only. Lines are read per document, which the list does not need.
 *
 * `byStatus` answers the question every one of these screens asks beside its
 * list — how many are open, what is the pipeline worth — for the WHOLE filter
 * rather than the loaded page, and it ignores the status filter so selecting a
 * chip does not change the figures above it. Currencies are listed, never
 * summed together: a pipeline worth "USD 900" when half of it is in rupees is
 * not a number anybody can act on.
 */
export async function listDocuments(
  ctx: TenantContext,
  options: ListDocumentOptions = {},
): Promise<{ rows: SalesDocument[]; total: number; byStatus: StatusRollup[] }> {
  ctx.require('record.read')
  const filters = ['d.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.kind) add('d.kind = $?', options.kind)
  if (options.customerId) add('d.customer_id = $?', options.customerId)
  if (options.q?.trim()) add('lower(d.reference) like $?', `%${options.q.trim().toLowerCase()}%`)
  // Held back so the rollup below can be built from everything but the status.
  const withoutStatus = filters.join(' and ')
  const rollupParams = [...params]
  if (options.status) add('d.status = $?', options.status)
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from sales_documents d where ${where}`,
    params as never[],
  )
  const { rows: rollup } = await ctx.db.query<{ status: string; n: string; total: string; currencies: string[] }>(
    `select d.status, count(*)::text as n, coalesce(sum(d.grand_total), 0)::text as total,
            array_agg(distinct d.currency) as currencies
       from sales_documents d where ${withoutStatus}
      group by d.status order by d.status`,
    rollupParams as never[],
  )

  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<DocumentRow>(
    `select d.id, d.kind, d.reference, d.customer_id, p.name as customer_name, d.status, d.currency,
            d.subtotal, d.discount_total, d.tax_total, d.grand_total, d.paid_total, d.posted_at,
            d.cancelled_at, d.version
       from sales_documents d
       left join sales_customers c on c.id = d.customer_id
       left join parties p on p.id = c.party_id
      where ${where}
      order by d.created_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return {
    total: Number(counted[0].n),
    byStatus: rollup.map((row) => ({
      status: row.status,
      count: Number(row.n),
      total: row.total,
      currencies: row.currencies ?? [],
    })),
    rows: rows.map((row) => mapDocument(row, [])),
  }
}

async function insertLines(tx: Db, ctx: TenantContext, documentId: string, lines: ComputedLine[]): Promise<void> {
  for (const line of lines) {
    await tx.query(
      `insert into sales_document_lines
         (tenant_id, document_id, position, item_code, description, quantity, unit_price,
          discount_percent, tax_category_id, tax_rate_percent, line_subtotal, line_tax, line_total)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        ctx.tenantId,
        documentId,
        line.position,
        line.itemCode ?? null,
        line.description,
        line.quantity,
        line.unitPrice,
        line.discountPercent ?? '0',
        line.taxCategoryId ?? null,
        line.taxRatePercent ?? '0',
        line.lineSubtotal,
        line.lineTax,
        line.lineTotal,
      ],
    )
  }
}

/**
 * Posts a document to the ledger.
 *
 * Idempotent by construction: the update only matches while `posted_at is null`,
 * so a double-click or a retried request posts once. After posting the document
 * is immutable — `updateDocumentLines` refuses it.
 */
export async function postDocument(ctx: TenantContext, documentId: string, version: number): Promise<{ postedAt: string }> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number; posted_at: Date | null; kind: string; reference: string; grand_total: string }>(
      `select version, posted_at, kind, reference, grand_total::text as grand_total
         from sales_documents where id = $1 and tenant_id = $2 for update`,
      [documentId, ctx.tenantId],
    )
    const document = rows[0]
    if (!document) throw notFound('That document')
    /*
     * Already posted: the state the caller asked for holds, so answer with the
     * original timestamp instead of an error. A double-clicked Post button is
     * not a conflict, and the row lock plus this check mean the ledger effect
     * still happens exactly once. The version predicate below is for a genuine
     * edit race, which is a different thing.
     */
    if (document.posted_at) return { postedAt: new Date(document.posted_at).toISOString() }
    if (document.version !== version) throw conflict('Someone else changed this document.', document.version)

    // The match policy is checked here rather than at the boundary: posting is
    // the moment the document becomes immutable, so it is the last point at
    // which a refusal still leaves something editable to correct.
    if (document.kind === 'invoice') await enforceMatchPolicy(tx, ctx, documentId, document.reference)

    await tx.query(
      `update sales_documents set posted_at = $2, posted_by = $3, status = 'posted', version = version + 1, updated_at = $2
        where id = $1`,
      [documentId, ctx.now, ctx.userId],
    )
    await recordAudit(tx, ctx, {
      action: `sales.${document.kind}_posted`,
      resource: 'sales_document',
      resourceId: documentId,
      detail: { grandTotal: document.grand_total },
    })
    return { postedAt: ctx.now.toISOString() }
  })
}

/** Replaces the lines of an unposted document and recomputes every total. */
export async function updateDocumentLines(
  ctx: TenantContext,
  documentId: string,
  version: number,
  lines: LineInput[],
): Promise<SalesDocument> {
  ctx.require('record.update')
  if (!lines.length) throw unprocessable('empty_document', 'A document needs at least one line.')
  const totals = computeTotals(lines)

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number; posted_at: Date | null; kind: string; reference: string; currency: string; customer_id: string | null; status: string }>(
      `select version, posted_at, kind, reference, currency, customer_id, status
         from sales_documents where id = $1 and tenant_id = $2 for update`,
      [documentId, ctx.tenantId],
    )
    const document = rows[0]
    if (!document) throw notFound('That document')
    if (document.posted_at) {
      // A posted document is evidence. Correct it with a credit note.
      throw conflict('That document is posted and cannot be edited. Raise a credit note instead.')
    }
    if (document.version !== version) throw conflict('Someone else changed this document.', document.version)

    await tx.query('delete from sales_document_lines where document_id = $1', [documentId])
    await insertLines(tx, ctx, documentId, totals.lines)
    await tx.query(
      `update sales_documents set subtotal = $2, discount_total = $3, tax_total = $4, grand_total = $5,
              version = version + 1, updated_at = $6 where id = $1`,
      [documentId, totals.subtotal, totals.discountTotal, totals.taxTotal, totals.grandTotal, ctx.now],
    )
    await recordAudit(tx, ctx, {
      action: 'sales.document_updated',
      resource: 'sales_document',
      resourceId: documentId,
      detail: { grandTotal: totals.grandTotal },
    })
    return {
      id: documentId,
      kind: document.kind,
      reference: document.reference,
      customerId: document.customer_id,
      customerName: null,
      status: document.status,
      currency: document.currency,
      ...totals,
      paidTotal: '0.0000',
      postedAt: null,
      cancelledAt: null,
      version: document.version + 1,
      lines: totals.lines,
    }
  })
}

/* --------------------------------- payments ------------------------------- */

/**
 * Records a payment and allocates it across documents.
 *
 * The idempotency key is what makes a replayed provider webhook safe: the
 * second delivery finds the existing payment and allocates nothing further.
 */
export async function recordPayment(
  ctx: TenantContext,
  input: {
    customerId: string
    amount: string
    currency: string
    method: string
    receivedOn: string
    allocations: { documentId: string; amount: string }[]
    idempotencyKey?: string
    providerRef?: string
  },
): Promise<{ paymentId: string; duplicate: boolean }> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const { rows } = await tx.query<{ id: string }>(
        'select id from customer_payments where tenant_id = $1 and idempotency_key = $2',
        [ctx.tenantId, input.idempotencyKey],
      )
      if (rows[0]) return { paymentId: rows[0].id, duplicate: true }
    }

    const allocated = input.allocations.reduce((sum, item) => sum + toMinor(item.amount), 0n)
    if (allocated > toMinor(input.amount)) {
      throw unprocessable('over_allocated', 'The allocations add up to more than the payment.')
    }

    const reference = await nextReference(tx, ctx, 'payment')
    const { rows: payment } = await tx.query<{ id: string }>(
      `insert into customer_payments (tenant_id, company_id, customer_id, reference, method, amount, currency, received_on, provider_ref, idempotency_key, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [
        ctx.tenantId,
        ctx.companyId,
        input.customerId,
        reference,
        input.method,
        input.amount,
        input.currency.toUpperCase(),
        input.receivedOn,
        input.providerRef ?? null,
        input.idempotencyKey ?? null,
        ctx.userId,
      ],
    )

    for (const allocation of input.allocations) {
      const { rows: target } = await tx.query<{ grand_total: string; paid_total: string }>(
        `select grand_total::text as grand_total, paid_total::text as paid_total
           from sales_documents where id = $1 and tenant_id = $2 for update`,
        [allocation.documentId, ctx.tenantId],
      )
      if (!target[0]) throw notFound('That invoice')
      const outstanding = toMinor(target[0].grand_total) - toMinor(target[0].paid_total)
      if (toMinor(allocation.amount) > outstanding) {
        throw unprocessable(
          'over_payment',
          `That allocation is more than the ${toDecimal(outstanding)} still outstanding on the invoice.`,
        )
      }
      await tx.query(
        'insert into payment_allocations (tenant_id, payment_id, document_id, amount) values ($1,$2,$3,$4)',
        [ctx.tenantId, payment[0].id, allocation.documentId, allocation.amount],
      )
      await tx.query(
        `update sales_documents set paid_total = paid_total + $2,
                status = case when paid_total + $2 >= grand_total then 'paid' else status end,
                updated_at = $3
          where id = $1`,
        [allocation.documentId, allocation.amount, ctx.now],
      )
    }

    await recordAudit(tx, ctx, {
      action: 'sales.payment_recorded',
      resource: 'payment',
      resourceId: payment[0].id,
      detail: { amount: input.amount, currency: input.currency, allocations: input.allocations.length },
    })
    return { paymentId: payment[0].id, duplicate: false }
  })
}

/* ------------------------------ subscriptions ----------------------------- */

export type SweepSummary = { invoiced: number; alreadyBilled: number; periods: string[] }

/**
 * Bills every subscription period that is due and not yet billed.
 *
 * THE fix for the prototype's sweep, which raised a new invoice for every
 * active subscription every time the button was pressed. Here the unit of work
 * is a *period*, and `subscription_periods` has a unique index on
 * (subscription, period_start) — so pressing twice, or a dispatcher retrying,
 * bills once.
 */
export async function runSubscriptionBilling(ctx: TenantContext, upTo: Date): Promise<SweepSummary> {
  ctx.require('record.create')
  const summary: SweepSummary = { invoiced: 0, alreadyBilled: 0, periods: [] }

  const { rows: subscriptions } = await ctx.db.query<{
    id: string
    customer_id: string | null
    currency: string
    reference: string
  }>(
    `select id, customer_id, currency, reference from sales_documents
      where tenant_id = $1 and kind = 'subscription' and status = 'active' and cancelled_at is null`,
    [ctx.tenantId],
  )

  for (const subscription of subscriptions) {
    const { rows: due } = await ctx.db.query<{ id: string; period_start: string; period_end: string }>(
      `select id, period_start::text as period_start, period_end::text as period_end
         from subscription_periods
        where subscription_id = $1 and status = 'pending' and period_start <= $2
        order by period_start`,
      [subscription.id, upTo],
    )

    for (const period of due) {
      try {
        await ctx.db.transaction(async (tx) => {
          // Claim the period first. If another sweep already moved it, this
          // matches nothing and the period is skipped rather than billed twice.
          const { rowCount } = await tx.query(
            `update subscription_periods set status = 'invoiced'
              where id = $1 and status = 'pending'`,
            [period.id],
          )
          if (rowCount === 0) {
            summary.alreadyBilled += 1
            return
          }

          const { rows: lines } = await tx.query<{
            description: string
            quantity: string
            unit_price: string
            discount_percent: string
            tax_rate_percent: string
          }>(
            `select description, quantity::text as quantity, unit_price::text as unit_price,
                    discount_percent::text as discount_percent, tax_rate_percent::text as tax_rate_percent
               from sales_document_lines where document_id = $1 order by position`,
            [subscription.id],
          )
          const totals = computeTotals(
            lines.map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unit_price,
              discountPercent: line.discount_percent,
              taxRatePercent: line.tax_rate_percent,
            })),
          )

          const reference = await nextReference(tx, ctx, 'invoice')
          const { rows: invoice } = await tx.query<{ id: string }>(
            `insert into sales_documents
               (tenant_id, company_id, kind, reference, customer_id, source_document_id, status, currency,
                subtotal, discount_total, tax_total, grand_total, issued_on, created_by)
             values ($1,$2,'invoice',$3,$4,$5,'draft',$6,$7,$8,$9,$10,$11,$12) returning id`,
            [
              ctx.tenantId,
              ctx.companyId,
              reference,
              subscription.customer_id,
              subscription.id,
              subscription.currency,
              totals.subtotal,
              totals.discountTotal,
              totals.taxTotal,
              totals.grandTotal,
              period.period_start,
              ctx.userId,
            ],
          )
          await insertLines(tx, ctx, invoice[0].id, totals.lines)
          await tx.query('update subscription_periods set invoice_id = $2 where id = $1', [period.id, invoice[0].id])
          await recordAudit(tx, ctx, {
            action: 'sales.subscription_invoiced',
            resource: 'sales_document',
            resourceId: invoice[0].id,
            detail: { subscription: subscription.reference, period: period.period_start },
          })
          summary.invoiced += 1
          summary.periods.push(period.period_start)
        })
      } catch (error) {
        // One subscription's failure must not abandon the rest of the sweep.
        await recordAudit(ctx.db, ctx, {
          action: 'sales.subscription_billing_failed',
          resource: 'sales_document',
          resourceId: subscription.id,
          outcome: 'failure',
          detail: { period: period.period_start, error: error instanceof Error ? error.message : 'unknown' },
        })
      }
    }
  }

  return summary
}

/** Generates the period rows a subscription will be billed for. */
export async function scheduleSubscriptionPeriods(
  ctx: TenantContext,
  subscriptionId: string,
  starts: Date,
  count: number,
  cadenceDays = 30,
): Promise<number> {
  ctx.require('record.create')
  // Checked rather than left to the foreign key: an id from another tenant
  // must read as "no such subscription", not as a database error.
  const { rows } = await ctx.db.query<{ kind: string }>(
    'select kind from sales_documents where id = $1 and tenant_id = $2',
    [subscriptionId, ctx.tenantId],
  )
  if (!rows[0]) throw notFound('That subscription')
  if (rows[0].kind !== 'subscription') throw unprocessable('not_a_subscription', 'Only a subscription can be given billing periods.')

  let created = 0
  for (let index = 0; index < count; index += 1) {
    const periodStart = new Date(starts.getTime() + index * cadenceDays * 86_400_000)
    const periodEnd = new Date(periodStart.getTime() + cadenceDays * 86_400_000 - 1)
    const { rowCount } = await ctx.db.query(
      `insert into subscription_periods (tenant_id, subscription_id, period_start, period_end)
       values ($1, $2, $3, $4) on conflict (subscription_id, period_start) do nothing`,
      [ctx.tenantId, subscriptionId, periodStart.toISOString().slice(0, 10), periodEnd.toISOString().slice(0, 10)],
    )
    created += rowCount
  }
  return created
}

/* ----------------------------- cancellation ------------------------------ */

/**
 * Cancels a document.
 *
 * The row stays and is marked cancelled, because a numbered document that
 * vanishes leaves a gap in a sequence somebody will have to account for. A
 * posted document is refused outright: it is evidence, and the correction for
 * it is a credit note.
 */
export async function cancelDocument(
  ctx: TenantContext,
  documentId: string,
  version: number,
): Promise<{ cancelledAt: string }> {
  ctx.require('record.archive')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number; posted_at: Date | null; cancelled_at: Date | null; kind: string; reference: string }>(
      `select version, posted_at, cancelled_at, kind, reference
         from sales_documents where id = $1 and tenant_id = $2 for update`,
      [documentId, ctx.tenantId],
    )
    const document = rows[0]
    if (!document) throw notFound('That document')
    // Already cancelled is the state the caller asked for, not a failure.
    if (document.cancelled_at) return { cancelledAt: new Date(document.cancelled_at).toISOString() }
    if (document.posted_at) {
      throw conflict(`${document.reference} is posted and cannot be cancelled. Raise a credit note instead.`)
    }
    if (document.version !== version) throw conflict('Someone else changed this document.', document.version)

    await tx.query(
      `update sales_documents set cancelled_at = $2, status = 'cancelled', version = version + 1, updated_at = $2
        where id = $1`,
      [documentId, ctx.now],
    )
    await recordAudit(tx, ctx, {
      action: `sales.${document.kind}_cancelled`,
      resource: 'sales_document',
      resourceId: documentId,
      detail: { reference: document.reference },
    })
    return { cancelledAt: ctx.now.toISOString() }
  })
}

/* ----------------------------- tax categories ---------------------------- */

/** One leg of a slab — "CGST 9%" — so a split is data rather than a sentence. */
export type TaxComponent = { name: string; percent: string }

export type TaxCategory = {
  id: string
  name: string
  ratePercent: string
  withinRegion: TaxComponent[]
  crossRegion: TaxComponent[]
}

const mapTaxCategory = (row: {
  id: string
  name: string
  rate_percent: string
  within_region: TaxComponent[] | null
  cross_region: TaxComponent[] | null
}): TaxCategory => ({
  id: row.id,
  name: row.name,
  ratePercent: row.rate_percent,
  withinRegion: row.within_region ?? [],
  crossRegion: row.cross_region ?? [],
})

export async function listTaxCategories(ctx: TenantContext): Promise<TaxCategory[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{
    id: string
    name: string
    rate_percent: string
    within_region: TaxComponent[] | null
    cross_region: TaxComponent[] | null
  }>(
    `select id, name, rate_percent::text as rate_percent, within_region, cross_region
       from tax_categories where tenant_id = $1 and archived_at is null order by rate_percent, name`,
    [ctx.tenantId],
  )
  return rows.map(mapTaxCategory)
}

export async function createTaxCategory(
  ctx: TenantContext,
  input: { name: string; ratePercent: string; withinRegion?: TaxComponent[]; crossRegion?: TaxComponent[] },
): Promise<TaxCategory> {
  ctx.require('settings.manage')
  const { rows: clash } = await ctx.db.query(
    'select 1 from tax_categories where tenant_id = $1 and lower(name) = lower($2) and archived_at is null',
    [ctx.tenantId, input.name],
  )
  if (clash[0]) throw unprocessable('duplicate_name', `There is already a category called ${input.name}.`)

  const { rows } = await ctx.db.query<{
    id: string
    name: string
    rate_percent: string
    within_region: TaxComponent[] | null
    cross_region: TaxComponent[] | null
  }>(
    `insert into tax_categories (tenant_id, name, rate_percent, within_region, cross_region)
     values ($1,$2,$3,$4,$5)
     returning id, name, rate_percent::text as rate_percent, within_region, cross_region`,
    [
      ctx.tenantId,
      input.name,
      input.ratePercent,
      JSON.stringify(input.withinRegion ?? []),
      JSON.stringify(input.crossRegion ?? []),
    ],
  )
  await recordAudit(ctx.db, ctx, {
    action: 'sales.tax_category_created',
    resource: 'tax_category',
    resourceId: rows[0].id,
    detail: { name: input.name, ratePercent: input.ratePercent },
  })
  return mapTaxCategory(rows[0])
}

/**
 * Archives a slab. Never deletes: `sales_document_lines.tax_category_id`
 * points here, and a posted invoice must keep saying which category it was
 * taxed under.
 */
export async function archiveTaxCategory(ctx: TenantContext, categoryId: string): Promise<void> {
  ctx.require('settings.manage')
  const { rowCount } = await ctx.db.query(
    'update tax_categories set archived_at = $3 where id = $1 and tenant_id = $2 and archived_at is null',
    [categoryId, ctx.tenantId, ctx.now],
  )
  if (rowCount === 0) throw notFound('That tax category')
  await recordAudit(ctx.db, ctx, { action: 'sales.tax_category_archived', resource: 'tax_category', resourceId: categoryId })
}

/* ------------------------------ match policy ----------------------------- */

export type MatchAction = 'warn' | 'block' | 'ignore'

export type MatchPolicy = {
  priceTolerancePercent: string
  priceAction: MatchAction
  quantityTolerancePercent: string
  quantityAction: MatchAction
  requireOrder: boolean
  requireDelivery: boolean
  /**
   * When the policy was last written, and the token a write must carry back.
   * Null means no policy row exists and the values above are the defaults in
   * force — `match_policies` has no version column, so the timestamp is what
   * makes a concurrent edit a conflict rather than a silent overwrite.
   */
  updatedAt: string | null
}

const MATCH_DEFAULTS: Omit<MatchPolicy, 'updatedAt'> = {
  priceTolerancePercent: '5.000',
  priceAction: 'warn',
  quantityTolerancePercent: '2.000',
  quantityAction: 'warn',
  requireOrder: false,
  requireDelivery: false,
}

type MatchRow = {
  price_tolerance_percent: string
  price_action: MatchAction
  quantity_tolerance_percent: string
  quantity_action: MatchAction
  require_order: boolean
  require_delivery: boolean
  updated_at: Date
}

const MATCH_SELECT = `price_tolerance_percent::text as price_tolerance_percent, price_action,
       quantity_tolerance_percent::text as quantity_tolerance_percent, quantity_action,
       require_order, require_delivery, updated_at`

const mapMatchPolicy = (row: MatchRow): MatchPolicy => ({
  priceTolerancePercent: row.price_tolerance_percent,
  priceAction: row.price_action,
  quantityTolerancePercent: row.quantity_tolerance_percent,
  quantityAction: row.quantity_action,
  requireOrder: row.require_order,
  requireDelivery: row.require_delivery,
  updatedAt: new Date(row.updated_at).toISOString(),
})

export async function readMatchPolicy(ctx: TenantContext): Promise<MatchPolicy> {
  ctx.require('settings.read')
  const { rows } = await ctx.db.query<MatchRow>(`select ${MATCH_SELECT} from match_policies where tenant_id = $1`, [
    ctx.tenantId,
  ])
  return rows[0] ? mapMatchPolicy(rows[0]) : { ...MATCH_DEFAULTS, updatedAt: null }
}

export async function writeMatchPolicy(
  ctx: TenantContext,
  input: Omit<MatchPolicy, 'updatedAt'> & { updatedAt: string | null },
): Promise<MatchPolicy> {
  ctx.require('settings.manage')

  if (input.updatedAt === null) {
    const { rows } = await ctx.db.query<MatchRow>(
      `insert into match_policies
         (tenant_id, price_tolerance_percent, price_action, quantity_tolerance_percent, quantity_action,
          require_order, require_delivery, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (tenant_id) do nothing
       returning ${MATCH_SELECT}`,
      [
        ctx.tenantId,
        input.priceTolerancePercent,
        input.priceAction,
        input.quantityTolerancePercent,
        input.quantityAction,
        input.requireOrder,
        input.requireDelivery,
        ctx.now,
      ],
    )
    if (!rows[0]) throw conflict('Someone else set a match policy while you were editing.')
    await recordAudit(ctx.db, ctx, { action: 'sales.match_policy_updated', resource: 'match_policy', resourceId: ctx.tenantId })
    return mapMatchPolicy(rows[0])
  }

  const { rows } = await ctx.db.query<MatchRow>(
    `update match_policies
        set price_tolerance_percent = $3, price_action = $4, quantity_tolerance_percent = $5,
            quantity_action = $6, require_order = $7, require_delivery = $8, updated_at = $9
      where tenant_id = $1 and updated_at = $2::timestamptz
      returning ${MATCH_SELECT}`,
    [
      ctx.tenantId,
      input.updatedAt,
      input.priceTolerancePercent,
      input.priceAction,
      input.quantityTolerancePercent,
      input.quantityAction,
      input.requireOrder,
      input.requireDelivery,
      ctx.now,
    ],
  )
  if (!rows[0]) throw conflict('Someone else changed the match policy while you were editing.')
  await recordAudit(ctx.db, ctx, { action: 'sales.match_policy_updated', resource: 'match_policy', resourceId: ctx.tenantId })
  return mapMatchPolicy(rows[0])
}

/** Drift as a percentage of the base, in minor units. Null when there is no base. */
function driftPercent(base: bigint, actual: bigint): bigint | null {
  if (base === 0n) return null
  const difference = actual - base
  const magnitude = difference < 0n ? -difference : difference
  return (magnitude * 100n * pow10(SCALE)) / base
}

/**
 * Applies the 3-way match policy to an invoice about to post.
 *
 * Only invoices are matched, and only against the documents they were actually
 * raised from: the chain is followed through `source_document_id`, so an
 * invoice billed from a delivery that came from an order is matched against
 * both. Nothing is compared when there is no source — a tolerance against a
 * document that does not exist is not a measurement.
 *
 * With no policy row the product ships with no checks at all rather than
 * inventing thresholds nobody agreed: `readMatchPolicy` reports the defaults
 * for display, but enforcement waits for an explicit save.
 */
async function enforceMatchPolicy(tx: Db, ctx: TenantContext, documentId: string, reference: string): Promise<void> {
  const { rows: policyRows } = await tx.query<MatchRow>(`select ${MATCH_SELECT} from match_policies where tenant_id = $1`, [
    ctx.tenantId,
  ])
  if (!policyRows[0]) return
  const policy = mapMatchPolicy(policyRows[0])

  // Walk the source chain. Four hops is already quotation → order → delivery →
  // invoice; a longer one would mean a cycle, which the bound also stops.
  type ChainRow = { source_document_id: string | null; kind: string; subtotal: string }
  const chain: { id: string; kind: string; subtotal: string }[] = []
  let cursor: string | null = documentId
  for (let hop = 0; hop < 4 && cursor !== null; hop += 1) {
    const here: string = cursor
    const step = await tx.query<ChainRow>(
      'select source_document_id, kind, subtotal::text as subtotal from sales_documents where id = $1 and tenant_id = $2',
      [here, ctx.tenantId],
    )
    const row = step.rows[0]
    if (!row) break
    // The invoice itself is not one of its own sources.
    if (hop > 0) chain.push({ id: here, kind: row.kind, subtotal: row.subtotal })
    cursor = row.source_document_id
  }

  const order = chain.find((entry) => entry.kind === 'order')
  const delivery = chain.find((entry) => entry.kind === 'delivery')

  if (policy.requireOrder && !order) {
    throw unprocessable('match_order_required', `${reference} is not linked to a sales order, and the match policy requires one.`)
  }
  if (policy.requireDelivery && !delivery) {
    throw unprocessable('match_delivery_required', `${reference} is not linked to a delivery note, and the match policy requires one.`)
  }

  const { rows: mine } = await tx.query<{ subtotal: string; quantity: string }>(
    `select d.subtotal::text as subtotal, coalesce(sum(l.quantity), 0)::text as quantity
       from sales_documents d left join sales_document_lines l on l.document_id = d.id
      where d.id = $1 group by d.subtotal`,
    [documentId],
  )
  const invoiced = mine[0]
  if (!invoiced) return

  const checks: { label: string; base: string | null; actual: string; tolerance: string; action: MatchAction }[] = []
  if (order) {
    checks.push({
      label: 'price',
      base: order.subtotal,
      actual: invoiced.subtotal,
      tolerance: policy.priceTolerancePercent,
      action: policy.priceAction,
    })
  }
  if (delivery) {
    const { rows: delivered } = await tx.query<{ quantity: string }>(
      'select coalesce(sum(quantity), 0)::text as quantity from sales_document_lines where document_id = $1',
      [delivery.id],
    )
    checks.push({
      label: 'quantity',
      base: delivered[0]?.quantity ?? null,
      actual: invoiced.quantity,
      tolerance: policy.quantityTolerancePercent,
      action: policy.quantityAction,
    })
  }

  for (const check of checks) {
    if (check.action === 'ignore' || check.base === null) continue
    const drift = driftPercent(toMinor(check.base), toMinor(check.actual))
    if (drift === null || drift <= toMinor(check.tolerance)) continue
    if (check.action === 'block') {
      throw unprocessable(
        `match_${check.label}_out_of_tolerance`,
        `The invoiced ${check.label} differs from the ${check.label === 'price' ? 'order' : 'delivery note'} by more than the ${check.tolerance}% allowed.`,
      )
    }
    await recordAudit(tx, ctx, {
      action: 'sales.match_warning',
      resource: 'sales_document',
      resourceId: documentId,
      outcome: 'failure',
      detail: { check: check.label, tolerance: check.tolerance, base: check.base, actual: check.actual },
    })
  }
}
