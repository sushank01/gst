import { tenantRoute, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../server/http/validate.ts'
import { listCsat } from '../../../../../server/services/support.ts'

/*
 * Spelt out rather than coerced. `z.coerce.boolean()` reads the string
 * "false" as true, which would turn "show me the ones nobody has reviewed"
 * into its opposite — and the reviewed filter is tri-state, so absent has to
 * stay distinguishable from either answer.
 */
const flag = z.enum(['true', 'false']).transform((value) => value === 'true')

const Query = z
  .object({
    maxScore: z.coerce.number().int().min(1).max(5).optional(),
    reviewed: flag.optional(),
    answeredOnly: flag.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Satisfaction ratings, plus how many resolved tickets are still owed a survey. */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: await listCsat(ctx, parseOrThrow(Query, searchParams(request))),
}))
