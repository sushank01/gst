import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  computeTotals, toMinor, toDecimal, archiveTaxCategory, cancelDocument, createDocument,
  createTaxCategory, listTaxCategories, postDocument, readMatchPolicy, updateDocumentLines,
  recordPayment, runSubscriptionBilling, scheduleSubscriptionPeriods, writeMatchPolicy,
} from '../src/server/services/sales.ts'

async function shop() {
  const db = await freshDb()
  const c = clock()
  const userId = await seedUser(db, { email: 'a@example.com' })
  const tenant = await createTenantWithOwner(db, userId, { name: 'Acme' }, c.now(), 'r')
  const { token } = await createSession(db, { userId, tenantId: tenant.tenantId }, c.now())
  const ctx = await withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))

  const { rows } = await db.query<{ id: string }>(
    `insert into parties (tenant_id, kind, name) values ($1,'organisation','Globex') returning id`, [tenant.tenantId])
  const { rows: customer } = await db.query<{ id: string }>(
    `insert into sales_customers (tenant_id, party_id, currency) values ($1,$2,'USD') returning id`,
    [tenant.tenantId, rows[0].id])
  return { db, c, ctx, tenantId: tenant.tenantId, customerId: customer[0].id }
}

/* ------------------------------- money maths ------------------------------ */

test('decimal conversion is exact in both directions', () => {
  assert.equal(toDecimal(toMinor('0.1')), '0.1000')
  assert.equal(toDecimal(toMinor('19.9999')), '19.9999')
  assert.equal(toDecimal(toMinor('-5.25')), '-5.2500')
  assert.equal(toDecimal(toMinor('1000000')), '1000000.0000')
  assert.throws(() => toMinor('12.34.56'), /not a valid amount/)
  assert.throws(() => toMinor('abc'), /not a valid amount/)
})

test('0.1 + 0.2 is exactly 0.3 through the line calculator', () => {
  const totals = computeTotals([
    { description: 'a', quantity: '1', unitPrice: '0.1' },
    { description: 'b', quantity: '1', unitPrice: '0.2' },
  ])
  assert.equal(totals.grandTotal, '0.3000', 'a float would give 0.30000000000000004')
})

test('tax is computed per line on the discounted amount', () => {
  const totals = computeTotals([
    { description: 'Widget', quantity: '3', unitPrice: '100', discountPercent: '10', taxRatePercent: '18' },
  ])
  // 3 × 100 = 300; less 10% = 270; 18% of 270 = 48.60
  assert.equal(totals.subtotal, '300.0000')
  assert.equal(totals.discountTotal, '30.0000')
  assert.equal(totals.taxTotal, '48.6000')
  assert.equal(totals.grandTotal, '318.6000')
  assert.equal(totals.lines[0].lineTotal, '318.6000')
})

test('rounding is half-up and does not drift across many lines', () => {
  const lines = Array.from({ length: 100 }, () => ({
    description: 'x', quantity: '1', unitPrice: '0.015', taxRatePercent: '7.5',
  }))
  const totals = computeTotals(lines)
  assert.equal(totals.subtotal, '1.5000', '100 × 0.015')
  // 0.015 × 7.5% = 0.001125 → 0.0011 per line at 4dp, ×100 = 0.11
  assert.equal(totals.taxTotal, '0.1100')
  assert.equal(totals.grandTotal, '1.6100')
})

/* -------------------------------- documents ------------------------------- */

test('a document stores server-computed totals, never a client-supplied number', async () => {
  const { db, ctx, customerId } = await shop()
  const invoice = await createDocument(ctx, {
    kind: 'invoice', customerId, currency: 'usd',
    lines: [{ description: 'Consulting', quantity: '10', unitPrice: '150', taxRatePercent: '20' }],
  })
  assert.equal(invoice.grandTotal, '1800.0000')
  assert.equal(invoice.currency, 'USD', 'currency is normalised')

  const { rows } = await db.query<{ grand_total: string; tax_total: string }>(
    'select grand_total::text as grand_total, tax_total::text as tax_total from sales_documents where id = $1',
    [invoice.id])
  assert.equal(rows[0].grand_total, '1800.0000')
  assert.equal(rows[0].tax_total, '300.0000')
  await db.close()
})

