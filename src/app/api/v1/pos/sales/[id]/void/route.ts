import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed } from '../../../../../../../server/http/validate.ts'
import { voidSale } from '../../../../../../../server/services/pos.ts'

const Body = z.object({ reason: trimmed(500) }).strict()

/** Voids a sale on an open till. The row stays: a voided sale is evidence. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { reason } = parseOrThrow(Body, await jsonBody(request))
  await voidSale(ctx, pathSegment(request, 1), reason)
  return { status: 204 }
})
