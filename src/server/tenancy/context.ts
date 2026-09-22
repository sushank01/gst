import type { Db } from '../db/client.ts'
import { forbidden, notFound, unauthorized } from '../http/errors.ts'
import { resolveSession, type ResolvedSession } from '../auth/session.ts'
import { isRole, roleHas, type Permission, type Role } from './permissions.ts'

/**
 * The single authorization path.
 *
 * Every request handler builds a context here and every service takes one. A
 * service never receives a bare tenant id from the caller, so "which tenant am
 * I acting in" can only be answered by the session — not by a request body, a
 * query string or a header a client controls.
 */

export type AuthContext = {
  db: Db
  now: Date
  requestId: string
  session: ResolvedSession
  userId: string
}

export type TenantContext = AuthContext & {
  tenantId: string
  role: Role
  /** Optional company narrowing inside the tenant. Null means tenant-wide. */
  companyId: string | null
  can: (permission: Permission) => boolean
  require: (permission: Permission) => void
}

/** The only place a tenant id is allowed to enter a query. */
export type TenantScope = { tenantId: string; companyId?: string | null }

export const scopeOf = (ctx: TenantContext): TenantScope => ({ tenantId: ctx.tenantId, companyId: ctx.companyId })

export async function authenticate(
  db: Db,
  token: string | undefined | null,
  options: { now: Date; requestId: string },
): Promise<AuthContext> {
  const session = await resolveSession(db, token, options.now)
  if (!session) throw unauthorized()
  return { db, now: options.now, requestId: options.requestId, session, userId: session.userId }
}

/**
 * Binds the tenant from the session's membership. A suspended membership is
 * treated as absent, so removing someone takes effect on their next request
 * rather than at cookie expiry.
 */
export async function withTenant(auth: AuthContext, requestedTenantId?: string | null): Promise<TenantContext> {
  const tenantId = requestedTenantId ?? auth.session.tenantId
  if (!tenantId) throw forbidden('Choose a workspace first.')

  // If a caller names a tenant, it must still be one they belong to — the
  // lookup is by (tenant, user), never by tenant alone.
  const { rows } = await auth.db.query<{ role: string; status: string; tenant_status: string }>(
    `select m.role, m.status, t.status as tenant_status
       from memberships m
       join tenants t on t.id = m.tenant_id
      where m.tenant_id = $1 and m.user_id = $2`,
    [tenantId, auth.userId],
  )
  const row = rows[0]
  if (!row || row.status !== 'active') throw forbidden('You do not have access to this workspace.')
  if (row.tenant_status !== 'active') throw forbidden('This workspace is not active.')
  if (!isRole(row.role)) throw forbidden('Your role is not recognised.')

  const role = row.role
  const can = (permission: Permission) => roleHas(role, permission)
  return {
    ...auth,
    tenantId,
    role,
    companyId: null,
    can,
    require(permission: Permission) {
      if (!can(permission)) throw forbidden(`Your role (${role}) cannot ${permission.replace('.', ' ')}.`)
    },
  }
}

/** Narrows to one company, verifying it belongs to the session's tenant. */
export async function withCompany(ctx: TenantContext, companyId: string | null): Promise<TenantContext> {
  if (!companyId) return { ...ctx, companyId: null }
  const { rows } = await ctx.db.query<{ id: string }>(
    'select id from companies where id = $1 and tenant_id = $2 and archived_at is null',
    [companyId, ctx.tenantId],
  )
  // 404 rather than 403: a company in another tenant must be indistinguishable
  // from one that does not exist.
  if (!rows[0]) throw notFound('That company')
  return { ...ctx, companyId }
}

/**
 * Guard for any query that reaches business data. Services call this instead of
 * accepting a tenant id parameter, so an accidental `tenantId: undefined`
 * becomes a thrown error rather than a query with no tenant predicate.
 */
export function assertScope(scope: TenantScope): TenantScope {
  if (!scope?.tenantId || typeof scope.tenantId !== 'string') {
    throw new Error('Refusing to run a business query without a tenant scope.')
  }
  return scope
}