test('references are sequential per kind and never collide', async () => {
  const { db, ctx, customerId } = await shop()
  const a = await createDocument(ctx, { kind: 'invoice', customerId, currency: 'USD', lines: [{ description: 'x', quantity: '1', unitPrice: '1' }] })
  const b = await createDocument(ctx, { kind: 'invoice', customerId, currency: 'USD', lines: [{ description: 'x', quantity: '1', unitPrice: '1' }] })
  const order = await createDocument(ctx, { kind: 'order', customerId, currency: 'USD', lines: [{ description: 'x', quantity: '1', unitPrice: '1' }] })
  assert.equal(a.reference, 'INV-0001')
  assert.equal(b.reference, 'INV-0002')
  assert.equal(order.reference, 'SO-0001', 'each kind has its own sequence')
  await db.close()
})

test('a document with no lines is refused', async () => {
  const { db, ctx, customerId } = await shop()
  await assert.rejects(
    () => createDocument(ctx, { kind: 'invoice', customerId, currency: 'USD', lines: [] }),
    (e: any) => e.code === 'empty_document',
  )
  await db.close()
})

test('posting is idempotent and makes the document immutable', async () => {
  const { db, ctx, customerId } = await shop()
  const invoice = await createDocument(ctx, {
    kind: 'invoice', customerId, currency: 'USD',
    lines: [{ description: 'x', quantity: '1', unitPrice: '100' }],
  })

  const first = await postDocument(ctx, invoice.id, invoice.version)

  /*
   * Posting again reports the ORIGINAL timestamp rather than failing. A
   * double-clicked Post button is not a conflict: the state the caller asked
   * for already holds. What must happen exactly once is the ledger effect, and
   * the audit count below is the proof of that — not an error the UI has to
   * decode. Whichever version is quoted, the answer is the same.
   */
  assert.deepEqual(await postDocument(ctx, invoice.id, invoice.version + 1), first)
  assert.deepEqual(await postDocument(ctx, invoice.id, invoice.version), first, 'even at a stale version')

  await assert.rejects(
    () => updateDocumentLines(ctx, invoice.id, invoice.version + 1, [{ description: 'y', quantity: '1', unitPrice: '5' }]),
    /posted and cannot be edited/,
  )

  const { rows } = await db.query<{ n: string }>("select count(*)::text as n from audit_events where action = 'sales.invoice_posted'")
  assert.equal(rows[0].n, '1', 'posted once, audited once')
  await db.close()
})

test('editing lines recomputes every total', async () => {
  const { db, ctx, customerId } = await shop()
  const invoice = await createDocument(ctx, {
    kind: 'invoice', customerId, currency: 'USD',
    lines: [{ description: 'x', quantity: '1', unitPrice: '100' }],
  })
  const updated = await updateDocumentLines(ctx, invoice.id, invoice.version, [
    { description: 'x', quantity: '2', unitPrice: '100', taxRatePercent: '10' },
    { description: 'y', quantity: '1', unitPrice: '50' },
  ])
  assert.equal(updated.grandTotal, '270.0000')
  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from sales_document_lines where document_id = $1', [invoice.id])
  assert.equal(rows[0].n, '2', 'lines were replaced, not appended')
  await db.close()
})

test('a stale edit is refused', async () => {
  const { db, ctx, customerId } = await shop()
  const invoice = await createDocument(ctx, { kind: 'invoice', customerId, currency: 'USD', lines: [{ description: 'x', quantity: '1', unitPrice: '1' }] })
  await updateDocumentLines(ctx, invoice.id, invoice.version, [{ description: 'y', quantity: '1', unitPrice: '2' }])
  await assert.rejects(
    () => updateDocumentLines(ctx, invoice.id, invoice.version, [{ description: 'z', quantity: '1', unitPrice: '3' }]),
    (e: any) => e.status === 409,
  )
  await db.close()
})

/* -------------------------------- payments -------------------------------- */

