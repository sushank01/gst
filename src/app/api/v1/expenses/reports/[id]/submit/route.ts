import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../../server/http/validate.ts'
import { submitReport } from '../../../../../../../server/services/expenses.ts'

const Body = z.object({ version: z.coerce.number().int().min(0) }).strict()

export const POST = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(Body, await jsonBody(request))
  return { body: { report: await submitReport(ctx, pathSegment(request, 1), version) } }
})
