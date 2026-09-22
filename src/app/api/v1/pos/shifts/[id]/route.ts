import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { readShift } from '../../../../../../server/services/pos.ts'

/** One till with its totals, summed from the sale tenders rather than stored. */
export const GET = tenantRoute(async ({ request, ctx }) => ({ body: { shift: await readShift(ctx, pathSegment(request)) } }))
