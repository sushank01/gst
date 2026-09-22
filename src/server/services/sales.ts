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
  status: string
  currency: string
  subtotal: string
  discountTotal: string
  taxTotal: string
  grandTotal: string
  paidTotal: string
  postedAt: string | null
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
      status: input.status ?? 'draft',
      currency: input.currency.toUpperCase(),
      ...totals,
      paidTotal: '0.0000',
      postedAt: null,
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
  status: string
  currency: string
  subtotal: string
  discount_total: string
  tax_total: string
  grand_total: string
  paid_total: string
  posted_at: Date | null
  version: number
}

function mapDocument(row: DocumentRow, lines: ComputedLine[]): SalesDocument {
  return {
    id: row.id,
    kind: row.kind,
    reference: row.reference,
    customerId: row.customer_id,
    status: row.status,
    currency: row.currency,
    subtotal: row.subtotal,
    discountTotal: row.discount_total,
    taxTotal: row.tax_total,
    grandTotal: row.grand_total,
    paidTotal: row.paid_total ?? '0.0000',
    postedAt: row.posted_at ? new Date(row.posted_at).toISOString() : null,
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
    `select id, kind, reference, customer_id, status, currency, subtotal, discount_total,
            tax_total, grand_total, paid_total, posted_at, version
       from sales_documents where id = $1 and tenant_id = $2`,
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

/** List view: totals only. Lines are read per document, which the list does not need. */
export async function listDocuments(
  ctx: TenantContext,
  options: ListDocumentOptions = {},
): Promise<{ rows: SalesDocument[]; total: number }> {
  ctx.require('record.read')
  const filters = ['d.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.kind) add('d.kind = $?', options.kind)
  if (options.status) add('d.status = $?', options.status)
  if (options.customerId) add('d.customer_id = $?', options.customerId)
  if (options.q?.trim()) add('lower(d.reference) like $?', `%${options.q.trim().toLowerCase()}%`)
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from sales_documents d where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<DocumentRow>(
    `select d.id, d.kind, d.reference, d.customer_id, d.status, d.currency, d.subtotal,
            d.discount_total, d.tax_total, d.grand_total, d.paid_total, d.posted_at, d.version
       from sales_documents d where ${where}
      order by d.created_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return { total: Number(counted[0].n), rows: rows.map((row) => mapDocument(row, [])) }
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
    const { rows } = await tx.query<{ version: number; posted_at: Date | null; kind: string; grand_total: string }>(
      'select version, posted_at, kind, grand_total::text as grand_total from sales_documents where id = $1 and tenant_id = $2 for update',
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
      status: document.status,
      currency: document.currency,
      ...totals,
      paidTotal: '0.0000',
      postedAt: null,
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
