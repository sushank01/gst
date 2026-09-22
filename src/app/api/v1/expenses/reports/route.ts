import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { listReports, openReport } from '../../../../../server/services/expenses.ts'

const Query = z
  .object({
    employeeId: uuid.optional(),
    status: z.string().trim().max(40).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Expense claims, filtered by person and state. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listReports(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { reports: rows, total } }
})

const Body = z.object({ employeeId: uuid, title: trimmed(200), currency, travelRequestId: uuid.optional() }).strict()

/** Opens an empty claim for somebody, in one currency. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { report: await openReport(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
