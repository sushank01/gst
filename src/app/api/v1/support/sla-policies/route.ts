import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { createSlaPolicy, listSlaPolicies } from '../../../../../server/services/supportConfig.ts'

/** The SLA policies. These set the clocks a ticket is opened with. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { policies: await listSlaPolicies(ctx) } }))

const Body = z
  .object({
    name: trimmed(120),
    calendarId: uuid.optional(),
    /** Which tickets it covers — priority, category, tier. */
    appliesTo: z.record(z.string(), z.unknown()).optional(),
    firstResponseMinutes: z.coerce.number().int().min(1).max(1_000_000).optional(),
    resolutionMinutes: z.coerce.number().int().min(1).max(1_000_000).optional(),
  })
  .strict()

/** Creates one. A policy with neither target is refused: it would set no clock. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { policy: await createSlaPolicy(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
