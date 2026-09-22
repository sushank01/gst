import { tenantRoute, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate } from '../../../../../../server/http/validate.ts'
import { exportTicketsCsv } from '../../../../../../server/services/support.ts'

const Query = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    status: z.string().trim().max(60).optional(),
    priority: z.string().trim().max(60).optional(),
  })
  .strict()

/**
 * Tickets as CSV, over the same filters the list uses. Anything a spreadsheet
 * would execute is neutralised before it reaches the file.
 */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { from, to, status, priority } = parseOrThrow(Query, searchParams(request))
  const csv = await exportTicketsCsv(ctx, {
    status,
    priority,
    createdFrom: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
    createdTo: to ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000) : undefined,
  })
  return {
    raw: {
      body: new TextEncoder().encode(csv),
      contentType: 'text/csv; charset=utf-8',
      filename: `tickets-${ctx.now.toISOString().slice(0, 10)}.csv`,
    },
  }
})
