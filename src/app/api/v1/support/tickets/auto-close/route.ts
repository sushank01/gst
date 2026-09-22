import { tenantRoute } from '../../../../../../server/http/handler.ts'
import { autoCloseResolved } from '../../../../../../server/services/support.ts'

/**
 * Closes resolved tickets that have sat past the survey window. Each one goes
 * through the normal transition, so its clocks and its history are the same as
 * if an agent had closed it.
 */
export const POST = tenantRoute(async ({ ctx }) => ({ body: await autoCloseResolved(ctx) }))
