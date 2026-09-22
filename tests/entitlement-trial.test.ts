import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import { entitlement } from '../src/server/services/installations.ts'

/**
 * The trial countdown.
 *
 * The prototype rendered "13 days left" as a constant, so it was wrong from
 * the second day and told every workspace the same thing. It is computed from
 * the stored end date on every read here, which is the only way it can be right.
 */
async function withTrial(daysFromNow: number | null) {
  const db = await freshDb()
  const c = clock()
  // Offset from the FROZEN clock the context uses, not from the wall clock —
  // otherwise the test measures the gap between the two.
  const endsAt = daysFromNow === null ? null : new Date(c.now().getTime() + daysFromNow * 86_400_000)
  const owner = await seedUser(db, { email: 'owner@example.com', fullName: 'Owner' })
  const acme = await createTenantWithOwner(db, owner, { name: 'Acme' }, c.now(), 'r1')
  const { rows } = await db.query<{ id: string }>(
    `insert into plans (code, name, app_quota, monthly_credits, currency) values ('starter','Starter',3,5000,'INR') returning id`,
  )
  await db.query(`insert into subscriptions (tenant_id, plan_id, status, trial_ends_at) values ($1,$2,'trialing',$3)`, [
    acme.tenantId,
    rows[0].id,
    endsAt,
  ])
  const { token } = await createSession(db, { userId: owner, tenantId: acme.tenantId }, c.now())
  return { db, c, ctx: await withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' })) }
}

test('the countdown is computed from the stored date, not a constant', async () => {
  const { db, ctx } = await withTrial(9.5)
  const limits = await entitlement(db, ctx)
  assert.equal(limits.trialDaysLeft, 9, 'nine and a half days left is nine whole days, not ten')
  assert.equal(limits.planName, 'Starter')
  assert.equal(limits.monthlyCredits, 5000)
  await db.close()
})

test('an expired trial reports zero, never a negative count', async () => {
  const { db, ctx } = await withTrial(-5)
  assert.equal((await entitlement(db, ctx)).trialDaysLeft, 0)
  await db.close()
})

test('no trial date means no trial, rather than a default one', async () => {
  const { db, ctx } = await withTrial(null)
  const limits = await entitlement(db, ctx)
  assert.equal(limits.trialEndsAt, null)
  assert.equal(limits.trialDaysLeft, null)
  await db.close()
})
