import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, trimmed } from '../../../../../server/http/validate.ts'
import { addInventoryField, listInventory } from '../../../../../server/services/compliance.ts'

/** Your own catalogue of where personal data lives. Empty until you write it. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { fields: await listInventory(ctx) } }))

const Body = z
  .object({
    entity: trimmed(120),
    field: trimmed(120),
    category: z.enum(['basic', 'contact', 'identifier', 'location', 'behavioural', 'special_category']),
    sensitive: z.boolean().optional(),
    legalBasis: trimmed(120),
    retention: optionalTrimmed(200),
    notes: optionalTrimmed(2000),
  })
  .strict()

/** Catalogues one field. The same field twice is refused: a duplicate reads as a second purpose. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { field: await addInventoryField(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
