import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, uuid } from '../../../../../server/http/validate.ts'
import { readApprovalLadder, replaceApprovalLadder } from '../../../../../server/services/assets.ts'

/** The ladder an asset request must clear, in order, and its version. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: await readApprovalLadder(ctx) }))

const Body = z
  .object({
    levels: z
      .array(
        z
          .object({
            level: z.coerce.number().int().min(1).max(10),
            approverKind: z.enum(['role', 'user']),
            approverRole: optionalTrimmed(80).nullable().optional(),
            userIds: z.array(uuid).max(20).optional(),
          })
          .strict(),
      )
      .max(10),
    version: z.coerce.number().int().min(0),
  })
  .strict()

/**
 * Replaces the ladder in one write.
 *
 * With no levels configured a request is approved on submission, so an empty
 * ladder is a real configuration rather than a missing one — sending it is
 * how a workspace turns approvals off.
 */
export const PUT = tenantRoute(async ({ request, ctx }) => ({
  body: await replaceApprovalLadder(ctx, parseOrThrow(Body, await jsonBody(request))),
}))
