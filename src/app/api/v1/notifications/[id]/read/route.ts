import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { markRead } from '../../../../../../server/services/notifications.ts'

/** Marks one read. Idempotent — reading twice keeps the first timestamp. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: await markRead(ctx, pathSegment(request, 1)),
}))
