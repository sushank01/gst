import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { readDocument } from '../../../../../../server/services/sales.ts'

export const GET = tenantRoute(async ({ request, ctx }) => ({ body: { document: await readDocument(ctx, pathSegment(request)) } }))
