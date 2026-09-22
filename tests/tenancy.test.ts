import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { hashPassword } from '../src/server/auth/password.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant, withCompany, assertScope } from '../src/server/tenancy/context.ts'
import { roleHas, ROLE_PERMISSIONS } from '../src/server/tenancy/permissions.ts'
import {
  createTenantWithOwner, listTenantsForUser, listMembers, inviteMember,
  changeMemberRole, removeMember, acceptInvitation,
} from '../src/server/services/tenancy.ts'
import { consumeToken } from '../src/server/auth/service.ts'

const PASSWORD = 'correct horse battery staple'

/** Two tenants, each with its own owner, plus signed-in contexts for both. */
async function twoTenants() {
  const db = await freshDb()
  const c = clock()
  const alice = await seedUser(db, { email: 'alice@example.com', fullName: 'Alice', passwordHash: await hashPassword(PASSWORD) })
  const mallory = await seedUser(db, { email: 'mallory@example.com', fullName: 'Mallory', passwordHash: await hashPassword(PASSWORD) })

  const acme = await createTenantWithOwner(db, alice, { name: 'Acme' }, c.now(), 'req-1')
  const evil = await createTenantWithOwner(db, mallory, { name: 'Evil Corp' }, c.now(), 'req-2')

  const aliceSession = await createSession(db, { userId: alice, tenantId: acme.tenantId }, c.now())
  const mallorySession = await createSession(db, { userId: mallory, tenantId: evil.tenantId }, c.now())

  const ctxOf = async (token: string) =>
    withTenant(await authenticate(db, token, { now: c.now(), requestId: 'req' }))

  return { db, c, alice, mallory, acme, evil, aliceSession, mallorySession, ctxOf }
}

test('creating a tenant makes tenant + primary company + owner membership atomically', async () => {
  const db = await freshDb()
  const c = clock()
  const userId = await seedUser(db, { email: 'a@example.com' })
  const created = await createTenantWithOwner(db, userId, { name: 'Acme Industries' }, c.now(), 'req-1')

  const company = await db.query<{ is_primary: boolean; name: string }>(
    'select is_primary, name from companies where tenant_id = $1',
    [created.tenantId],
  )
  assert.equal(company.rows.length, 1)
  assert.equal(company.rows[0].is_primary, true)

  const membership = await db.query<{ role: string }>('select role from memberships where tenant_id = $1', [created.tenantId])
  assert.equal(membership.rows[0].role, 'owner')

  const audit = await db.query<{ action: string; actor_user_id: string }>(
    'select action, actor_user_id from audit_events where tenant_id = $1',
    [created.tenantId],
  )
  assert.equal(audit.rows[0].action, 'tenant.created')
  assert.equal(audit.rows[0].actor_user_id, userId, 'the actor is the real user, not a client-supplied value')
  await db.close()
})

test('a user only sees tenants they are a member of', async () => {
  const { db, alice, mallory, acme, evil } = await twoTenants()
  const aliceTenants = await listTenantsForUser(db, alice)
  assert.deepEqual(aliceTenants.map((t) => t.id), [acme.tenantId])
  const malloryTenants = await listTenantsForUser(db, mallory)
  assert.deepEqual(malloryTenants.map((t) => t.id), [evil.tenantId])
  await db.close()
})

test('ISOLATION: a session cannot bind to a tenant it has no membership in', async () => {
  const { db, c, mallorySession, evil, acme } = await twoTenants()
  const auth = await authenticate(db, mallorySession.token, { now: c.now(), requestId: 'r' })

  const own = await withTenant(auth, evil.tenantId)
  assert.equal(own.tenantId, evil.tenantId)

  await assert.rejects(
    () => withTenant(auth, acme.tenantId),
    (error: any) => {
      assert.equal(error.status, 403, 'naming another tenant id is refused')
      return true
    },
  )
  await db.close()
})

test('ISOLATION: a company in another tenant reads as not found, not forbidden', async () => {
  const { db, ctxOf, mallorySession, acme } = await twoTenants()
  const mallory = await ctxOf(mallorySession.token)
  await assert.rejects(
    () => withCompany(mallory, acme.companyId),
    (error: any) => {
      assert.equal(error.status, 404, '403 would confirm the record exists')
      return true
    },
  )
  await db.close()
})