test('a payment allocates against an invoice and marks it paid', async () => {
  const { db, ctx, customerId } = await shop()
  const invoice = await createDocument(ctx, {
    kind: 'invoice', customerId, currency: 'USD',
    lines: [{ description: 'x', quantity: '1', unitPrice: '500' }],
  })
  await postDocument(ctx, invoice.id, invoice.version)

  await recordPayment(ctx, {
    customerId, amount: '500.0000', currency: 'USD', method: 'card', receivedOn: '2026-01-05',
    allocations: [{ documentId: invoice.id, amount: '500.0000' }],
  })
  const { rows } = await db.query<{ paid_total: string; status: string }>(
    'select paid_total::text as paid_total, status from sales_documents where id = $1', [invoice.id])
  assert.equal(rows[0].paid_total, '500.0000')
  assert.equal(rows[0].status, 'paid')
  await db.close()
})

test('REPLAY: a webhook delivered twice records one payment', async () => {
  const { db, ctx, customerId } = await shop()
  const invoice = await createDocument(ctx, { kind: 'invoice', customerId, currency: 'USD', lines: [{ description: 'x', quantity: '1', unitPrice: '100' }] })

  const first = await recordPayment(ctx, {
    customerId, amount: '100.0000', currency: 'USD', method: 'card', receivedOn: '2026-01-05',
    allocations: [{ documentId: invoice.id, amount: '100.0000' }], idempotencyKey: 'stripe_evt_1',
  })
  const replay = await recordPayment(ctx, {
    customerId, amount: '100.0000', currency: 'USD', method: 'card', receivedOn: '2026-01-05',
    allocations: [{ documentId: invoice.id, amount: '100.0000' }], idempotencyKey: 'stripe_evt_1',
  })
  assert.equal(replay.duplicate, true)
  assert.equal(replay.paymentId, first.paymentId)

  const { rows } = await db.query<{ paid_total: string }>('select paid_total::text as paid_total from sales_documents where id = $1', [invoice.id])
  assert.equal(rows[0].paid_total, '100.0000', 'allocated once, not twice')
  await db.close()
})

test('an invoice cannot be over-paid', async () => {
  const { db, ctx, customerId } = await shop()
  const invoice = await createDocument(ctx, { kind: 'invoice', customerId, currency: 'USD', lines: [{ description: 'x', quantity: '1', unitPrice: '100' }] })
  await assert.rejects(
    () => recordPayment(ctx, {
      customerId, amount: '500.0000', currency: 'USD', method: 'card', receivedOn: '2026-01-05',
      allocations: [{ documentId: invoice.id, amount: '500.0000' }],
    }),
    (e: any) => e.code === 'over_payment',
  )
  await db.close()
})

test('allocations cannot exceed the payment', async () => {
  const { db, ctx, customerId } = await shop()
  const invoice = await createDocument(ctx, { kind: 'invoice', customerId, currency: 'USD', lines: [{ description: 'x', quantity: '1', unitPrice: '100' }] })
  await assert.rejects(
    () => recordPayment(ctx, {
      customerId, amount: '50.0000', currency: 'USD', method: 'card', receivedOn: '2026-01-05',
      allocations: [{ documentId: invoice.id, amount: '100.0000' }],
    }),
    (e: any) => e.code === 'over_allocated',
  )
  await db.close()
})

/* ----------------------------- subscriptions ------------------------------ */

async function activeSubscription(ctx: any, customerId: string, db: any) {
  const subscription = await createDocument(ctx, {
    kind: 'subscription', customerId, currency: 'USD', status: 'active',
    lines: [{ description: 'Monthly plan', quantity: '1', unitPrice: '99', taxRatePercent: '20' }],
  })
  await db.query("update sales_documents set status = 'active' where id = $1", [subscription.id])
  return subscription
}

test('THE BUG: repeated sweeps bill each period exactly once', async () => {
  const { db, ctx, customerId } = await shop()
  const subscription = await activeSubscription(ctx, customerId, db)
  await scheduleSubscriptionPeriods(ctx, subscription.id, new Date('2026-01-01T00:00:00Z'), 3, 30)

  const first = await runSubscriptionBilling(ctx, new Date('2026-01-15T00:00:00Z'))
  assert.equal(first.invoiced, 1, 'only the period that has started is billed')

  // The prototype raised a fresh invoice on every click. Ten clicks here.
  for (let i = 0; i < 10; i += 1) {
    const again = await runSubscriptionBilling(ctx, new Date('2026-01-15T00:00:00Z'))
    assert.equal(again.invoiced, 0, `sweep ${i + 2} must bill nothing new`)
  }

  const { rows } = await db.query<{ n: string }>("select count(*)::text as n from sales_documents where kind = 'invoice'")
  assert.equal(rows[0].n, '1', 'one invoice after eleven sweeps')
  await db.close()
})

