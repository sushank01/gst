import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  catalogFor, entitlement, installApp, listInstallations, setAppEnabled, setInstalledApps, uninstallApp,
} from '../src/server/services/installations.ts'

async function workspace(appQuota: number | null = null) {
  const db = await freshDb()
  const c = clock()
  const owner = await seedUser(db, { email: 'owner@example.com', fullName: 'Owner' })
  const acme = await createTenantWithOwner(db, owner, { name: 'Acme' }, c.now(), 'r1')

  if (appQuota !== null) {
    const { rows } = await db.query<{ id: string }>(
      `insert into plans (code, name, app_quota, currency) values ('starter', 'Starter', $1, 'INR') returning id`,
      [appQuota],
    )
    await db.query(`insert into subscriptions (tenant_id, plan_id, status) values ($1, $2, 'active')`, [acme.tenantId, rows[0].id])
  }

  const { token } = await createSession(db, { userId: owner, tenantId: acme.tenantId }, c.now())
  return { db, c, ctx: await withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' })) }
}

test('a gated application is refused with the reason, not installed as an empty shell', async () => {
  const { db, ctx } = await workspace()
  await assert.rejects(
    () => installApp(ctx, 'PAY'),
    /no implementation behind it yet/i,
    'a catalogue entry is not an application',
  )
  assert.equal((await listInstallations(ctx)).length, 0)
  await db.close()
})

test('an application not in the catalogue is not found', async () => {
  const { db, ctx } = await workspace()
  await assert.rejects(() => installApp(ctx, 'NOPE'), /Application NOPE/)
  await db.close()
})

test('installing is idempotent and reinstalling reuses the same row', async () => {
  const { db, ctx } = await workspace()
  await installApp(ctx, 'CRM')
  const twice = await installApp(ctx, 'CRM')
  assert.equal(twice.length, 1, 'installing something already installed is not an error')

  await uninstallApp(ctx, 'CRM')
  assert.equal((await listInstallations(ctx)).length, 0)

  await installApp(ctx, 'CRM')
  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from app_installations where tenant_id = $1', [
    ctx.tenantId,
  ])
  assert.equal(rows[0].n, '1', 'reinstalling finds the original row — its data is still there')
  await db.close()
})

test('QUOTA: the plan limit is enforced, and two installs cannot share the last slot', async () => {
  const { db, ctx } = await workspace(2)
  await installApp(ctx, 'CRM')
  const limits = await entitlement(db, ctx)
  assert.deepEqual(
    { planCode: limits.planCode, appQuota: limits.appQuota, used: limits.used, remaining: limits.remaining },
    { planCode: 'starter', appQuota: 2, used: 1, remaining: 1 },
  )
  assert.equal(limits.trialDaysLeft, null, 'a subscription with no trial date has no trial, not a default one')

  const results = await Promise.allSettled([installApp(ctx, 'HR'), installApp(ctx, 'SUP')])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'only one may take the last slot')

  assert.equal((await listInstallations(ctx)).length, 2)
  await assert.rejects(() => installApp(ctx, 'POS'), /covers 2 application/i)
  await db.close()
})

test('no plan means no recorded limit, which is not the same as a limit of zero', async () => {
  const { db, ctx } = await workspace()
  const limits = await entitlement(db, ctx)
  assert.equal(limits.appQuota, null)
  assert.equal(limits.remaining, null)
  await installApp(ctx, 'CRM')
  await installApp(ctx, 'HR')
  assert.equal((await listInstallations(ctx)).length, 2)
  await db.close()
})

test('ONBOARDING: deselecting an app genuinely removes it', async () => {
  const { db, ctx } = await workspace()
  const first = await setInstalledApps(ctx, ['CRM', 'HR', 'SUP'])
  assert.deepEqual(first.installed.sort(), ['CRM', 'HR', 'SUP'])
  assert.deepEqual(first.removed, [])

  // The prototype pushed to an array and never removed, so unchecking did nothing.
  const second = await setInstalledApps(ctx, ['CRM', 'POS'])
  assert.deepEqual(second.installed, ['POS'])
  assert.deepEqual(second.removed.sort(), ['HR', 'SUP'])
  assert.deepEqual(
    (await listInstallations(ctx)).map((row) => row.appCode).sort(),
    ['CRM', 'POS'],
  )
  await db.close()
})

