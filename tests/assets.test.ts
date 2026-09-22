import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  archiveAsset,
  assetHistory,
  assignAsset,
  createAsset,
  depreciationOf,
  listAssets,
  readAsset,
  recordService,
  retireAsset,
  returnAsset,
  updateAsset,
} from '../src/server/services/assets.ts'

async function workspace() {
  const db = await freshDb()
  const c = clock()
  const owner = await seedUser(db, { email: 'ops@example.com', fullName: 'Ops Lead' })
  const other = await seedUser(db, { email: 'rival@example.com', fullName: 'Rival' })
  const acme = await createTenantWithOwner(db, owner, { name: 'Acme' }, c.now(), 'r1')
  const rival = await createTenantWithOwner(db, other, { name: 'Rival' }, c.now(), 'r2')
  const ctxFor = async (userId: string, tenantId: string) => {
    const { token } = await createSession(db, { userId, tenantId }, c.now())
    return withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))
  }
  return {
    db,
    c,
    owner,
    other,
    ctx: await ctxFor(owner, acme.tenantId),
    rivalCtx: await ctxFor(other, rival.tenantId),
  }
}

const LAPTOP = { name: 'ThinkPad X1', assetType: 'laptop', serialNumber: 'PF0ABCDE' }

test('registering an asset allocates a sequential tag and opens its history', async () => {
  const { db, ctx } = await workspace()
  const first = await createAsset(ctx, LAPTOP)
  const second = await createAsset(ctx, { name: 'Dell Monitor' })

  assert.equal(first.tag, 'AST-0001')
  assert.equal(second.tag, 'AST-0002', 'tags come from a locked sequence, not a count')
  assert.equal(first.status, 'in_stock')
  assert.equal(first.holder, null)

  const history = await assetHistory(ctx, first.id)
  assert.equal(history.length, 1)
  assert.equal(history[0].kind, 'registered')
  await db.close()
})

test('a duplicate tag is refused as a field error, not a constraint crash', async () => {
  const { db, ctx } = await workspace()
  await createAsset(ctx, { name: 'A', tag: 'LAB-1' })
  await assert.rejects(() => createAsset(ctx, { name: 'B', tag: 'lab-1' }), /already in use/i)
  await db.close()
})

test('CUSTODY: an asset cannot be issued to two people', async () => {
  const { db, ctx, owner } = await workspace()
  const asset = await createAsset(ctx, LAPTOP)

  const issued = await assignAsset(ctx, asset.id, { holderUserId: owner, dueBackOn: '2026-12-31' })
  assert.equal(issued.status, 'assigned')
  assert.equal(issued.holder?.userId, owner)

  await assert.rejects(
    () => assignAsset(ctx, asset.id, { holderLabel: 'Someone else' }),
    /already issued/i,
    'the second holder must be refused, not silently replace the first',
  )

  const { rows } = await db.query<{ n: string }>(
    'select count(*)::text as n from asset_assignments where asset_id = $1 and returned_at is null',
    [asset.id],
  )
  assert.equal(rows[0].n, '1')
  await db.close()
})

test('CUSTODY: two concurrent issues cannot both succeed', async () => {
  const { db, ctx, owner } = await workspace()
  const asset = await createAsset(ctx, LAPTOP)

  // Both start before either commits. The partial unique index is what makes
  // this safe; the pre-check alone would let both through.
  const results = await Promise.allSettled([
    assignAsset(ctx, asset.id, { holderUserId: owner }),
    assignAsset(ctx, asset.id, { holderLabel: 'Front desk' }),
  ])
  const fulfilled = results.filter((r) => r.status === 'fulfilled')
  assert.equal(fulfilled.length, 1, `exactly one issue may win, got ${fulfilled.length}`)

  const { rows } = await db.query<{ n: string }>(
    'select count(*)::text as n from asset_assignments where asset_id = $1 and returned_at is null',
    [asset.id],
  )
  assert.equal(rows[0].n, '1')
  await db.close()
})

