import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, uuid } from '../../../../../../../server/http/validate.ts'
import { assignTicket } from '../../../../../../../server/services/support.ts'

// `null` unassigns; the service refuses a user outside the workspace either way.
const Body = z.object({ userId: uuid.nullable(), version: z.coerce.number().int().min(0) }).strict()

/** Assigns or unassigns a ticket. Somebody outside the workspace is refused. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  await assignTicket(ctx, pathSegment(request, 1), input.userId, input.version)
  return { status: 204 }
})
