import { tenantRoute, pathSegment } from '../../../../../../../server/http/handler.ts'
import { returnableLines } from '../../../../../../../server/services/returns.ts'

/**
 * What is still returnable on an invoice, line by line.
 *
 * Computed against earlier returns rather than from the invoice alone, which
 * is what stops a line being credited twice.
 */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: { lines: await returnableLines(ctx, pathSegment(request, 1)) },
}))
