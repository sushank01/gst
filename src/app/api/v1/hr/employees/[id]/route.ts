import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { readEmployee } from '../../../../../../server/services/hr.ts'

export const GET = tenantRoute(async ({ request, ctx }) => ({ body: { employee: await readEmployee(ctx, pathSegment(request)) } }))
