import { tenantRoute } from '../../../../../server/http/handler.ts'
import { readAssetTaxonomies } from '../../../../../server/services/assets.ts'

/** Every asset taxonomy and its entries, as one versioned document. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: await readAssetTaxonomies(ctx) }))
