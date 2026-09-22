import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { badRequest, unprocessable } from '../../../../../../server/http/errors.ts'
import { MAX_UPLOAD_BYTES, completeUpload } from '../../../../../../server/services/files.ts'

/**
 * The bytes themselves, as the raw request body.
 *
 * The stream is read with a hard ceiling rather than trusting content-length:
 * a client that lies about the length would otherwise buffer without limit.
 */
export const PUT = tenantRoute(async ({ request, ctx }) => {
  const token = request.headers.get('x-upload-token')
  if (!token) throw badRequest('Send the upload token from the begin-upload step.')

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_UPLOAD_BYTES) throw unprocessable('file_too_large', 'That file is larger than the limit.')

  const body = Buffer.from(await request.arrayBuffer())
  if (body.byteLength > MAX_UPLOAD_BYTES) throw unprocessable('file_too_large', 'That file is larger than the limit.')

  return { body: await completeUpload(ctx, pathSegment(request), body, token) }
})
