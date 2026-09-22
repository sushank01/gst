import { tenantRoute, pathSegment } from '../../../../../../../server/http/handler.ts'
import { revertSettingsChange } from '../../../../../../../server/services/settings.ts'

/**
 * Reverts to the value recorded before a change.
 *
 * A revert is itself a new version with its own history row — the trail is
 * append-only, so undoing a change never erases the evidence it happened.
 */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: { settings: await revertSettingsChange(ctx, pathSegment(request, 1)) },
}))
