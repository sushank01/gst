import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, money, trimmed } from '../../../../../server/http/validate.ts'
import { listApprovalLevels, replaceApprovalLevels } from '../../../../../server/services/expenses.ts'

const Scope = z.object({ scope: z.enum(['expense', 'travel']) }).strict()

/** The approval ladder a claim or a trip climbs, in order. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { scope } = parseOrThrow(Scope, searchParams(request))
  return { body: { levels: await listApprovalLevels(ctx, scope) } }
})

const Body = z
  .object({
    scope: z.enum(['expense', 'travel']),
    levels: z
      .array(
        z
          .object({
            label: trimmed(120),
            /** Blank means the level always applies, which is a threshold of zero. */
            threshold: money.optional(),
            approverRole: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
          })
          .strict(),
      )
      .max(10),
  })
  .strict()

/**
 * Replaces the whole ladder for one scope.
 *
 * Whole-set rather than per-row, because the level numbers are unique per
 * scope: renumbering after a deletion row by row collides halfway through.
 */
export const PUT = tenantRoute(async ({ request, ctx }) => {
  const { scope, levels } = parseOrThrow(Body, await jsonBody(request))
  return { body: { levels: await replaceApprovalLevels(ctx, scope, levels) } }
})
