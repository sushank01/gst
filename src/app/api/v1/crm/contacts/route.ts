import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, optionalTrimmed } from '../../../../../server/http/validate.ts'
import { createParty, listParties } from '../../../../../server/services/crm.ts'

const Query = z
  .object({
    q: z.string().trim().max(200).optional(),
    type: z.string().trim().max(60).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    includeArchived: z.coerce.boolean().optional(),
  })
  .strict()

/** People, filtered and paged. The total counts matching rows, not the page. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const { rows, total } = await listParties(ctx, 'person', {
    query: query.q,
    partyType: query.type,
    limit: query.limit,
    offset: query.offset,
    includeArchived: query.includeArchived,
  })
  return { body: { contacts: rows, total } }
})

const Body = z
  .object({
    name: trimmed(160),
    email: z.string().trim().email('Enter a valid email address.').optional().or(z.literal('')),
    phone: optionalTrimmed(40),
    company: optionalTrimmed(160),
    type: optionalTrimmed(60),
    notes: optionalTrimmed(4000),
  })
  .strict()

/** Adds a person, linking their employer by id rather than storing a typed name. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const contact = await createParty(ctx, 'person', {
    name: input.name,
    email: input.email || null,
    phone: input.phone,
    company: input.company,
    partyType: input.type,
    notes: input.notes,
  })
  return { status: 201, body: { contact } }
})
