import { tenantRoute, jsonBody, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, money, trimmed, uuid } from '../../../../../../server/http/validate.ts'
import { listLeaveEntries, recordLeaveEntry } from '../../../../../../server/services/leave.ts'

const Kind = z.enum(['grant', 'adjustment', 'encashment', 'lapse'])

const Query = z
  .object({
    employeeId: uuid.optional(),
    leaveTypeId: uuid.optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    kind: Kind.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** The balance ledger across employees — grants, adjustments and encashments. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listLeaveEntries(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { entries: rows, total } }
})

const Body = z
  .object({
    employeeId: uuid,
    leaveTypeId: uuid,
    year: z.coerce.number().int().min(2000).max(2100),
    // Days are a decimal string end to end: half days are real, and a float
    // that has been through JSON is not the number that was typed.
    days: money,
    reason: trimmed(200),
    kind: Kind.optional(),
  })
  .strict()

/**
 * Writes one ledger entry. Idempotent per (kind, employee, type, year, reason),
 * so a repeated submission does not grant the days twice.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { recorded } = await recordLeaveEntry(ctx, parseOrThrow(Body, await jsonBody(request)))
  return { status: recorded ? 201 : 200, body: { recorded } }
})
