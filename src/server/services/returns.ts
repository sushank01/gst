import { notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import {
  computeTotals, decimalText, nextReference, toDecimal, toMinor, type LineInput, type SalesDocument,
} from './sales.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Returns and credit notes.
 *
 * A return is bounded by what was actually sold. The rule that matters is that
 * the quantity returned across every return against an invoice can never
 * exceed the quantity that invoice billed — otherwise a customer can be
 * credited for more than they bought, repeatedly, and each credit note looks
 * individually reasonable.
 *
 * A credit note does not edit the invoice. The invoice is posted evidence and
 * stays as it was; the credit note is a separate posted document that reduces
 * what is owed. Editing the original is how an audit trail stops matching the
 * money that moved.
 */

export type ReturnLineInput = {
  /** The invoice line being returned against. */
  sourceLineId: string
  quantity: string
  reason?: string | null
}

type Raw = Record<string, unknown>

/** How much of each line of an invoice has already been returned. */
async function returnedSoFar(db: Db, ctx: TenantContext, invoiceId: string): Promise<Map<string, bigint>> {
  const { rows } = await db.query<{ source_line_id: string; quantity: string }>(
    `select l.source_line_id, sum(l.quantity)::text as quantity
       from sales_document_lines l
       join sales_documents d on d.id = l.document_id
      where d.tenant_id = $1 and d.source_document_id = $2 and d.kind in ('return', 'credit_note')
        and d.posted_at is not null and l.source_line_id is not null
      group by l.source_line_id`,
    [ctx.tenantId, invoiceId],
  )
  return new Map(rows.map((row) => [row.source_line_id, toMinor(row.quantity)]))
}

/**
 * Raises a credit note against a posted invoice.
 *
 * Created already posted: a draft credit note is a promise of money that has
 * not been given back, and the outstanding balance would be wrong for as long
 * as it sat unposted.
 */
export async function createReturn(
  ctx: TenantContext,
  input: { invoiceId: string; lines: ReturnLineInput[]; reason: string; kind?: 'return' | 'credit_note' },
): Promise<SalesDocument> {
  ctx.require('record.create')
  if (!input.lines.length) throw unprocessable('empty_return', 'Say which lines are coming back.')

  return ctx.db.transaction(async (tx) => {
    const { rows: invoice } = await tx.query<{
      id: string
      kind: string
      customer_id: string | null
      currency: string
      posted_at: Date | null
      reference: string
    }>(
      `select id, kind, customer_id, currency, posted_at, reference
         from sales_documents where id = $1 and tenant_id = $2 for update`,
      [input.invoiceId, ctx.tenantId],
    )
    if (!invoice[0]) throw notFound('That invoice')
    if (invoice[0].kind !== 'invoice') throw unprocessable('not_an_invoice', 'A return is raised against an invoice.')
    // Nothing has been billed until the invoice is posted, so there is nothing
    // to credit back.
    if (!invoice[0].posted_at) throw unprocessable('not_posted', 'That invoice has not been posted.')

    const { rows: sourceLines } = await tx.query<{
      id: string
      position: number
      item_code: string | null
      description: string
      quantity: string
      unit_price: string
      discount_percent: string
      tax_category_id: string | null
      tax_rate_percent: string
    }>(
      `select id, position, item_code, description, quantity::text, unit_price::text,
              discount_percent::text, tax_category_id, tax_rate_percent::text
         from sales_document_lines where document_id = $1 and tenant_id = $2`,
      [input.invoiceId, ctx.tenantId],
    )
    const byId = new Map(sourceLines.map((line) => [line.id, line]))
    const already = await returnedSoFar(tx, ctx, input.invoiceId)

    const lines: (LineInput & { sourceLineId: string })[] = []
    for (const line of input.lines) {
      const source = byId.get(line.sourceLineId)
      if (!source) throw notFound('That invoice line')

      const wanted = toMinor(line.quantity)
      if (wanted <= 0n) throw unprocessable('bad_quantity', 'A returned quantity must be positive.')

      const billed = toMinor(source.quantity)
      const returned = already.get(line.sourceLineId) ?? 0n
      if (returned + wanted > billed) {
        throw unprocessable(
          'over_return',
          `${source.description}: ${toDecimal(billed)} were billed and ${toDecimal(returned)} already returned; ` +
            `${toDecimal(wanted)} more would exceed that.`,
        )
      }

      /*
       * The credit is priced at what was CHARGED, not at today's price. A
       * return repriced at the current rate refunds an amount the customer
       * never paid — in either direction.
       */
      lines.push({
        sourceLineId: line.sourceLineId,
        itemCode: source.item_code,
        description: source.description,
        quantity: line.quantity,
        unitPrice: source.unit_price,
        discountPercent: source.discount_percent,
        taxCategoryId: source.tax_category_id,
        taxRatePercent: source.tax_rate_percent,
      })
    }

    const totals = computeTotals(lines)
    const kind = input.kind ?? 'credit_note'
    const reference = await nextReference(tx, ctx, kind)

    const { rows: created } = await tx.query<{ id: string; version: number }>(
      `insert into sales_documents
         (tenant_id, company_id, kind, reference, customer_id, source_document_id, status, currency,
          subtotal, discount_total, tax_total, grand_total, issued_on, notes, created_by, posted_at, posted_by)
       values ($1,$2,$3,$4,$5,$6,'posted',$7,$8,$9,$10,$11,$12,$13,$14,$15,$14)
       returning id, version`,
      [
        ctx.tenantId,
        ctx.companyId,
        kind,
        reference,
        invoice[0].customer_id,
        input.invoiceId,
        invoice[0].currency,
        totals.subtotal,
        totals.discountTotal,
        totals.taxTotal,
        totals.grandTotal,
        ctx.now.toISOString().slice(0, 10),
        input.reason,
        ctx.userId,
        ctx.now,
      ],
    )
    const documentId = created[0].id

    for (const [index, line] of totals.lines.entries()) {
      await tx.query(
        `insert into sales_document_lines
           (tenant_id, document_id, position, item_code, description, quantity, unit_price,
            discount_percent, tax_category_id, tax_rate_percent, line_subtotal, line_tax, line_total, source_line_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
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
          lines[index].sourceLineId,
        ],
      )
    }

    await recordAudit(tx, ctx, {
      action: `sales.${kind}_raised`,
      resource: 'sales_document',
      resourceId: documentId,
      detail: { reference, against: invoice[0].reference, grandTotal: totals.grandTotal },
    })

    return {
      id: documentId,
      kind,
      reference,
      customerId: invoice[0].customer_id,
      // Not joined here: the caller already knows whose invoice it credited.
      customerName: null,
      status: 'posted',
      currency: invoice[0].currency,
      ...totals,
      paidTotal: '0.0000',
      postedAt: ctx.now.toISOString(),
      cancelledAt: null,
      version: created[0].version,
      lines: totals.lines,
    }
  })
}

export type ReturnableLine = {
  lineId: string
  description: string
  billed: string
  returned: string
  returnable: string
  unitPrice: string
}

/**
 * What is still returnable on an invoice.
 *
 * The screen that raises a return needs this, and computing it there from the
 * invoice alone would ignore earlier returns — which is exactly how a line
 * gets credited twice.
 */
export async function returnableLines(ctx: TenantContext, invoiceId: string): Promise<ReturnableLine[]> {
  ctx.require('record.read')
  const { rows: invoice } = await ctx.db.query('select 1 from sales_documents where id = $1 and tenant_id = $2', [
    invoiceId,
    ctx.tenantId,
  ])
  if (!invoice[0]) throw notFound('That invoice')

  const { rows } = await ctx.db.query<{
    id: string
    description: string
    quantity: string
    unit_price: string
  }>(
    `select id, description, quantity::text, unit_price::text
       from sales_document_lines where document_id = $1 and tenant_id = $2 order by position`,
    [invoiceId, ctx.tenantId],
  )
  const already = await returnedSoFar(ctx.db, ctx, invoiceId)

  return rows.map((line) => {
    const billed = toMinor(line.quantity)
    const returned = already.get(line.id) ?? 0n
    return {
      lineId: line.id,
      description: line.description,
      billed: toDecimal(billed),
      returned: toDecimal(returned),
      returnable: toDecimal(billed - returned),
      unitPrice: line.unit_price,
    }
  })
}

/**
 * What a customer still owes, net of credit notes.
 *
 * Invoices add, credits subtract. Reading the invoice total alone overstates
 * the debt of anybody who has ever returned anything.
 */
export async function netOutstanding(ctx: TenantContext, customerId: string): Promise<{ currency: string | null; amount: string }> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{ currency: string | null; owed: string; credited: string }>(
    `select min(currency) as currency,
            coalesce(sum(grand_total - paid_total) filter (where kind = 'invoice'), 0)::text as owed,
            coalesce(sum(grand_total) filter (where kind in ('credit_note', 'return')), 0)::text as credited
       from sales_documents
      where tenant_id = $1 and customer_id = $2 and posted_at is not null`,
    [ctx.tenantId, customerId],
  )
  const net = toMinor(rows[0].owed) - toMinor(rows[0].credited)
  return { currency: rows[0].currency, amount: toDecimal(net) }
}

/* ----------------------------- rate contracts ----------------------------- */

export type ContractRow = {
  id: string
  reference: string
  customerId: string | null
  groupId: string | null
  currency: string
  validFrom: string
  validTo: string | null
  priority: number
  status: string
  lines: { itemCode: string; unitPrice: string; minQuantity: string; discountPercent: string }[]
}

const day = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, 10) : (value as Date).toISOString().slice(0, 10)

export async function createRateContract(
  ctx: TenantContext,
  input: {
    reference: string
    currency: string
    validFrom: string
    validTo?: string | null
    customerId?: string | null
    groupId?: string | null
    priority?: number
    lines: { itemCode: string; unitPrice: string; minQuantity?: string; discountPercent?: string; description?: string | null }[]
  },
): Promise<ContractRow> {
  ctx.require('settings.manage')
  if (!input.customerId && !input.groupId) {
    throw unprocessable('no_scope', 'A rate contract applies to a customer or a customer group.')
  }
  if (!input.lines.length) throw unprocessable('empty_contract', 'A contract with no prices sets no prices.')
  if (input.validTo && input.validTo < input.validFrom) {
    throw unprocessable('bad_period', 'The contract ends before it starts.')
  }

  return ctx.db.transaction(async (tx) => {
    const { rows: clash } = await tx.query('select 1 from rate_contracts where tenant_id = $1 and reference = $2', [
      ctx.tenantId,
      input.reference,
    ])
    if (clash[0]) throw unprocessable('duplicate_reference', `${input.reference} is already in use.`)

    const { rows } = await tx.query<{ id: string }>(
      `insert into rate_contracts (tenant_id, customer_id, group_id, reference, currency, valid_from, valid_to, priority)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [
        ctx.tenantId,
        input.customerId ?? null,
        input.groupId ?? null,
        input.reference,
        input.currency.toUpperCase(),
        input.validFrom,
        input.validTo ?? null,
        input.priority ?? 0,
      ],
    )
    for (const line of input.lines) {
      await tx.query(
        `insert into rate_contract_lines (tenant_id, contract_id, item_code, description, unit_price, min_quantity, discount_percent)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          ctx.tenantId,
          rows[0].id,
          line.itemCode,
          line.description ?? null,
          line.unitPrice,
          line.minQuantity ?? '0',
          line.discountPercent ?? '0',
        ],
      )
    }
    return readRateContract({ ...ctx, db: tx }, rows[0].id)
  })
}

export async function readRateContract(ctx: TenantContext, contractId: string): Promise<ContractRow> {
  const { rows } = await ctx.db.query<Raw>('select * from rate_contracts where id = $1 and tenant_id = $2', [
    contractId,
    ctx.tenantId,
  ])
  if (!rows[0]) throw notFound('That contract')

  const { rows: lines } = await ctx.db.query<{
    item_code: string
    unit_price: string
    min_quantity: string
    discount_percent: string
  }>(
    `select item_code, unit_price::text, min_quantity::text, discount_percent::text
       from rate_contract_lines where contract_id = $1 order by item_code, min_quantity`,
    [contractId],
  )
  return {
    id: rows[0].id as string,
    reference: rows[0].reference as string,
    customerId: (rows[0].customer_id as string) ?? null,
    groupId: (rows[0].group_id as string) ?? null,
    currency: rows[0].currency as string,
    validFrom: day(rows[0].valid_from),
    validTo: rows[0].valid_to ? day(rows[0].valid_to) : null,
    priority: rows[0].priority as number,
    status: rows[0].status as string,
    lines: lines.map((line) => ({
      itemCode: line.item_code,
      unitPrice: line.unit_price,
      minQuantity: line.min_quantity,
      discountPercent: line.discount_percent,
    })),
  }
}

export async function listRateContracts(ctx: TenantContext, customerId?: string): Promise<ContractRow[]> {
  ctx.require('record.read')
  const { rows } = customerId
    ? await ctx.db.query<{ id: string }>(
        'select id from rate_contracts where tenant_id = $1 and customer_id = $2 order by priority desc, valid_from desc',
        [ctx.tenantId, customerId],
      )
    : await ctx.db.query<{ id: string }>(
        'select id from rate_contracts where tenant_id = $1 order by priority desc, valid_from desc',
        [ctx.tenantId],
      )
  const out: ContractRow[] = []
  for (const row of rows) out.push(await readRateContract(ctx, row.id))
  return out
}

export type ResolvedPrice = {
  itemCode: string
  unitPrice: string
  discountPercent: string
  /** Which contract set it, or null when nothing applied and the list price stands. */
  contractId: string | null
  contractReference: string | null
}

/**
 * The price for an item on a day, for a customer.
 *
 * Precedence is data, not query order: the highest `priority` among the
 * contracts in force wins, and within one contract the highest `min_quantity`
 * at or below the quantity being bought. Ties broken by the later start date,
 * because a contract signed more recently is the one both parties remember.
 */
export async function resolvePrice(
  ctx: TenantContext,
  input: { customerId: string; itemCode: string; quantity: string; on?: string; listPrice?: string },
): Promise<ResolvedPrice> {
  ctx.require('record.read')
  const on = input.on ?? ctx.now.toISOString().slice(0, 10)

  const { rows } = await ctx.db.query<{
    contract_id: string
    reference: string
    unit_price: string
    discount_percent: string
    min_quantity: string
  }>(
    `select c.id as contract_id, c.reference, l.unit_price::text, l.discount_percent::text, l.min_quantity::text
       from rate_contracts c
       join rate_contract_lines l on l.contract_id = c.id
       left join sales_customers cust on cust.id = $2
      where c.tenant_id = $1
        and c.status = 'active'
        and c.valid_from <= $4::date
        and (c.valid_to is null or c.valid_to >= $4::date)
        and (c.customer_id = $2 or (c.group_id is not null and c.group_id = cust.group_id))
        and lower(l.item_code) = lower($3)
      order by c.priority desc, l.min_quantity desc, c.valid_from desc`,
    [ctx.tenantId, input.customerId, input.itemCode, on],
  )

  const quantity = toMinor(input.quantity)
  const applicable = rows.find((row) => toMinor(row.min_quantity) <= quantity)
  if (!applicable) {
    return {
      itemCode: input.itemCode,
      unitPrice: input.listPrice ?? '0.0000',
      discountPercent: '0.000',
      contractId: null,
      contractReference: null,
    }
  }
  return {
    itemCode: input.itemCode,
    unitPrice: decimalText(applicable.unit_price) as string,
    discountPercent: decimalText(applicable.discount_percent) as string,
    contractId: applicable.contract_id,
    contractReference: applicable.reference,
  }
}
