import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  agingReport, archiveCustomerGroup, createCustomer, createCustomerGroup, createLoyaltyProgramme,
  deactivateLoyaltyProgramme, listCustomerGroups, listCustomers, listLoyaltyProgrammes, orderToCash,
  readCustomer, revenueSeries, topDebtors, updateCustomer,
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

test('receivables in two currencies are never added together', async () => {
  const { db, ctx } = await shop()
  const rupees = await createCustomer(ctx, { name: 'Nimbus', currency: 'INR' })
  const dollars = await createCustomer(ctx, { name: 'Contoso', currency: 'USD' })

  await invoice(ctx, rupees.id, '1000', -10)
  await invoice(ctx, rupees.id, '2000', -10)
  const abroad = await createDocument(ctx, {
    kind: 'invoice',
    customerId: dollars.id,
    currency: 'USD',
    dueOn: day(ctx, -10),
    lines: [{ description: 'Services', quantity: '1', unitPrice: '5000' }],
  })
  await postDocument(ctx, abroad.id, abroad.version)

  const aging = await agingReport(ctx, ctx.now)
  // The old report summed every currency and then labelled the answer with
  // whichever invoice the query happened to return first — 8000 of nothing.
  assert.equal(aging.total, '3000.0000')
  assert.equal(aging.currency, 'INR', 'the currency most of the debt is in')
  assert.deepEqual(aging.otherCurrencies, ['USD'], 'named, not converted and not added in')
  assert.equal(aging.buckets.find((bucket) => bucket.label === '1–30')!.count, 2)

  // Asking for dollars narrows what is aged, not what is outstanding. The
  // rupees are still named, because the question this field answers — "is
  // there money owed that this figure leaves out?" — has the same answer
  // whichever currency was asked for.
  const asked = await agingReport(ctx, ctx.now, 'USD')
  assert.equal(asked.total, '5000.0000')
  assert.equal(asked.currency, 'USD')
  assert.deepEqual(asked.otherCurrencies, ['INR'])
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

test('an empty aging report names no currency and no others', async () => {
  const { db, ctx } = await shop()
  const aging = await agingReport(ctx, ctx.now)
  assert.equal(aging.currency, null, '"INR 0" would assert a currency nothing is owed in')
  assert.deepEqual(aging.otherCurrencies, [])
  assert.equal(aging.total, '0.0000')
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

/* --------------------------------- email ---------------------------------- */

test('the email a form collects is the email the API returns', async () => {
  const { db, ctx } = await shop()
  const customer = await createCustomer(ctx, { name: 'Nimbus', currency: 'INR', email: 'billing@nimbus.test' })
  // A form field that is accepted and then dropped is worse than no field: the
  // person believes they recorded something.
  assert.equal(customer.email, 'billing@nimbus.test')
  assert.equal((await readCustomer(ctx, customer.id)).email, 'billing@nimbus.test')

  const found = await listCustomers(ctx, { q: 'nimbus.test' })
  assert.equal(found.total, 1, 'the directory promises a search by email, so the server has to match on it')
  await db.close()
})

test('a second customer at the same address is refused with a message, not a 500', async () => {
  const { db, ctx } = await shop()
  await createCustomer(ctx, { name: 'Nimbus', currency: 'INR', email: 'billing@nimbus.test' })
  await assert.rejects(
    () => createCustomer(ctx, { name: 'Nimbus Two', currency: 'INR', email: 'BILLING@nimbus.test' }),
    /already belongs to another account/,
    'the unique index would reject this anyway, but as an error nobody can act on',
  )
  await db.close()
})

/* ----------------------------- customer groups ---------------------------- */

test('a group is archived, not deleted, so its customers stay segmented', async () => {
  const { db, ctx } = await shop()
  const group = await createCustomerGroup(ctx, { name: 'Wholesale' })
  const customer = await createCustomer(ctx, { name: 'Nimbus', currency: 'INR', groupId: group.id })
  assert.equal(customer.groupName, 'Wholesale')

  assert.equal((await listCustomerGroups(ctx))[0].customers, 1)
  await assert.rejects(() => createCustomerGroup(ctx, { name: 'wholesale' }), /already a group/)

  await archiveCustomerGroup(ctx, group.id)
  assert.deepEqual(await listCustomerGroups(ctx), [])
  const { rows } = await db.query<{ group_id: string | null }>('select group_id from sales_customers where id = $1', [
    customer.id,
  ])
  assert.equal(rows[0].group_id, group.id, 'erasing the row would silently unsegment every customer in it')
  await db.close()
})

test('ISOLATION: groups and programmes belong to one workspace', async () => {
  const { db, ctx, rivalCtx } = await shop()
  await createCustomerGroup(ctx, { name: 'Wholesale' })
  await createLoyaltyProgramme(ctx, { name: 'Points', currency: 'INR' })
  assert.deepEqual(await listCustomerGroups(rivalCtx), [])
  assert.deepEqual(await listLoyaltyProgrammes(rivalCtx), [])
  await db.close()
})

/* --------------------------- loyalty programmes --------------------------- */

test('a programme is deactivated, because accrued points point back at it', async () => {
  const { db, ctx } = await shop()
  const programme = await createLoyaltyProgramme(ctx, { name: 'Points', currency: 'inr', pointsPerUnit: '2' })
  assert.equal(programme.currency, 'INR')
  assert.equal(programme.pointsPerUnit, '2.0000')

  await deactivateLoyaltyProgramme(ctx, programme.id)
  assert.deepEqual(await listLoyaltyProgrammes(ctx), [])
  assert.equal((await listLoyaltyProgrammes(ctx, true)).length, 1, 'a balance whose scheme vanished cannot be explained')
  await assert.rejects(() => deactivateLoyaltyProgramme(ctx, programme.id), /That programme/)
  await db.close()
})

/* ------------------------------ revenue series ---------------------------- */

test('revenue is bucketed over time, and two currencies are never added up', async () => {
  const { db, ctx } = await shop()
  const usd = await createCustomer(ctx, { name: 'Globex', currency: 'USD' })
  const inr = await createCustomer(ctx, { name: 'Nimbus', currency: 'INR' })

  for (const [customerId, currency, price] of [
    [usd.id, 'USD', '100'],
    [usd.id, 'USD', '250'],
    [inr.id, 'INR', '9000'],
  ] as const) {
    const invoice = await createDocument(ctx, {
      kind: 'invoice',
      customerId,
      currency,
      lines: [{ description: 'Widget', quantity: '1', unitPrice: price }],
    })
    await postDocument(ctx, invoice.id, invoice.version)
  }

  const series = await revenueSeries(ctx, { from: day(ctx, -1), to: day(ctx, 1), bucket: 'day' })
  // Two USD invoices outnumber the one INR invoice, so USD is what is
  // reported — and the rupees are named rather than folded into the dollars.
  assert.equal(series.currency, 'USD')
  assert.deepEqual(series.otherCurrencies, ['INR'])
  assert.equal(series.total, '350.0000')
  assert.equal(series.invoices, 2)
  assert.equal(series.buckets.length, 1)

  const rupees = await revenueSeries(ctx, { from: day(ctx, -1), to: day(ctx, 1), currency: 'INR' })
  assert.equal(rupees.total, '9000.0000')
  await db.close()
})

test('a range with nothing invoiced reports no currency, not a zero in one', async () => {
  const { db, ctx } = await shop()
  const series = await revenueSeries(ctx, { from: day(ctx, -30), to: day(ctx, -20) })
  // "USD 0" would assert a currency this workspace may not even trade in.
  assert.equal(series.currency, null)
  assert.deepEqual(series.buckets, [])
  await db.close()
})
