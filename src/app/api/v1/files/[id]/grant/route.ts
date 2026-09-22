import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { issueDownloadGrant } from '../../../../../../server/services/files.ts'

/**
 * A short-lived, single-use download token.
 *
 * Downloads go through a grant rather than a guessable id so a file URL cannot
 * be forwarded and replayed indefinitely, and so the grant records who asked.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const token = await issueDownloadGrant(ctx, pathSegment(request, 1))
  return { status: 201, body: { token, url: `/api/v1/files/download?token=${encodeURIComponent(token)}` } }
})
