import { tenantRoute, jsonBody, pathSegment, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed } from '../../../../../server/http/validate.ts'
import { readSettings, writeSettings } from '../../../../../server/services/settings.ts'

const Section = z.object({ section: z.string().trim().min(1).max(60) }).strict()

export const GET = tenantRoute(async ({ request, ctx }) => {
  const { section } = parseOrThrow(Section, searchParams(request))
  // The caller's defaults are not accepted from the request: a settings
  // document must not be definable by whoever reads it.
  return { body: { settings: await readSettings(ctx, pathSegment(request), section, {}) } }
})

const Body = z
  .object({
    section: trimmed(60),
    value: z.record(z.string(), z.unknown()),
    version: z.coerce.number().int().min(0),
    summary: trimmed(200),
  })
  .strict()

/** Version-checked: a stale editor gets 409 with the current version, not a silent overwrite. */
export const PUT = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const settings = await writeSettings(ctx, { ...input, appCode: pathSegment(request) })
  return { body: { settings } }
})
