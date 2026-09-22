import { tenantRoute, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, uuid } from '../../../../../server/http/validate.ts'
import { listEmployeeDocuments } from '../../../../../server/services/hr.ts'

const Query = z
  .object({
    employeeId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Employee documents held by HR, with the expiry date each one carries. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listEmployeeDocuments(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { documents: rows, total } }
})
