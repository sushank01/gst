import { tenantRoute, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../server/http/validate.ts'
import { listDealOptions } from '../../../../../../server/services/crm.ts'

const Query = z.object({ limit: z.coerce.number().int().min(1).max(500).optional() }).strict()

/**
 * Deals across every pipeline, for a picker.
 *
 * `GET /crm/deals` answers for one pipeline because a board is a pipeline.
 * An activity is not: it may be about any deal, so choosing a target from the
 * board read left every deal outside the default pipeline unreachable.
 */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  return { body: await listDealOptions(ctx, query.limit) }
})
