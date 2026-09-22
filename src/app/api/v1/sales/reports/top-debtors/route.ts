import { tenantRoute, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../server/http/validate.ts'
import { topDebtors } from '../../../../../../server/services/customers.ts'

const Query = z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }).strict()

/** Who owes the most, with what is merely owed separated from what is late. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { limit } = parseOrThrow(Query, searchParams(request))
  return { body: { debtors: await topDebtors(ctx, limit) } }
})
