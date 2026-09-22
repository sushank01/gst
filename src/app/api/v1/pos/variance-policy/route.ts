import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDateTime, money } from '../../../../../server/http/validate.ts'
import { readVariancePolicy, writeVariancePolicy } from '../../../../../server/services/pos.ts'

/**
 * The drawer thresholds the till itself enforces.
 *
 * These live in their own table rather than in app settings because closing a
 * shift reads `reasonRequiredAbove` from it — a figure saved anywhere else
 * would appear on the settings screen and change nothing at the drawer.
 */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { policy: await readVariancePolicy(ctx) } }))

const Body = z
  .object({
    reasonRequiredAbove: money,
    amberWorstShift: money,
    redWorstShift: money,
    amberAverage: money,
    redAverage: money,
    /** The timestamp last read. Null means "there was no policy yet". */
    updatedAt: isoDateTime.nullable(),
  })
  .strict()

/** Saves the thresholds. Red must be at least amber, for the worst shift and the average alike. */
export const PUT = tenantRoute(async ({ request, ctx }) => ({
  body: { policy: await writeVariancePolicy(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
