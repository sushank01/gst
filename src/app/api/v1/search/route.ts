import { tenantRoute, searchParams } from '../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../server/http/validate.ts'
import { search } from '../../../../server/services/reports.ts'

const Query = z
  .object({ q: z.string().trim().min(2, 'Type at least two characters.').max(200), perKind: z.coerce.number().int().min(1).max(20).optional() })
  .strict()

/** Searches leads, tickets, documents, people and assets at once, inside this workspace only. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  return { body: { results: await search(ctx, query.q, query.perKind) } }
})
