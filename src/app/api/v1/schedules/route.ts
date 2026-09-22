import { tenantRoute, jsonBody } from '../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, trimmed } from '../../../../server/http/validate.ts'
import { createSchedule, listSchedules } from '../../../../server/services/schedules.ts'

/** Every schedule, with its real next run and the next few local occurrences. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { schedules: await listSchedules(ctx) } }))

const Body = z
  .object({
    name: trimmed(160),
    kind: trimmed(60),
    /*
     * Five-field cron plus an IANA zone. Both are validated now rather than at
     * the first dispatch, so a schedule that can never fire is refused while
     * somebody is still looking at it.
     */
    cron: trimmed(120),
    timezone: optionalTrimmed(60),
    targetRef: optionalTrimmed(200),
    payload: z.record(z.string(), z.unknown()).optional(),
    /** What to do when an occurrence is still running. */
    overlapPolicy: z.enum(['skip', 'queue', 'allow']).optional(),
    catchupWindowSeconds: z.coerce.number().int().min(0).max(604_800).optional(),
  })
  .strict()

/** Creates a schedule, refusing an expression that could never fire. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { schedule: await createSchedule(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
