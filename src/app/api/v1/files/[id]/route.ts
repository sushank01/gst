import { tenantRoute, pathSegment } from '../../../../../server/http/handler.ts'
import { archiveFile } from '../../../../../server/services/files.ts'

/** Archive, not erase: the row and its audit trail outlive the bytes. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await archiveFile(ctx, pathSegment(request))
  return { status: 204 }
})
