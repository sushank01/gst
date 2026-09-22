import type { TenantContext } from '../tenancy/context.ts'

/**
 * The read side of the audit trail.
 *
 * `src/server/events/audit.ts` is write-only by design — there is no update or
 * delete path in it, and this module adds none. Reading is a separate concern
 * with a separate permission: `audit.read` belongs to admins and owners, so a
 * member asking for this gets a refusal rather than a table that happens to be
 * empty for them.
 *
 * Filtering, searching and paging happen in SQL. The prototype loaded the whole
 * array into the browser and filtered it there, which means the figure beside
 * the pager was the size of whatever had been loaded rather than the number of
 * matching events.
 *
 * `detail` is deliberately not returned. It is redacted on the way in, but it
 * still holds the before-and-after of business records; the trail answers who
 * did what to which record, and a column nothing renders is a copy of that data
 * on a second screen for no reason.
 */

export type AuditRow = {
  id: string
  occurredAt: string
  /** 'user' for a person, otherwise the machine that acted: job, system, portal. */
  actorKind: string
  actorUserId: string | null
  actorEmail: string | null
  actorName: string | null
  /** The actor's role in THIS workspace. Null for a machine, or a removed member. */
  actorRole: string | null
  action: string
  resource: string
  resourceId: string | null
  outcome: string
  requestId: string | null
}

export type AuditSort = 'occurredAt' | 'action' | 'resource' | 'outcome' | 'actor'

export type AuditFilters = {
  action?: string
  resource?: string
  outcome?: 'success' | 'failure' | 'denied'
  from?: string
  to?: string
  q?: string
  sort?: AuditSort
  direction?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export type AuditPage = {
  rows: AuditRow[]
  /** Events matching the filter, not the length of this page. */
  total: number
  /** The values that actually occur in this workspace, for the filter menus. */
  facets: { actions: string[]; resources: string[] }
}

type Raw = {
  id: string
  occurred_at: Date | string
  actor_kind: string
  actor_user_id: string | null
  email: string | null
  full_name: string | null
  role: string | null
  action: string
  resource: string
  resource_id: string | null
  outcome: string
  request_id: string | null
}

const map = (row: Raw): AuditRow => ({
  id: String(row.id),
  occurredAt: new Date(row.occurred_at).toISOString(),
  actorKind: row.actor_kind,
  actorUserId: row.actor_user_id,
  actorEmail: row.email,
  actorName: row.full_name,
  actorRole: row.role,
  action: row.action,
  resource: row.resource,
  resourceId: row.resource_id,
  outcome: row.outcome,
  requestId: row.request_id,
})

/*
 * Sortable columns, by name rather than by string. An order-by assembled from
 * whatever the client sent is an injection; an allowlist is the only reason
 * this interpolation is safe.
 */
const SORTS: Record<AuditSort, string> = {
  occurredAt: 'e.occurred_at',
  action: 'e.action',
  resource: 'e.resource',
  outcome: 'e.outcome',
  actor: 'lower(coalesce(u.email, e.actor_kind))',
}

const FROM = `from audit_events e
     left join users u on u.id = e.actor_user_id
     left join memberships m on m.user_id = e.actor_user_id and m.tenant_id = e.tenant_id`

export async function listAuditEvents(ctx: TenantContext, filters: AuditFilters = {}): Promise<AuditPage> {
  ctx.require('audit.read')

  const where = ['e.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    where.push(clause.replace('$?', `$${params.length}`))
  }

  if (filters.action) add('e.action = $?', filters.action)
  if (filters.resource) add('e.resource = $?', filters.resource)
  if (filters.outcome) add('e.outcome = $?', filters.outcome)
  if (filters.from) add('e.occurred_at >= $?', new Date(filters.from))
  if (filters.to) add('e.occurred_at <= $?', new Date(filters.to))
  if (filters.q?.trim()) {
    params.push(`%${filters.q.trim().toLowerCase()}%`)
    const index = params.length
    where.push(`(lower(coalesce(u.email, '')) like $${index}
                 or lower(coalesce(u.full_name, '')) like $${index}
                 or lower(e.action) like $${index}
                 or lower(e.resource) like $${index}
                 or lower(coalesce(e.resource_id, '')) like $${index})`)
  }
  const predicate = where.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n ${FROM} where ${predicate}`,
    params as never[],
  )

  /*
   * Both halves of the order are chosen here, not received: the column is the
   * allowlist's value for the requested name (a miss falls back rather than
   * putting `undefined` in the statement), and the direction is narrowed to one
   * of two words. They are joined into a clause the way every composed fragment
   * in this codebase is — an order-by assembled from a caller's string is an
   * injection, and `tests/sql.test.ts` holds that line.
   *
   * The id breaks ties: two events in the same millisecond must not swap places
   * between pages, which would show one of them twice and hide the other.
   */
  const direction = filters.direction === 'asc' ? 'asc' : 'desc'
  const orderParts = [SORTS[filters.sort as AuditSort] ?? SORTS.occurredAt, direction, ', e.id', direction]
  const order = orderParts.join(' ')
  params.push(Math.min(Math.max(filters.limit ?? 50, 1), 500), Math.max(filters.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Raw>(
    `select e.id::text as id, e.occurred_at, e.actor_kind, e.actor_user_id, u.email, u.full_name, m.role,
            e.action, e.resource, e.resource_id, e.outcome, e.request_id
       ${FROM}
      where ${predicate}
      order by ${order}
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )

  return {
    rows: rows.map(map),
    total: Number(counted[0].n),
    facets: await facetsFor(ctx),
  }
}

/**
 * The distinct actions and resources this workspace has actually recorded.
 *
 * Taken from the whole trail rather than the current page: once the table is
 * paged, a menu built from the loaded rows offers whichever handful of values
 * page one happened to contain, and filtering to anything else looks empty.
 */
async function facetsFor(ctx: TenantContext): Promise<{ actions: string[]; resources: string[] }> {
  const { rows } = await ctx.db.query<{ kind: string; value: string }>(
    `select 'action' as kind, action as value from audit_events where tenant_id = $1
      union
     select 'resource' as kind, resource as value from audit_events where tenant_id = $1
      order by kind, value`,
    [ctx.tenantId],
  )
  return {
    actions: rows.filter((row) => row.kind === 'action').map((row) => row.value),
    resources: rows.filter((row) => row.kind === 'resource').map((row) => row.value),
  }
}
