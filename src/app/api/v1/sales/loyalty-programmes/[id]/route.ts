import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { deactivateLoyaltyProgramme } from '../../../../../../server/services/customers.ts'

/**
 * Withdraws a scheme by deactivating it.
 *
 * The points customers already accrued point at the programme that granted
 * them; deleting the row would leave a balance nobody can explain.
 */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await deactivateLoyaltyProgramme(ctx, pathSegment(request))
  return { status: 204 }
})
