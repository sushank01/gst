import { tenantRoute, jsonBody, pathSegment } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed } from '../../../../../server/http/validate.ts'
import { setPolicyActive, updatePolicy } from '../../../../../server/services/guardrails.ts'

const Body = z.object({ active: z.boolean() }).strict()

/** Turns a policy on or off. An inactive policy enforces nothing. */
export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const { active } = parseOrThrow(Body, await jsonBody(request))
  return { body: { policy: await setPolicyActive(ctx, pathSegment(request), active) } }
})

const Put = z
  .object({
    /** The version the editor read. A stale one is a 409, not a silent overwrite. */
    version: z.coerce.number().int().min(0),
    name: trimmed(160),
    kind: z.enum(['keyword', 'content', 'pii', 'spend', 'rate', 'schema']),
    checkpoint: z.enum(['input', 'output', 'tool_call', 'tool_result']),
    action: z.enum(['block', 'warn', 'redact', 'human_review']),
    config: z.record(z.string(), z.unknown()).optional(),
    failureMode: z.enum(['open', 'closed']).optional(),
  })
  .strict()

/**
 * Replaces what a policy says — its kind, check point, action and matching
 * configuration. A definition that could never match is refused.
 */
export const PUT = tenantRoute(async ({ request, ctx }) => ({
  body: { policy: await updatePolicy(ctx, pathSegment(request), parseOrThrow(Put, await jsonBody(request))) },
}))
