import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Append-only audit.
 *
 * The actor is taken from the server context, never from a request body, and
 * there is no update or delete path in this module — the only way to change
 * history would be raw SQL, which the runtime database role should not be
 * granted. Detail is redacted before it is written, because an audit row is
 * exactly the place a password or token would survive a log-scrubbing policy.
 */

export type AuditOutcome = 'success' | 'failure' | 'denied'

export type AuditInput = {
  action: string
  resource: string
  resourceId?: string | null
  outcome?: AuditOutcome
  detail?: Record<string, unknown>
  companyId?: string | null
}

/** Keys whose values are never written, at any depth. */
const SECRET_KEYS =
  /^(password|new_?password|current_?password|token|secret|api_?key|access_?token|refresh_?token|authorization|cookie|client_?secret|private_?key|credential|ssn|card_?number|cvv)$/i

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]'
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEYS.test(key) ? '[redacted]' : redact(item, depth + 1)
    }
    return out
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`
  return value
}

export async function recordAudit(db: Db, ctx: TenantContext, input: AuditInput): Promise<void> {
  await db.query(
    `insert into audit_events
       (tenant_id, company_id, actor_user_id, actor_kind, action, resource, resource_id, outcome, detail, request_id, ip, occurred_at)
     values ($1, $2, $3, 'user', $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      ctx.tenantId,
      input.companyId ?? ctx.companyId,
      ctx.userId,
      input.action,
      input.resource,
      input.resourceId ?? null,
      input.outcome ?? 'success',
      JSON.stringify(redact(input.detail ?? {})),
      ctx.requestId,
      ctx.session ? null : null,
      ctx.now,
    ],
  )
}

/** For the scheduler, dispatchers and webhook receivers, which have no user. */
export async function recordSystemAudit(
  db: Db,
  input: AuditInput & { tenantId: string | null; actorKind?: 'system' | 'job' | 'integration' | 'portal'; now: Date; requestId?: string },
): Promise<void> {
  await db.query(
    `insert into audit_events
       (tenant_id, company_id, actor_kind, action, resource, resource_id, outcome, detail, request_id, occurred_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.tenantId,
      input.companyId ?? null,
      input.actorKind ?? 'system',
      input.action,
      input.resource,
      input.resourceId ?? null,
      input.outcome ?? 'success',
      JSON.stringify(redact(input.detail ?? {})),
      input.requestId ?? null,
      input.now,
    ],
  )
}
