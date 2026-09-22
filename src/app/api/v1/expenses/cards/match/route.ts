import { tenantRoute, jsonBody } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, uuid } from '../../../../../../server/http/validate.ts'
import { matchCardTransaction } from '../../../../../../server/services/expenses.ts'

const Body = z.object({ transactionId: uuid, expenseId: uuid }).strict()

/** One card line to one expense, both ways. That is what makes it reconciled. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  await matchCardTransaction(ctx, input.transactionId, input.expenseId)
  return { status: 204 }
})
