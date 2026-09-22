import { tenantRoute, jsonBody, pathSegment } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed } from '../../../../../../../server/http/validate.ts'
import { decideTimesheet } from '../../../../../../../server/services/timesheets.ts'

const Body = z
  .object({ decision: z.enum(['approved', 'rejected']), version: z.coerce.number().int().min(0), note: optionalTrimmed(2000) })
  .strict()

/** Approval locks the sheet; rejection returns it to the person to correct. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: { timesheet: await decideTimesheet(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request))) },
}))
