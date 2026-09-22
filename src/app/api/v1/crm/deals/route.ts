import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, optionalTrimmed, uuid, money, currency, isoDate } from '../../../../../server/http/validate.ts'
import { createDeal, listDeals, tenantCurrency } from '../../../../../server/services/crm.ts'

const Query = z
  .object({
    pipelineId: uuid.optional(),
    stageId: uuid.optional(),
    q: z.string().trim().max(200).optional(),
    source: z.string().trim().max(60).optional(),
    outcome: z.enum(['open', 'won', 'lost']).optional(),
    favourites: z.coerce.boolean().optional(),
    mine: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    includeArchived: z.coerce.boolean().optional(),
  })
  .strict()

/**
 * One pipeline's deals with its per-stage and per-outcome totals.
 *
 * The board columns, the table, the count beside it and the dashboard KPIs all
 * come from this single answer, so they cannot disagree. Money stays a decimal
 * string grouped by its own currency — two currencies are never added together.
 */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const list = await listDeals(ctx, {
    pipelineId: query.pipelineId,
    stageId: query.stageId,
    query: query.q,
    source: query.source,
    outcome: query.outcome,
    favouritesOnly: query.favourites,
    mineOnly: query.mine,
    limit: query.limit,
    offset: query.offset,
    includeArchived: query.includeArchived,
  })
  return {
    body: {
      deals: list.rows,
      total: list.total,
      pipelineId: list.pipelineId,
      pipelineName: list.pipelineName,
      stages: list.stages,
      summary: list.summary,
      /** What a new deal should be quoted in, from the workspace's own company. */
      defaultCurrency: await tenantCurrency(ctx),
    },
  }
})

const Body = z
  .object({
    name: trimmed(160),
    amount: money,
    currency,
    pipelineId: uuid.optional(),
    stageId: uuid.optional(),
    accountId: uuid.optional(),
    primaryContactId: uuid.optional(),
    expectedClose: isoDate.optional(),
    source: optionalTrimmed(60),
  })
  .strict()

/** Creates a deal directly, rather than only as the far side of a conversion. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const deal = await createDeal(ctx, input)
  return { status: 201, body: { deal } }
})
