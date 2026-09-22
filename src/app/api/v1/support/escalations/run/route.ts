import { tenantRoute } from '../../../../../../server/http/handler.ts'
import { runEscalations } from '../../../../../../server/services/support.ts'

/**
 * Marks breached clocks and fires escalation rules. Idempotent: each rule
 * fires once per ticket however often this is called, so the scheduler and an
 * impatient administrator cannot double-escalate between them.
 */
export const POST = tenantRoute(async ({ ctx }) => {
  ctx.require('settings.manage')
  return { body: await runEscalations(ctx) }
})
