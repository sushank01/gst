import { tenantRoute, jsonBody, pathSegment } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed } from '../../../../../server/http/validate.ts'
import { deleteSchedule, updateSchedule } from '../../../../../server/services/schedules.ts'

const Patch = z
  .object({
    name: optionalTrimmed(160),
    cron: optionalTrimmed(120),
    timezone: optionalTrimmed(60),
    overlapPolicy: z.enum(['skip', 'queue', 'allow']).optional(),
    active: z.boolean().optional(),
  })
  .strict()

/** Edits a schedule. Changing the expression recomputes the next run. */
export const PATCH = tenantRoute(async ({ request, ctx }) => ({
  body: { schedule: await updateSchedule(ctx, pathSegment(request), parseOrThrow(Patch, await jsonBody(request))) },
}))

/** Removes a schedule. Jobs it already produced keep their own history. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await deleteSchedule(ctx, pathSegment(request))
  return { status: 204 }
})
