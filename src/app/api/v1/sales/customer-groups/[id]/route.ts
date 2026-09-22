import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { archiveCustomerGroup } from '../../../../../../server/services/customers.ts'

/**
 * Archives a segment rather than erasing it.
 *
 * Customers point at their group, so deleting the row would silently unsegment
 * every customer in it. The unique index already ignores archived rows, so the
 * name is free to use again.
 */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await archiveCustomerGroup(ctx, pathSegment(request))
  return { status: 204 }
})
