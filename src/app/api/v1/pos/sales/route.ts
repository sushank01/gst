import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, money, optionalTrimmed, uuid } from '../../../../../server/http/validate.ts'
import { recordSale } from '../../../../../server/services/pos.ts'

const Tender = z
  .object({
    method: z.enum(['cash', 'card', 'upi', 'voucher', 'loyalty', 'other']),
    amount: money,
    reference: optionalTrimmed(120),
  })
  .strict()

const Body = z
  .object({
    shiftId: uuid,
    total: money,
    currency,
    customerId: uuid.optional(),
    documentId: uuid.optional(),
    tenders: z.array(Tender).min(1, 'A sale needs at least one payment line.').max(10),
  })
  .strict()

/**
 * Records a sale against an open till.
 *
 * The payment lines must add up to the total: a sale whose tenders do not
 * match what was charged cannot be reconciled at close, and the difference
 * surfaces as an unexplained cash variance hours later.
 */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: await recordSale(ctx, parseOrThrow(Body, await jsonBody(request))),
}))
