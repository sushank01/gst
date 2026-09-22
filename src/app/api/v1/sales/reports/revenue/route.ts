import { tenantRoute, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate } from '../../../../../../server/http/validate.ts'
import { revenueSeries } from '../../../../../../server/services/customers.ts'

const Query = z
  .object({
    from: isoDate,
    to: isoDate,
    bucket: z.enum(['day', 'month']).optional(),
    currency: currency.optional(),
  })
  .strict()

/**
 * Posted invoice value over time, bucketed by day or by month.
 *
 * Money in two currencies is never added together: one currency is reported
 * and the rest are named, so a chart can say what it is leaving out instead of
 * summing dollars into rupees.
 */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: await revenueSeries(ctx, parseOrThrow(Query, searchParams(request))),
}))
