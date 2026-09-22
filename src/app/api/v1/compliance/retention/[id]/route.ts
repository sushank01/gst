import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { removeRetentionPolicy } from '../../../../../../server/services/compliance.ts'

/** Removes a recorded retention policy. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await removeRetentionPolicy(ctx, pathSegment(request))
  return { status: 204 }
})
