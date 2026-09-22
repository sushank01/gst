import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  addAutomatedDecision, addDpia, addFlow, addInventoryField, addRetentionPolicy,
  listAutomatedDecisions, listDpias, listFlows, listInventory, listRetentionPolicies,
  removeInventoryField, updateDpia,
} from '../src/server/services/compliance.ts'

async function workspace() {
  const db = await freshDb()
  const c = clock()
  const owner = await seedUser(db, { email: 'dpo@example.com', fullName: 'Data Protection Officer' })
  const other = await seedUser(db, { email: 'rival@example.com', fullName: 'Rival' })
  const acme = await createTenantWithOwner(db, owner, { name: 'Acme' }, c.now(), 'r1')
  const rival = await createTenantWithOwner(db, other, { name: 'Rival' }, c.now(), 'r2')
  const ctxFor = async (userId: string, tenantId: string) => {
    const { token } = await createSession(db, { userId, tenantId }, c.now())
    return withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))
  }
  return { db, c, ctx: await ctxFor(owner, acme.tenantId), rivalCtx: await ctxFor(other, rival.tenantId) }
}

test('a new workspace has an EMPTY register, not a seeded one', async () => {
  const { db, ctx } = await workspace()
  assert.deepEqual(await listInventory(ctx), [])
  assert.deepEqual(await listFlows(ctx), [])
  assert.deepEqual(await listDpias(ctx), [])
  assert.deepEqual(await listRetentionPolicies(ctx), [])

  /*
   * This is the property that matters most here. The screens used to ship a
   * sixteen-field inventory naming tables this database does not have, and a
   * flow map asserting personal-data egress to four named processors with
   * "SCC + DPA" against them. A register nobody wrote is not a register.
   */
  await db.close()
})

test('the same field cannot be catalogued twice', async () => {
  const { db, ctx } = await workspace()
  await addInventoryField(ctx, { entity: 'users', field: 'email', category: 'contact', legalBasis: 'Contract' })
  await assert.rejects(
    () => addInventoryField(ctx, { entity: 'USERS', field: 'Email', category: 'contact', legalBasis: 'Consent' }),
    /already catalogued/i,
    'a duplicate looks like a second processing purpose for the same data',
  )
  assert.equal((await listInventory(ctx)).length, 1)
  await db.close()
})

test('a sensitive field is recorded as such and can be withdrawn', async () => {
  const { db, ctx } = await workspace()
  const field = await addInventoryField(ctx, {
    entity: 'hr_employees',
    field: 'date_of_birth',
    category: 'identifier',
    sensitive: true,
    legalBasis: 'Legal obligation',
    retention: '7 years after exit',
  })
  assert.equal(field.sensitive, true)
  assert.equal(field.retention, '7 years after exit')

  await removeInventoryField(ctx, field.id)
  assert.deepEqual(await listInventory(ctx), [])
  await db.close()
})

test('a data flow records the tenant s own words about a transfer', async () => {
  const { db, ctx } = await workspace()
  const flow = await addFlow(ctx, {
    name: 'Payroll export',
    direction: 'egress',
    source: 'hr_employees',
    destination: 'Payroll bureau (UK)',
    crossBorder: 'Adequacy decision — our counsel confirmed 2026-02',
  })
  // Free text, not an enum: choosing between transfer mechanisms is the
  // tenant's counsel's job, and the product must not make that choice.
  assert.equal(flow.crossBorder, 'Adequacy decision — our counsel confirmed 2026-02')
  await assert.rejects(() => addFlow(ctx, { name: 'payroll export', direction: 'egress', source: 'x', destination: 'y' }), /already recorded/i)
  await db.close()
})

