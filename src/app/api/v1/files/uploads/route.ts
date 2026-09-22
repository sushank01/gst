import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { beginUpload } from '../../../../../server/services/files.ts'

const Body = z
  .object({
    filename: trimmed(255),
    contentType: trimmed(160),
    byteSize: z.coerce.number().int().min(1),
    ownerKind: trimmed(60),
    ownerId: uuid.optional(),
  })
  .strict()

/**
 * Reserves the row and returns a single-use token. The declared size and type
 * are checked here so an oversized or disallowed upload is refused before any
 * bytes are transferred; both are checked again against the real bytes on
 * completion, because a client can declare anything.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const result = await beginUpload(ctx, parseOrThrow(Body, await jsonBody(request)))
  return { status: 201, body: result }
})
