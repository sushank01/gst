import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { removeInventoryField } from '../../../../../../server/services/compliance.ts'

/** Removes a field from the catalogue. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await removeInventoryField(ctx, pathSegment(request))
  return { status: 204 }
})
