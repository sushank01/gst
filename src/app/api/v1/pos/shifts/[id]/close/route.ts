import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, money, optionalTrimmed } from '../../../../../../../server/http/validate.ts'
import { closeShift } from '../../../../../../../server/services/pos.ts'

const Body = z
  .object({
    // `money` already allows a signed value: a drawer can be counted below
    // zero only as a correction, and the variance then speaks for itself.
    countedCash: money,
    reason: optionalTrimmed(500),
    version: z.coerce.number().int().min(0),
  })
  .strict()

/**
 * Closes the till against a counted amount.
 *
 * The expected figure is computed here from the tenders, so it cannot have
 * drifted from the sales. A variance above the policy threshold is refused
 * without a reason.
 */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: { shift: await closeShift(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request))) },
}))
