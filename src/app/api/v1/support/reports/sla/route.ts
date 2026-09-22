import { tenantRoute, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate } from '../../../../../../server/http/validate.ts'
import { slaCompliance } from '../../../../../../server/services/support.ts'

const Query = z.object({ from: isoDate.optional(), to: isoDate.optional() }).strict()

/** SLA compliance by priority. The two targets are counted from their own clocks. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { from, to } = parseOrThrow(Query, searchParams(request))
  const rows = await slaCompliance(ctx, {
    from: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
    // `to` is inclusive on screen, so the window runs to the end of that day.
    to: to ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000) : undefined,
  })
  return { body: { rows } }
})
