import { tenantRoute, jsonBody, pathSegment, searchParams } from '../../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, optionalTrimmed, uuid } from '../../../../../../../server/http/validate.ts'
import { addEntry, listEntries, removeEntry } from '../../../../../../../server/services/timesheets.ts'

/** The lines on a timesheet. */
export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: { entries: await listEntries(ctx, pathSegment(request, 1)) },
}))

const Body = z
  .object({
    workedOn: isoDate,
    minutes: z.coerce.number().int().min(1).max(1440),
    projectCode: optionalTrimmed(60),
    task: optionalTrimmed(200),
    billable: z.boolean().optional(),
    note: optionalTrimmed(2000),
  })
  .strict()

/** Only while the sheet is a draft; an approved sheet is evidence, not a form. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: { timesheet: await addEntry(ctx, pathSegment(request, 1), parseOrThrow(Body, await jsonBody(request))) },
}))

/** Removes a line while the sheet is still a draft. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  const { entryId } = parseOrThrow(z.object({ entryId: uuid }).strict(), searchParams(request))
  return { body: { timesheet: await removeEntry(ctx, pathSegment(request, 1), entryId) } }
})
