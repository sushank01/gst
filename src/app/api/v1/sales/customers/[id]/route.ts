import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, money, optionalTrimmed, uuid } from '../../../../../../server/http/validate.ts'
import { readCustomer, updateCustomer } from '../../../../../../server/services/customers.ts'

/** One customer with its commercial terms. */
export const GET = tenantRoute(async ({ request, ctx }) => ({ body: { customer: await readCustomer(ctx, pathSegment(request)) } }))

const Patch = z
  .object({
    version: z.coerce.number().int().min(0),
    // Renaming updates the shared party, so the CRM account follows.
    name: optionalTrimmed(200),
    code: optionalTrimmed(40).nullable().optional(),
    groupId: uuid.nullable().optional(),
    creditLimit: money.nullable().optional(),
    paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
    taxId: optionalTrimmed(40).nullable().optional(),
    taxRegion: optionalTrimmed(40).nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict()

/** Edits a customer. Takes the version last read. */
export const PATCH = tenantRoute(async ({ request, ctx }) => ({
  body: { customer: await updateCustomer(ctx, pathSegment(request), parseOrThrow(Patch, await jsonBody(request))) },
}))
