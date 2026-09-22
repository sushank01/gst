import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, money, optionalTrimmed, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { importCardTransactions, listCardTransactions } from '../../../../../server/services/expenses.ts'

const Query = z
  .object({
    /** Omit for every line; `true`/`false` for the reconciled or the unreconciled ones. */
    matched: z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Card transactions, with whether each is reconciled against an expense. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const { rows, total } = await listCardTransactions(ctx, {
    matched: query.matched === undefined ? undefined : query.matched === 'true',
    limit: query.limit,
    offset: query.offset,
  })
  return { body: { transactions: rows, total } }
})

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
