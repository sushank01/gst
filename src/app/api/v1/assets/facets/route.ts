import { tenantRoute, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../server/http/validate.ts'
import { assetFacets } from '../../../../../server/services/assets.ts'

const Query = z
  .object({
    /** The window `warrantyExpiring` counts over, so a tile and its list agree. */
    warrantyWithinDays: z.coerce.number().int().min(1).max(3650).optional(),
    /*
     * The register's other filters, spelled as `/assets` spells them, so a
     * chip count is the number of rows clicking that chip would show rather
     * than a workspace-wide figure sitting beside a filtered list.
     */
    q: z.string().trim().max(200).optional(),
    assetType: z.string().trim().max(60).optional(),
    location: z.string().trim().max(120).optional(),
  })
  .strict()

/** The counts behind the register's filter chips and dashboard tiles. */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: await assetFacets(ctx, parseOrThrow(Query, searchParams(request))),
}))
