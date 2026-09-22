import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, trimmed } from '../../../../../server/http/validate.ts'
import { addFlow, listFlows } from '../../../../../server/services/compliance.ts'

/** Where you say data moves. Nothing is pre-filled. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { flows: await listFlows(ctx) } }))

const Body = z
  .object({
    name: trimmed(160),
    direction: z.enum(['ingress', 'egress', 'internal']),
    source: trimmed(200),
    destination: trimmed(200),
    /*
     * Free text, deliberately not an enum of transfer mechanisms. Choosing
     * between standard contractual clauses, an adequacy decision and a
     * derogation is a legal judgement this product must not make on anybody's
     * behalf — it shipped a register asserting exactly that, and it was wrong.
     */
    crossBorder: optionalTrimmed(400),
  })
  .strict()

/** Records one flow in your own words. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { flow: await addFlow(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
