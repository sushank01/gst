import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { archiveTaxCategory } from '../../../../../../server/services/sales.ts'

/**
 * Archives a tax slab rather than deleting it.
 *
 * Posted invoice lines reference the category they were taxed under, and an
 * invoice that can no longer say which slab it used is not evidence of much.
 */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await archiveTaxCategory(ctx, pathSegment(request))
  return { status: 204 }
})
