import { tenantRoute, pathSegment, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../server/http/validate.ts'
import { listSettingsChanges } from '../../../../../../server/services/settings.ts'

const Query = z
  .object({ section: z.string().trim().max(60).optional(), limit: z.coerce.number().int().min(1).max(200).optional() })
  .strict()

export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const changes = await listSettingsChanges(ctx, pathSegment(request, 1), query.section, query.limit)
  return { body: { changes } }
})
