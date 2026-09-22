import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate } from '../../../../../../../server/http/validate.ts'
import { confirmEmployee } from '../../../../../../../server/services/hr.ts'

const Body = z.object({ confirmedOn: isoDate, version: z.coerce.number().int().min(0) }).strict()

/** Confirms somebody out of probation. Once. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const employee = await confirmEmployee(ctx, pathSegment(request, 1), input.confirmedOn, input.version)
  return { body: { employee } }
})
