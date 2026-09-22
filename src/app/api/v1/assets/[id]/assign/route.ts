import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, optionalTrimmed, uuid } from '../../../../../../server/http/validate.ts'
import { assignAsset } from '../../../../../../server/services/assets.ts'

const Body = z
  .object({
    holderUserId: uuid.optional(),
    holderPartyId: uuid.optional(),
    holderLabel: optionalTrimmed(160),
    dueBackOn: isoDate.optional(),
  })
  .strict()

/** Issues the asset. An asset already out is a 409, never a silent handover. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const asset = await assignAsset(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request)))
  return { body: { asset } }
})
