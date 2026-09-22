import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { cancelQueuedJob } from '../../../../../../server/services/schedules.ts'

/**
 * Cancels a queued job.
 *
 * A running job holds a lease and is refused: cancelling it would leave a
 * worker writing results for something the screen says is cancelled.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  await cancelQueuedJob(ctx, pathSegment(request, 1))
  return { status: 204 }
})
