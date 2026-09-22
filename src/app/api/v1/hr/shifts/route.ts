import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed } from '../../../../../server/http/validate.ts'
import { createShift, listShifts } from '../../../../../server/services/attendance.ts'

const Query = z.object({ includeArchived: z.coerce.boolean().optional() }).strict()

/** The work shifts attendance is settled against. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { includeArchived } = parseOrThrow(Query, searchParams(request))
  return { body: { shifts: await listShifts(ctx, includeArchived) } }
})

const Body = z
  .object({
    name: trimmed(120),
    startsMinute: z.coerce.number().int().min(0).max(1440),
    endsMinute: z.coerce.number().int().min(1).max(2880),
    breakMinutes: z.coerce.number().int().min(0).max(1440).optional(),
    graceMinutes: z.coerce.number().int().min(0).max(240).optional(),
    // Empty means every day. 0 is Sunday, matching the stored array.
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(),
  })
  .strict()

/** Defines a shift. Until one exists, late and short hours cannot be computed at all. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { shift: await createShift(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
