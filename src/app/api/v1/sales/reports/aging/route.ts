import { tenantRoute, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate } from '../../../../../../server/http/validate.ts'
import { agingReport } from '../../../../../../server/services/customers.ts'

const Query = z.object({ asOf: isoDate.optional(), currency: currency.optional() }).strict()

/**
 * Receivables bucketed by how late each invoice is.
 *
 * An invoice with no due date sits in "Not due" rather than being counted as
 * current — inferring terms nobody agreed would age it wrongly.
 */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const asOf = query.asOf ? new Date(`${query.asOf}T00:00:00Z`) : ctx.now
  return { body: await agingReport(ctx, asOf, query.currency) }
})
