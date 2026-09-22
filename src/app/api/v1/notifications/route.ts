import { tenantRoute, searchParams } from '../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../server/http/validate.ts'
import { listNotifications } from '../../../../server/services/notifications.ts'

const Query = z
  .object({ unreadOnly: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(200).optional() })
  .strict()

/**
 * This person's notifications, with their own unread count.
 *
 * Per person, not per workspace: the prototype kept one number for the whole
 * browser, so everybody sharing it saw the same badge and one of them reading
 * an item cleared it for all of them.
 */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: await listNotifications(ctx, parseOrThrow(Query, searchParams(request))),
}))
