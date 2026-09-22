import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, isoDateTime } from '../../../../../../server/http/validate.ts'
import { updateActivity } from '../../../../../../server/services/crm.ts'

const Patch = z
  .object({
    version: z.coerce.number().int().min(0),
    subject: optionalTrimmed(200),
    body: optionalTrimmed(4000),
    occursAt: isoDateTime.optional(),
    timezone: optionalTrimmed(60),
    durationMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
    completed: z.boolean().optional(),
    outcome: optionalTrimmed(200),
  })
  .strict()

/** Completes, reschedules or annotates an activity, against the version read. */
export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Patch, await jsonBody(request))
  const activity = await updateActivity(ctx, pathSegment(request), input)
  return { body: { activity } }
})
