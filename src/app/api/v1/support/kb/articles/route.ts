import { tenantRoute, jsonBody, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, trimmed, uuid } from '../../../../../../server/http/validate.ts'
import { createArticle, listArticles } from '../../../../../../server/services/knowledge.ts'

const Query = z
  .object({
    q: z.string().trim().max(200).optional(),
    categoryId: uuid.optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    /*
     * Who is reading. `internal` is the agent view; anything else sees only
     * published articles at or below that visibility, enforced in the query.
     * A `status` parameter cannot widen an outside reader's view.
     */
    audience: z.enum(['internal', 'portal', 'public']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Knowledge-base articles for one audience. A draft never reaches an outside one. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listArticles(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { articles: rows, total } }
})

const Body = z
  .object({
    title: trimmed(240),
    body: z.string().max(200_000).optional(),
    slug: optionalTrimmed(120),
    categoryId: uuid.optional(),
    visibility: z.enum(['internal', 'portal', 'public']).optional(),
  })
  .strict()

/** Creates an article as a draft. Publishing it is a separate, deliberate act. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { article: await createArticle(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
