import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../../../server/http/validate.ts'
import { publishArticle, unpublishArticle } from '../../../../../../../../server/services/knowledge.ts'

const Body = z.object({ version: z.coerce.number().int().min(0) }).strict()

/** Publishes the article, recording which version became public. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(Body, await jsonBody(request))
  return { body: { article: await publishArticle(ctx, pathSegment(request, 1), version) } }
})

/** Takes it back out of every outside view. It stays visible to the team. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(Body, await jsonBody(request))
  return { body: { article: await unpublishArticle(ctx, pathSegment(request, 1), version) } }
})
