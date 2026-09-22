import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { setPrimaryCompany } from '../../../../../../server/services/companies.ts'

/**
 * Makes this the primary entity.
 *
 * Both writes happen in one transaction: the index allows exactly one primary,
 * so clearing and setting separately would leave a moment with none.
 */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: { company: await setPrimaryCompany(ctx, pathSegment(request, 1)) },
}))
