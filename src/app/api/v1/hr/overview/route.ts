import { tenantRoute } from '../../../../../server/http/handler.ts'
import { hrOverview } from '../../../../../server/services/hr.ts'

/** The HR dashboard's figures, including the ones this deployment cannot compute. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { overview: await hrOverview(ctx) } }))
