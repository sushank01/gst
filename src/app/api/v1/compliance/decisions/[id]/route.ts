import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { removeAutomatedDecision } from '../../../../../../server/services/compliance.ts'

/** Removes a recorded decision. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await removeAutomatedDecision(ctx, pathSegment(request))
  return { status: 204 }
})
