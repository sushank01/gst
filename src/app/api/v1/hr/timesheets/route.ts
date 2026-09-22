import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, uuid } from '../../../../../server/http/validate.ts'
import { openTimesheet } from '../../../../../server/services/timesheets.ts'

const Query = z
  .object({
    employeeId: uuid.optional(),
    status: z.string().trim().max(40).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict()

/** Timesheets, filtered by person and state. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  ctx.require('record.read')
  const query = parseOrThrow(Query, searchParams(request))
  const filters = ['tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  if (query.employeeId) {
    params.push(query.employeeId)
    filters.push(`employee_id = $${params.length}`)
  }
  if (query.status) {
    params.push(query.status)
    filters.push(`status = $${params.length}`)
  }
  params.push(Math.min(query.limit ?? 50, 200))
  const where = filters.join(' and ')
  const { rows } = await ctx.db.query(
    `select id, employee_id, period_start, period_end, status, total_minutes, version
       from hr_timesheets where ${where} order by period_start desc limit $${params.length}`,
    params as never[],
  )
  return { body: { timesheets: rows } }
})

const Body = z.object({ employeeId: uuid, periodStart: isoDate, periodEnd: isoDate }).strict()

/** Opening the same period twice returns the sheet already there. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { timesheet: await openTimesheet(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
