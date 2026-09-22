import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, money, optionalTrimmed, trimmed, uuid } from '../../../../../../server/http/validate.ts'
import { recordService } from '../../../../../../server/services/assets.ts'

const Body = z
  .object({
    kind: trimmed(60),
    startedOn: isoDate,
    completedOn: isoDate.optional(),
    vendorPartyId: uuid.optional(),
    cost: money.optional(),
    currency: currency.optional(),
    notes: optionalTrimmed(4000),
  })
  .strict()

/** Records service. An open record takes the asset out of circulation; a completed one returns it. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const asset = await recordService(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request)))
  return { body: { asset } }
})
