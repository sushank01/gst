import { tenantRoute, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate } from '../../../../../server/http/validate.ts'
import { expenseSummary } from '../../../../../server/services/expenses.ts'

const Query = z.object({ from: isoDate.optional(), to: isoDate.optional() }).strict()

/**
 * The figures behind the Travel & Expense dashboard.
 *
 * Grouped by currency throughout, and summed over every matching claim rather
 * than over a page of them. A figure that cannot be measured — an average
 * turnaround with nothing yet reimbursed — is absent, not reported as zero.
 */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: { summary: await expenseSummary(ctx, parseOrThrow(Query, searchParams(request))) },
}))
