import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../../server/http/validate.ts'
import { postDocument } from '../../../../../../../server/services/sales.ts'

/**
 * Posting is one-way and idempotent: posting an already-posted document
 * returns the original timestamp rather than re-posting it, because the
 * accounting effect must happen exactly once.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(z.object({ version: z.coerce.number().int().min(0) }).strict(), await jsonBody(request))
  return { body: await postDocument(ctx, pathSegment(request, 1), version) }
})
