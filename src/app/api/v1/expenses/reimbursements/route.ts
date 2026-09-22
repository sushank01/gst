import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, uuid } from '../../../../../server/http/validate.ts'
import { runReimbursement } from '../../../../../server/services/expenses.ts'

const Body = z.object({ currency, reportIds: z.array(uuid).max(500).optional() }).strict()

/**
 * Pays approved claims.
 *
 * Safe to call twice: a report can appear in one reimbursement item ever, so a
 * retried or double-clicked run reports the rest as skipped rather than paying
 * anybody a second time.
 */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: await runReimbursement(ctx, parseOrThrow(Body, await jsonBody(request))),
}))
