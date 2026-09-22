import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, trimmed } from '../../../../../server/http/validate.ts'
import { addRetentionPolicy, listRetentionPolicies } from '../../../../../server/services/compliance.ts'

/**
 * Retention periods this workspace intends.
 *
 * Every row carries `enforced: false`, and always will until a purge job
 * exists. Nothing on this deployment deletes anything on a schedule, and a
 * register that implies otherwise is worse than none — somebody may rely on it
 * in an audit.
 */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { policies: await listRetentionPolicies(ctx) } }))

const Body = z
  .object({ subject: trimmed(160), keepForDays: z.coerce.number().int().min(1).max(36_500), note: optionalTrimmed(2000) })
  .strict()

/** Records one period per subject. Two for one subject is a contradiction. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { policy: await addRetentionPolicy(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
