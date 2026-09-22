import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, trimmed } from '../../../../../server/http/validate.ts'
import { createFieldOption, listFieldOptions } from '../../../../../server/services/supportConfig.ts'

const Field = z.enum(['status', 'priority', 'category', 'type', 'channel'])

/** The tenant's own ticket vocabularies. These are read by the SLA engine. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { field } = parseOrThrow(z.object({ field: Field.optional() }).strict(), searchParams(request))
  return { body: { options: await listFieldOptions(ctx, field) } }
})

const Body = z
  .object({
    field: Field,
    slug: trimmed(60),
    label: trimmed(120),
    colour: optionalTrimmed(20),
    position: z.coerce.number().int().min(0).max(999).optional(),
    /*
     * For a status, what the engine should do with it. Required, and checked
     * against what the engine understands: a behaviour outside that set would
     * be stored and then ignored, leaving tickets in a state no clock, report
     * or filter knows how to treat.
     */
    behaviour: z.enum(['active', 'waiting', 'resolved', 'closed']).optional(),
    firstResponseMinutes: z.coerce.number().int().min(1).max(1_000_000).optional(),
    resolutionMinutes: z.coerce.number().int().min(1).max(1_000_000).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict()

/** Adds an option. One default per field; setting a new one clears the old. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { option: await createFieldOption(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
