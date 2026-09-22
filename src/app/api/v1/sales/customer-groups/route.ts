import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, money, trimmed } from '../../../../../server/http/validate.ts'
import { createCustomerGroup, listCustomerGroups } from '../../../../../server/services/customers.ts'

/** The segments a customer may belong to, with how many customers are in each. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { groups: await listCustomerGroups(ctx) } }))

const Body = z.object({ name: trimmed(80), discountPercent: money.optional() }).strict()

/** Creates a segment. Names are unique per workspace, so a report cannot split one group in two. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { group: await createCustomerGroup(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
