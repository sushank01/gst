import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, money, optionalTrimmed } from '../../../../../../../server/http/validate.ts'
import { decideReport } from '../../../../../../../server/services/expenses.ts'

const Body = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    version: z.coerce.number().int().min(0),
    note: optionalTrimmed(2000),
    /** An approver may pay less than was claimed; they may not pay more. */
    approvedAmount: money.optional(),
  })
  .strict()

export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: { report: await decideReport(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request))) },
}))
