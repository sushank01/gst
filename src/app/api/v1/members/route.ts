import { tenantRoute, jsonBody } from '../../../../server/http/handler.ts'
import { parseOrThrow, z, emailField } from '../../../../server/http/validate.ts'
import { inviteMember, listMembers } from '../../../../server/services/tenancy.ts'
import { ROLES } from '../../../../server/tenancy/permissions.ts'

/** Everyone in this workspace, with their role and status. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { members: await listMembers(ctx) } }))

const Body = z.object({ email: emailField, role: z.enum(ROLES) }).strict()

/** Invites somebody. The invitation is queued for delivery in the same transaction. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const { invitationId } = await inviteMember(ctx, input)
  // The token goes to the invitee by email, never back to the inviter.
  return { status: 201, body: { invitationId, email: input.email, role: input.role, status: 'pending' } }
})
