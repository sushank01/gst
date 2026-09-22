import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, uuid } from '../../../../../server/http/validate.ts'
import { listReimbursementRuns, runReimbursement } from '../../../../../server/services/expenses.ts'

const Query = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Payout batches, newest first, with what each of them actually paid. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listReimbursementRuns(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { runs: rows, total } }
})

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
