import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, optionalTrimmed, uuid } from '../../../../../server/http/validate.ts'
import { createTicket, listTickets } from '../../../../../server/services/support.ts'

const Query = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.string().trim().max(60).optional(),
    priority: z.string().trim().max(60).optional(),
    channel: z.string().trim().max(60).optional(),
    /** Comma-separated; a ticket matches if it carries any of them. */
    tags: z.string().trim().max(200).optional(),
    assigneeUserId: uuid.optional(),
    /*
     * Spelt out rather than coerced: `z.coerce.boolean()` reads the string
     * "false" as true, which would silently turn the Unassigned queue on.
     */
    unassigned: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    requesterPartyId: uuid.optional(),
    /** Exact match. `q` also searches the subject, so it cannot stand in here. */
    requesterEmail: z.string().trim().max(320).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Tickets, filtered and paged. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const { rows, total } = await listTickets(ctx, {
    ...query,
    tags: query.tags
      ? query.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : undefined,
  })
  return { body: { tickets: rows, total } }
})

const Body = z
  .object({
    subject: trimmed(240),
    body: trimmed(20_000),
    requesterEmail: z.string().trim().email('Enter a valid email address.').optional().or(z.literal('')),
    requesterName: optionalTrimmed(160),
    requesterPartyId: uuid.optional(),
    priority: optionalTrimmed(60),
    category: optionalTrimmed(60),
    channel: optionalTrimmed(40),
    teamId: uuid.optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    externalMessageId: optionalTrimmed(200),
  })
  .strict()

/** Opens a ticket with its first message and SLA clocks. A seen inbound message threads instead. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const ticket = await createTicket(ctx, { ...input, requesterEmail: input.requesterEmail || null })
  return { status: 201, body: { ticket } }
})
