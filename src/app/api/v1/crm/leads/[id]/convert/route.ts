import { tenantRoute, jsonBody } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, money, currency } from '../../../../../../../server/http/validate.ts'
import { convertLead } from '../../../../../../../server/services/crm.ts'

const Body = z
  .object({ dealName: trimmed(160), amount: money, currency, version: z.coerce.number().int().min(0) })
  .strict()

/** Keeps the lead and links it to the new deal, so the history survives. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean)
  const id = segments[segments.length - 2] ?? ''
  const input = parseOrThrow(Body, await jsonBody(request))
  const { dealId } = await convertLead(ctx, id, input)
  return { status: 201, body: { dealId } }
})
