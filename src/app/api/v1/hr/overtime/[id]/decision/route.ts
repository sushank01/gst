import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../../server/http/validate.ts'
import { decideOvertime } from '../../../../../../../server/services/timesheets.ts'

const Body = z.object({ decision: z.enum(['approved', 'rejected']), version: z.coerce.number().int().min(0) }).strict()

/** Approves or rejects an overtime claim. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: { overtime: await decideOvertime(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request))) },
}))
