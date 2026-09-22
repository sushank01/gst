import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { removeFlow } from '../../../../../../server/services/compliance.ts'

/** Removes a recorded flow. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await removeFlow(ctx, pathSegment(request))
  return { status: 204 }
})
