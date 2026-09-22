import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, optionalTrimmed, uuid } from '../../../../../server/http/validate.ts'
import { requestOvertime } from '../../../../../server/services/timesheets.ts'

const Body = z
  .object({
    employeeId: uuid,
    workedOn: isoDate,
    minutes: z.coerce.number().int().min(1).max(1440),
    reason: optionalTrimmed(2000),
  })
  .strict()

/** Claims overtime for a day. One live claim per person per day. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { overtime: await requestOvertime(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
