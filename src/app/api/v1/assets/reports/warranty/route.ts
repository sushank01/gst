import { tenantRoute, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../server/http/validate.ts'
import { warrantyReport } from '../../../../../../server/services/assets.ts'

const Query = z
  .object({
    withinDays: z.coerce.number().int().min(1).max(3650).optional(),
    /** Off for a list of what is about to lapse rather than what already has. */
    includeExpired: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict()

/**
 * Warranties that have run out or are about to, as rows rather than a count.
 *
 * Days left are measured against the server's day, so the list and the tile
 * above it cannot disagree about which assets are inside the window.
 */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: await warrantyReport(ctx, parseOrThrow(Query, searchParams(request))),
}))
