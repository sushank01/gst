import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, optionalTrimmed, uuid, isoDateTime } from '../../../../../server/http/validate.ts'
import { createActivity, listActivities } from '../../../../../server/services/crm.ts'

const Query = z
  .object({
    kind: z.string().trim().max(40).optional(),
    q: z.string().trim().max(200).optional(),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
    completed: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/**
 * Calls, emails, meetings, notes, tasks and calendar entries in a time window.
 *
 * The follow-ups timeline and the calendar month read the same rows through
 * this one endpoint, so the two screens cannot tell different stories about
 * what happened.
 */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const { rows, total } = await listActivities(ctx, {
    kind: query.kind,
    query: query.q,
    from: query.from,
    to: query.to,
    completed: query.completed,
    limit: query.limit,
    offset: query.offset,
  })
  return { body: { activities: rows, total } }
})

const Body = z
  .object({
    kind: trimmed(40),
    subject: trimmed(200),
    body: optionalTrimmed(4000),
    partyId: uuid.optional(),
    dealId: uuid.optional(),
    leadId: uuid.optional(),
    occursAt: isoDateTime.optional(),
    timezone: optionalTrimmed(60),
    durationMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
  })
  .strict()

/** Logs an activity against exactly one contact, account, deal or lead. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const activity = await createActivity(ctx, input)
  return { status: 201, body: { activity } }
})
