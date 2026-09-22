import { tenantRoute, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, uuid } from '../../../../../server/http/validate.ts'
import { attendanceAcross } from '../../../../../server/services/attendance.ts'

const Query = z
  .object({
    from: isoDate,
    to: isoDate,
    employeeId: uuid.optional(),
    departmentId: uuid.optional(),
    status: z.enum(['present', 'absent', 'weekly_off', 'holiday', 'leave', 'half_day', 'on_duty']).optional(),
    minOvertimeMinutes: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/**
 * Settled attendance days across the tenant, with the totals for the whole
 * filter rather than for the page — a range total that moved when you paged
 * would be a different number every time it was read.
 */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total, totals } = await attendanceAcross(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { days: rows, total, totals } }
})
