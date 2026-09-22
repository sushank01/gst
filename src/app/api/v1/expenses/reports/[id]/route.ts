import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { readReport } from '../../../../../../server/services/expenses.ts'

export const GET = tenantRoute(async ({ request, ctx }) => ({ body: { report: await readReport(ctx, pathSegment(request)) } }))
