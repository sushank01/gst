import { tenantRoute, jsonBody, pathSegment, searchParams } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, uuid } from '../../../../../../../server/http/validate.ts'
import { attachExpense, detachExpense } from '../../../../../../../server/services/expenses.ts'

const Body = z.object({ expenseId: uuid }).strict()

/** Files an expense onto the claim. One report per expense, ever. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { expenseId } = parseOrThrow(Body, await jsonBody(request))
  return { body: { report: await attachExpense(ctx, pathSegment(request, 1), expenseId) } }
})

/** Takes an expense off the claim, freeing it to be filed elsewhere. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  const { expenseId } = parseOrThrow(Body, searchParams(request))
  return { body: { report: await detachExpense(ctx, pathSegment(request, 1), expenseId) } }
})
