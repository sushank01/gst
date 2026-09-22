import { tenantRoute, jsonBody, pathSegment, searchParams } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, uuid } from '../../../../../../../server/http/validate.ts'
import { readArticle, recordArticleView, updateArticle } from '../../../../../../../server/services/knowledge.ts'

const Query = z.object({ countView: z.coerce.boolean().optional() }).strict()

/** One article. `countView=true` records a read; an editor previewing does not. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { countView } = parseOrThrow(Query, searchParams(request))
  const id = pathSegment(request)
  if (countView) await recordArticleView(ctx, id)
  return { body: { article: await readArticle(ctx, id) } }
})

const Patch = z
  .object({
    version: z.coerce.number().int().min(0),
    title: optionalTrimmed(240),
    body: z.string().max(200_000).optional(),
    categoryId: uuid.optional(),
    visibility: z.enum(['internal', 'portal', 'public']).optional(),
  })
  .strict()

/** Edits an article. A published one keeps its previous text as a version. */
export const PATCH = tenantRoute(async ({ request, ctx }) => ({
  body: { article: await updateArticle(ctx, pathSegment(request), parseOrThrow(Patch, await jsonBody(request))) },
}))
