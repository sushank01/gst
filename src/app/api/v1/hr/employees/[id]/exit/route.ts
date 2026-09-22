import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, optionalTrimmed, trimmed } from '../../../../../../../server/http/validate.ts'
import { exitEmployee } from '../../../../../../../server/services/hr.ts'

const Body = z
  .object({ exitedOn: isoDate, reason: trimmed(200), note: optionalTrimmed(2000), version: z.coerce.number().int().min(0) })
  .strict()

/** Records the exit. The record itself is kept — their history has to survive them. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const employee = await exitEmployee(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request)))
  return { body: { employee } }
})
