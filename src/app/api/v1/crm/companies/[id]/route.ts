import { tenantRoute, jsonBody, searchParams, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed } from '../../../../../../server/http/validate.ts'
import { archiveParty, restoreParty, updateParty } from '../../../../../../server/services/crm.ts'

const Patch = z
  .object({
    version: z.coerce.number().int().min(0),
    name: optionalTrimmed(160),
    industry: optionalTrimmed(120),
    website: optionalTrimmed(300),
    employees: z.coerce.number().int().min(0).max(10_000_000).optional(),
    type: optionalTrimmed(60),
    email: z.string().trim().email().optional().or(z.literal('')),
    phone: optionalTrimmed(40),
    notes: optionalTrimmed(4000),
    restore: z.boolean().optional(),
  })
  .strict()

/** Edits an account against the version it was read at, or restores an archived one. */
export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Patch, await jsonBody(request))
  if (input.restore) {
    await restoreParty(ctx, 'organisation', pathSegment(request))
    return { status: 204 }
  }
  const company = await updateParty(ctx, 'organisation', pathSegment(request), {
    version: input.version,
    name: input.name,
    industry: input.industry,
    website: input.website,
    employeeCount: input.employees ?? null,
    partyType: input.type,
    email: input.email || undefined,
    phone: input.phone,
    notes: input.notes,
  })
  return { body: { company } }
})

/** Archive, not delete — the deals that name this account still need it to resolve. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(z.object({ version: z.coerce.number().int().min(0) }).strict(), searchParams(request))
  await archiveParty(ctx, 'organisation', pathSegment(request), version)
  return { status: 204 }
})