test('later periods bill as they fall due, each exactly once', async () => {
  const { db, ctx, customerId } = await shop()
  const subscription = await activeSubscription(ctx, customerId, db)
  await scheduleSubscriptionPeriods(ctx, subscription.id, new Date('2026-01-01T00:00:00Z'), 3, 30)

  await runSubscriptionBilling(ctx, new Date('2026-01-15T00:00:00Z'))
  await runSubscriptionBilling(ctx, new Date('2026-02-15T00:00:00Z'))
  await runSubscriptionBilling(ctx, new Date('2026-03-15T00:00:00Z'))
  await runSubscriptionBilling(ctx, new Date('2026-03-15T00:00:00Z'))

  const { rows } = await db.query<{ n: string }>("select count(*)::text as n from sales_documents where kind = 'invoice'")
  assert.equal(rows[0].n, '3', 'three periods, three invoices')
  const periods = await db.query<{ status: string }>('select status from subscription_periods order by period_start')
  assert.deepEqual(periods.rows.map((r) => r.status), ['invoiced', 'invoiced', 'invoiced'])
  await db.close()
})

test('CONCURRENCY: two dispatchers sweeping at once still bill once', async () => {
  const { db, ctx, customerId } = await shop()
  const subscription = await activeSubscription(ctx, customerId, db)
  await scheduleSubscriptionPeriods(ctx, subscription.id, new Date('2026-01-01T00:00:00Z'), 1, 30)

  await Promise.all([
    runSubscriptionBilling(ctx, new Date('2026-01-15T00:00:00Z')),
    runSubscriptionBilling(ctx, new Date('2026-01-15T00:00:00Z')),
  ])
  const { rows } = await db.query<{ n: string }>("select count(*)::text as n from sales_documents where kind = 'invoice'")
  assert.equal(rows[0].n, '1', 'the period is claimed by exactly one sweep')
  await db.close()
})

test('the generated invoice carries the subscription lines and correct tax', async () => {
  const { db, ctx, customerId } = await shop()
  const subscription = await activeSubscription(ctx, customerId, db)
  await scheduleSubscriptionPeriods(ctx, subscription.id, new Date('2026-01-01T00:00:00Z'), 1, 30)
  await runSubscriptionBilling(ctx, new Date('2026-01-15T00:00:00Z'))

  const { rows } = await db.query<{ grand_total: string; source_document_id: string }>(
    "select grand_total::text as grand_total, source_document_id from sales_documents where kind = 'invoice'")
  assert.equal(rows[0].grand_total, '118.8000', '99 + 20% tax')
  assert.equal(rows[0].source_document_id, subscription.id, 'the invoice points back at its subscription')
  await db.close()
})

test('a cancelled subscription stops billing', async () => {
  const { db, ctx, customerId } = await shop()
  const subscription = await activeSubscription(ctx, customerId, db)
  await scheduleSubscriptionPeriods(ctx, subscription.id, new Date('2026-01-01T00:00:00Z'), 2, 30)
  await db.query("update sales_documents set cancelled_at = now() where id = $1", [subscription.id])

  const summary = await runSubscriptionBilling(ctx, new Date('2026-03-15T00:00:00Z'))
  assert.equal(summary.invoiced, 0)
  await db.close()
})

test('ISOLATION: a sweep only bills its own tenant', async () => {
  const a = await shop()
  const b = await shop()
  const subA = await activeSubscription(a.ctx, a.customerId, a.db)
  await scheduleSubscriptionPeriods(a.ctx, subA.id, new Date('2026-01-01T00:00:00Z'), 1, 30)

  const summary = await runSubscriptionBilling(b.ctx, new Date('2026-02-01T00:00:00Z'))
  assert.equal(summary.invoiced, 0, "another tenant's subscriptions are invisible")
  await a.db.close()
  await b.db.close()
})

/* ------------------------------- cancelling ------------------------------- */

