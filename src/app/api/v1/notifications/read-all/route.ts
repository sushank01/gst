import { tenantRoute } from '../../../../../server/http/handler.ts'
import { markAllRead } from '../../../../../server/services/notifications.ts'

/** Clears this person's badge. Nobody else's. */
export const POST = tenantRoute(async ({ ctx }) => ({ body: await markAllRead(ctx) }))
