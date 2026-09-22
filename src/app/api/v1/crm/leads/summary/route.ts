import { tenantRoute } from '../../../../../../server/http/handler.ts'
import { leadSummary } from '../../../../../../server/services/crm.ts'

/**
 * Lead counts per status across the whole workspace.
 *
 * The board view used to bucket whichever page happened to be loaded, so a
 * column header on a 500-lead tenant counted 25 rows and called it the total.
 */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { byStatus: await leadSummary(ctx) } }))