test('cancelling marks the document; the number never disappears', async () => {
  const { db, ctx, customerId } = await shop()
  const draft = await createDocument(ctx, {
    kind: 'order',
    customerId,
    currency: 'USD',
    lines: [{ description: 'Widget', quantity: '1', unitPrice: '50' }],
  })

  const cancelled = await cancelDocument(ctx, draft.id, draft.version)
  assert.ok(cancelled.cancelledAt)

  const { rows } = await db.query<{ status: string; reference: string; cancelled_at: Date | null }>(
    'select status, reference, cancelled_at from sales_documents where id = $1',
    [draft.id],
  )
  // The row survives: a gap in a numbered sequence is something somebody has
  // to account for later, and "it was deleted" is not an account of it.
  assert.equal(rows[0].reference, draft.reference)
  assert.equal(rows[0].status, 'cancelled')
  assert.ok(rows[0].cancelled_at)
  await db.close()
})

test('cancelling twice is not an error, and a posted document is refused', async () => {
  const { db, ctx, customerId } = await shop()
  const draft = await createDocument(ctx, {
    kind: 'invoice',
    customerId,
    currency: 'USD',
    lines: [{ description: 'Widget', quantity: '1', unitPrice: '50' }],
  })
  const first = await cancelDocument(ctx, draft.id, draft.version)
  // The state the caller asked for already holds, so a retried request is not
  // a conflict — the same timestamp comes back.
  const again = await cancelDocument(ctx, draft.id, draft.version)
  assert.equal(again.cancelledAt, first.cancelledAt)

  const posted = await createDocument(ctx, {
    kind: 'invoice',
    customerId,
    currency: 'USD',
    lines: [{ description: 'Widget', quantity: '1', unitPrice: '50' }],
  })
  await postDocument(ctx, posted.id, posted.version)
  await assert.rejects(() => cancelDocument(ctx, posted.id, posted.version + 1), /credit note/i)
  await db.close()
})

test('a stale cancel is a conflict, not a silent erasure', async () => {
  const { db, ctx, customerId } = await shop()
  const draft = await createDocument(ctx, {
    kind: 'quotation',
    customerId,
    currency: 'USD',
    lines: [{ description: 'Widget', quantity: '1', unitPrice: '50' }],
  })
  await updateDocumentLines(ctx, draft.id, draft.version, [{ description: 'Widget', quantity: '2', unitPrice: '50' }])
  await assert.rejects(() => cancelDocument(ctx, draft.id, draft.version), /Someone else changed/)
  await db.close()
})

/* ----------------------------- tax categories ----------------------------- */

test('a tax slab is archived, never deleted, because posted lines point at it', async () => {
  const { db, ctx } = await shop()
  const slab = await createTaxCategory(ctx, { name: 'GST 18%', ratePercent: '18' })
  assert.equal(slab.ratePercent, '18.000')
  await assert.rejects(() => createTaxCategory(ctx, { name: 'gst 18%', ratePercent: '18' }), /already a category/)

  await archiveTaxCategory(ctx, slab.id)
  assert.deepEqual(await listTaxCategories(ctx), [])

  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from tax_categories where id = $1', [slab.id])
  assert.equal(rows[0].n, '1', 'an invoice that cannot say which slab taxed it is not evidence of much')
  // The name is free again once archived, which is what the partial index is for.
  const remade = await createTaxCategory(ctx, { name: 'GST 18%', ratePercent: '18' })
  assert.notEqual(remade.id, slab.id)
  await db.close()
})

/* ------------------------------ match policy ------------------------------ */

test('with no policy saved, nothing is enforced and nothing claims to be', async () => {
  const { db, ctx, customerId } = await shop()
  const policy = await readMatchPolicy(ctx)
  // Null says plainly that these are defaults on display rather than a rule
  // somebody chose — the screen has to be able to tell the difference.
  assert.equal(policy.updatedAt, null)

  const invoice = await createDocument(ctx, {
    kind: 'invoice',
    customerId,
    currency: 'USD',
    lines: [{ description: 'Widget', quantity: '1', unitPrice: '100' }],
  })
  const posted = await postDocument(ctx, invoice.id, invoice.version)
  assert.ok(posted.postedAt, 'an unsaved policy must not start refusing posts')
  await db.close()
})

