import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  agingReport, createCustomer, listCustomers, orderToCash, readCustomer, topDebtors, updateCustomer,
} from '../src/server/services/customers.ts'
import { createDocument, postDocument, recordPayment } from '../src/server/services/sales.ts'
import { createLead } from '../src/server/services/crm.ts'

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
  return { db, c, ctx: await ctxFor(owner, acme.tenantId), rivalCtx: await ctxFor(other, rival.tenantId) }
}

const day = (ctx: { now: Date }, offset: number) => new Date(ctx.now.getTime() + offset * 86_400_000).toISOString().slice(0, 10)

test('a customer is a party, so renaming it renames the CRM account too', async () => {
  const { db, ctx } = await shop()
  const customer = await createCustomer(ctx, { name: 'Nimbus Industries', currency: 'INR', code: 'NIM' })
  assert.equal(customer.name, 'Nimbus Industries')

  const renamed = await updateCustomer(ctx, customer.id, { version: customer.version, name: 'Nimbus Group' })
  assert.equal(renamed.name, 'Nimbus Group')

  const { rows } = await db.query<{ name: string }>('select name from parties where id = $1', [customer.partyId])
  assert.equal(rows[0].name, 'Nimbus Group', 'one record, not a name copied onto every document')
  await db.close()
})

test('an existing CRM account can become a customer, once', async () => {
  const { db, ctx } = await shop()
  const lead = await createLead(ctx, { name: 'Ada Lovelace', email: 'ada@nimbus.test', company: 'Nimbus Industries' })
  assert.ok(lead.id)

  const { rows } = await db.query<{ id: string }>(
    "select id from parties where tenant_id = $1 and kind = 'organisation'",
    [ctx.tenantId],
  )
  const customer = await createCustomer(ctx, { name: 'Nimbus Industries', currency: 'INR', partyId: rows[0].id })
  assert.equal(customer.partyId, rows[0].id)

  await assert.rejects(
    () => createCustomer(ctx, { name: 'Nimbus again', currency: 'INR', partyId: rows[0].id }),
    /already a customer/i,
  )
  await db.close()
})

test('a duplicate customer code is refused, and search agrees with the count', async () => {
  const { db, ctx } = await shop()
  await createCustomer(ctx, { name: 'Nimbus', currency: 'INR', code: 'NIM' })
  await assert.rejects(() => createCustomer(ctx, { name: 'Other', currency: 'INR', code: 'nim' }), /already in use/i)

  await createCustomer(ctx, { name: 'Contoso', currency: 'INR', code: 'CON' })
  const all = await listCustomers(ctx, {})
  assert.equal(all.total, 2)
  assert.equal(all.rows.length, 2)

  const found = await listCustomers(ctx, { q: 'nimb' })
  assert.equal(found.total, 1)
  assert.equal(found.rows[0].code, 'NIM')
  await db.close()
})

/** An invoice for `amount`, posted, due `dueInDays` from the frozen clock. */
async function invoice(ctx: Awaited<ReturnType<typeof shop>>['ctx'], customerId: string, amount: string, dueInDays: number) {
  const document = await createDocument(ctx, {
    kind: 'invoice',
    customerId,
    currency: 'INR',
    dueOn: day(ctx, dueInDays),
    lines: [{ description: 'Services', quantity: '1', unitPrice: amount }],
  })
  await postDocument(ctx, document.id, document.version)
  return document
}

test('aging buckets by how late each invoice is, and does not guess a due date', async () => {
  const { db, ctx } = await shop()
  const customer = await createCustomer(ctx, { name: 'Nimbus', currency: 'INR' })

  await invoice(ctx, customer.id, '1000', 10) // not yet due
  await invoice(ctx, customer.id, '2000', -5) // 5 days late
  await invoice(ctx, customer.id, '3000', -45) // 45 days late
  await invoice(ctx, customer.id, '4000', -120) // 120 days late

  // No due date at all: it must not be aged as if it were current.
  const undated = await createDocument(ctx, {
    kind: 'invoice',
    customerId: customer.id,
    currency: 'INR',
    lines: [{ description: 'No terms', quantity: '1', unitPrice: '500' }],
  })
  await postDocument(ctx, undated.id, undated.version)

  const aging = await agingReport(ctx, ctx.now)
  const bucket = (label: string) => aging.buckets.find((entry) => entry.label === label)!
  assert.equal(bucket('Current').amount, '1000.0000')
  assert.equal(bucket('1–30').amount, '2000.0000')
  assert.equal(bucket('31–60').amount, '3000.0000')
  assert.equal(bucket('90+').amount, '4000.0000')
  assert.equal(bucket('Not due').amount, '500.0000', 'an invoice with no terms is not overdue')
  assert.equal(aging.total, '10500.0000')
  await db.close()
})