test('a DPIA moves through review under optimistic concurrency', async () => {
  const { db, ctx } = await workspace()
  const dpia = await addDpia(ctx, {
    title: 'Automated lead scoring',
    processing: 'Scores inbound leads from behavioural signals.',
    riskLevel: 'high',
  })
  assert.equal(dpia.status, 'draft')

  const reviewed = await updateDpia(ctx, dpia.id, { version: dpia.version, status: 'approved', reviewedOn: '2026-09-01' })
  assert.equal(reviewed.status, 'approved')
  assert.equal(reviewed.reviewedOn, '2026-09-01')

  await assert.rejects(
    () => updateDpia(ctx, dpia.id, { version: dpia.version, status: 'draft' }),
    (error: unknown) => (error as { currentVersion?: number }).currentVersion === dpia.version + 1,
  )
  await db.close()
})

test('an automated decision records profiling and human review as explicit facts', async () => {
  const { db, ctx } = await workspace()
  const decision = await addAutomatedDecision(ctx, {
    name: 'Credit limit suggestion',
    profiling: true,
    humanReview: false,
    logicSummary: 'Suggests a limit from payment history.',
  })
  // Both are columns rather than prose, because an Art. 22 answer turns on
  // exactly these two questions and nobody should have to read for them.
  assert.equal(decision.profiling, true)
  assert.equal(decision.humanReview, false)
  assert.equal((await listAutomatedDecisions(ctx)).length, 1)
  await db.close()
})

test('RETENTION IS NOT ENFORCED, and every row says so', async () => {
  const { db, ctx } = await workspace()
  const policy = await addRetentionPolicy(ctx, { subject: 'Support tickets', keepForDays: 365 })
  assert.equal(policy.enforced, false)

  const all = await listRetentionPolicies(ctx)
  assert.ok(
    all.every((row) => row.enforced === false),
    'no purge job exists; a register that implies deletion is happening is worse than none',
  )

  await assert.rejects(() => addRetentionPolicy(ctx, { subject: 'support TICKETS', keepForDays: 30 }), /already exists/i)
  await assert.rejects(() => addRetentionPolicy(ctx, { subject: 'Invoices', keepForDays: 0 }), /at least one day/i)
  await db.close()
})

test('recording a policy is audited, including that it is not enforced', async () => {
  const { db, ctx } = await workspace()
  await addRetentionPolicy(ctx, { subject: 'Support tickets', keepForDays: 365 })

  const { rows } = await db.query<{ action: string; detail: Record<string, unknown> }>(
    "select action, detail from audit_events where action = 'compliance.retention_recorded'",
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].detail.enforced, false, 'the trail records what was actually true at the time')
  await db.close()
})

test('a viewer may read the register but not write to it', async () => {
  const { db, ctx } = await workspace()
  const viewer = await seedUser(db, { email: 'viewer@example.com', fullName: 'Viewer' })
  await db.query(`insert into memberships (tenant_id, user_id, role, status) values ($1,$2,'viewer','active')`, [
    ctx.tenantId,
    viewer,
  ])
  const { token } = await createSession(db, { userId: viewer, tenantId: ctx.tenantId }, ctx.now)
  const viewerCtx = await withTenant(await authenticate(db, token, { now: ctx.now, requestId: 'r' }))

  await addInventoryField(ctx, { entity: 'users', field: 'email', category: 'contact', legalBasis: 'Contract' })
  assert.equal((await listInventory(viewerCtx)).length, 1)
  await assert.rejects(
    () => addInventoryField(viewerCtx, { entity: 'users', field: 'phone', category: 'contact', legalBasis: 'Contract' }),
    /cannot settings manage/i,
  )
  await db.close()
})

test('ISOLATION: one workspace never sees another s register', async () => {
  const { db, ctx, rivalCtx } = await workspace()
  await addInventoryField(ctx, { entity: 'users', field: 'email', category: 'contact', legalBasis: 'Contract' })
  await addFlow(ctx, { name: 'Payroll export', direction: 'egress', source: 'a', destination: 'b' })
  await addDpia(ctx, { title: 'Ours', processing: 'x' })

  assert.deepEqual(await listInventory(rivalCtx), [])
  assert.deepEqual(await listFlows(rivalCtx), [])
  assert.deepEqual(await listDpias(rivalCtx), [])
  await db.close()
})
