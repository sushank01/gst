import { tenantRoute, jsonBody, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed } from '../../../../../../server/http/validate.ts'
import { archiveLead, restoreLead, updateLead } from '../../../../../../server/services/crm.ts'

const idOf = (request: Request) => {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

const Patch = z
  .object({
    version: z.coerce.number().int().min(0),
    name: optionalTrimmed(160),
    email: z.string().trim().email().optional().or(z.literal('')),
    phone: optionalTrimmed(40),
    company: optionalTrimmed(160),
    status: optionalTrimmed(60),
    source: optionalTrimmed(60),
    score: z.coerce.number().int().min(0).max(100).optional(),
    notes: optionalTrimmed(4000),
    restore: z.boolean().optional(),
  })
  .strict()

/** Edits a lead, or restores an archived one. */
export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Patch, await jsonBody(request))
  if (input.restore) {
    await restoreLead(ctx, idOf(request))
    return { status: 204 }
  }
  const lead = await updateLead(ctx, idOf(request), { ...input, email: input.email || undefined })
  return { body: { lead } }
})

/** Archive, not delete — the record is part of a deal's history. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  const version = parseOrThrow(z.object({ version: z.coerce.number().int().min(0) }).strict(), searchParams(request))
  await archiveLead(ctx, idOf(request), version.version)
  return { status: 204 }
})
