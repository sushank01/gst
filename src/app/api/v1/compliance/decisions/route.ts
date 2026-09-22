import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, trimmed } from '../../../../../server/http/validate.ts'
import { addAutomatedDecision, listAutomatedDecisions } from '../../../../../server/services/compliance.ts'

/** The automated decisions this workspace makes about people. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { decisions: await listAutomatedDecisions(ctx) } }))

const Body = z
  .object({
    name: trimmed(160),
    description: optionalTrimmed(2000),
    /* Explicit fields, not prose: an Art. 22 answer turns on exactly these two. */
    profiling: z.boolean().optional(),
    humanReview: z.boolean().optional(),
    logicSummary: optionalTrimmed(4000),
  })
  .strict()

/** Records one, with whether it profiles and whether a person reviews it. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { decision: await addAutomatedDecision(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
