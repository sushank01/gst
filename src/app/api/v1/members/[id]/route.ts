import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../server/http/validate.ts'
import { changeMemberRole, removeMember } from '../../../../../server/services/tenancy.ts'
import { ROLES } from '../../../../../server/tenancy/permissions.ts'

const Body = z.object({ role: z.enum(ROLES) }).strict()

/** The membership id is scoped to the session's tenant inside the service. */
function membershipId(request: Request): string {
  const segments = new URL(request.url).pathname.split('/')
  return segments[segments.length - 1] ?? ''
}

export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const { role } = parseOrThrow(Body, await jsonBody(request))
  await changeMemberRole(ctx, membershipId(request), role)
  return { status: 204 }
})

export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await removeMember(ctx, membershipId(request))
  return { status: 204 }
})
