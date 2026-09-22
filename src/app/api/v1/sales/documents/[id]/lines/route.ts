import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, money, optionalTrimmed, trimmed, uuid } from '../../../../../../../server/http/validate.ts'
import { updateDocumentLines } from '../../../../../../../server/services/sales.ts'

const Line = z
  .object({
    itemCode: optionalTrimmed(60),
    description: trimmed(400),
    quantity: money,
    unitPrice: money,
    discountPercent: money.optional(),
    taxCategoryId: uuid.optional(),
    taxRatePercent: money.optional(),
  })
  .strict()

const Body = z.object({ version: z.coerce.number().int().min(0), lines: z.array(Line).min(1).max(500) }).strict()

/** Whole-set replacement: a partial line patch cannot keep totals consistent. */
export const PUT = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const document = await updateDocumentLines(ctx, pathSegment(request, 1), input.version, input.lines)
  return { body: { document } }
})
