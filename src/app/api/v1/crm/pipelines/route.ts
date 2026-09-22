import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { createPipeline, listPipelines } from '../../../../../server/services/crm.ts'

/**
 * The workspace's pipelines and their real stages, names, positions and outcomes.
 *
 * An empty list means this workspace has never created a deal — the default
 * pipeline is seeded on first use, not pretended into existence by a read.
 */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { pipelines: await listPipelines(ctx) } }))

const Body = z.object({ name: trimmed(80), duplicateOf: uuid.optional() }).strict()

/** Creates a pipeline, copying another's stages when one is named. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const pipeline = await createPipeline(ctx, input)
  return { status: 201, body: { pipeline } }
})
