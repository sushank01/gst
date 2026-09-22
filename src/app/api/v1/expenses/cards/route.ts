import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, money, optionalTrimmed, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { importCardTransactions, unmatchedTransactions } from '../../../../../server/services/expenses.ts'

/** Card transactions that are not yet matched to an expense. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { transactions: await unmatchedTransactions(ctx) } }))

const Line = z
  .object({
    // The provider's own id. Unique per tenant, so re-importing a statement
    // adds nothing rather than doubling every charge on it.
    externalRef: trimmed(200),
    postedOn: isoDate,
    merchant: trimmed(200),
    amount: money,
    currency,
    employeeId: uuid.optional(),
    cardLast4: optionalTrimmed(4),
  })
  .strict()

/** Imports a statement. Re-importing adds nothing: the provider reference is the key. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { lines } = parseOrThrow(z.object({ lines: z.array(Line).min(1).max(2000) }).strict(), await jsonBody(request))
  return { body: await importCardTransactions(ctx, lines) }
})
