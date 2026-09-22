import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { readEmployee } from '../../../../../../server/services/hr.ts'

/** One person, with their current department, designation, location and manager. */
export const GET = tenantRoute(async ({ request, ctx }) => ({ body: { employee: await readEmployee(ctx, pathSegment(request)) } }))
