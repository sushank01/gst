import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { appMetrics } from '../../../../../../server/services/reports.ts'

/**
 * The figures behind one application's dashboard tab.
 *
 * Returns only what can be computed from the workspace's own records. A metric
 * that needs data nobody has entered is absent rather than reported as zero,
 * because a measured zero and an absent measurement are different facts.
 */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: { metrics: await appMetrics(ctx, pathSegment(request).toUpperCase()) },
}))
