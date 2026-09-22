import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../../../server/http/validate.ts'
import { cancelLeave } from '../../../../../../../../server/services/leave.ts'

const Body = z.object({ version: z.coerce.number().int().min(0) }).strict()

/** Cancelling writes a restoration entry; the original deduction stays visible. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(Body, await jsonBody(request))
  return { body: { request: await cancelLeave(ctx, pathSegment(request, 1), version) } }
})
