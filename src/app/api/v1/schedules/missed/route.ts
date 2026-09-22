import { tenantRoute, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../server/http/validate.ts'
import { missedRuns } from '../../../../../server/services/schedules.ts'

/**
 * Occurrences that were not run, and why.
 *
 * Recorded rather than silently skipped: a schedule that quietly missed a
 * night is indistinguishable from one that ran and did nothing.
 */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { limit } = parseOrThrow(z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }).strict(), searchParams(request))
  return { body: { missed: await missedRuns(ctx, limit) } }
})
