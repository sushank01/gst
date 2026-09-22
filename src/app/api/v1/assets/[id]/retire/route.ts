import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, money, optionalTrimmed, trimmed } from '../../../../../../server/http/validate.ts'
import { retireAsset } from '../../../../../../server/services/assets.ts'

const Body = z
  .object({
    reason: trimmed(200),
    method: optionalTrimmed(60),
    proceeds: money.optional(),
    currency: currency.optional(),
    retiredOn: isoDate,
    note: optionalTrimmed(2000),
  })
  .strict()

/** Once per asset, and never while it is still out with someone. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const asset = await retireAsset(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request)))
  return { body: { asset } }
})
