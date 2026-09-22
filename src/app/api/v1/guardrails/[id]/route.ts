import { tenantRoute, jsonBody, pathSegment } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../server/http/validate.ts'
import { setPolicyActive } from '../../../../../server/services/guardrails.ts'

const Body = z.object({ active: z.boolean() }).strict()

export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const { active } = parseOrThrow(Body, await jsonBody(request))
  return { body: { policy: await setPolicyActive(ctx, pathSegment(request), active) } }
})