test('ISOLATION: member listing never crosses tenants', async () => {
  const { db, ctxOf, aliceSession, mallorySession } = await twoTenants()
  const alice = await ctxOf(aliceSession.token)
  const mallory = await ctxOf(mallorySession.token)
  const aliceMembers = await listMembers(alice)
  const malloryMembers = await listMembers(mallory)
  assert.deepEqual(aliceMembers.map((m) => m.email), ['alice@example.com'])
  assert.deepEqual(malloryMembers.map((m) => m.email), ['mallory@example.com'])
  await db.close()
})

test('ISOLATION: removing a membership in another tenant is refused', async () => {
  const { db, ctxOf, aliceSession, mallorySession } = await twoTenants()
  const alice = await ctxOf(aliceSession.token)
  const mallory = await ctxOf(mallorySession.token)
  const aliceMembership = (await listMembers(alice))[0].membershipId
  await assert.rejects(() => removeMember(mallory, aliceMembership), (error: any) => {
    assert.equal(error.status, 404)
    return true
  })
  const still = await listMembers(alice)
  assert.equal(still.length, 1, "the other tenant's membership survives")
  await db.close()
})

test('a scope without a tenant id is refused before it reaches SQL', () => {
  assert.throws(() => assertScope({ tenantId: '' }), /without a tenant scope/)
  assert.throws(() => assertScope(undefined as any), /without a tenant scope/)
  assert.deepEqual(assertScope({ tenantId: 'abc' }), { tenantId: 'abc' })
})

test('role permissions are additive and viewers cannot write', () => {
  assert.equal(roleHas('viewer', 'record.read'), true)
  assert.equal(roleHas('viewer', 'record.create'), false)
  assert.equal(roleHas('member', 'record.create'), true)
  assert.equal(roleHas('member', 'member.invite'), false)
  assert.equal(roleHas('admin', 'member.invite'), true)
  assert.equal(roleHas('admin', 'record.delete'), false, 'hard delete is owner-only')
  assert.equal(roleHas('owner', 'record.delete'), true)
  for (const permission of ROLE_PERMISSIONS.member) {
    assert.ok(ROLE_PERMISSIONS.admin.has(permission), `admin inherits ${permission}`)
  }
})

test('a viewer is refused a write by the server, whatever the UI shows', async () => {
  const { db, c, acme, ctxOf } = await twoTenants()
  const viewerId = await seedUser(db, { email: 'viewer@example.com' })
  await db.query("insert into memberships (tenant_id, user_id, role) values ($1,$2,'viewer')", [acme.tenantId, viewerId])
  const session = await createSession(db, { userId: viewerId, tenantId: acme.tenantId }, c.now())
  const viewer = await ctxOf(session.token)

  assert.equal(viewer.can('record.read'), true)
  assert.equal(viewer.can('member.invite'), false)
  await assert.rejects(() => inviteMember(viewer, { email: 'x@example.com', role: 'member' }), (error: any) => {
    assert.equal(error.status, 403)
    return true
  })
  await db.close()
})

test('inviting queues delivery in the same transaction and records audit', async () => {
  const { db, ctxOf, aliceSession, acme } = await twoTenants()
  const alice = await ctxOf(aliceSession.token)
  const { invitationId, token } = await inviteMember(alice, { email: 'bob@example.com', role: 'member' })

  const outbox = await db.query<{ topic: string; status: string; payload: any }>('select topic, status, payload from outbox')
  assert.equal(outbox.rows.length, 1)
  assert.equal(outbox.rows[0].topic, 'invitation.send')
  assert.equal(outbox.rows[0].status, 'pending')

  const audit = await db.query<{ action: string; detail: any }>(
    "select action, detail from audit_events where action = 'member.invited'",
  )
  assert.equal(audit.rows.length, 1)
  assert.equal(audit.rows[0].detail.email, 'bob@example.com')

  const consumed = await consumeToken(db, token, 'invitation', alice.now)
  assert.equal(consumed?.tenantId, acme.tenantId)
  assert.equal((consumed?.payload as any).invitationId, invitationId)
  await db.close()
})

test('inviting an existing member is refused', async () => {
  const { db, ctxOf, aliceSession } = await twoTenants()
  const alice = await ctxOf(aliceSession.token)
  await assert.rejects(() => inviteMember(alice, { email: 'ALICE@example.com', role: 'member' }), /already a member/)
  await db.close()
})

