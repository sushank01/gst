import { tenantRoute } from '../../../../../server/http/handler.ts'
import { overview } from '../../../../../server/services/reports.ts'

/**
 * The workspace overview.
 *
 * Every figure is computed from the rows the module itself reads, so this can
 * never drift from the screen underneath it. Anything that cannot be computed
 * appears in `unavailable` with a reason rather than as a zero — a real zero
 * and "no data yet" are different answers and the UI must show them differently.
 */
export const GET = tenantRoute(async ({ ctx }) => ({ body: await overview(ctx) }))
