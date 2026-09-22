import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, money } from '../../../../../../server/http/validate.ts'
import { updateCategory } from '../../../../../../server/services/expenses.ts'

/*
 * Every field is nullable as well as optional: an omitted key leaves the column
 * alone, an explicit null clears it. Without the distinction there is no way to
 * remove a limit once one has been set.
 */
const Body = z
  .object({
    glAccount: z.string().trim().max(60).nullable().optional(),
    limitAmount: money.nullable().optional(),
    limitCurrency: currency.nullable().optional(),
    receiptRequiredAbove: money.nullable().optional(),
  })
  .strict()

/** Changes one category's ledger account and policy limits. */
export const PATCH = tenantRoute(async ({ request, ctx }) => ({
  body: { category: await updateCategory(ctx, pathSegment(request), parseOrThrow(Body, await jsonBody(request))) },
}))
