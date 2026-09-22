import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import { overview, search } from '../src/server/services/reports.ts'
import { hireEmployee } from '../src/server/services/hr.ts'
import { createAsset, assignAsset } from '../src/server/services/assets.ts'
import { createTicket, listTickets, replyToTicket } from '../src/server/services/support.ts'
import { createDocument, listDocuments, postDocument } from '../src/server/services/sales.ts'
import { createLead } from '../src/server/services/crm.ts'
import { grant } from '../src/server/services/credits.ts'

async function workspace() {
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

test('an empty workspace reports real zeroes and says what it cannot compute', async () => {
  const { db, ctx } = await workspace()
  const report = await overview(ctx)

  assert.equal(report.people.headcount, 0)
  assert.equal(report.support.open, 0)
  assert.equal(report.sales.postedThisMonth, '0')

  // The distinction the prototype could not make: no data is not a zero.
  assert.equal(report.support.medianFirstResponseMinutes, null)
  assert.ok(report.unavailable.some((entry) => entry.metric === 'support.medianFirstResponseMinutes'))
  assert.ok(report.unavailable.some((entry) => entry.metric === 'sales.currency'))
  await db.close()
})

test('every figure agrees with the module it came from', async () => {
  const { db, ctx } = await workspace()

  await hireEmployee(ctx, { fullName: 'Ada', joinedOn: ctx.now.toISOString().slice(0, 10) })
  await hireEmployee(ctx, { fullName: 'Grace', joinedOn: '2025-01-05', probationEndsOn: '2025-04-05' })

  const ticket = await createTicket(ctx, { subject: 'Reader offline', body: 'red light' })
  await createTicket(ctx, { subject: 'Second', body: 'x' })
  await replyToTicket(ctx, ticket.id, { body: 'on the way', visibility: 'public' })

  const invoice = await createDocument(ctx, {
    kind: 'invoice',
    currency: 'INR',
    lines: [{ description: 'Consulting', quantity: '1', unitPrice: '5000' }],
  })
  await postDocument(ctx, invoice.id, invoice.version)

  const asset = await createAsset(ctx, { name: 'ThinkPad' })
  await createAsset(ctx, { name: 'Monitor' })
  await assignAsset(ctx, asset.id, { holderLabel: 'Front desk' })
  await grant(db, ctx.tenantId, 500, 'trial allocation')

  const report = await overview(ctx)

  // Each of these is cross-checked against the module's own list query, which
  // is the property that matters: the dashboard and the screen must not drift.
  assert.equal(report.people.headcount, 2)
  assert.equal(report.people.onProbation, 1)
  assert.equal(report.people.joinersThisMonth, 1)

  assert.equal(report.support.open, (await listTickets(ctx, {})).total)
  assert.equal(report.support.unassigned, 2)
  assert.equal(report.support.medianFirstResponseMinutes, 0, 'a frozen clock means an instant response, not no response')

  const documents = await listDocuments(ctx, { kind: 'invoice' })
  assert.equal(documents.total, 1)
  assert.equal(report.sales.postedThisMonth, documents.rows[0].grandTotal)
  assert.equal(report.sales.outstanding, documents.rows[0].grandTotal, 'posted and unpaid is outstanding')
  assert.equal(report.sales.currency, 'INR')

  assert.equal(report.assets.registered, 2)
  assert.equal(report.assets.issued, 1)
  assert.equal(report.credits.granted, 500)
  assert.equal(report.credits.available, 500)
  await db.close()
})

test('the credit figures come from the ledger, not a second sum', async () => {
  const { db, ctx } = await workspace()
  await grant(db, ctx.tenantId, 1000, 'trial')
  const { reserve, settle, balance } = await import('../src/server/services/credits.ts')
  const held = await reserve(ctx, { amount: 200, reason: 'agent run' })
  await settle(ctx, held.reservationId, 150)
  const open = await reserve(ctx, { amount: 90, reason: 'in flight' })
  assert.ok(open.reservationId)

  const ledger = await balance(db, ctx.tenantId)
  const report = await overview(ctx)
  assert.deepEqual(
    { granted: report.credits.granted, used: report.credits.used, available: report.credits.available },
    { granted: ledger.granted, used: ledger.used, available: ledger.available },
    'one implementation of the arithmetic, so a dashboard cannot contradict billing',
  )
  await db.close()
})

test('an overdue invoice is counted only once it is past due and unpaid', async () => {
  const { db, ctx } = await workspace()
  const past = new Date(ctx.now.getTime() - 40 * 86_400_000).toISOString().slice(0, 10)
  const future = new Date(ctx.now.getTime() + 40 * 86_400_000).toISOString().slice(0, 10)

  const overdue = await createDocument(ctx, {
    kind: 'invoice',
    currency: 'INR',
    dueOn: past,
    lines: [{ description: 'Late', quantity: '1', unitPrice: '100' }],
  })
  const notYet = await createDocument(ctx, {
    kind: 'invoice',
    currency: 'INR',
    dueOn: future,
    lines: [{ description: 'Soon', quantity: '1', unitPrice: '100' }],
  })
  // A draft is not overdue however old it is; only a posted invoice is owed.
  assert.equal((await overview(ctx)).sales.overdueInvoices, 0)

  await postDocument(ctx, overdue.id, overdue.version)
  await postDocument(ctx, notYet.id, notYet.version)
  assert.equal((await overview(ctx)).sales.overdueInvoices, 1)
  await db.close()
})

test('ISOLATION: the overview never counts another workspace', async () => {
  const { db, ctx, rivalCtx } = await workspace()
  await hireEmployee(ctx, { fullName: 'Ada', joinedOn: '2026-01-05' })
  await createTicket(ctx, { subject: 'Ours', body: 'x' })
  await createAsset(ctx, { name: 'ThinkPad' })

  const theirs = await overview(rivalCtx)
  assert.equal(theirs.people.headcount, 0)
  assert.equal(theirs.support.open, 0)
  assert.equal(theirs.assets.registered, 0)
  await db.close()
})

test('search spans the modules and stays inside the workspace', async () => {
  const { db, ctx, rivalCtx } = await workspace()
  await createLead(ctx, { name: 'Ada Lovelace', email: 'ada@nimbus.test', company: 'Nimbus Industries' })
  await createTicket(ctx, { subject: 'Nimbus reader offline', body: 'x' })
  await hireEmployee(ctx, { fullName: 'Nimbus Contractor', joinedOn: '2026-01-05' })
  await createAsset(ctx, { name: 'Nimbus Laptop', serialNumber: 'NB-001' })

  const hits = await search(ctx, 'nimbus')
  assert.deepEqual(
    [...new Set(hits.map((hit) => hit.kind))].sort(),
    ['asset', 'employee', 'lead', 'ticket'],
  )
  assert.ok(hits.every((hit) => hit.url.startsWith('/app/')))

  assert.deepEqual(await search(rivalCtx, 'nimbus'), [], 'a result from another workspace must never appear')
  assert.deepEqual(await search(ctx, 'n'), [], 'a single character would match most of the database')
  await db.close()
})

test('search finds an asset by its serial number and a document by its reference', async () => {
  const { db, ctx } = await workspace()
  await createAsset(ctx, { name: 'ThinkPad X1', serialNumber: 'PF0ABCDE' })
  const invoice = await createDocument(ctx, {
    kind: 'invoice',
    currency: 'INR',
    lines: [{ description: 'x', quantity: '1', unitPrice: '1' }],
  })

  const bySerial = await search(ctx, 'pf0abc')
  assert.equal(bySerial[0].kind, 'asset')

  const byReference = await search(ctx, invoice.reference.toLowerCase())
  assert.equal(byReference[0].kind, 'sales_document')
  assert.equal(byReference[0].title, invoice.reference)
  await db.close()
})
