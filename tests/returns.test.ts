import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import { createCustomer } from '../src/server/services/customers.ts'
import { createDocument, postDocument } from '../src/server/services/sales.ts'
import {
  createRateContract, createReturn, listRateContracts, netOutstanding, resolvePrice, returnableLines,
} from '../src/server/services/returns.ts'

async function shop() {
  const db = await freshDb()
  const c = clock()
  const owner = await seedUser(db, { email: 'owner@example.com', fullName: 'Owner' })
  const other = await seedUser(db, { email: 'rival@example.com', fullName: 'Rival' })
  const acme = await createTenantWithOwner(db, owner, { name: 'Acme' }, c.now(), 'r1')
  const rival = await createTenantWithOwner(db, other, { name: 'Rival' }, c.now(), 'r2')
  const ctxFor = async (userId: string, tenantId: string) => {
    const { token } = await createSession(db, { userId, tenantId }, c.now())
    return withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))
  }
  const ctx = await ctxFor(owner, acme.tenantId)
  const customer = await createCustomer(ctx, { name: 'Nimbus', currency: 'INR' })
  return { db, c, ctx, customer, rivalCtx: await ctxFor(other, rival.tenantId) }
}

/** A posted invoice: 10 widgets at 100, 2 cases at 500. */
async function postedInvoice(ctx: Awaited<ReturnType<typeof shop>>['ctx'], customerId: string) {
  const document = await createDocument(ctx, {
    kind: 'invoice',
    customerId,
    currency: 'INR',
    lines: [
      { itemCode: 'WID', description: 'Widget', quantity: '10', unitPrice: '100.0000' },
      { itemCode: 'CASE', description: 'Case', quantity: '2', unitPrice: '500.0000' },
    ],
  })
  await postDocument(ctx, document.id, document.version)
  return document
}

test('a return is priced at what was charged, not at today s price', async () => {
  const { db, ctx, customer } = await shop()
  const invoice = await postedInvoice(ctx, customer.id)
  const lines = await returnableLines(ctx, invoice.id)

  const credit = await createReturn(ctx, {
    invoiceId: invoice.id,
    reason: 'damaged in transit',
    lines: [{ sourceLineId: lines[0].lineId, quantity: '3' }],
  })
  assert.equal(credit.kind, 'credit_note')
  assert.equal(credit.status, 'posted', 'a draft credit note is money not yet given back')
  assert.equal(credit.grandTotal, '300.0000', '3 at the invoiced 100, whatever the list price is now')
  await db.close()
})

test('OVER-RETURN: more cannot come back than went out, across several returns', async () => {
  const { db, ctx, customer } = await shop()
  const invoice = await postedInvoice(ctx, customer.id)
  const lines = await returnableLines(ctx, invoice.id)
  assert.equal(lines[0].billed, '10.0000')
  assert.equal(lines[0].returnable, '10.0000')

  await createReturn(ctx, { invoiceId: invoice.id, reason: 'first', lines: [{ sourceLineId: lines[0].lineId, quantity: '6' }] })
  const after = await returnableLines(ctx, invoice.id)
  assert.equal(after[0].returned, '6.0000')
  assert.equal(after[0].returnable, '4.0000')

  // Each of these looks reasonable on its own; together they exceed the sale.
  await assert.rejects(
    () => createReturn(ctx, { invoiceId: invoice.id, reason: 'second', lines: [{ sourceLineId: lines[0].lineId, quantity: '5' }] }),
    /would exceed that/,
  )

  const rest = await createReturn(ctx, {
    invoiceId: invoice.id,
    reason: 'second',
    lines: [{ sourceLineId: lines[0].lineId, quantity: '4' }],
  })
  assert.equal(rest.grandTotal, '400.0000')
  assert.equal((await returnableLines(ctx, invoice.id))[0].returnable, '0.0000')
  await db.close()
})

test('the invoice is not edited; the credit note stands beside it', async () => {
  const { db, ctx, customer } = await shop()
  const invoice = await postedInvoice(ctx, customer.id)
  const lines = await returnableLines(ctx, invoice.id)
  await createReturn(ctx, { invoiceId: invoice.id, reason: 'x', lines: [{ sourceLineId: lines[0].lineId, quantity: '2' }] })

  const { rows } = await db.query<{ grand_total: string }>(
    'select grand_total::text as grand_total from sales_documents where id = $1',
    [invoice.id],
  )
  assert.equal(rows[0].grand_total, '2000.0000', 'posted evidence stays as it was')

  // But what the customer owes reflects the credit.
  const net = await netOutstanding(ctx, customer.id)
  assert.equal(net.amount, '1800.0000', 'reading the invoice alone overstates the debt of anybody who returned anything')
  await db.close()
})

