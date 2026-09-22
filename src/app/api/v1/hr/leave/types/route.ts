import { tenantRoute, jsonBody } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, money, trimmed } from '../../../../../../server/http/validate.ts'
import { createLeaveType } from '../../../../../../server/services/leave.ts'
import { listVocabulary } from '../../../../../../server/services/hr.ts'

/** The leave types, with the departments every leave screen filters by. */
export const GET = tenantRoute(async ({ ctx }) => {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{ id: string; name: string; code: string }>(
    'select id, name, code from hr_leave_types where tenant_id = $1 and archived_at is null order by name',
    [ctx.tenantId],
  )
  // Departments ride along because every leave screen filters by them.
  return { body: { leaveTypes: rows, departments: await listVocabulary(ctx, 'department') } }
})

const Body = z
  .object({
    name: trimmed(120),
    code: trimmed(20),
    accrualDays: money.optional(),
    accrualPeriod: z.enum(['monthly', 'quarterly', 'yearly', 'none']).optional(),
    maxBalanceDays: money.optional(),
    allowNegative: z.boolean().optional(),
    requiresApproval: z.boolean().optional(),
    countsWeekends: z.boolean().optional(),
    countsHolidays: z.boolean().optional(),
  })
  .strict()

/** Defines a leave type and how it accrues. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { leaveType: await createLeaveType(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
