import type { Db } from '../db/client.ts'
import { conflict, forbidden, notFound } from '../http/errors.ts'
import { randomSlug, INVITE_TTL_MS, issueToken } from '../auth/service.ts'
import { enqueue } from '../events/outbox.ts'
import { recordAudit } from '../events/audit.ts'
import type { TenantContext } from '../tenancy/context.ts'
import type { Role } from '../tenancy/permissions.ts'

/**
 * Tenant, company and membership lifecycle.
 *
 * Everything that creates a tenant does so in one transaction with its first
 * company, its owner membership and its audit row. A half-created tenant whose
 * wizard says "complete" is the failure mode this exists to prevent.
 */

export type CreateTenantInput = {
  name: string
  companyName?: string
  currency?: string
  timezone?: string
}

export type CreatedTenant = { tenantId: string; companyId: string; slug: string }

export async function createTenantWithOwner(
  db: Db,
  userId: string,
  input: CreateTenantInput,
  now: Date,
  requestId: string,
): Promise<CreatedTenant> {
  const name = input.name.trim()
  const currency = (input.currency ?? 'USD').toUpperCase()
  const timezone = input.timezone ?? 'UTC'

  return db.transaction(async (tx) => {
    // Retry the slug rather than failing the whole signup on a rare collision.
    let slug = randomSlug(name)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { rows } = await tx.query('select 1 from tenants where lower(slug) = lower($1)', [slug])
      if (!rows.length) break
      slug = randomSlug(name)
    }

    const { rows: tenantRows } = await tx.query<{ id: string }>(
      'insert into tenants (name, slug, currency, timezone) values ($1, $2, $3, $4) returning id',
      [name, slug, currency, timezone],
    )
    const tenantId = tenantRows[0].id

    const { rows: companyRows } = await tx.query<{ id: string }>(
      `insert into companies (tenant_id, name, code, currency, timezone, is_primary)
       values ($1, $2, 'HQ', $3, $4, true) returning id`,
      [tenantId, (input.companyName ?? name).trim(), currency, timezone],
    )

    await tx.query("insert into memberships (tenant_id, user_id, role) values ($1, $2, 'owner')", [tenantId, userId])

    await tx.query(
      // `resource_id` is text and `tenant_id` is uuid, so the same value needs
      // two placeholders — PostgreSQL refuses to deduce two types for one.
      `insert into audit_events (tenant_id, company_id, actor_user_id, actor_kind, action, resource, resource_id, detail, request_id, occurred_at)
       values ($1, $2, $3, 'user', 'tenant.created', 'tenant', $4, $5, $6, $7)`,
      [tenantId, companyRows[0].id, userId, tenantId, JSON.stringify({ name, slug }), requestId, now],
    )

    return { tenantId, companyId: companyRows[0].id, slug }
  })
}

export type TenantSummary = { id: string; name: string; slug: string; role: Role; currency: string }

export async function listTenantsForUser(db: Db, userId: string): Promise<TenantSummary[]> {
  const { rows } = await db.query<{ id: string; name: string; slug: string; role: Role; currency: string }>(
    `select t.id, t.name, t.slug, m.role, t.currency
       from memberships m join tenants t on t.id = m.tenant_id
      where m.user_id = $1 and m.status = 'active' and t.status = 'active'
      order by t.name`,
    [userId],
  )
  return rows
}

/**
 * Locks this tenant's owner rows and returns how many there are.
 *
 * The rows themselves are locked — `count(*) ... for update` is not valid SQL,
 * and would not have given the guarantee anyway. Two concurrent demotions of
 * the last two owners now serialise here instead of both reading "2".
 */
async function lockOwners(tx: Db, tenantId: string): Promise<number> {
  const { rows } = await tx.query<{ id: string }>(
    "select id from memberships where tenant_id = $1 and role = 'owner' and status = 'active' for update",
    [tenantId],
  )
  return rows.length
}

/* -------------------------------- members -------------------------------- */

export type MemberRow = {
  membershipId: string
  userId: string
  email: string
  fullName: string
  role: Role
  status: string
  lastLoginAt: Date | null
}

export async function listMembers(ctx: TenantContext): Promise<MemberRow[]> {
  ctx.require('member.read')
  const { rows } = await ctx.db.query<{
    membership_id: string
    user_id: string
    email: string
    full_name: string
    role: Role
    status: string
    last_login_at: Date | null
  }>(
    `select m.id as membership_id, u.id as user_id, u.email, u.full_name, m.role, m.status, u.last_login_at
       from memberships m join users u on u.id = m.user_id
      where m.tenant_id = $1
      order by u.full_name`,
    [ctx.tenantId],
  )
  return rows.map((row) => ({
    membershipId: row.membership_id,
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
  }))
}

/**
 * Creates an invitation and queues its delivery in one transaction, so the
 * "invited" state in the UI always corresponds to a message that will be sent.
 */
