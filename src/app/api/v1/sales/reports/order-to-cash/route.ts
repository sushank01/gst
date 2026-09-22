import { tenantRoute, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate } from '../../../../../../server/http/validate.ts'
import { orderToCash } from '../../../../../../server/services/customers.ts'

const Query = z.object({ from: isoDate, to: isoDate }).strict()

/** The funnel by document kind. Only posted documents count; a draft is not revenue. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  return { body: await orderToCash(ctx, query.from, query.to) }
})
