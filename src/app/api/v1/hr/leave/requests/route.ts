import { tenantRoute, jsonBody, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, optionalTrimmed, uuid } from '../../../../../../server/http/validate.ts'
import { listLeaveRequests, requestLeave } from '../../../../../../server/services/leave.ts'
import { loadDefaultCalendar } from '../../../../../../server/services/calendarStore.ts'
import { selfEmployee } from '../../../../../../server/services/hr.ts'
import { notFound } from '../../../../../../server/http/errors.ts'

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
  const { rows, total } = await listLeaveRequests(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { requests: rows, total } }
})

const Body = z
  .object({
    employeeId: uuid.optional(),
    leaveTypeId: uuid,
    startsOn: isoDate,
    endsOn: isoDate,
    halfDay: z.boolean().optional(),
    reason: optionalTrimmed(2000),
  })
  .strict()

/**
 * Books leave. Without `employeeId` it books the caller's own; with one it is
 * somebody booking on another person's behalf, which needs the create right.
 *
 * The day count comes from the working calendar, so a week spanning a public
 * holiday costs four days rather than five.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))

  let employeeId = input.employeeId
  if (!employeeId) {
    const self = await selfEmployee(ctx)
    if (!self) throw notFound('Your employee record')
    employeeId = self.id
  }

  const leave = await requestLeave(ctx, { ...input, employeeId }, await loadDefaultCalendar(ctx))
  return { status: 201, body: { request: leave } }
})
