import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import { recordAudit, recordSystemAudit } from '../src/server/events/audit.ts'
import { listAuditEvents } from '../src/server/services/audit.ts'

/**
 * The audit trail's read side.
 *
 * Every property here exists because the prototype's version of this screen got
 * it wrong: it filtered a browser array (so the count was the loaded length),
 * it showed the signed-in user's own address as the actor of every row, and it
 * offered the whole table to anybody who could open the page.
 */

async function workspace() {
  const db = await freshDb()
  const c = clock()
  const owner = await seedUser(db, { email: 'owner@example.com', fullName: 'Ada Owner' })
  const acme = await createTenantWithOwner(db, owner, { name: 'Acme' }, c.now(), 'r1')

  const ctxFor = async (userId: string, tenantId: string) => {
    const { token } = await createSession(db, { userId, tenantId }, c.now())
    return withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))
  }
  return { db, c, owner, tenantId: acme.tenantId, ctx: await ctxFor(owner, acme.tenantId), ctxFor }
}

test('a new workspace has the one event its creation actually wrote', async () => {
  const { db, ctx } = await workspace()
  const page = await listAuditEvents(ctx)
  assert.equal(page.total, 1)
  assert.equal(page.rows[0].action, 'tenant.created')
  assert.equal(page.rows[0].actorEmail, 'owner@example.com', 'the actor is the row, not the reader')
  assert.equal(page.rows[0].actorRole, 'owner', 'the role comes from the membership, not a literal')
  await db.close()
})

test('a member is refused, rather than shown an empty trail', async () => {
  const { db, ctx, ctxFor, tenantId } = await workspace()
  const colleague = await seedUser(db, { email: 'sam@example.com', fullName: 'Sam' })
  await db.query(`insert into memberships (tenant_id, user_id, role, status) values ($1,$2,'member','active')`, [
    tenantId,
    colleague,
  ])
  const theirs = await ctxFor(colleague, tenantId)

  // An empty table would read as "nothing has happened here", which is a
  // different and much more reassuring claim than "you may not see this".
  await assert.rejects(() => listAuditEvents(theirs), /cannot audit read/i)
  assert.equal((await listAuditEvents(ctx)).total, 1)
  await db.close()
})

test('the total counts matching events, not the page', async () => {
  const { db, ctx } = await workspace()
  for (let index = 0; index < 12; index += 1) {
    await recordAudit(db, ctx, { action: 'record.updated', resource: 'lead', resourceId: `lead-${index}` })
  }

  const page = await listAuditEvents(ctx, { limit: 5 })
  assert.equal(page.rows.length, 5)
  assert.equal(page.total, 13, 'the pager says how many match, not how many were fetched')

  const filtered = await listAuditEvents(ctx, { action: 'record.updated', limit: 5 })
  assert.equal(filtered.total, 12, 'and it is the total for the filter in force')
  await db.close()
})

test('paging never shows one event twice, even at the same instant', async () => {
  const { db, ctx } = await workspace()
  // Written with one clock value on purpose: ordering by time alone leaves
  // ties, and a tie that resolves differently per query duplicates a row on
  // page two while hiding another.
  for (let index = 0; index < 6; index += 1) {
    await recordAudit(db, ctx, { action: 'company.updated', resource: 'company', resourceId: `c-${index}` })
  }

  const first = await listAuditEvents(ctx, { limit: 3, offset: 0 })
  const second = await listAuditEvents(ctx, { limit: 3, offset: 3 })
  const ids = [...first.rows, ...second.rows].map((row) => row.id)
  assert.equal(new Set(ids).size, ids.length)
  await db.close()
})

test('filters narrow by action, resource, outcome and free text', async () => {
  const { db, ctx } = await workspace()
  await recordAudit(db, ctx, { action: 'member.invited', resource: 'invitation', resourceId: 'inv-1' })
  await recordAudit(db, ctx, { action: 'company.archived', resource: 'company', resourceId: 'co-9', outcome: 'failure' })

  assert.equal((await listAuditEvents(ctx, { action: 'member.invited' })).total, 1)
  assert.equal((await listAuditEvents(ctx, { resource: 'company' })).total, 1)
  assert.equal((await listAuditEvents(ctx, { outcome: 'failure' })).total, 1)
  assert.equal((await listAuditEvents(ctx, { outcome: 'denied' })).total, 0, 'a real zero, not a hidden failure')

  // The search covers the actor as well as the event, because "what did Ada
  // do" is the question this screen is opened with.
  assert.equal((await listAuditEvents(ctx, { q: 'ada' })).total, 3)
  assert.equal((await listAuditEvents(ctx, { q: 'co-9' })).total, 1)
  await db.close()
})

