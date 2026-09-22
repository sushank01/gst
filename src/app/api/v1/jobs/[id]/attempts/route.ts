import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { jobAttempts } from '../../../../../../server/services/schedules.ts'

/**
 * Every attempt at this job.
 *
 * The job row keeps only the latest error; these rows keep all of them, so a
 * job that failed three different ways can be diagnosed.
 */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: { attempts: await jobAttempts(ctx, pathSegment(request, 1)) },
}))
