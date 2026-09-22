import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { deleteCalendar } from '../../../../../../server/services/supportConfig.ts'

/** Deletes a calendar. Refused for the default, or while an SLA policy uses it. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await deleteCalendar(ctx, pathSegment(request))
  return { status: 204 }
})
