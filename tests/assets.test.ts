import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

/* ------------------------------ requests --------------------------------- */

const {
  requestAsset, decideAssetRequest, issueAgainstRequest, listAssetRequests, assetFacets, stockSummary,
} = await import('../src/server/services/assets.ts')

/** A workspace with `levels` approval levels configured. */
async function withApprovals(levels: number) {
  const context = await workspace()
  for (let level = 1; level <= levels; level += 1) {
    await context.db.query(
      `insert into asset_approval_levels (tenant_id, level, approver_kind, approver_role) values ($1,$2,'role','admin')`,
      [context.ctx.tenantId, level],
    )
  }
  return context
}

test('with no approval levels configured a request is approved on submission', async () => {
  const { db, ctx } = await workspace()
  const request = await requestAsset(ctx, { assetType: 'laptop', reason: 'new joiner' })
  assert.match(request.reference, /^AR-\d{4}-0001$/)
  assert.equal(
    request.status,
    'approved',
    'requiring an approval from a level that does not exist leaves every request stuck',
  )
  await db.close()
})

test('a request clears each configured level in order', async () => {
  const { db, ctx } = await withApprovals(2)
  const request = await requestAsset(ctx, { assetType: 'laptop', quantity: 2 })
  assert.equal(request.status, 'submitted')
  assert.equal(request.currentLevel, 1)

  const afterOne = await decideAssetRequest(ctx, request.id, { decision: 'approved', version: request.version })
  assert.equal(afterOne.status, 'submitted')
  assert.equal(afterOne.currentLevel, 2)

  const afterTwo = await decideAssetRequest(ctx, request.id, { decision: 'approved', version: afterOne.version })
  assert.equal(afterTwo.status, 'approved')
  await db.close()
})

