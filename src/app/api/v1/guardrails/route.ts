import { tenantRoute, jsonBody, searchParams } from '../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed } from '../../../../server/http/validate.ts'
import { createPolicy, listPolicies } from '../../../../server/services/guardrails.ts'

const Checkpoint = z.enum(['input', 'output', 'tool_call', 'tool_result'])

export const GET = tenantRoute(async ({ request, ctx }) => {
  const { checkpoint } = parseOrThrow(z.object({ checkpoint: Checkpoint.optional() }).strict(), searchParams(request))
  return { body: { policies: await listPolicies(ctx, checkpoint) } }
})

const Body = z
  .object({
    name: trimmed(160),
    kind: z.enum(['keyword', 'content', 'pii', 'spend', 'rate', 'schema']),
    checkpoint: Checkpoint,
    action: z.enum(['block', 'warn', 'redact', 'human_review']),
    config: z.record(z.string(), z.unknown()).optional(),
    /*
     * What happens when the evaluator itself cannot run. Defaults to closed:
     * a rule somebody wrote to prevent something must not be bypassed by
     * breaking it.
     */
    failureMode: z.enum(['open', 'closed']).optional(),
  })
  .strict()

export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { policy: await createPolicy(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
