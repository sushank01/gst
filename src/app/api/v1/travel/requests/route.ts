import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, money, optionalTrimmed, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { createTrip, listTrips } from '../../../../../server/services/travel.ts'

const Query = z
  .object({
    employeeId: uuid.optional(),
    status: z.string().trim().max(40).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listTrips(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { requests: rows, total } }
})

const Body = z
  .object({
    employeeId: uuid,
    purpose: trimmed(400),
    destination: trimmed(200),
    departsOn: isoDate,
    returnsOn: isoDate,
    tripKind: z.enum(['domestic', 'international']).optional(),
    origin: optionalTrimmed(200),
    estimatedCost: money.optional(),
    currency: currency.optional(),
    projectCode: optionalTrimmed(60),
    budgetHead: optionalTrimmed(60),
    advanceRequested: money.optional(),
  })
  .strict()

export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { request: await createTrip(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