test('returning closes custody, records condition and frees the asset', async () => {
  const { db, ctx, owner } = await workspace()
  const asset = await createAsset(ctx, LAPTOP)
  await assignAsset(ctx, asset.id, { holderUserId: owner })

  const returned = await returnAsset(ctx, asset.id, { condition: 'scratched lid', note: 'dropped once' })
  assert.equal(returned.status, 'in_stock')
  assert.equal(returned.holder, null)
  assert.equal(returned.condition, 'scratched lid')

  // Issuable again once it is back.
  const reissued = await assignAsset(ctx, asset.id, { holderLabel: 'Front desk' })
  assert.equal(reissued.status, 'assigned')

  const history = await assetHistory(ctx, asset.id)
  assert.deepEqual(
    history.map((event) => event.kind),
    ['assigned', 'returned', 'assigned', 'registered'],
    'the handover chain is kept, not overwritten',
  )
  await db.close()
})

test('returning an asset that is not out is refused', async () => {
  const { db, ctx } = await workspace()
  const asset = await createAsset(ctx, LAPTOP)
  await assert.rejects(() => returnAsset(ctx, asset.id), /not currently issued/i)
  await db.close()
})

test('a person outside the workspace cannot be given an asset', async () => {
  const { db, ctx, other } = await workspace()
  const asset = await createAsset(ctx, LAPTOP)
  await assert.rejects(() => assignAsset(ctx, asset.id, { holderUserId: other }), /That person/)
  await db.close()
})

test('service takes an asset out of circulation and completion returns it', async () => {
  const { db, ctx } = await workspace()
  const asset = await createAsset(ctx, LAPTOP)

  const sent = await recordService(ctx, asset.id, { kind: 'repair', startedOn: '2026-02-01' })
  assert.equal(sent.status, 'in_service')

  const back = await recordService(ctx, asset.id, { kind: 'repair', startedOn: '2026-02-01', completedOn: '2026-02-09', cost: '4500.00', currency: 'inr' })
  assert.equal(back.status, 'in_stock')

  const { rows } = await db.query<{ cost: string; currency: string }>(
    'select cost::text as cost, currency from asset_service_records where asset_id = $1 and completed_on is not null',
    [asset.id],
  )
  assert.equal(rows[0].currency, 'INR', 'currency is normalised, not stored as typed')
  await db.close()
})

test('servicing an issued asset does not quietly take it off its holder', async () => {
  const { db, ctx, owner } = await workspace()
  const asset = await createAsset(ctx, LAPTOP)
  await assignAsset(ctx, asset.id, { holderUserId: owner })

  const serviced = await recordService(ctx, asset.id, { kind: 'inspection', startedOn: '2026-03-01' })
  assert.equal(serviced.status, 'assigned')
  assert.equal(serviced.holder?.userId, owner, 'custody survives an inspection')
  await db.close()
})

test('retirement happens once, and never while the asset is out', async () => {
  const { db, ctx, owner } = await workspace()
  const asset = await createAsset(ctx, LAPTOP)
  await assignAsset(ctx, asset.id, { holderUserId: owner })

  await assert.rejects(
    () => retireAsset(ctx, asset.id, { reason: 'end of life', retiredOn: '2026-06-30' }),
    /still issued/i,
  )

  await returnAsset(ctx, asset.id)
  const retired = await retireAsset(ctx, asset.id, { reason: 'end of life', retiredOn: '2026-06-30' })
  assert.equal(retired.status, 'retired')

  await assert.rejects(
    () => retireAsset(ctx, asset.id, { reason: 'again', retiredOn: '2026-07-01' }),
    /already been retired/i,
  )
  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from asset_retirements where asset_id = $1', [asset.id])
  assert.equal(rows[0].n, '1')

  await assert.rejects(() => assignAsset(ctx, asset.id, { holderUserId: owner }), /cannot be issued/i)
  await db.close()
})

test('a stale version loses, and the caller is told what to refetch', async () => {
  const { db, ctx } = await workspace()
  const asset = await createAsset(ctx, LAPTOP)
  await updateAsset(ctx, asset.id, { version: asset.version, location: 'Pune HQ' })

  await assert.rejects(
    () => updateAsset(ctx, asset.id, { version: asset.version, location: 'Mumbai' }),
    (error: unknown) => (error as { currentVersion?: number }).currentVersion === asset.version + 1,
  )
  assert.equal((await readAsset(ctx, asset.id)).location, 'Pune HQ')
  await db.close()
})

