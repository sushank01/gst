import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, optionalTrimmed, uuid } from '../../../../../server/http/validate.ts'
import { createTicket, listTickets } from '../../../../../server/services/support.ts'

const Query = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.string().trim().max(60).optional(),
    priority: z.string().trim().max(60).optional(),
    assigneeUserId: uuid.optional(),
    requesterPartyId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const { rows, total } = await listTickets(ctx, query)
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

export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const ticket = await createTicket(ctx, { ...input, requesterEmail: input.requesterEmail || null })
  return { status: 201, body: { ticket } }
})
