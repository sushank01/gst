import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, money, trimmed } from '../../../../../server/http/validate.ts'
import { createLoyaltyProgramme, listLoyaltyProgrammes } from '../../../../../server/services/customers.ts'

const Query = z.object({ includeInactive: z.coerce.boolean().optional() }).strict()

/** Loyalty schemes: how points accrue on a sale and what a point is worth. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { includeInactive } = parseOrThrow(Query, searchParams(request))
  return { body: { programmes: await listLoyaltyProgrammes(ctx, includeInactive) } }
})

const Body = z
  .object({ name: trimmed(80), currency, pointsPerUnit: money.optional(), pointValue: money.optional() })
  .strict()

/** Creates a scheme. A point's value is money, so it carries its own currency. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { programme: await createLoyaltyProgramme(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
