import { tenantRoute } from '../../../../../server/http/handler.ts'
import { assetFacets } from '../../../../../server/services/assets.ts'

/** The counts behind the register's filter chips and dashboard tiles. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: await assetFacets(ctx) }))
