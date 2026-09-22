import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, optionalTrimmed } from '../../../../../../server/http/validate.ts'
import { listTickets, slaStatus, transitionTicket } from '../../../../../../server/services/support.ts'
import { notFound } from '../../../../../../server/http/errors.ts'

export const GET = tenantRoute(async ({ request, ctx }) => {
  const id = pathSegment(request)
  // Reuses the list query so the detail view and the list can never disagree
  // about a ticket's state or its tenant scoping.
  const { rows } = await listTickets(ctx, { ticketId: id, limit: 1 })
  if (!rows[0]) throw notFound('That ticket')
  return { body: { ticket: rows[0], sla: await slaStatus(ctx, id) } }
})

const Patch = z
  .object({ status: trimmed(60), version: z.coerce.number().int().min(0), note: optionalTrimmed(2000) })
  .strict()

export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Patch, await jsonBody(request))
  const ticket = await transitionTicket(ctx, pathSegment(request), input)
  return { body: { ticket } }
})