test('an unposted or non-invoice document cannot be returned against', async () => {
  const { db, ctx, customer } = await shop()
  const draft = await createDocument(ctx, {
    kind: 'invoice',
    customerId: customer.id,
    currency: 'INR',
    lines: [{ description: 'x', quantity: '1', unitPrice: '10' }],
  })
  const drafted = await returnableLines(ctx, draft.id)
  await assert.rejects(
    () => createReturn(ctx, { invoiceId: draft.id, reason: 'x', lines: [{ sourceLineId: drafted[0].lineId, quantity: '1' }] }),
    /has not been posted/i,
  )

  const quote = await createDocument(ctx, {
    kind: 'quotation',
    customerId: customer.id,
    currency: 'INR',
    lines: [{ description: 'x', quantity: '1', unitPrice: '10' }],
  })
  await postDocument(ctx, quote.id, quote.version)
  const quoted = await returnableLines(ctx, quote.id)
  await assert.rejects(
    () => createReturn(ctx, { invoiceId: quote.id, reason: 'x', lines: [{ sourceLineId: quoted[0].lineId, quantity: '1' }] }),
    /raised against an invoice/i,
  )
  await db.close()
})

test('an empty return, or one with a line from another invoice, is refused', async () => {
  const { db, ctx, customer } = await shop()
  const invoice = await postedInvoice(ctx, customer.id)
  const other = await postedInvoice(ctx, customer.id)
  const otherLines = await returnableLines(ctx, other.id)

  await assert.rejects(() => createReturn(ctx, { invoiceId: invoice.id, reason: 'x', lines: [] }), /which lines/i)
  await assert.rejects(
    () => createReturn(ctx, { invoiceId: invoice.id, reason: 'x', lines: [{ sourceLineId: otherLines[0].lineId, quantity: '1' }] }),
    /That invoice line/,
  )
  await db.close()
})

/* ----------------------------- rate contracts ----------------------------- */

test('a contract must have a scope and at least one price', async () => {
  const { db, ctx, customer } = await shop()
  await assert.rejects(
    () => createRateContract(ctx, { reference: 'RC-1', currency: 'INR', validFrom: '2026-01-01', lines: [{ itemCode: 'WID', unitPrice: '90' }] }),
    /applies to a customer or a customer group/i,
  )
  await assert.rejects(
    () => createRateContract(ctx, { reference: 'RC-1', currency: 'INR', validFrom: '2026-01-01', customerId: customer.id, lines: [] }),
    /no prices sets no prices/i,
  )
  await assert.rejects(
    () =>
      createRateContract(ctx, {
        reference: 'RC-1',
        currency: 'INR',
        validFrom: '2026-06-01',
        validTo: '2026-01-01',
        customerId: customer.id,
        lines: [{ itemCode: 'WID', unitPrice: '90' }],
      }),
    /ends before it starts/i,
  )
  await db.close()
})

test('price resolution honours the contract in force on the day', async () => {
  const { db, ctx, customer } = await shop()
  await createRateContract(ctx, {
    reference: 'RC-2026',
    currency: 'INR',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    customerId: customer.id,
    lines: [{ itemCode: 'WID', unitPrice: '90.0000' }],
  })

  const inForce = await resolvePrice(ctx, { customerId: customer.id, itemCode: 'WID', quantity: '1', on: '2026-06-01' })
  assert.equal(inForce.unitPrice, '90.0000')
  assert.equal(inForce.contractReference, 'RC-2026')

  // Before it starts and after it ends, the list price stands.
  const before = await resolvePrice(ctx, { customerId: customer.id, itemCode: 'WID', quantity: '1', on: '2025-12-31', listPrice: '100.0000' })
  assert.equal(before.unitPrice, '100.0000')
  assert.equal(before.contractId, null)
  const after = await resolvePrice(ctx, { customerId: customer.id, itemCode: 'WID', quantity: '1', on: '2027-01-01', listPrice: '100.0000' })
  assert.equal(after.contractId, null)
  await db.close()
})

