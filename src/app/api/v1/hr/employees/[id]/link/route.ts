import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, uuid } from '../../../../../../../server/http/validate.ts'
import { linkEmployeeAccount } from '../../../../../../../server/services/hr.ts'

const Body = z.object({ userId: uuid.nullable() }).strict()

/** Connects a login to an employee record, which is what self-service resolves. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { userId } = parseOrThrow(Body, await jsonBody(request))
  const employee = await linkEmployeeAccount(ctx, pathSegment(request, 1), userId)
  return { body: { employee } }
})
