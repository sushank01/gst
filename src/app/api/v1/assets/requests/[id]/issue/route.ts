import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, uuid } from '../../../../../../../server/http/validate.ts'
import { issueAgainstRequest } from '../../../../../../../server/services/assets.ts'

const Body = z.object({ assetId: uuid, version: z.coerce.number().int().min(0), dueBackOn: isoDate.optional() }).strict()

/**
 * Hands the asset over and closes the request together.
 *
 * A request left reading "approved" after the asset went out is one somebody
 * issues a second time.
 */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: await issueAgainstRequest(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request))),
}))
