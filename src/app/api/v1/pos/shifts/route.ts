import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, money, optionalTrimmed, uuid } from '../../../../../server/http/validate.ts'
import { listShifts, openShift } from '../../../../../server/services/pos.ts'

const Query = z
  .object({
    open: z.coerce.boolean().optional(),
    closed: z.coerce.boolean().optional(),
    cashierUserId: uuid.optional(),
    /** Tills closed inside a window — what "the last 30 days" actually means. */
    closedFrom: isoDate.optional(),
    closedTo: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/**
 * Tills, newest first, each with its cashier's name and the tenders it took.
 *
 * `total` counts every till matching the filter, not the page — a dashboard
 * figure taken from the page length is wrong the moment there are more than
 * fifty.
 */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: await listShifts(ctx, parseOrThrow(Query, searchParams(request))),
}))

const Body = z
  .object({
    currency,
    openingFloat: money.optional(),
    warehouse: optionalTrimmed(120),
    /** Opening a till for somebody else needs the settings right. */
    cashierUserId: uuid.optional(),
  })
  .strict()

/** Opens a till. One per cashier; a second is refused while the first is open. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { shift: await openShift(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
