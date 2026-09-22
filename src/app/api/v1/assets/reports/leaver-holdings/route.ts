import { tenantRoute } from '../../../../../../server/http/handler.ts'
import { leaverHoldings } from '../../../../../../server/services/assets.ts'

/**
 * Equipment still held by people who have left.
 *
 * The employee counts travel with the rows because only custody held by an
 * employee linked to a platform account can be seen: without them a zero
 * reads as "nobody is holding anything" when it may mean "no leaver here is
 * linked to an account".
 */
export const GET = tenantRoute(async ({ ctx }) => ({ body: await leaverHoldings(ctx) }))
