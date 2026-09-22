import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, trimmed } from '../../../../../../server/http/validate.ts'
import { replaceAssetTaxonomy } from '../../../../../../server/services/assets.ts'

const Body = z
  .object({
    entries: z
      .array(
        z
          .object({ value: trimmed(60), label: trimmed(120), tagPrefix: optionalTrimmed(12).nullable().optional() })
          .strict(),
      )
      .max(200),
    version: z.coerce.number().int().min(0),
  })
  .strict()

/**
 * Replaces one taxonomy's entries.
 *
 * Version-checked like every settings write, and refused when an entry that
 * records still store would be removed — the screen promises nothing is
 * silently orphaned, and this is where that promise is kept.
 */
export const PUT = tenantRoute(async ({ request, ctx }) => {
  const { entries, version } = parseOrThrow(Body, await jsonBody(request))
  return { body: await replaceAssetTaxonomy(ctx, pathSegment(request), entries, version) }
})