test('the highest priority wins, so precedence is data and not query order', async () => {
  const { db, ctx, customer } = await shop()
  await createRateContract(ctx, {
    reference: 'RC-STANDARD',
    currency: 'INR',
    validFrom: '2026-01-01',
    customerId: customer.id,
    priority: 0,
    lines: [{ itemCode: 'WID', unitPrice: '95.0000' }],
  })
  await createRateContract(ctx, {
    reference: 'RC-NEGOTIATED',
    currency: 'INR',
    validFrom: '2026-01-01',
    customerId: customer.id,
    priority: 10,
    lines: [{ itemCode: 'WID', unitPrice: '80.0000' }],
  })

  const resolved = await resolvePrice(ctx, { customerId: customer.id, itemCode: 'WID', quantity: '1', on: '2026-06-01' })
  assert.equal(resolved.contractReference, 'RC-NEGOTIATED')
  assert.equal(resolved.unitPrice, '80.0000')
  await db.close()
})

test('a volume break applies only at or above its quantity', async () => {
  const { db, ctx, customer } = await shop()
  await createRateContract(ctx, {
    reference: 'RC-VOLUME',
    currency: 'INR',
    validFrom: '2026-01-01',
    customerId: customer.id,
    lines: [
      { itemCode: 'WID', unitPrice: '95.0000', minQuantity: '0' },
      { itemCode: 'WID', unitPrice: '85.0000', minQuantity: '50' },
      { itemCode: 'WID', unitPrice: '75.0000', minQuantity: '500' },
    ],
  })

  const at = (quantity: string) => resolvePrice(ctx, { customerId: customer.id, itemCode: 'WID', quantity, on: '2026-06-01' })
  assert.equal((await at('1')).unitPrice, '95.0000')
  assert.equal((await at('49')).unitPrice, '95.0000')
  assert.equal((await at('50')).unitPrice, '85.0000', 'at the break, not above it')
  assert.equal((await at('499')).unitPrice, '85.0000')
  assert.equal((await at('1000')).unitPrice, '75.0000')
  await db.close()
})

test('a group contract covers every customer in the group', async () => {
  const { db, ctx } = await shop()
  const { rows } = await db.query<{ id: string }>(
    "insert into customer_groups (tenant_id, name) values ($1, 'Wholesale') returning id",
    [ctx.tenantId],
  )
  const member = await createCustomer(ctx, { name: 'Wholesale Co', currency: 'INR', groupId: rows[0].id })
  const outsider = await createCustomer(ctx, { name: 'Retail Co', currency: 'INR' })

  await createRateContract(ctx, {
    reference: 'RC-WHOLESALE',
    currency: 'INR',
    validFrom: '2026-01-01',
    groupId: rows[0].id,
    lines: [{ itemCode: 'WID', unitPrice: '70.0000' }],
  })

  assert.equal((await resolvePrice(ctx, { customerId: member.id, itemCode: 'WID', quantity: '1', on: '2026-06-01' })).unitPrice, '70.0000')
  const retail = await resolvePrice(ctx, { customerId: outsider.id, itemCode: 'WID', quantity: '1', on: '2026-06-01', listPrice: '100.0000' })
  assert.equal(retail.contractId, null, 'a group price is not everybody s price')
  await db.close()
})

test('ISOLATION: returns and contracts never cross workspaces', async () => {
  const { db, ctx, rivalCtx, customer } = await shop()
  const invoice = await postedInvoice(ctx, customer.id)
  const lines = await returnableLines(ctx, invoice.id)
  await createRateContract(ctx, {
    reference: 'RC-1',
    currency: 'INR',
    validFrom: '2026-01-01',
    customerId: customer.id,
    lines: [{ itemCode: 'WID', unitPrice: '90' }],
  })

  await assert.rejects(() => returnableLines(rivalCtx, invoice.id), /That invoice/)
  await assert.rejects(
    () => createReturn(rivalCtx, { invoiceId: invoice.id, reason: 'x', lines: [{ sourceLineId: lines[0].lineId, quantity: '1' }] }),
    /That invoice/,
  )
  assert.deepEqual(await listRateContracts(rivalCtx), [])
  await db.close()
})
