import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed } from '../../../../../../server/http/validate.ts'
import { archiveFieldOption, updateFieldOption } from '../../../../../../server/services/supportConfig.ts'

const Patch = z
  .object({
    label: optionalTrimmed(120),
    colour: optionalTrimmed(20),
    position: z.coerce.number().int().min(0).max(999).optional(),
    behaviour: z.enum(['active', 'waiting', 'resolved', 'closed']).optional(),
    firstResponseMinutes: z.coerce.number().int().min(1).max(1_000_000).optional(),
    resolutionMinutes: z.coerce.number().int().min(1).max(1_000_000).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict()

/** Renames or retargets an option. Renaming is safe while tickets use it. */
export const PATCH = tenantRoute(async ({ request, ctx }) => ({
  body: { option: await updateFieldOption(ctx, pathSegment(request), parseOrThrow(Patch, await jsonBody(request))) },
}))

/** Archives it — refused while tickets still hold the value. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await archiveFieldOption(ctx, pathSegment(request))
  return { status: 204 }
})
