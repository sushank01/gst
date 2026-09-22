import { tenantRoute, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../server/http/validate.ts'
import { stockSummary } from '../../../../../../server/services/assets.ts'

const Query = z.object({ groupBy: z.enum(['type', 'location', 'status']) }).strict()

/**
 * Stock by type, location or status.
 *
 * Count and value are separate: an asset with no recorded cost is counted but
 * adds nothing, so a half-priced register is not mistaken for a half-empty one.
 */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { groupBy } = parseOrThrow(Query, searchParams(request))
  return { body: { lines: await stockSummary(ctx, groupBy) } }
})
