import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed } from '../../../../../../server/http/validate.ts'
import { returnAsset } from '../../../../../../server/services/assets.ts'

const Body = z.object({ condition: optionalTrimmed(60), note: optionalTrimmed(2000) }).strict()

/** Records a return, closing custody and freeing the asset to be issued again. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const asset = await returnAsset(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request)))
  return { body: { asset } }
})
