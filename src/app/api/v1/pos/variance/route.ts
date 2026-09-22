import { tenantRoute, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate } from '../../../../../server/http/validate.ts'
import { varianceReport } from '../../../../../server/services/pos.ts'

const Query = z.object({ from: isoDate.optional(), to: isoDate.optional() }).strict()

/**
 * Cash variance across closed tills.
 *
 * Reports the worst single shift alongside the average, because a steady small
 * shortfall and one large one are different problems and an average hides the
 * first inside the second.
 */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: await varianceReport(ctx, parseOrThrow(Query, searchParams(request))),
}))
