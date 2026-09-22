import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, trimmed } from '../../../../../server/http/validate.ts'
import { evaluate } from '../../../../../server/services/guardrails.ts'

const Body = z
  .object({
    checkpoint: z.enum(['input', 'output', 'tool_call', 'tool_result']),
    text: trimmed(100_000),
    resource: optionalTrimmed(60),
    resourceId: optionalTrimmed(120),
  })
  .strict()

/**
 * Runs the active policies against a piece of text and returns the decision.
 *
 * This DECIDES; it does not enforce. The caller must honour the outcome —
 * `block` means do not proceed, `redact` means use the returned text. Exposed
 * so a settings screen can show an operator what their rules would actually do
 * before anything depends on them.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  return { body: { decision: await evaluate(ctx, input.checkpoint, input.text, input) } }
})
