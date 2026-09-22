import { tenantRoute, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, uuid } from '../../../../../server/http/validate.ts'
import { lifecycleChanges } from '../../../../../server/services/hr.ts'

const Query = z
  .object({
    kind: z.enum(['promotion', 'transfer']).optional(),
    employeeId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Promotions and transfers with what each one changed from. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await lifecycleChanges(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { changes: rows, total } }
})
