import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, money, optionalTrimmed, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { createReturn } from '../../../../../server/services/returns.ts'

const Line = z.object({ sourceLineId: uuid, quantity: money, reason: optionalTrimmed(500) }).strict()

const Body = z
  .object({
    invoiceId: uuid,
    reason: trimmed(500),
    lines: z.array(Line).min(1, 'Say which lines are coming back.').max(200),
    kind: z.enum(['return', 'credit_note']).optional(),
  })
  .strict()

/**
 * Raises a credit note against a posted invoice.
 *
 * Priced at what was charged, not at today's price, and bounded by what the
 * invoice actually billed less anything already returned — so a line cannot be
 * credited twice across separate returns that each look reasonable alone. The
 * invoice itself is not edited: it is posted evidence, and the credit note
 * stands beside it.
 */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { document: await createReturn(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
