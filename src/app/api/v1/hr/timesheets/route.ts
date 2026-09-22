import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, uuid } from '../../../../../server/http/validate.ts'
import { listTimesheets, openTimesheet } from '../../../../../server/services/timesheets.ts'

const Query = z
  .object({
    employeeId: uuid.optional(),
    managerId: uuid.optional(),
    status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'locked']).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Timesheets, filtered by person and state, counted over the filter. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listTimesheets(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { timesheets: rows, total } }
})

const Body = z.object({ employeeId: uuid, periodStart: isoDate, periodEnd: isoDate }).strict()

/** Opening the same period twice returns the sheet already there. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { timesheet: await openTimesheet(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
