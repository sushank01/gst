import { tenantRoute, pathSegment, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../server/http/validate.ts'
import { archiveVocabulary } from '../../../../../../server/services/hr.ts'

const Query = z.object({ kind: z.enum(['department', 'designation', 'location']) }).strict()

/** Retires one taxonomy entry. The employees who held it keep their history. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  const { kind } = parseOrThrow(Query, searchParams(request))
  await archiveVocabulary(ctx, kind, pathSegment(request))
  return { status: 204 }
})