test('a selection that does not fit the plan is refused entirely, not half applied', async () => {
  const { db, ctx } = await workspace(2)
  await assert.rejects(() => setInstalledApps(ctx, ['CRM', 'HR', 'SUP']), /3 were chosen/i)
  assert.equal((await listInstallations(ctx)).length, 0, 'a half-applied choice is worse than a refused one')

  const fits = await setInstalledApps(ctx, ['CRM', 'HR'])
  assert.equal(fits.installations.length, 2)
  await db.close()
})

test('a gated app in the selection is reported, and the rest still install', async () => {
  const { db, ctx } = await workspace()
  const result = await setInstalledApps(ctx, ['CRM', 'PAY', 'NOPE'])
  assert.deepEqual(result.installed, ['CRM'])
  assert.deepEqual(
    result.refused.map((entry) => entry.appCode).sort(),
    ['NOPE', 'PAY'],
    'the marketplace shows these, so a wizard passing one on is not an error',
  )
  assert.match(result.refused.find((entry) => entry.appCode === 'PAY')!.reason, /no implementation/i)
  await db.close()
})

test('the same app twice in a selection counts once', async () => {
  const { db, ctx } = await workspace(1)
  const result = await setInstalledApps(ctx, ['CRM', 'crm', ' CRM '])
  assert.deepEqual(result.installed, ['CRM'])
  await db.close()
})

test('disabling keeps the installation; uninstalling does not', async () => {
  const { db, ctx } = await workspace()
  await installApp(ctx, 'CRM')

  const disabled = await setAppEnabled(ctx, 'CRM', false)
  assert.equal(disabled[0].status, 'disabled')
  assert.ok(disabled[0].disabledAt, 'a disabled app is still installed, and still counts against the quota')
  assert.equal((await entitlement(db, ctx)).used, 1)

  const enabled = await setAppEnabled(ctx, 'CRM', true)
  assert.equal(enabled[0].status, 'installed')
  assert.equal(enabled[0].disabledAt, null)

  await uninstallApp(ctx, 'CRM')
  assert.equal((await entitlement(db, ctx)).used, 0)
  await assert.rejects(() => setAppEnabled(ctx, 'CRM', false), /not installed/i)
  await db.close()
})

test('the catalogue says what is releasable and what this workspace already has', async () => {
  const { db, ctx } = await workspace()
  await installApp(ctx, 'CRM')
  const catalog = await catalogFor(ctx)

  const crm = catalog.find((app) => app.code === 'CRM')!
  assert.equal(crm.status, 'installed')
  const payroll = catalog.find((app) => app.code === 'PAY')!
  assert.equal(payroll.releasable, false)
  assert.equal(payroll.status, null)
  assert.ok(catalog.some((app) => app.releasable), 'some applications are real')
  await db.close()
})

test('a viewer cannot install or remove applications', async () => {
  const { db, ctx } = await workspace()
  const viewer = await seedUser(db, { email: 'viewer@example.com', fullName: 'Viewer' })
  await db.query(`insert into memberships (tenant_id, user_id, role, status) values ($1,$2,'viewer','active')`, [
    ctx.tenantId,
    viewer,
  ])
  const { token } = await createSession(db, { userId: viewer, tenantId: ctx.tenantId }, ctx.now)
  const viewerCtx = await withTenant(await authenticate(db, token, { now: ctx.now, requestId: 'r' }))

  await assert.rejects(() => installApp(viewerCtx, 'CRM'), /cannot settings manage/i)
  await assert.rejects(() => setInstalledApps(viewerCtx, ['CRM']), /cannot settings manage/i)
  await db.close()
})
