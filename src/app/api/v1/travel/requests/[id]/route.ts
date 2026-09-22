import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../server/http/validate.ts'
import { cancelTrip, readTrip } from '../../../../../../server/services/travel.ts'

export const GET = tenantRoute(async ({ request, ctx }) => ({ body: { request: await readTrip(ctx, pathSegment(request)) } }))

/** Calls the trip off. Bookings stay on record — they may already have cost money. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(z.object({ version: z.coerce.number().int().min(0) }).strict(), await jsonBody(request))
  return { body: { request: await cancelTrip(ctx, pathSegment(request), version) } }
})
