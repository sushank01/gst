import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, money, optionalTrimmed, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { recordPayment } from '../../../../../server/services/sales.ts'

const Body = z
  .object({
    customerId: uuid,
    amount: money,
    currency,
    method: trimmed(40),
    receivedOn: isoDate,
    allocations: z.array(z.object({ documentId: uuid, amount: money }).strict()).max(100),
    /*
     * Supplied by the caller and enforced by a unique index. A retried request
     * returns the original payment instead of taking the money twice.
     */
    idempotencyKey: optionalTrimmed(120),
    providerRef: optionalTrimmed(120),
  })
  .strict()

export const POST = tenantRoute(async ({ request, ctx }) => {
  const result = await recordPayment(ctx, parseOrThrow(Body, await jsonBody(request)))
  return { status: result.duplicate ? 200 : 201, body: result }
})
