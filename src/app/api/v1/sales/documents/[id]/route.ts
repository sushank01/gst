import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { readDocument } from '../../../../../../server/services/sales.ts'

/** One document with its lines and totals. */
export const GET = tenantRoute(async ({ request, ctx }) => ({ body: { document: await readDocument(ctx, pathSegment(request)) } }))
