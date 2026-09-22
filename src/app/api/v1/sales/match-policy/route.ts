import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDateTime, money } from '../../../../../server/http/validate.ts'
import { readMatchPolicy, writeMatchPolicy } from '../../../../../server/services/sales.ts'

/**
 * How strictly an invoice must agree with its order and delivery note.
 *
 * `updatedAt` is null when no policy has been saved: the figures returned are
 * then the defaults on display, and nothing is enforced until somebody saves.
 */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { policy: await readMatchPolicy(ctx) } }))

const Action = z.enum(['warn', 'block', 'ignore'])

const Body = z
  .object({
    priceTolerancePercent: money,
    priceAction: Action,
    quantityTolerancePercent: money,
    quantityAction: Action,
    requireOrder: z.boolean(),
    requireDelivery: z.boolean(),
    /** The timestamp last read. Null means "there was no policy yet". */
    updatedAt: isoDateTime.nullable(),
  })
  .strict()

/**
 * Saves the policy, and it takes effect at the next post.
 *
 * The write carries the timestamp it read, so a second admin editing the same
 * page gets a conflict instead of quietly replacing the first one's thresholds.
 */
export const PUT = tenantRoute(async ({ request, ctx }) => ({
  body: { policy: await writeMatchPolicy(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