test('require-an-order refuses an invoice that answers no order', async () => {
  const { db, ctx, customerId } = await shop()
  await writeMatchPolicy(ctx, {
    priceTolerancePercent: '5',
    priceAction: 'warn',
    quantityTolerancePercent: '2',
    quantityAction: 'warn',
    requireOrder: true,
    requireDelivery: false,
    updatedAt: null,
  })

  const loose = await createDocument(ctx, {
    kind: 'invoice',
    customerId,
    currency: 'USD',
    lines: [{ description: 'Widget', quantity: '1', unitPrice: '100' }],
  })
  await assert.rejects(() => postDocument(ctx, loose.id, loose.version), /not linked to a sales order/)

  const order = await createDocument(ctx, {
    kind: 'order',
    customerId,
    currency: 'USD',
    lines: [{ description: 'Widget', quantity: '1', unitPrice: '100' }],
  })
  const billed = await createDocument(ctx, {
    kind: 'invoice',
    customerId,
    sourceDocumentId: order.id,
    currency: 'USD',
    lines: [{ description: 'Widget', quantity: '1', unitPrice: '100' }],
  })
  assert.ok((await postDocument(ctx, billed.id, billed.version)).postedAt)
  await db.close()
})

test('a price beyond tolerance blocks the post only when the action says block', async () => {
  const { db, ctx, customerId } = await shop()
  const order = await createDocument(ctx, {
    kind: 'order',
    customerId,
    currency: 'USD',
    lines: [{ description: 'Widget', quantity: '1', unitPrice: '100' }],
  })
  const overbilled = () =>
    createDocument(ctx, {
      kind: 'invoice',
      customerId,
      sourceDocumentId: order.id,
      currency: 'USD',
      lines: [{ description: 'Widget', quantity: '1', unitPrice: '120' }],
    })

  const policy = await writeMatchPolicy(ctx, {
    priceTolerancePercent: '5',
    priceAction: 'warn',
    quantityTolerancePercent: '2',
    quantityAction: 'warn',
    requireOrder: false,
    requireDelivery: false,
    updatedAt: null,
  })
  const warned = await overbilled()
  // "Warn" means exactly that: flagged in the audit trail, allowed through.
  assert.ok((await postDocument(ctx, warned.id, warned.version)).postedAt)

  await writeMatchPolicy(ctx, {
    priceTolerancePercent: '5',
    priceAction: 'block',
    quantityTolerancePercent: '2',
    quantityAction: 'warn',
    requireOrder: false,
    requireDelivery: false,
    updatedAt: policy.updatedAt,
  })
  const blocked = await overbilled()
  await assert.rejects(() => postDocument(ctx, blocked.id, blocked.version), /more than the 5(\.0+)?% allowed/)

  const within = await createDocument(ctx, {
    kind: 'invoice',
    customerId,
    sourceDocumentId: order.id,
    currency: 'USD',
    lines: [{ description: 'Widget', quantity: '1', unitPrice: '104' }],
  })
  assert.ok((await postDocument(ctx, within.id, within.version)).postedAt, '4% drift is inside a 5% tolerance')
  await db.close()
})

test('a stale match-policy save is a conflict', async () => {
  const { db, ctx } = await shop()
  const body = {
    priceTolerancePercent: '5',
    priceAction: 'warn' as const,
    quantityTolerancePercent: '2',
    quantityAction: 'warn' as const,
    requireOrder: false,
    requireDelivery: false,
  }
  const read = await readMatchPolicy(ctx)
  await writeMatchPolicy(ctx, { ...body, updatedAt: read.updatedAt })
  await assert.rejects(() => writeMatchPolicy(ctx, { ...body, updatedAt: read.updatedAt }), /Someone else/)
  await db.close()
})

/* --------------------------- subscription periods ------------------------- */

test('only a subscription can be given billing periods, and only in this workspace', async () => {
  const { db, ctx, customerId } = await shop()
  const invoice = await createDocument(ctx, {
    kind: 'invoice',
    customerId,
    currency: 'USD',
    lines: [{ description: 'Widget', quantity: '1', unitPrice: '10' }],
  })
  await assert.rejects(() => scheduleSubscriptionPeriods(ctx, invoice.id, new Date(), 1), /Only a subscription/)
  // A missing id reads as "no such subscription" rather than as a foreign-key
  // failure, which is what an id from another workspace would otherwise be.
  await assert.rejects(
    () => scheduleSubscriptionPeriods(ctx, '00000000-0000-0000-0000-000000000000', new Date(), 1),
    /That subscription/,
  )
  await db.close()
})
