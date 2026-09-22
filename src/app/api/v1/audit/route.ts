import { tenantRoute, searchParams } from '../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDateTime, optionalTrimmed } from '../../../../server/http/validate.ts'
import { listAuditEvents } from '../../../../server/services/audit.ts'

const Query = z
  .object({
    action: optionalTrimmed(120),
    resource: optionalTrimmed(120),
    outcome: z.enum(['success', 'failure', 'denied']).optional(),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
    q: optionalTrimmed(200),
    sort: z.enum(['occurredAt', 'action', 'resource', 'outcome', 'actor']).optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/**
 * The workspace's audit trail: who did what, to which record, and whether it
 * succeeded. Admins and owners only, and it never leaves the workspace.
 *
 * The response carries the total for the filter and the values that actually
 * occur in this trail, so the count beside the pager and the filter menus both
 * describe the whole trail rather than the page in front of the reader.
 */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: await listAuditEvents(ctx, parseOrThrow(Query, searchParams(request))),
}))
