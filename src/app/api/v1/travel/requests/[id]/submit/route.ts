import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../../server/http/validate.ts'
import { submitTrip } from '../../../../../../../server/services/travel.ts'

const Body = z.object({ version: z.coerce.number().int().min(0) }).strict()

/** Submits a trip for approval. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(Body, await jsonBody(request))
  return { body: { request: await submitTrip(ctx, pathSegment(request, 1), version) } }
})
