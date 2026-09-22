import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed } from '../../../../../server/http/validate.ts'
import { createTeam, listTeams } from '../../../../../server/services/supportConfig.ts'

/** The support teams a ticket or canned response can belong to. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { teams: await listTeams(ctx) } }))

const Body = z
  .object({ name: trimmed(120), email: z.string().trim().email('Enter a valid email address.').optional().or(z.literal('')) })
  .strict()

/** Creates a team. Names are unique, and the address is normalised. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  return { status: 201, body: { team: await createTeam(ctx, { ...input, email: input.email || null }) } }
})
