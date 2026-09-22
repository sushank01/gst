import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, money, optionalTrimmed, trimmed } from '../../../../../server/http/validate.ts'
import { createCategory, listCategories } from '../../../../../server/services/expenses.ts'

/** Expense categories with the policy columns the flagging engine reads. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { categories: await listCategories(ctx) } }))

const Body = z
  .object({
    name: trimmed(120),
    code: trimmed(40),
    glAccount: optionalTrimmed(60),
    limitAmount: money.optional(),
    /** Required alongside a limit: a cap with no currency cannot be applied. */
    limitCurrency: currency.optional(),
    receiptRequiredAbove: money.optional(),
  })
  .strict()

/** Adds a category. Its code is unique per workspace. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { category: await createCategory(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
