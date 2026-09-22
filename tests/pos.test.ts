import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  closeShift, listShifts, openShift, readShift, recordSale, varianceReport, voidSale,
} from '../src/server/services/pos.ts'

async function till() {
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
  return { db, c, owner, ctx: await ctxFor(owner, acme.tenantId), rivalCtx: await ctxFor(other, rival.tenantId) }
}

const cash = (amount: string) => [{ method: 'cash' as const, amount }]

test('one open till per cashier, and closing twice is refused', async () => {
  const { db, ctx } = await till()
  const shift = await openShift(ctx, { currency: 'INR', openingFloat: '2000.0000' })
  assert.equal(shift.closedAt, null)

  await assert.rejects(() => openShift(ctx, { currency: 'INR' }), /still open/i)

  const closed = await closeShift(ctx, shift.id, { countedCash: '2000.0000', version: shift.version })
  assert.equal(closed.variance, '0.0000')

  await assert.rejects(() => closeShift(ctx, shift.id, { countedCash: '2000.0000', version: closed.version }), /already closed/i)

  // Once closed, the cashier may open another.
  const next = await openShift(ctx, { currency: 'INR' })
  assert.ok(next.id)
  await db.close()
})

test('CONCURRENCY: two devices cannot open two tills for one cashier', async () => {
  const { db, ctx } = await till()
  const results = await Promise.allSettled([
    openShift(ctx, { currency: 'INR' }),
    openShift(ctx, { currency: 'INR' }),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)

  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from pos_shifts where closed_at is null')
  assert.equal(rows[0].n, '1', 'two open drawers means a shortfall nobody can attribute')
  await db.close()
})

test('a sale whose payment lines do not add up to its total is refused', async () => {
  const { db, ctx } = await till()
  const shift = await openShift(ctx, { currency: 'INR' })

  await assert.rejects(
    () => recordSale(ctx, { shiftId: shift.id, total: '500.0000', currency: 'INR', tenders: cash('400.0000') }),
    /come to 400.0000 but the sale is 500.0000/,
    'a mismatch here surfaces as an unexplained cash variance hours later',
  )
  await assert.rejects(
    () => recordSale(ctx, { shiftId: shift.id, total: '500.0000', currency: 'INR', tenders: [] }),
    /at least one payment line/i,
  )

  const split = await recordSale(ctx, {
    shiftId: shift.id,
    total: '500.0000',
    currency: 'INR',
    tenders: [
      { method: 'cash', amount: '200.0000' },
      { method: 'card', amount: '300.0000' },
    ],
  })
  assert.match(split.reference, /\w/)
  await db.close()
})

test('the expected drawer is summed from the tenders: only cash, never card', async () => {
  const { db, ctx } = await till()
  const shift = await openShift(ctx, { currency: 'INR', openingFloat: '1000.0000' })

  await recordSale(ctx, { shiftId: shift.id, total: '500.0000', currency: 'INR', tenders: cash('500.0000') })
  await recordSale(ctx, {
    shiftId: shift.id,
    total: '800.0000',
    currency: 'INR',
    tenders: [{ method: 'card', amount: '800.0000' }],
  })
  await recordSale(ctx, {
    shiftId: shift.id,
    total: '300.0000',
    currency: 'INR',
    tenders: [
      { method: 'cash', amount: '100.0000' },
      { method: 'upi', amount: '200.0000' },
    ],
  })

  const read = await readShift(ctx, shift.id)
  assert.equal(read.totals.sales, 3)
  assert.equal(read.totals.gross, '1600.0000')
  assert.equal(read.totals.byMethod.card, '800.0000')
  // 1000 float + 500 + 100 cash. The card and UPI never reach the drawer.
  assert.equal(read.totals.expectedCash, '1600.0000')
  await db.close()
})

test('a voided sale leaves the drawer expectation alone', async () => {
  const { db, ctx } = await till()
  const shift = await openShift(ctx, { currency: 'INR', openingFloat: '0' })
  const keep = await recordSale(ctx, { shiftId: shift.id, total: '500.0000', currency: 'INR', tenders: cash('500.0000') })
  const drop = await recordSale(ctx, { shiftId: shift.id, total: '200.0000', currency: 'INR', tenders: cash('200.0000') })

  await voidSale(ctx, drop.saleId, 'rung up twice')
  const read = await readShift(ctx, shift.id)
  assert.equal(read.totals.expectedCash, '500.0000')
  assert.equal(read.totals.sales, 1)

  await assert.rejects(() => voidSale(ctx, drop.saleId, 'again'), /already voided/i)

  // The row survives: a voided sale is evidence, a deleted one is a gap.
  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from pos_sales')
  assert.equal(rows[0].n, '2')
  assert.ok(keep.saleId)
  await db.close()
})

test('a variance above the policy threshold cannot be closed without a reason', async () => {
  const { db, ctx } = await till()
  await db.query('insert into cash_variance_policies (tenant_id, reason_required_above) values ($1, 100)', [ctx.tenantId])

  const shift = await openShift(ctx, { currency: 'INR', openingFloat: '1000.0000' })
  await recordSale(ctx, { shiftId: shift.id, total: '500.0000', currency: 'INR', tenders: cash('500.0000') })

  // 1500 expected, 1400 counted: a hundred short.
  await assert.rejects(
    () => closeShift(ctx, shift.id, { countedCash: '1400.0000', version: shift.version }),
    /Record why before closing/,
    'a drawer that is short with no explanation is a loss nobody investigated',
  )

  const closed = await closeShift(ctx, shift.id, {
    countedCash: '1400.0000',
    reason: 'note given to a customer as change, no receipt',
    version: shift.version,
  })
  assert.equal(closed.expectedCash, '1500.0000')
  assert.equal(closed.variance, '-100.0000', 'negative is short')
  assert.equal(closed.varianceReason, 'note given to a customer as change, no receipt')
  await db.close()
})

test('a variance inside the threshold closes without one', async () => {
  const { db, ctx } = await till()
  await db.query('insert into cash_variance_policies (tenant_id, reason_required_above) values ($1, 100)', [ctx.tenantId])
  const shift = await openShift(ctx, { currency: 'INR', openingFloat: '1000.0000' })

  const closed = await closeShift(ctx, shift.id, { countedCash: '1050.0000', version: shift.version })
  assert.equal(closed.variance, '50.0000', 'positive is over')
  assert.equal(closed.varianceReason, null)
  await db.close()
})

test('a closed till takes no more sales, and a sale cannot be voided after close', async () => {
  const { db, ctx } = await till()
  const shift = await openShift(ctx, { currency: 'INR' })
  const sale = await recordSale(ctx, { shiftId: shift.id, total: '100.0000', currency: 'INR', tenders: cash('100.0000') })
  await closeShift(ctx, shift.id, { countedCash: '100.0000', version: shift.version })

  await assert.rejects(
    () => recordSale(ctx, { shiftId: shift.id, total: '100.0000', currency: 'INR', tenders: cash('100.0000') }),
    /is closed/i,
  )
  await assert.rejects(
    () => voidSale(ctx, sale.saleId, 'too late'),
    /credit note/i,
    'voiding after close would change a reconciled figure retrospectively',
  )
  await db.close()
})

test('a till only takes its own currency', async () => {
  const { db, ctx } = await till()
  const shift = await openShift(ctx, { currency: 'INR' })
  await assert.rejects(
    () => recordSale(ctx, { shiftId: shift.id, total: '100.0000', currency: 'USD', tenders: cash('100.0000') }),
    /takes INR/,
  )
  await db.close()
})

test('the variance report separates the worst shift from the average', async () => {
  const { db, ctx } = await till()
  await db.query(
    `insert into cash_variance_policies (tenant_id, reason_required_above, amber_worst_shift, red_worst_shift, amber_average, red_average)
     values ($1, 1000, 50, 200, 20, 100)`,
    [ctx.tenantId],
  )

  // Three shifts: two clean, one 120 short.
  for (const counted of ['0', '0', '-120']) {
    const shift = await openShift(ctx, { currency: 'INR', openingFloat: '0' })
    await closeShift(ctx, shift.id, { countedCash: counted === '-120' ? '-120.0000' : '0', version: shift.version })
  }

  const report = await varianceReport(ctx)
  assert.equal(report.shifts, 3)
  assert.equal(report.worst, '120.0000')
  assert.equal(report.total, '-120.0000')
  assert.equal(report.average, '-40.0000')
  // Worst is amber (>=50, <200); the average is amber too (>=20, <100).
  assert.equal(report.band, 'amber', 'a steady small shortfall and one large one are different problems')
  await db.close()
})

test('a report over no shifts is not a report of no variance', async () => {
  const { db, ctx } = await till()
  const report = await varianceReport(ctx)
  assert.equal(report.shifts, 0)
  assert.equal(report.band, 'green')
  assert.equal(report.average, '0.0000')
  await db.close()
})

test('ISOLATION: a till in another workspace is not found', async () => {
  const { db, ctx, rivalCtx } = await till()
  const shift = await openShift(ctx, { currency: 'INR' })

  await assert.rejects(() => readShift(rivalCtx, shift.id), /That till/)
  await assert.rejects(
    () => recordSale(rivalCtx, { shiftId: shift.id, total: '1.0000', currency: 'INR', tenders: cash('1.0000') }),
    /That till/,
  )
  await assert.rejects(() => closeShift(rivalCtx, shift.id, { countedCash: '0', version: shift.version }), /That till/)
  assert.deepEqual(await listShifts(rivalCtx, {}), [])
  await db.close()
})