test('a date range excludes what falls outside it', async () => {
  const { db, c, ctx } = await workspace()
  const later = { ...ctx, now: c.advance(3 * 86_400_000) }
  await recordAudit(db, later, { action: 'record.updated', resource: 'lead', resourceId: 'l-1' })

  const recent = await listAuditEvents(ctx, { from: new Date(c.now().getTime() - 86_400_000).toISOString() })
  assert.equal(recent.total, 1, 'only the event inside the window')
  assert.equal(recent.rows[0].resourceId, 'l-1')

  const everything = await listAuditEvents(ctx)
  assert.equal(everything.total, 2)
  await db.close()
})

test('a machine actor is reported as a machine, not as a person', async () => {
  const { db, ctx, tenantId } = await workspace()
  await recordSystemAudit(db, {
    tenantId,
    action: 'job.ran',
    resource: 'schedule',
    resourceId: 'nightly',
    actorKind: 'job',
    now: ctx.now,
  })

  const page = await listAuditEvents(ctx, { action: 'job.ran' })
  assert.equal(page.rows[0].actorKind, 'job')
  assert.equal(page.rows[0].actorEmail, null, 'nothing is invented for an actor that is not a user')
  assert.equal(page.rows[0].actorRole, null)
  await db.close()
})

test('the filter menus list what this workspace has recorded', async () => {
  const { db, ctx } = await workspace()
  await recordAudit(db, ctx, { action: 'guardrail.created', resource: 'guardrail_policy', resourceId: 'g-1' })
  await recordAudit(db, ctx, { action: 'guardrail.created', resource: 'guardrail_policy', resourceId: 'g-2' })

  const { facets } = await listAuditEvents(ctx, { limit: 1 })
  assert.deepEqual(facets.actions, ['guardrail.created', 'tenant.created'])
  assert.deepEqual(facets.resources, ['guardrail_policy', 'tenant'])
  // Built from the trail rather than from the page: with limit 1 a menu made
  // of the loaded rows would offer exactly one action.
  await db.close()
})

test('sorting is by named column, and an unknown sort cannot reach the query', async () => {
  const { db, ctx } = await workspace()
  await recordAudit(db, ctx, { action: 'aaa.first', resource: 'lead' })
  await recordAudit(db, ctx, { action: 'zzz.last', resource: 'lead' })

  const ascending = await listAuditEvents(ctx, { sort: 'action', direction: 'asc' })
  assert.equal(ascending.rows[0].action, 'aaa.first')
  const descending = await listAuditEvents(ctx, { sort: 'action', direction: 'desc' })
  assert.equal(descending.rows[0].action, 'zzz.last')

  // The order-by is looked up in a map, so a value that is not a key falls back
  // to the default rather than being interpolated into SQL.
  const injected = await listAuditEvents(ctx, { sort: 'action; drop table audit_events' as never })
  assert.equal(injected.total, 3)
  await db.close()
})

test('ISOLATION: one workspace never reads another workspace s trail', async () => {
  const { db, ctx, ctxFor } = await workspace()
  const mallory = await seedUser(db, { email: 'mallory@example.com', fullName: 'Mallory' })
  const evil = await createTenantWithOwner(db, mallory, { name: 'Evil' }, ctx.now, 'r2')
  const theirs = await ctxFor(mallory, evil.tenantId)

  await recordAudit(db, ctx, { action: 'company.created', resource: 'company', resourceId: 'ours' })

  const mine = await listAuditEvents(ctx)
  const other = await listAuditEvents(theirs)
  assert.equal(mine.total, 2)
  assert.equal(other.total, 1, 'only their own tenant.created')
  assert.ok(!other.rows.some((row) => row.resourceId === 'ours'))
  assert.ok(!other.facets.actions.includes('company.created'), 'even the filter menu must not leak it')
  await db.close()
})
