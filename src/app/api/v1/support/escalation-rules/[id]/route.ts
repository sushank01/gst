import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../server/http/validate.ts'
import { setEscalationRuleActive } from '../../../../../../server/services/supportConfig.ts'

const Body = z.object({ active: z.boolean() }).strict()

/** Turns a rule on or off. An inactive rule never fires. */
export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const { active } = parseOrThrow(Body, await jsonBody(request))
  return { body: { rule: await setEscalationRuleActive(ctx, pathSegment(request), active) } }
})
