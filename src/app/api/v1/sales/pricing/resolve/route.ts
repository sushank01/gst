import { tenantRoute, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, money, trimmed, uuid } from '../../../../../../server/http/validate.ts'
import { resolvePrice } from '../../../../../../server/services/returns.ts'

const Query = z
  .object({ customerId: uuid, itemCode: trimmed(60), quantity: money, on: isoDate.optional(), listPrice: money.optional() })
  .strict()

/**
 * The price for an item, for this customer, on this day.
 *
 * The highest-priority contract in force wins, then the highest volume break
 * at or below the quantity. With nothing applicable the list price is returned
 * unchanged and `contractId` is null, so the caller can say which it used.
 */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: { price: await resolvePrice(ctx, parseOrThrow(Query, searchParams(request))) },
}))
