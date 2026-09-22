import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, money, trimmed } from '../../../../../server/http/validate.ts'
import { createTaxCategory, listTaxCategories } from '../../../../../server/services/sales.ts'

/** Named tax slabs, so an item points at a category instead of carrying a loose percentage. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { categories: await listTaxCategories(ctx) } }))

/** One leg of a split — "CGST", 9% — so a slab's components are data, not a sentence. */
const Component = z.object({ name: trimmed(40), percent: money }).strict()

const Body = z
  .object({
    name: trimmed(80),
    ratePercent: money,
    withinRegion: z.array(Component).max(6).optional(),
    crossRegion: z.array(Component).max(6).optional(),
  })
  .strict()

/** Creates a tax slab. Statutory rates are not seeded for you; the rate is whatever you enter. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { category: await createTaxCategory(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
