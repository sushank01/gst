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

/** Accounts, filtered and paged. The total counts matching rows, not the page. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const { rows, total } = await listParties(ctx, 'organisation', {
    query: query.q,
    partyType: query.type,
    limit: query.limit,
    offset: query.offset,
    includeArchived: query.includeArchived,
  })
  return { body: { companies: rows, total } }
})

const Body = z
  .object({
    name: trimmed(160),
    industry: optionalTrimmed(120),
    website: optionalTrimmed(300),
    employees: z.coerce.number().int().min(0).max(10_000_000).optional(),
    type: optionalTrimmed(60),
    email: z.string().trim().email('Enter a valid email address.').optional().or(z.literal('')),
    phone: optionalTrimmed(40),
    notes: optionalTrimmed(4000),
  })
  .strict()

/** Adds an account. Every field here is a real column on `parties`. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const company = await createParty(ctx, 'organisation', {
    name: input.name,
    industry: input.industry,
    website: input.website,
    employeeCount: input.employees ?? null,
    partyType: input.type,
    email: input.email || null,
    phone: input.phone,
    notes: input.notes,
  })
  return { status: 201, body: { company } }
})
