import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, optionalTrimmed, uuid } from '../../../../../server/http/validate.ts'
import { listOvertime, requestOvertime } from '../../../../../server/services/timesheets.ts'

const Query = z
  .object({
    employeeId: uuid.optional(),
    managerId: uuid.optional(),
    status: z.enum(['submitted', 'approved', 'rejected', 'cancelled']).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Overtime claims, filtered by person, state or the day worked. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listOvertime(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { overtime: rows, total } }
})

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
