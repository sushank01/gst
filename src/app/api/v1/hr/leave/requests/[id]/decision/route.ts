import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed } from '../../../../../../../../server/http/validate.ts'
import { decideLeave } from '../../../../../../../../server/services/leave.ts'

const Body = z
  .object({ decision: z.enum(['approved', 'rejected']), version: z.coerce.number().int().min(0), note: optionalTrimmed(2000) })
  .strict()

/** Approving twice deducts once: the ledger entry's key is the request id. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: { request: await decideLeave(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request))) },
}))
