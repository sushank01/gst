import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, trimmed, uuid } from '../../../../../../../server/http/validate.ts'
import { transferEmployee } from '../../../../../../../server/services/hr.ts'

/*
 * `null` means "clear this", which is different from leaving the field out —
 * so each is nullable AND optional, and the service treats undefined as
 * "unchanged". Collapsing the two would make it impossible to remove a manager.
 */
const Body = z
  .object({
    effectiveFrom: isoDate,
    departmentId: uuid.nullable().optional(),
    designationId: uuid.nullable().optional(),
    locationId: uuid.nullable().optional(),
    managerId: uuid.nullable().optional(),
    employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern', 'consultant']).nullable().optional(),
    reason: trimmed(200),
    version: z.coerce.number().int().min(0),
  })
  .strict()

/** Moves somebody. Closes the open position and opens the next, so the history is kept. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const employee = await transferEmployee(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request)))
  return { body: { employee } }
})
