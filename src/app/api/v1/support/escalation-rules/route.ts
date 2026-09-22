import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed } from '../../../../../server/http/validate.ts'
import { createEscalationRule, listEscalationRules } from '../../../../../server/services/supportConfig.ts'

/** The escalation rules the SLA sweep fires. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { rules: await listEscalationRules(ctx) } }))

const Body = z
  .object({
    name: trimmed(120),
    triggerTarget: z.enum(['first_response', 'resolution']),
    /** Minutes before (negative) or after the SLA boundary. */
    offsetMinutes: z.coerce.number().int().min(-100_000).max(100_000).optional(),
    conditions: z.record(z.string(), z.unknown()).optional(),
    /*
     * Checked against what the sweep can actually perform. Storing an action
     * it cannot do would leave an administrator believing tickets were being
     * escalated when nothing happens.
     */
    actions: z.array(z.record(z.string(), z.unknown()).and(z.object({ kind: z.string() }))).min(1).max(10),
  })
  .strict()

/** Creates a rule. One that does nothing is refused. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { rule: await createEscalationRule(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
