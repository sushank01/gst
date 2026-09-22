import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed } from '../../../../../../../server/http/validate.ts'
import { reviewCsat } from '../../../../../../../server/services/support.ts'

const Body = z.object({ note: optionalTrimmed(2000) }).strict()

/** Records that a low score was followed up, which is what takes it off the queue. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { note } = parseOrThrow(Body, await jsonBody(request))
  return { body: { response: await reviewCsat(ctx, pathSegment(request, 1), note) } }
})
