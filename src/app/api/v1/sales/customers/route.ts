import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, money, optionalTrimmed, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { createCustomer, listCustomers } from '../../../../../server/services/customers.ts'

const Query = z
  .object({
    q: z.string().trim().max(200).optional(),
    groupId: uuid.optional(),
    activeOnly: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Customers, filtered and paged. The count and the rows always agree. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listCustomers(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { customers: rows, total } }
})

const Body = z
  .object({
    name: trimmed(200),
    currency,
    code: optionalTrimmed(40),
    groupId: uuid.optional(),
    creditLimit: money.optional(),
    paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
    taxId: optionalTrimmed(40),
    taxRegion: optionalTrimmed(40),
    /** An existing CRM account, so one record serves both. */
    partyId: uuid.optional(),
  })
  .strict()

/** Creates a customer, reusing a CRM account when one is named. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { customer: await createCustomer(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
