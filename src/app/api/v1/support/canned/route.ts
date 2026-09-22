import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { createCanned, listCanned } from '../../../../../server/services/knowledge.ts'

/** Canned replies available to an agent, optionally narrowed to one team. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { teamId } = parseOrThrow(z.object({ teamId: uuid.optional() }).strict(), searchParams(request))
  return { body: { responses: await listCanned(ctx, teamId) } }
})

const Body = z
  .object({ shortcut: trimmed(40), title: trimmed(160), body: trimmed(20_000), teamId: uuid.optional() })
  .strict()

/** Creates one. The leading slash is how people type it, not part of the key. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { response: await createCanned(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
