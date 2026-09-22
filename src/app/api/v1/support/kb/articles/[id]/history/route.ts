import { tenantRoute, pathSegment } from '../../../../../../../../server/http/handler.ts'
import { articleHistory } from '../../../../../../../../server/services/knowledge.ts'

/** What this article said before each published edit. */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: { versions: await articleHistory(ctx, pathSegment(request, 1)) },
}))
