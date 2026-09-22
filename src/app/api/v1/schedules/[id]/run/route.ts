import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { runScheduleNow } from '../../../../../../server/services/schedules.ts'

/**
 * Runs a schedule now, by enqueuing a real job.
 *
 * A null `jobId` means that instant was already queued — reported honestly
 * rather than as a fresh run. The prototype's equivalent printed a success
 * line and did nothing at all.
 */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: await runScheduleNow(ctx, pathSegment(request, 1)),
}))
