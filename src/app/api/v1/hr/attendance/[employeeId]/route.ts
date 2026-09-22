import { tenantRoute, jsonBody, pathSegment, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate } from '../../../../../../server/http/validate.ts'
import { attendanceBetween, settleDay } from '../../../../../../server/services/attendance.ts'
import { loadDefaultCalendar } from '../../../../../../server/services/calendarStore.ts'

const Query = z.object({ from: isoDate, to: isoDate }).strict()

export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const days = await attendanceBetween(ctx, pathSegment(request), query.from, query.to)
  return { body: { days } }
})

const Body = z.object({ on: isoDate }).strict()

/**
 * Settles one day from its punches. Idempotent — re-settling recomputes the
 * same numbers rather than adding to them — so a retried job is harmless.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { on } = parseOrThrow(Body, await jsonBody(request))
  const day = await settleDay(ctx, pathSegment(request), on, await loadDefaultCalendar(ctx))
  return { body: { day } }
})
