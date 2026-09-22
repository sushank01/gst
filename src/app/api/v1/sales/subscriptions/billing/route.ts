import { tenantRoute, jsonBody } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDateTime } from '../../../../../../server/http/validate.ts'
import { runSubscriptionBilling } from '../../../../../../server/services/sales.ts'

/**
 * Invoices every subscription period that has come due and is not yet billed.
 *
 * Running it eleven times produces one invoice per period, not eleven: each
 * sweep claims the period row before it invoices. The prototype's sweep
 * re-invoiced every active subscription on every click.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { upTo } = parseOrThrow(z.object({ upTo: isoDateTime.optional() }).strict(), await jsonBody(request))
  ctx.require('record.create')
  return { body: await runSubscriptionBilling(ctx, upTo ? new Date(upTo) : ctx.now) }
})
