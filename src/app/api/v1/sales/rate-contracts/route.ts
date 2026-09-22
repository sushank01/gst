import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, money, optionalTrimmed, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { createRateContract, listRateContracts } from '../../../../../server/services/returns.ts'

/** Negotiated prices, highest priority first. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { customerId } = parseOrThrow(z.object({ customerId: uuid.optional() }).strict(), searchParams(request))
  return { body: { contracts: await listRateContracts(ctx, customerId) } }
})

const Line = z
  .object({
    itemCode: trimmed(60),
    unitPrice: money,
    /** The volume break. A line applies at or above this quantity. */
    minQuantity: money.optional(),
    discountPercent: money.optional(),
    description: optionalTrimmed(400),
  })
  .strict()

const Body = z
  .object({
    reference: trimmed(60),
    currency,
    validFrom: isoDate,
    validTo: isoDate.optional(),
    customerId: uuid.optional(),
    groupId: uuid.optional(),
    /** Higher wins when two contracts could apply, so precedence is data. */
    priority: z.coerce.number().int().min(0).max(1000).optional(),
    lines: z.array(Line).min(1).max(1000),
  })
  .strict()

/** Creates a contract for one customer or a whole group. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { contract: await createRateContract(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