test('ISOLATION: another workspace cannot read, issue or retire the asset', async () => {
  const { db, ctx, rivalCtx } = await workspace()
  const asset = await createAsset(ctx, LAPTOP)

  await assert.rejects(() => readAsset(rivalCtx, asset.id), /not found|That asset/i)
  await assert.rejects(() => assignAsset(rivalCtx, asset.id, { holderLabel: 'Thief' }), /That asset/)
  await assert.rejects(() => retireAsset(rivalCtx, asset.id, { reason: 'x', retiredOn: '2026-01-01' }), /That asset/)
  await assert.rejects(() => returnAsset(rivalCtx, asset.id), /not currently issued|That asset/)

  const theirs = await listAssets(rivalCtx, {})
  assert.equal(theirs.total, 0)
  await db.close()
})

test('search and filters agree with the count, and archived assets stay hidden', async () => {
  const { db, ctx, owner } = await workspace()
  await createAsset(ctx, { name: 'ThinkPad X1', assetType: 'laptop', serialNumber: 'PF0ABCDE' })
  const monitor = await createAsset(ctx, { name: 'Dell U2720Q', assetType: 'monitor' })
  const phone = await createAsset(ctx, { name: 'Pixel 9', assetType: 'phone' })
  await assignAsset(ctx, phone.id, { holderUserId: owner })

  const all = await listAssets(ctx, {})
  assert.equal(all.total, 3)
  assert.equal(all.rows.length, 3)

  const bySerial = await listAssets(ctx, { q: 'pf0abc' })
  assert.equal(bySerial.total, 1)

  const byHolder = await listAssets(ctx, { holderUserId: owner })
  assert.equal(byHolder.total, 1)
  assert.equal(byHolder.rows[0].id, phone.id)

  await archiveAsset(ctx, monitor.id, monitor.version)
  const afterArchive = await listAssets(ctx, {})
  assert.equal(afterArchive.total, 2, 'the count and the rows must not disagree')
  assert.equal(afterArchive.rows.length, 2)
  assert.equal((await listAssets(ctx, { includeArchived: true })).total, 3)
  await db.close()
})

test('an issued asset cannot be archived out from under its holder', async () => {
  const { db, ctx, owner } = await workspace()
  const asset = await createAsset(ctx, LAPTOP)
  await assignAsset(ctx, asset.id, { holderUserId: owner })
  const current = await readAsset(ctx, asset.id)
  await assert.rejects(() => archiveAsset(ctx, asset.id, current.version), /still issued/i)
  await db.close()
})

test('depreciation is computed only from inputs that were actually supplied', async () => {
  const { db, ctx } = await workspace()
  const bare = await createAsset(ctx, { name: 'Chair' })
  assert.equal(depreciationOf(bare, new Date('2026-09-22T00:00:00Z')), null, 'no life, no number')

  const laptop = await createAsset(ctx, {
    name: 'ThinkPad',
    acquiredOn: '2025-09-22',
    purchaseCost: '120000.0000',
    salvageValue: '0.0000',
    usefulLifeMonths: 36,
  })
  const after12 = depreciationOf(laptop, new Date('2026-09-22T00:00:00Z'))
  assert.equal(after12?.method, 'straight_line')
  assert.equal(after12?.monthsElapsed, 12)
  assert.equal(after12?.monthlyAmount, '3333.3333')
  // The figures reconcile: 3333.3333 x 12 is exactly the accumulated charge.
  assert.equal(after12?.accumulated, '39999.9996')
  assert.equal(after12?.netBookValue, '80000.0004')

  // The last month absorbs the rounding, so a fully depreciated asset lands
  // exactly on its salvage value rather than four ten-thousandths away.
  const atEndOfLife = depreciationOf(laptop, new Date('2028-09-22T00:00:00Z'))
  assert.equal(atEndOfLife?.monthsElapsed, 36)
  assert.equal(atEndOfLife?.accumulated, '120000.0000')
  assert.equal(atEndOfLife?.netBookValue, '0.0000')

  // Never depreciates past its life, whatever date you ask about.
  const after10Years = depreciationOf(laptop, new Date('2035-09-22T00:00:00Z'))
  assert.equal(after10Years?.monthsElapsed, 36)
  assert.equal(after10Years?.netBookValue, '0.0000')

  // With a salvage value it stops there, not at zero.
  const machine = await createAsset(ctx, {
    name: 'Lathe',
    acquiredOn: '2020-01-01',
    purchaseCost: '500000.0000',
    salvageValue: '50000.0000',
    usefulLifeMonths: 120,
  })
  const settled = depreciationOf(machine, new Date('2030-01-01T00:00:00Z'))
  assert.equal(settled?.netBookValue, '50000.0000')
  await db.close()
})
