import { tenantRoute, jsonBody, searchParams } from '../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, optionalTrimmed, trimmed, uuid } from '../../../../server/http/validate.ts'
import { createCompany, listCompanies } from '../../../../server/services/companies.ts'

/**
 * The workspace's legal entities, primary first.
 *
 * The primary one is a real row created with the tenant — the prototype
 * derived it from the organisation name typed at signup, so the entity every
 * document was issued against did not exist in storage.
 */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { includeArchived } = parseOrThrow(
    z.object({ includeArchived: z.coerce.boolean().optional() }).strict(),
    searchParams(request),
  )
  return { body: { companies: await listCompanies(ctx, includeArchived) } }
})

const Body = z
  .object({
    name: trimmed(160),
    code: trimmed(20),
    currency,
    timezone: optionalTrimmed(60),
    country: optionalTrimmed(2),
    taxId: optionalTrimmed(40),
    parentId: uuid.optional(),
  })
  .strict()

/** Adds an entity. Codes are unique per workspace, whatever their case. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { company: await createCompany(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
