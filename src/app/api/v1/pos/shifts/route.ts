import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, money, optionalTrimmed, uuid } from '../../../../../server/http/validate.ts'
import { listShifts, openShift } from '../../../../../server/services/pos.ts'

const Query = z
  .object({
    open: z.coerce.boolean().optional(),
    cashierUserId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict()

/** Tills, newest first. `open=true` returns only those still trading. */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: { shifts: await listShifts(ctx, parseOrThrow(Query, searchParams(request))) },
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
