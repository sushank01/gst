import { tenantRoute, pathSegment } from '../../../../../../../server/http/handler.ts'
import { employmentHistory } from '../../../../../../../server/services/hr.ts'

/** Every position held, newest first. Appended to, never rewritten. */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: { positions: await employmentHistory(ctx, pathSegment(request, 1)) },
}))
