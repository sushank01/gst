import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../../../server/http/validate.ts'
import { submitTimesheet } from '../../../../../../../server/services/timesheets.ts'

const Body = z.object({ version: z.coerce.number().int().min(0) }).strict()

export const POST = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(Body, await jsonBody(request))
  return { body: { timesheet: await submitTimesheet(ctx, pathSegment(request, 1), version) } }
})
