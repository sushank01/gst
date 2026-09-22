import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, trimmed } from '../../../../../server/http/validate.ts'
import { createCalendar, listCalendars } from '../../../../../server/services/supportConfig.ts'

/** Working calendars, with their hours and holidays. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { calendars: await listCalendars(ctx) } }))

const Hour = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    opensMinute: z.coerce.number().int().min(0).max(1440),
    closesMinute: z.coerce.number().int().min(0).max(1440),
  })
  .strict()

const Body = z
  .object({
    name: trimmed(120),
    /*
     * An IANA zone, checked by asking the platform to format a date in it. An
     * unrecognised zone that silently fell back to UTC would make every SLA
     * computed against this calendar wrong by hours, with nothing looking
     * broken.
     */
    timezone: trimmed(60),
    isDefault: z.boolean().optional(),
    hours: z.array(Hour).max(21),
    holidays: z.array(z.object({ observedOn: isoDate, name: trimmed(120) }).strict()).max(60).optional(),
  })
  .strict()

/** Creates a calendar with its week and holidays. Only one may be the default. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { calendar: await createCalendar(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
