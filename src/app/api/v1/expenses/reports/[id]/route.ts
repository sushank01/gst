import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { readReport } from '../../../../../../server/services/expenses.ts'

/** One claim with its lines. */
export const GET = tenantRoute(async ({ request, ctx }) => ({ body: { report: await readReport(ctx, pathSegment(request)) } }))