export async function inviteMember(
  ctx: TenantContext,
  input: { email: string; role: Role },
): Promise<{ invitationId: string; token: string }> {
  ctx.require('member.invite')
  if (input.role === 'owner') ctx.require('tenant.manage')

  return ctx.db.transaction(async (tx) => {
    const { rows: already } = await tx.query(
      `select 1 from memberships m join users u on u.id = m.user_id
        where m.tenant_id = $1 and lower(u.email) = lower($2)`,
      [ctx.tenantId, input.email],
    )
    if (already.length) throw conflict('That person is already a member of this workspace.')

    const { rows } = await tx.query<{ id: string }>(
      `insert into invitations (tenant_id, email, role, invited_by, expires_at)
       values ($1, $2, $3, $4, $5)
       on conflict (tenant_id, lower(email)) where status = 'pending'
       do update set role = excluded.role, invited_by = excluded.invited_by,
                     expires_at = excluded.expires_at, updated_at = now()
       returning id`,
      [ctx.tenantId, input.email.trim(), input.role, ctx.userId, new Date(ctx.now.getTime() + INVITE_TTL_MS)],
    )
    const invitationId = rows[0].id

    const token = await issueToken(tx, {
      purpose: 'invitation',
      tenantId: ctx.tenantId,
      email: input.email.trim(),
      payload: { invitationId, role: input.role },
      ttlMs: INVITE_TTL_MS,
      now: ctx.now,
    })

    await enqueue(tx, {
      tenantId: ctx.tenantId,
      topic: 'invitation.send',
      payload: { invitationId, email: input.email.trim(), role: input.role, token },
      idempotencyKey: `invitation:${invitationId}`,
    }, ctx.now)

    await recordAudit(tx, ctx, {
      action: 'member.invited',
      resource: 'invitation',
      resourceId: invitationId,
      detail: { email: input.email.trim(), role: input.role },
    })

    return { invitationId, token }
  })
}

/**
 * Role changes, guarded so a workspace cannot lose its last owner.
 *
 * The owner count is read `for update` inside the transaction: two admins
 * demoting the last two owners concurrently must not both see "there is
 * another owner" and both succeed.
 */
export async function changeMemberRole(ctx: TenantContext, membershipId: string, role: Role): Promise<void> {
  ctx.require('member.manage')
  if (role === 'owner') ctx.require('tenant.manage')

  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ user_id: string; role: Role }>(
      'select user_id, role from memberships where id = $1 and tenant_id = $2 for update',
      [membershipId, ctx.tenantId],
    )
    const target = rows[0]
    if (!target) throw notFound('That member')
    if (target.role === role) return

    if (target.role === 'owner' && (await lockOwners(tx, ctx.tenantId)) <= 1) {
      throw conflict('A workspace must keep at least one owner.')
    }

    await tx.query('update memberships set role = $2, updated_at = $3 where id = $1', [membershipId, role, ctx.now])
    await recordAudit(tx, ctx, {
      action: 'member.role_changed',
      resource: 'membership',
      resourceId: membershipId,
      detail: { from: target.role, to: role, userId: target.user_id },
    })
  })
}

export async function removeMember(ctx: TenantContext, membershipId: string): Promise<void> {
  ctx.require('member.remove')
  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ user_id: string; role: Role }>(
      'select user_id, role from memberships where id = $1 and tenant_id = $2 for update',
      [membershipId, ctx.tenantId],
    )
    const target = rows[0]
    if (!target) throw notFound('That member')
    if (target.user_id === ctx.userId) throw forbidden('You cannot remove your own membership.')
    if (target.role === 'owner' && (await lockOwners(tx, ctx.tenantId)) <= 1) {
      throw conflict('A workspace must keep at least one owner.')
    }
    await tx.query('delete from memberships where id = $1', [membershipId])
    // Ending their sessions for this tenant is part of removal, not a follow-up.
    await tx.query('update sessions set revoked_at = $3 where user_id = $1 and tenant_id = $2 and revoked_at is null', [
      target.user_id,
      ctx.tenantId,
      ctx.now,
    ])
    await recordAudit(tx, ctx, {
      action: 'member.removed',
      resource: 'membership',
      resourceId: membershipId,
      detail: { userId: target.user_id, role: target.role },
    })
  })
}

export async function acceptInvitation(
  db: Db,
  input: { invitationId: string; userId: string; role: Role; tenantId: string },
  now: Date,
): Promise<void> {
  /*
   * The expiry sweep runs before, and outside, the accepting transaction.
   * Marking the row expired *inside* a transaction that then throws rolls the
   * mark back, leaving it 'pending' forever — a bug the tests caught.
   */
  await db.query(
    `update invitations set status = 'expired', updated_at = $3
      where id = $1 and tenant_id = $2 and status = 'pending' and expires_at <= $3`,
    [input.invitationId, input.tenantId, now],
  )

  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ status: string; expires_at: Date }>(
      'select status, expires_at from invitations where id = $1 and tenant_id = $2 for update',
      [input.invitationId, input.tenantId],
    )
    const invitation = rows[0]
    if (!invitation) throw notFound('That invitation')
    if (invitation.status === 'expired') throw conflict('That invitation has expired.')
    if (invitation.status !== 'pending') throw conflict('That invitation has already been used.')
    await tx.query(
      `insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)
       on conflict (tenant_id, user_id) do update set status = 'active', updated_at = now()`,
      [input.tenantId, input.userId, input.role],
    )
    await tx.query("update invitations set status = 'accepted', accepted_by = $2, accepted_at = $3, updated_at = $3 where id = $1", [
      input.invitationId,
      input.userId,
      now,
    ])
  })
}
