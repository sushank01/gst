import { tenantRoute } from '../../../../../../server/http/handler.ts'
import { sendPendingCsat } from '../../../../../../server/services/support.ts'

/**
 * Queues a survey for every resolved ticket that has none, honouring the
 * tenant's wait and skip-older windows. Idempotent: a ticket already surveyed
 * is counted as eligible-but-not-queued rather than surveyed twice.
 */
export const POST = tenantRoute(async ({ ctx }) => ({ body: await sendPendingCsat(ctx) }))
