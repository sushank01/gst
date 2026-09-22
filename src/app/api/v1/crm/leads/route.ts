import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, optionalTrimmed } from '../../../../../server/http/validate.ts'
import { createLead, listLeads } from '../../../../../server/services/crm.ts'

const Query = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.string().trim().max(60).optional(),
    source: z.string().trim().max(60).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    includeArchived: z.coerce.boolean().optional(),
  })
  .strict()

export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const { rows, total } = await listLeads(ctx, {
    query: query.q,
    status: query.status,
    source: query.source,
    limit: query.limit,
    offset: query.offset,
    includeArchived: query.includeArchived,
  })
  return { body: { leads: rows, total } }
})

const Body = z
  .object({
    name: trimmed(160),
    email: z.string().trim().email('Enter a valid email address.').optional().or(z.literal('')),
    phone: optionalTrimmed(40),
    company: optionalTrimmed(160),
    status: optionalTrimmed(60),
    source: optionalTrimmed(60),
    score: z.coerce.number().int().min(0).max(100).optional(),
    notes: optionalTrimmed(4000),
  })
  .strict()

export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const lead = await createLead(ctx, { ...input, email: input.email || null })
  return { status: 201, body: { lead } }
})
