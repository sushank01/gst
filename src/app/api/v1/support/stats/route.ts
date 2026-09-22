import { tenantRoute } from '../../../../../server/http/handler.ts'
import { supportStats } from '../../../../../server/services/support.ts'

/**
 * Every figure the support dashboard shows, counted over all tickets rather
 * than over a page of them. Open versus closed comes from each status's own
 * behaviour, so a tenant that renamed its statuses still gets the right split.
 */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { stats: await supportStats(ctx) } }))
