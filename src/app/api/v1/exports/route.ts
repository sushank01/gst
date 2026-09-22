import { tenantRoute, searchParams } from '../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../server/http/validate.ts'
import { exportCsv } from '../../../../server/services/imports.ts'

const Query = z.object({ kind: z.enum(['customers', 'assets']) }).strict()

/**
 * Exports records as CSV.
 *
 * Any value a spreadsheet would execute is prefixed so it opens as text: a
 * customer named `=cmd|…` must not become a command on whoever opens the file.
 */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { kind } = parseOrThrow(Query, searchParams(request))
  const csv = await exportCsv(ctx, kind)
  return {
    raw: {
      body: new TextEncoder().encode(csv),
      contentType: 'text/csv; charset=utf-8',
      filename: `${kind}-${ctx.now.toISOString().slice(0, 10)}.csv`,
    },
  }
})
