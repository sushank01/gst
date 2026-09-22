import { tenantRoute, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../server/http/validate.ts'
import { listViolations } from '../../../../../server/services/guardrails.ts'

/** What was stopped and why. Excerpts are masked before they are stored. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { limit } = parseOrThrow(
    z.object({ limit: z.coerce.number().int().min(1).max(500).optional() }).strict(),
    searchParams(request),
  )
  return { body: { violations: await listViolations(ctx, limit) } }
})
