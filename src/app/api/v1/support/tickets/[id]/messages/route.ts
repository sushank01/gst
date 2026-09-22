import { tenantRoute, jsonBody, pathSegment, searchParams } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, optionalTrimmed } from '../../../../../../../server/http/validate.ts'
import { listMessages, replyToTicket } from '../../../../../../../server/services/support.ts'

/**
 * `view=requester` returns only what the requester can see. The default is the
 * agent view, which a viewer-role session still cannot reach because the
 * service checks `record.read` against the caller's own permissions.
 */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(z.object({ view: z.enum(['agent', 'requester']).optional() }).strict(), searchParams(request))
  const messages = await listMessages(ctx, pathSegment(request, 1), { includeInternal: query.view !== 'requester' })
  return { body: { messages } }
})

const Body = z
  .object({ body: trimmed(20_000), visibility: z.enum(['public', 'internal']), externalMessageId: optionalTrimmed(200) })
  .strict()

export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const result = await replyToTicket(ctx, pathSegment(request, 1), input)
  return { status: 201, body: result }
})
