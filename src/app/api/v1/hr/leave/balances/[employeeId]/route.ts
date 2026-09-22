import { tenantRoute, pathSegment, searchParams } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, uuid } from '../../../../../../../server/http/validate.ts'
import { leaveBalances, leaveLedger } from '../../../../../../../server/services/leave.ts'

const Query = z
  .object({ year: z.coerce.number().int().min(2000).max(2100).optional(), leaveTypeId: uuid.optional() })
  .strict()

/**
 * Balances, computed from the ledger on every read.
 *
 * With a `leaveTypeId` the entries come too, so the number can always be
 * explained rather than just asserted.
 */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const employeeId = pathSegment(request)
  const year = query.year ?? ctx.now.getUTCFullYear()
  return {
    body: {
      year,
      balances: await leaveBalances(ctx, employeeId, year),
      ledger: query.leaveTypeId ? await leaveLedger(ctx, employeeId, query.leaveTypeId, year) : null,
    },
  }
})
