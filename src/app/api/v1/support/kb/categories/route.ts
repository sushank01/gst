import { tenantRoute, jsonBody } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, trimmed } from '../../../../../../server/http/validate.ts'
import { createCategory, listCategories } from '../../../../../../server/services/knowledge.ts'

/** The knowledge-base categories, in their configured order. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { categories: await listCategories(ctx) } }))

const Body = z
  .object({ name: trimmed(120), slug: optionalTrimmed(120), position: z.coerce.number().int().min(0).max(999).optional() })
  .strict()

/** Adds a category. A slug that collides is refused rather than suffixed. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { category: await createCategory(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