test('a paid invoice leaves the aging report', async () => {
  const { db, ctx } = await shop()
  const customer = await createCustomer(ctx, { name: 'Nimbus', currency: 'INR' })
  const document = await invoice(ctx, customer.id, '1000', -10)
  assert.equal((await agingReport(ctx, ctx.now)).total, '1000.0000')

  await recordPayment(ctx, {
    customerId: customer.id,
    amount: '1000.0000',
    currency: 'INR',
    method: 'bank',
    receivedOn: day(ctx, 0),
    allocations: [{ documentId: document.id, amount: '1000.0000' }],
  })
  assert.equal((await agingReport(ctx, ctx.now)).total, '0.0000', 'derived from the documents, not a stored balance')
  await db.close()
})

test('a partly paid invoice ages only what is still owed', async () => {
  const { db, ctx } = await shop()
  const customer = await createCustomer(ctx, { name: 'Nimbus', currency: 'INR' })
  const document = await invoice(ctx, customer.id, '1000', -10)
  await recordPayment(ctx, {
    customerId: customer.id,
    amount: '400.0000',
    currency: 'INR',
    method: 'bank',
    receivedOn: day(ctx, 0),
    allocations: [{ documentId: document.id, amount: '400.0000' }],
  })
  assert.equal((await agingReport(ctx, ctx.now)).total, '600.0000')
  await db.close()
})

test('top debtors separates what is owed from what is late', async () => {
  const { db, ctx } = await shop()
  const big = await createCustomer(ctx, { name: 'Big Co', currency: 'INR' })
  const small = await createCustomer(ctx, { name: 'Small Co', currency: 'INR' })

  await invoice(ctx, big.id, '5000', 30) // owed, not late
  await invoice(ctx, big.id, '3000', -20) // late
  await invoice(ctx, small.id, '1000', -60) // late

  const debtors = await topDebtors(ctx, 5)
  assert.equal(debtors.length, 2)
  assert.equal(debtors[0].name, 'Big Co')
  assert.equal(debtors[0].outstanding, '8000.0000')
  assert.equal(debtors[0].overdue, '3000.0000', 'owed and late are different numbers')
  assert.equal(debtors[1].overdue, '1000.0000')
  await db.close()
})

test('the order-to-cash funnel counts only posted documents', async () => {
  const { db, ctx } = await shop()
  const customer = await createCustomer(ctx, { name: 'Nimbus', currency: 'INR' })

  const quote = await createDocument(ctx, {
    kind: 'quotation',
    customerId: customer.id,
    currency: 'INR',
    lines: [{ description: 'Proposal', quantity: '1', unitPrice: '9000' }],
  })
  await postDocument(ctx, quote.id, quote.version)

  // Left as a draft: not a quotation anybody received.
  await createDocument(ctx, {
    kind: 'quotation',
    customerId: customer.id,
    currency: 'INR',
    lines: [{ description: 'Draft', quantity: '1', unitPrice: '50000' }],
  })

  const billed = await invoice(ctx, customer.id, '4000', 10)
  await recordPayment(ctx, {
    customerId: customer.id,
    amount: '1500.0000',
    currency: 'INR',
    method: 'bank',
    receivedOn: day(ctx, 0),
    allocations: [{ documentId: billed.id, amount: '1500.0000' }],
  })

  const funnel = await orderToCash(ctx, day(ctx, -30), day(ctx, 1))
  assert.equal(funnel.quoted, '9000.0000', 'the draft is excluded')
  assert.equal(funnel.invoiced, '4000.0000')
  assert.equal(funnel.collected, '1500.0000')
  assert.equal(funnel.ordered, '0')
  await db.close()
})

test('ISOLATION: customers and receivables never cross workspaces', async () => {
  const { db, ctx, rivalCtx } = await shop()
  const customer = await createCustomer(ctx, { name: 'Nimbus', currency: 'INR' })
  await invoice(ctx, customer.id, '1000', -10)

  await assert.rejects(() => readCustomer(rivalCtx, customer.id), /That customer/)
  await assert.rejects(
    () => updateCustomer(rivalCtx, customer.id, { version: customer.version, name: 'Stolen' }),
    /That customer/,
  )
  assert.equal((await listCustomers(rivalCtx, {})).total, 0)
  assert.equal((await agingReport(rivalCtx, rivalCtx.now)).total, '0.0000')
  assert.deepEqual(await topDebtors(rivalCtx), [])
  await db.close()
})
