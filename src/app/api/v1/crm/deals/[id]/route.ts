import { tenantRoute, jsonBody, searchParams, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, uuid, money, currency, isoDate } from '../../../../../../server/http/validate.ts'
import { archiveDeal, updateDeal } from '../../../../../../server/services/crm.ts'

const Patch = z
  .object({
    version: z.coerce.number().int().min(0),
    name: optionalTrimmed(160),
    stageId: uuid.optional(),
    amount: money.optional(),
    currency: currency.optional(),
    expectedClose: isoDate.optional(),
    source: optionalTrimmed(60),
    isFavourite: z.boolean().optional(),
    lostReason: optionalTrimmed(300),
    restore: z.boolean().optional(),
  })
  .strict()

/**
 * Edits a deal, including a stage move.
 *
 * A stage change writes `deal_stage_history` and takes the won/lost outcome
 * from the stage's own `outcome` column, so a renamed stage does not stop the
 * funnel counting — and moving a deal back into an open stage re-opens it.
 */
export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Patch, await jsonBody(request))
  const deal = await updateDeal(ctx, pathSegment(request), input)
  return { body: { deal } }
})

/** Archive, not delete — a closed deal is the evidence behind every revenue figure. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(z.object({ version: z.coerce.number().int().min(0) }).strict(), searchParams(request))
  await archiveDeal(ctx, pathSegment(request), version)
  return { status: 204 }
})
