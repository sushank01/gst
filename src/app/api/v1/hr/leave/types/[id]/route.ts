import { tenantRoute, pathSegment } from '../../../../../../../server/http/handler.ts'
import { archiveLeaveType } from '../../../../../../../server/services/leave.ts'

/** Retires a leave type. Archived, not deleted — the balances rest on its entries. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await archiveLeaveType(ctx, pathSegment(request))
  return { status: 204 }
})
