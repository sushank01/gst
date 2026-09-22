import { authRoute, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../server/http/validate.ts'
import { notFound } from '../../../../../server/http/errors.ts'
import { redeemDownload } from '../../../../../server/services/files.ts'

/**
 * Redeems a grant and returns the bytes.
 *
 * The token alone identifies the file, and the grant is consumed, so a link
 * that leaks is useful once and briefly. A signed-in session is still required:
 * an unauthenticated download endpoint is an open door to the object store.
 */
export const GET = authRoute(async ({ request, ctx }) => {
  const { token } = parseOrThrow(z.object({ token: z.string().min(16).max(200) }).strict(), searchParams(request))
  const file = await redeemDownload(ctx.db, token, ctx.now)
  if (!file) throw notFound('That download link')
  return { raw: { body: file.body, contentType: file.contentType, filename: file.filename } }
})
