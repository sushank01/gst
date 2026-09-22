import { tenantRoute, jsonBody, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, uuid } from '../../../../../../server/http/validate.ts'
import { assignShift, listShiftAssignments } from '../../../../../../server/services/attendance.ts'

const Query = z
  .object({
    employeeId: uuid.optional(),
    shiftId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Who is on which shift, and since when. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listShiftAssignments(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { assignments: rows, total } }
})

const Body = z.object({ employeeId: uuid, shiftId: uuid, effectiveFrom: isoDate }).strict()

/** Moves somebody onto a shift, closing the previous assignment the day before. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { assignment: await assignShift(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
