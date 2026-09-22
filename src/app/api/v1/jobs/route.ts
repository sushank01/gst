import { tenantRoute, searchParams } from '../../../../server/http/handler.ts'
import { parseOrThrow, z, uuid } from '../../../../server/http/validate.ts'
import { listJobs } from '../../../../server/services/schedules.ts'

const Query = z
  .object({
    status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'dead']).optional(),
    scheduleId: uuid.optional(),
    kind: z.string().trim().max(60).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Queued and finished work, newest first. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listJobs(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { jobs: rows, total } }
})