test('accepting an invitation creates the membership once and cannot be replayed', async () => {
  const { db, c, ctxOf, aliceSession, acme } = await twoTenants()
  const alice = await ctxOf(aliceSession.token)
  const { invitationId } = await inviteMember(alice, { email: 'bob@example.com', role: 'member' })
  const bob = await seedUser(db, { email: 'bob@example.com', fullName: 'Bob' })

  await acceptInvitation(db, { invitationId, userId: bob, role: 'member', tenantId: acme.tenantId }, c.now())
  assert.equal((await listMembers(alice)).length, 2)

  await assert.rejects(
    () => acceptInvitation(db, { invitationId, userId: bob, role: 'member', tenantId: acme.tenantId }, c.now()),
    /already been used/,
  )
  await db.close()
})

test('an expired invitation is refused and marked expired', async () => {
  const { db, c, ctxOf, aliceSession, acme } = await twoTenants()
  const alice = await ctxOf(aliceSession.token)
  const { invitationId } = await inviteMember(alice, { email: 'bob@example.com', role: 'member' })
  const bob = await seedUser(db, { email: 'bob@example.com' })
  const late = c.advance(15 * 24 * 60 * 60 * 1000)
  await assert.rejects(
    () => acceptInvitation(db, { invitationId, userId: bob, role: 'member', tenantId: acme.tenantId }, late),
    /expired/,
  )
  const { rows } = await db.query<{ status: string }>('select status from invitations where id = $1', [invitationId])
  assert.equal(rows[0].status, 'expired')
  await db.close()
})

test('a workspace cannot lose its last owner by demotion or removal', async () => {
  const { db, ctxOf, aliceSession } = await twoTenants()
  const alice = await ctxOf(aliceSession.token)
  const ownMembership = (await listMembers(alice))[0].membershipId

  await assert.rejects(() => changeMemberRole(alice, ownMembership, 'member'), /at least one owner/)
  await assert.rejects(() => removeMember(alice, ownMembership), /cannot remove your own membership/)
  assert.equal((await listMembers(alice))[0].role, 'owner')
  await db.close()
})

test('removing a member revokes their sessions for that tenant immediately', async () => {
  const { db, c, ctxOf, aliceSession, acme } = await twoTenants()
  const alice = await ctxOf(aliceSession.token)
  const bob = await seedUser(db, { email: 'bob@example.com' })
  await db.query("insert into memberships (tenant_id, user_id, role) values ($1,$2,'member')", [acme.tenantId, bob])
  const bobSession = await createSession(db, { userId: bob, tenantId: acme.tenantId }, c.now())

  const bobMembership = (await listMembers(alice)).find((m) => m.email === 'bob@example.com')!.membershipId
  await removeMember(alice, bobMembership)

  const { rows } = await db.query<{ revoked_at: Date | null }>('select revoked_at from sessions where id = $1', [
    bobSession.session.id,
  ])
  assert.ok(rows[0].revoked_at, 'their cookie stops working now, not at expiry')
  await db.close()
})

test('a suspended membership loses access without deleting the row', async () => {
  const { db, c, acme, ctxOf } = await twoTenants()
  const bob = await seedUser(db, { email: 'bob@example.com' })
  await db.query("insert into memberships (tenant_id, user_id, role) values ($1,$2,'member')", [acme.tenantId, bob])
  const session = await createSession(db, { userId: bob, tenantId: acme.tenantId }, c.now())
  assert.ok(await ctxOf(session.token))

  await db.query("update memberships set status = 'suspended' where tenant_id = $1 and user_id = $2", [acme.tenantId, bob])
  await assert.rejects(() => ctxOf(session.token), (error: any) => {
    assert.equal(error.status, 403)
    return true
  })
  await db.close()
})

test('audit detail redacts secrets even when a caller passes them', async () => {
  const { db, ctxOf, aliceSession } = await twoTenants()
  const alice = await ctxOf(aliceSession.token)
  const { recordAudit } = await import('../src/server/events/audit.ts')
  await recordAudit(db, alice, {
    action: 'test.redaction',
    resource: 'probe',
    detail: { password: 'hunter2', nested: { apiKey: 'sk-live-123', keep: 'visible' } },
  })
  const { rows } = await db.query<{ detail: any }>("select detail from audit_events where action = 'test.redaction'")
  assert.equal(rows[0].detail.password, '[redacted]')
  assert.equal(rows[0].detail.nested.apiKey, '[redacted]')
  assert.equal(rows[0].detail.nested.keep, 'visible')
  await db.close()
})
