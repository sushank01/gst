import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../server/http/validate.ts'
import { setSlaPolicyActive } from '../../../../../../server/services/supportConfig.ts'

const Body = z.object({ active: z.boolean() }).strict()

/** Turns a policy on or off. An inactive one sets no clocks on new tickets. */
export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const { active } = parseOrThrow(Body, await jsonBody(request))
  return { body: { policy: await setSlaPolicyActive(ctx, pathSegment(request), active) } }
})