test('a level cannot be decided twice, so a double-click cannot skip one', async () => {
  const { db, ctx } = await withApprovals(2)
  const request = await requestAsset(ctx, { assetType: 'laptop' })

  const results = await Promise.allSettled([
    decideAssetRequest(ctx, request.id, { decision: 'approved', version: request.version }),
    decideAssetRequest(ctx, request.id, { decision: 'approved', version: request.version }),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)

  const { rows } = await db.query<{ n: string }>(
    'select count(*)::text as n from asset_request_approvals where request_id = $1',
    [request.id],
  )
  assert.equal(rows[0].n, '1')
  await db.close()
})

test('a rejection stops the request', async () => {
  const { db, ctx } = await withApprovals(2)
  const request = await requestAsset(ctx, { assetType: 'laptop' })
  const rejected = await decideAssetRequest(ctx, request.id, { decision: 'rejected', version: request.version, note: 'no budget' })
  assert.equal(rejected.status, 'rejected')
  await assert.rejects(
    () => decideAssetRequest(ctx, request.id, { decision: 'approved', version: rejected.version }),
    /is rejected/i,
  )
  await db.close()
})

test('issuing against a request hands the asset over and closes the request together', async () => {
  const { db, ctx } = await withApprovals(1)
  const asset = await createAsset(ctx, LAPTOP)
  const request = await requestAsset(ctx, { assetType: 'laptop' })
  const approved = await decideAssetRequest(ctx, request.id, { decision: 'approved', version: request.version })

  const issued = await issueAgainstRequest(ctx, request.id, { assetId: asset.id, version: approved.version })
  assert.equal(issued.request.status, 'issued')
  assert.equal(issued.asset.status, 'assigned')
  assert.equal(issued.asset.holder?.userId, ctx.userId)

  // A request that still read "approved" is one somebody issues a second time.
  await assert.rejects(
    () => issueAgainstRequest(ctx, request.id, { assetId: asset.id, version: issued.request.version }),
    /is issued/i,
  )
  await db.close()
})

test('an unapproved request cannot be issued against', async () => {
  const { db, ctx } = await withApprovals(1)
  const asset = await createAsset(ctx, LAPTOP)
  const request = await requestAsset(ctx, { assetType: 'laptop' })
  await assert.rejects(
    () => issueAgainstRequest(ctx, request.id, { assetId: asset.id, version: request.version }),
    /is submitted/i,
  )
  await db.close()
})

test('a request must say what it is asking for', async () => {
  const { db, ctx } = await workspace()
  await assert.rejects(() => requestAsset(ctx, { reason: 'because' }), /what is being asked for/i)
  await db.close()
})

test('requests list by status and by who raised them', async () => {
  const { db, ctx } = await withApprovals(1)
  await requestAsset(ctx, { assetType: 'laptop' })
  const second = await requestAsset(ctx, { assetType: 'monitor' })
  await decideAssetRequest(ctx, second.id, { decision: 'rejected', version: second.version })

  assert.equal((await listAssetRequests(ctx, {})).total, 2)
  assert.equal((await listAssetRequests(ctx, { status: 'submitted' })).total, 1)
  assert.equal((await listAssetRequests(ctx, { mine: true })).total, 2)
  assert.equal((await listAssetRequests(ctx, { assetType: 'monitor' })).total, 1)
  await db.close()
})

test('facets count what the filter chips claim, and warranty is split by whether it has passed', async () => {
  const { db, ctx, owner } = await workspace()
  const past = new Date(ctx.now.getTime() - 40 * 86_400_000).toISOString().slice(0, 10)
  const soon = new Date(ctx.now.getTime() + 40 * 86_400_000).toISOString().slice(0, 10)
  const later = new Date(ctx.now.getTime() + 400 * 86_400_000).toISOString().slice(0, 10)

  const issued = await createAsset(ctx, { name: 'A', assetType: 'laptop', location: 'Pune', warrantyExpiresOn: past })
  await createAsset(ctx, { name: 'B', assetType: 'laptop', location: 'Pune', warrantyExpiresOn: soon })
  await createAsset(ctx, { name: 'C', assetType: 'monitor', warrantyExpiresOn: later })
  await assignAsset(ctx, issued.id, { holderUserId: owner })
  await requestAsset(ctx, { assetType: 'laptop' })

  const facets = await assetFacets(ctx)
  assert.equal(facets.byStatus.assigned, 1)
  assert.equal(facets.byStatus.in_stock, 2)
  assert.equal(facets.byType.laptop, 2)
  assert.equal(facets.byLocation.Pune, 2)
  assert.equal(facets.byLocation.unassigned, 1, 'an asset with no location is counted, not dropped')
  assert.equal(facets.outOfWarranty, 1)
  assert.equal(facets.warrantyExpiring, 1, 'expiring within 90 days; the one 400 days out is neither')
  assert.equal(facets.pendingRequests, 0, 'no approval levels, so nothing is pending')
  await db.close()
})

test('stock summary reports count and value separately', async () => {
  const { db, ctx } = await workspace()
  await createAsset(ctx, { name: 'A', assetType: 'laptop', purchaseCost: '120000.0000', currency: 'INR' })
  await createAsset(ctx, { name: 'B', assetType: 'laptop' }) // no recorded cost
  await createAsset(ctx, { name: 'C', assetType: 'monitor', purchaseCost: '30000.0000', currency: 'INR' })

  const byType = await stockSummary(ctx, 'type')
  const laptops = byType.find((line) => line.key === 'laptop')!
  assert.equal(laptops.count, 2)
  assert.equal(laptops.value, '120000.0000', 'the uncosted asset counts but adds no value')
  assert.equal(byType.find((line) => line.key === 'monitor')!.value, '30000.0000')

  const byStatus = await stockSummary(ctx, 'status')
  assert.equal(byStatus.find((line) => line.key === 'in_stock')!.count, 3)
  await db.close()
})

test('a chip count is the number of rows clicking that chip would show', async () => {
  const { db, ctx } = await workspace()
  await createAsset(ctx, { name: 'Pune laptop', assetType: 'laptop', location: 'Pune' })
  await createAsset(ctx, { name: 'Pune monitor', assetType: 'monitor', location: 'Pune' })
  await createAsset(ctx, { name: 'Goa laptop', assetType: 'laptop', location: 'Goa' })

  const whole = await assetFacets(ctx)
  assert.equal(whole.byStatus.in_stock, 3, 'unfiltered, the chips count the register')

  /*
   * The register applies type, location and search alongside the status
   * chips. A chip that keeps counting the whole workspace promises rows the
   * list will not show, so the counts and the list are checked against each
   * other here, through the same filter.
   */
  const scoped = await assetFacets(ctx, { assetType: 'laptop', location: 'Pune' })
  const listed = await listAssets(ctx, { assetType: 'laptop', location: 'Pune' })
  assert.equal(scoped.byStatus.in_stock, 1)
  assert.equal(
    Object.values(scoped.byStatus).reduce((total, count) => total + count, 0),
    listed.total,
    'the "All" chip and the list total are the same number',
  )

  const searched = await assetFacets(ctx, { q: 'monitor' })
  assert.equal(
    Object.values(searched.byStatus).reduce((total, count) => total + count, 0),
    (await listAssets(ctx, { q: 'monitor' })).total,
    'the search narrows the counts exactly as it narrows the list',
  )
  await db.close()
})

test('costs in different currencies are not added together', async () => {
  const { db, ctx } = await workspace()
  await createAsset(ctx, { name: 'A', assetType: 'laptop', purchaseCost: '1000.0000', currency: 'INR' })
  await createAsset(ctx, { name: 'B', assetType: 'laptop', purchaseCost: '1000.0000', currency: 'USD' })
  await createAsset(ctx, { name: 'C', assetType: 'monitor', purchaseCost: '30000.0000', currency: 'INR' })
  await createAsset(ctx, { name: 'D', assetType: 'webcam' })

  const byType = await stockSummary(ctx, 'type')
  const laptops = byType.find((line) => line.key === 'laptop')!
  assert.equal(laptops.count, 2)
  assert.equal(laptops.currencies, 2, 'two currencies: there is no single total to report')

  const monitors = byType.find((line) => line.key === 'monitor')!
  assert.equal(monitors.currencies, 1)
  assert.equal(monitors.value, '30000.0000')

  const webcams = byType.find((line) => line.key === 'webcam')!
  assert.equal(webcams.count, 1)
  assert.equal(webcams.currencies, 0, 'nothing priced, so the value column is not a measurement')
  await db.close()
})

test('ISOLATION: requests and facets never cross workspaces', async () => {
  const { db, ctx, rivalCtx } = await withApprovals(1)
  const request = await requestAsset(ctx, { assetType: 'laptop' })
  await createAsset(ctx, LAPTOP)

  await assert.rejects(
    () => decideAssetRequest(rivalCtx, request.id, { decision: 'approved', version: request.version }),
    /That request/,
  )
  assert.equal((await listAssetRequests(rivalCtx, {})).total, 0)
  assert.deepEqual((await assetFacets(rivalCtx)).byStatus, {})
  await db.close()
})

/* ----------------------------- taxonomies -------------------------------- */

const {
  readAssetTaxonomies, replaceAssetTaxonomy, readApprovalLadder, replaceApprovalLadder,
  warrantyReport, leaverHoldings,
} = await import('../src/server/services/assets.ts')

test('a workspace starts with a catalogue of types and no tag prefix it did not choose', async () => {
  const { db, ctx } = await workspace()
  const document = await readAssetTaxonomies(ctx)

  assert.equal(document.version, 0, 'nothing has been saved yet')
  assert.ok(document.taxonomies.asset_types.some((entry) => entry.value === 'laptop'))
  assert.equal(
    document.taxonomies.asset_types.every((entry) => entry.tagPrefix === null),
    true,
    'a shipped prefix would claim the register allocates from it before anyone chose one',
  )
  await db.close()
})

test('a configured tag prefix is what the register allocates from', async () => {
  const { db, ctx } = await workspace()
  const before = await createAsset(ctx, { name: 'Untyped laptop', assetType: 'laptop' })
  assert.equal(before.tag, 'AST-0001', 'no prefix configured, so the default sequence')

  const { version } = await readAssetTaxonomies(ctx)
  await replaceAssetTaxonomy(
    ctx,
    'asset_types',
    [
      { value: 'laptop', label: 'Laptop', tagPrefix: 'lap-' },
      { value: 'monitor', label: 'Monitor', tagPrefix: null },
    ],
    version,
  )

  const laptop = await createAsset(ctx, { name: 'ThinkPad', assetType: 'laptop' })
  const monitor = await createAsset(ctx, { name: 'Dell U2724', assetType: 'monitor' })
  assert.equal(laptop.tag, 'LAP-0001', 'the prefix is normalised: "lap-" and "LAP" are the same sticker')
  assert.equal(monitor.tag, 'AST-0002', 'a type with no prefix keeps the default sequence')

  const second = await createAsset(ctx, { name: 'ThinkPad II', assetType: 'laptop' })
  assert.equal(second.tag, 'LAP-0002', 'each prefix has its own locked sequence')
  await db.close()
})

test('a taxonomy entry cannot be removed while records still store its value', async () => {
  const { db, ctx } = await workspace()
  await createAsset(ctx, { name: 'ThinkPad', assetType: 'laptop' })
  const { version, taxonomies } = await readAssetTaxonomies(ctx)

  await assert.rejects(
    () =>
      replaceAssetTaxonomy(
        ctx,
        'asset_types',
        taxonomies.asset_types.filter((entry) => entry.value !== 'laptop'),
        version,
      ),
    /still use it/i,
    'the screen promises nothing is orphaned; a filtered array in the browser cannot keep that promise',
  )

  // An unused entry goes freely, so the refusal is about use and not about removal.
  const saved = await replaceAssetTaxonomy(
    ctx,
    'asset_types',
    taxonomies.asset_types.filter((entry) => entry.value !== 'speaker'),
    version,
  )
  assert.equal(saved.taxonomies.asset_types.some((entry) => entry.value === 'speaker'), false)
  assert.equal(saved.version, 1)
  await db.close()
})

test('a taxonomy save carrying a stale version is refused with the current one', async () => {
  const { db, ctx } = await workspace()
  const { version, taxonomies } = await readAssetTaxonomies(ctx)
  await replaceAssetTaxonomy(ctx, 'makes', taxonomies.makes, version)

  await assert.rejects(
    () => replaceAssetTaxonomy(ctx, 'makes', [], version),
    (error: Error & { currentVersion?: number }) => error.currentVersion === 1,
    'a second editor must be told what to merge against rather than overwriting',
  )
  await db.close()
})

test('a taxonomy refuses duplicate and unusable values', async () => {
  const { db, ctx } = await workspace()
  const { version } = await readAssetTaxonomies(ctx)
  const entry = { value: 'laptop', label: 'Laptop', tagPrefix: null }

  await assert.rejects(() => replaceAssetTaxonomy(ctx, 'asset_types', [entry, entry], version), /listed twice/i)
  await assert.rejects(
    () => replaceAssetTaxonomy(ctx, 'asset_types', [{ value: 'my type!', label: 'My type', tagPrefix: null }], version),
    /not a usable value/i,
  )
  await assert.rejects(() => replaceAssetTaxonomy(ctx, 'nonsense', [], version), /not found/i)
  await db.close()
})

/* --------------------------- approval levels ------------------------------ */

test('configuring an approval ladder is what puts a request in front of an approver', async () => {
  const { db, ctx } = await workspace()
  const empty = await readApprovalLadder(ctx)
  assert.deepEqual(empty.levels, [])
  assert.equal(empty.version, 0)

  const saved = await replaceApprovalLadder(ctx, {
    version: 0,
    levels: [
      { level: 1, approverKind: 'role', approverRole: 'IT Admin' },
      { level: 2, approverKind: 'role', approverRole: 'Finance' },
    ],
  })
  assert.equal(saved.version, 1)
  assert.deepEqual(saved.levels.map((level) => level.approverRole), ['IT Admin', 'Finance'])

  const request = await requestAsset(ctx, { assetType: 'laptop' })
  assert.equal(request.status, 'submitted', 'with a ladder configured a request waits for a decision')
  assert.equal(request.currentLevel, 1)
  await db.close()
})

test('two people saving the approval ladder at once: the second is told, not overwritten', async () => {
  const { db, ctx } = await workspace()
  await replaceApprovalLadder(ctx, { version: 0, levels: [{ level: 1, approverKind: 'role', approverRole: 'IT Admin' }] })

  await assert.rejects(
    () => replaceApprovalLadder(ctx, { version: 0, levels: [] }),
    (error: Error & { currentVersion?: number }) => error.currentVersion === 1,
  )
  assert.equal((await readApprovalLadder(ctx)).levels.length, 1, 'the refused save changed nothing')
  await db.close()
})

test('an approval level with nobody named is refused, and the previous ladder survives', async () => {
  const { db, ctx } = await workspace()
  await replaceApprovalLadder(ctx, { version: 0, levels: [{ level: 1, approverKind: 'role', approverRole: 'IT Admin' }] })

  await assert.rejects(
    () => replaceApprovalLadder(ctx, { version: 1, levels: [{ level: 1, approverKind: 'role', approverRole: '  ' }] }),
    /needs an approver/i,
    'a gate nobody can open stops every request for ever',
  )
  await assert.rejects(
    () =>
      replaceApprovalLadder(ctx, {
        version: 1,
        levels: [
          { level: 1, approverKind: 'role', approverRole: 'IT Admin' },
          { level: 1, approverKind: 'role', approverRole: 'Finance' },
        ],
      }),
    /listed twice/i,
  )

  const ladder = await readApprovalLadder(ctx)
  assert.equal(ladder.levels.length, 1)
  assert.equal(ladder.version, 1, 'a refused write records no replacement')
  await db.close()
})

test('a named approver must belong to the workspace', async () => {
  const { db, ctx, other } = await workspace()
  await assert.rejects(
    () => replaceApprovalLadder(ctx, { version: 0, levels: [{ level: 1, approverKind: 'user', userIds: [other] }] }),
    /That person/,
  )
  assert.deepEqual((await readApprovalLadder(ctx)).levels, [], 'the whole ladder rolls back with the bad level')
  await db.close()
})

/* ------------------------------- reports ---------------------------------- */

test('the warranty report lists rows with days left, measured from the server day', async () => {
  const { db, ctx } = await workspace()
  const day = (offset: number) => new Date(ctx.now.getTime() + offset * 86_400_000).toISOString().slice(0, 10)
  await createAsset(ctx, { name: 'Expired', assetType: 'laptop', warrantyExpiresOn: day(-10) })
  await createAsset(ctx, { name: 'Soon', assetType: 'laptop', warrantyExpiresOn: day(30) })
  await createAsset(ctx, { name: 'Later', assetType: 'laptop', warrantyExpiresOn: day(200) })
  await createAsset(ctx, { name: 'Unknown', assetType: 'laptop' })

  const report = await warrantyReport(ctx, { withinDays: 60 })
  assert.deepEqual(report.rows.map((row) => row.name), ['Expired', 'Soon'])
  assert.equal(report.rows[0].daysLeft, -10, 'a lapsed warranty reads negative rather than zero')
  assert.equal(report.rows[1].daysLeft, 30)
  assert.equal(report.expired, 1)
  assert.equal(report.expiring, 1, 'the one 200 days out is outside the window')
  assert.equal(
    report.rows.some((row) => row.name === 'Unknown'),
    false,
    'an asset with no warranty date recorded is unknown, not expired',
  )

  const upcoming = await warrantyReport(ctx, { withinDays: 60, includeExpired: false })
  assert.deepEqual(upcoming.rows.map((row) => row.name), ['Soon'])
  assert.equal(upcoming.total, 1)
  await db.close()
})

test('the warranty tile and the list beneath it count over the same window', async () => {
  const { db, ctx } = await workspace()
  const day = (offset: number) => new Date(ctx.now.getTime() + offset * 86_400_000).toISOString().slice(0, 10)
  await createAsset(ctx, { name: 'In 80 days', assetType: 'laptop', warrantyExpiresOn: day(80) })

  const facets = await assetFacets(ctx, { warrantyWithinDays: 60 })
  const report = await warrantyReport(ctx, { withinDays: 60, includeExpired: false })
  assert.equal(facets.warrantyExpiring, 0)
  assert.equal(facets.warrantyWithinDays, 60, 'the horizon travels with the count so a tile can name it')
  assert.equal(report.rows.length, facets.warrantyExpiring)
  await db.close()
})

test('leaver holdings report how much of the workforce they can actually see', async () => {
  const { db, ctx, owner } = await workspace()
  const asset = await createAsset(ctx, { name: 'ThinkPad', assetType: 'laptop' })
  await assignAsset(ctx, asset.id, { holderUserId: owner })

  const blind = await leaverHoldings(ctx)
  assert.equal(blind.total, 0)
  assert.equal(blind.employees, 0, 'with no employee records at all, zero is "cannot see" and the caller is told')

  await db.query(
    `insert into hr_employees (tenant_id, employee_no, user_id, full_name, status, exited_on)
     values ($1, 'E-1', $2, 'Ops Lead', 'exited', $3)`,
    [ctx.tenantId, owner, '2026-01-01'],
  )
  await db.query(
    `insert into hr_employees (tenant_id, employee_no, full_name, status)
     values ($1, 'E-2', 'Unlinked Leaver', 'exited')`,
    [ctx.tenantId],
  )

  const seen = await leaverHoldings(ctx)
  assert.equal(seen.total, 1)
  assert.equal(seen.rows[0].tag, asset.tag)
  assert.equal(seen.rows[0].holderName, 'Ops Lead')
  assert.equal(seen.exited, 2)
  assert.equal(seen.exitedUnlinked, 1, 'anything the unlinked leaver holds cannot be counted, and the screen says so')

  await returnAsset(ctx, asset.id)
  assert.equal((await leaverHoldings(ctx)).total, 0, 'a returned asset is no longer outstanding')

  /*
   * Custody recorded as a typed name has no account behind it, so no employee
   * can ever be matched to it. It is counted separately rather than folded
   * into a zero that reads as "nobody who left is holding anything".
   */
  const typed = await createAsset(ctx, { name: 'Loaner', assetType: 'laptop' })
  await assignAsset(ctx, typed.id, { holderLabel: 'Ops Lead' })
  const blindSpot = await leaverHoldings(ctx)
  assert.equal(blindSpot.total, 0, 'a typed name is invisible to an employee match')
  assert.equal(blindSpot.unlinkedCustody, 1, 'and the report says how much it cannot see')
  await db.close()
})

test('a request list carries the names the table renders, not the ids it stores', async () => {
  const { db, ctx } = await workspace()
  await replaceApprovalLadder(ctx, { version: 0, levels: [{ level: 1, approverKind: 'role', approverRole: 'IT Admin' }] })
  const request = await requestAsset(ctx, { assetType: 'laptop', reason: 'new joiner' })

  const pending = (await listAssetRequests(ctx, {})).rows[0]
  assert.equal(pending.requesterName, 'Ops Lead')
  assert.equal(pending.decidedByName, null, 'nobody has decided it yet')

  await decideAssetRequest(ctx, request.id, { decision: 'approved', version: request.version })
  const decided = (await listAssetRequests(ctx, {})).rows[0]
  assert.equal(decided.decidedByName, 'Ops Lead')
  assert.ok(decided.decidedAt, 'the decision carries when it happened')
  await db.close()
})

/* ------------------------- routes, at the boundary ------------------------ */

/*
 * The service tests above prove the rules. These prove the rules are reachable
 * through the door a browser knocks on: that the route reads the taxonomy code
 * out of its own path, that a stale version comes back as a 409 carrying the
 * version to merge against, and that the reports parse the query the screens
 * send. A service can be perfect and still unreachable.
 */
process.env.PGLITE_DIR = await mkdtemp(join(tmpdir(), 'apragya-asset-routes-'))

const registerUser = (await import('../src/app/api/v1/auth/register/route.ts')).POST
const createTenant = (await import('../src/app/api/v1/tenants/route.ts')).POST
const taxonomiesRoute = await import('../src/app/api/v1/assets/taxonomies/route.ts')
const taxonomyRoute = await import('../src/app/api/v1/assets/taxonomies/[code]/route.ts')
const approvalLevelsRoute = await import('../src/app/api/v1/assets/approval-levels/route.ts')
const warrantyRoute = await import('../src/app/api/v1/assets/reports/warranty/route.ts')
const leaverRoute = await import('../src/app/api/v1/assets/reports/leaver-holdings/route.ts')
const facetsRoute = await import('../src/app/api/v1/assets/facets/route.ts')

const BASE = 'http://test.local'
const jsonRequest = (method: string, path: string, body: unknown, cookie?: string) =>
  new Request(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
const getRequest = (path: string, cookie: string) => new Request(BASE + path, { headers: { cookie } })
const cookieOf = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0]

let sequence = 0
/** A signed-in owner with a workspace. Creating one rotates the session token. */
async function signedInOwner(): Promise<string> {
  sequence += 1
  const signedUp = cookieOf(
    await registerUser(
      jsonRequest('POST', '/api/v1/auth/register', {
        email: `assets${sequence}@example.com`,
        fullName: `Owner ${sequence}`,
        password: 'correct horse battery staple',
      }),
    ),
  )
  const created = await createTenant(jsonRequest('POST', '/api/v1/tenants', { name: `Assets ${sequence}` }, signedUp))
  assert.equal(created.status, 201, 'workspace creation failed')
  return cookieOf(created)
}

test('ROUTE: a taxonomy is read and replaced through its own path', async () => {
  const cookie = await signedInOwner()

  const read = await taxonomiesRoute.GET(getRequest('/api/v1/assets/taxonomies', cookie))
  const document = (await read.json()) as { taxonomies: Record<string, unknown[]>; version: number }
  assert.equal(read.status, 200)
  assert.ok(document.taxonomies.asset_types.length)

  const saved = await taxonomyRoute.PUT(
    jsonRequest(
      'PUT',
      '/api/v1/assets/taxonomies/asset_types',
      { entries: [{ value: 'laptop', label: 'Laptop', tagPrefix: 'LAP' }], version: document.version },
      cookie,
    ),
  )
  assert.equal(saved.status, 200)
  const after = (await saved.json()) as { taxonomies: Record<string, { value: string; tagPrefix: string }[]> }
  assert.deepEqual(after.taxonomies.asset_types, [{ value: 'laptop', label: 'Laptop', tagPrefix: 'LAP' }])

  const stale = await taxonomyRoute.PUT(
    jsonRequest('PUT', '/api/v1/assets/taxonomies/asset_types', { entries: [], version: document.version }, cookie),
  )
  assert.equal(stale.status, 409)
  const conflict = (await stale.json()) as { error: { currentVersion: number } }
  assert.equal(conflict.error.currentVersion, 1, 'the client is told what to merge against')

  const unknown = await taxonomyRoute.PUT(
    jsonRequest('PUT', '/api/v1/assets/taxonomies/invented', { entries: [], version: 0 }, cookie),
  )
  assert.equal(unknown.status, 404)
})

test('ROUTE: the approval ladder round-trips, and the reports parse what the screens send', async () => {
  const cookie = await signedInOwner()

  const empty = await approvalLevelsRoute.GET(getRequest('/api/v1/assets/approval-levels', cookie))
  assert.deepEqual(await empty.json(), { levels: [], version: 0 })

  const saved = await approvalLevelsRoute.PUT(
    jsonRequest(
      'PUT',
      '/api/v1/assets/approval-levels',
      { levels: [{ level: 1, approverKind: 'role', approverRole: 'IT Admin' }], version: 0 },
      cookie,
    ),
  )
  assert.equal(saved.status, 200)
  assert.equal(((await saved.json()) as { version: number }).version, 1)

  const facets = await facetsRoute.GET(getRequest('/api/v1/assets/facets?warrantyWithinDays=60', cookie))
  assert.equal(((await facets.json()) as { warrantyWithinDays: number }).warrantyWithinDays, 60)

  const warranty = await warrantyRoute.GET(
    getRequest('/api/v1/assets/reports/warranty?withinDays=60&includeExpired=false', cookie),
  )
  const report = (await warranty.json()) as { rows: unknown[]; withinDays: number }
  assert.equal(warranty.status, 200)
  assert.equal(report.withinDays, 60)
  assert.deepEqual(report.rows, [])

  const leavers = await leaverRoute.GET(getRequest('/api/v1/assets/reports/leaver-holdings', cookie))
  const holdings = (await leavers.json()) as { rows: unknown[]; employees: number }
  assert.equal(leavers.status, 200)
  assert.equal(holdings.employees, 0, 'a workspace with no employee records says so rather than implying a zero')

  const rejected = await facetsRoute.GET(getRequest('/api/v1/assets/facets?nonsense=1', cookie))
  assert.equal(rejected.status, 422, 'an unknown query parameter is a visible failure, not a silently ignored one')
})
