import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { assetHistory } from '../../../../../../server/services/assets.ts'

/** The custody and lifecycle chain, newest first. Append-only by construction. */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: { events: await assetHistory(ctx, pathSegment(request, 1)) },
}))
