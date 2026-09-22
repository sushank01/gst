import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed } from '../../../../../../../server/http/validate.ts'
import { decideAssetRequest } from '../../../../../../../server/services/assets.ts'

const Body = z
  .object({ decision: z.enum(['approved', 'rejected']), version: z.coerce.number().int().min(0), note: optionalTrimmed(2000) })
  .strict()

/** Records one decision. Each level is decidable exactly once. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: { request: await decideAssetRequest(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request))) },
}))
