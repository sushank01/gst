import { tenantRoute, jsonBody, searchParams, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed } from '../../../../../../server/http/validate.ts'
import { archiveParty, restoreParty, updateParty } from '../../../../../../server/services/crm.ts'

const Patch = z
  .object({
    version: z.coerce.number().int().min(0),
    name: optionalTrimmed(160),
    email: z.string().trim().email().optional().or(z.literal('')),
    phone: optionalTrimmed(40),
    company: optionalTrimmed(160),
    type: optionalTrimmed(60),
    notes: optionalTrimmed(4000),
    restore: z.boolean().optional(),
  })
  .strict()

/** Edits a contact against the version it was read at, or restores an archived one. */
export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Patch, await jsonBody(request))
  if (input.restore) {
    await restoreParty(ctx, 'person', pathSegment(request))
    return { status: 204 }
  }
  const contact = await updateParty(ctx, 'person', pathSegment(request), {
    version: input.version,
    name: input.name,
    email: input.email || undefined,
    phone: input.phone,
    company: input.company,
    partyType: input.type,
    notes: input.notes,
  })
  return { body: { contact } }
})

/** Archive, not delete — leads, deals and activities still refer to this person. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(z.object({ version: z.coerce.number().int().min(0) }).strict(), searchParams(request))
  await archiveParty(ctx, 'person', pathSegment(request), version)
  return { status: 204 }
})
