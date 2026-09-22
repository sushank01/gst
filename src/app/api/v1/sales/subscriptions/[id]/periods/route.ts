import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate } from '../../../../../../../server/http/validate.ts'
import { scheduleSubscriptionPeriods } from '../../../../../../../server/services/sales.ts'

const Body = z
  .object({
    /** First period start. Defaults to today. */
    starts: isoDate.optional(),
    count: z.coerce.number().int().min(1).max(120),
    cadenceDays: z.coerce.number().int().min(1).max(366).optional(),
  })
  .strict()

/**
 * Schedules the periods a subscription will be billed for.
 *
 * The billing sweep bills periods, not subscriptions — that is what stops it
 * re-invoicing on every run — so a subscription with no periods is never
 * invoiced at all. Running this twice for the same dates creates nothing
 * further: the unique index on (subscription, period start) absorbs it.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const created = await scheduleSubscriptionPeriods(
    ctx,
    pathSegment(request, 1),
    input.starts ? new Date(`${input.starts}T00:00:00Z`) : ctx.now,
    input.count,
    input.cadenceDays,
  )
  return { status: 201, body: { created } }
})
