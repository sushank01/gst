import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDateTime, money, optionalTrimmed } from '../../../../../../../server/http/validate.ts'
import { addBooking } from '../../../../../../../server/services/travel.ts'

const Body = z
  .object({
    kind: z.enum(['flight', 'train', 'bus', 'hotel', 'car', 'visa', 'other']),
    vendor: optionalTrimmed(200),
    reference: optionalTrimmed(120),
    startsAt: isoDateTime.optional(),
    endsAt: isoDateTime.optional(),
    cost: money.optional(),
    currency: currency.optional(),
  })
  .strict()

/** Refused before the trip is approved — that is what approving is for. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { booking: await addBooking(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request))) },
}))
