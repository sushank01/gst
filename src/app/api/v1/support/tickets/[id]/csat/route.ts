import { tenantRoute, pathSegment } from '../../../../../../../server/http/handler.ts'
import { sendCsat } from '../../../../../../../server/services/support.ts'

/**
 * Queues one satisfaction survey. A ticket that is not resolved, or that has
 * already been surveyed, answers 200 with `{sent: false}` rather than an error
 * — the caller asked for a state, and that state already holds.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const result = await sendCsat(ctx, pathSegment(request, 1))
  return { body: { sent: result !== null } }
})
