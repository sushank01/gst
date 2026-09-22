import { authRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, uuid } from '../../../../../server/http/validate.ts'
import { withTenant } from '../../../../../server/tenancy/context.ts'
import { rotateSessionTenant } from '../../../../../server/auth/session.ts'
import { sessionCookie } from '../../../../../server/http/cookies.ts'
import { forbidden } from '../../../../../server/http/errors.ts'

const Body = z.object({ tenantId: uuid }).strict()

/**
 * Switching is authorised before it happens: `withTenant` throws unless the
 * membership exists, so a client cannot move its session into a workspace it
 * does not belong to by posting an id.
 */
export const POST = authRoute(async ({ request, ctx }) => {
  const { tenantId } = parseOrThrow(Body, await jsonBody(request))
  const tenant = await withTenant(ctx, tenantId)
  const rotated = await rotateSessionTenant(ctx.db, ctx.session.id, tenant.tenantId, ctx.now)
  if (!rotated) throw forbidden('That session is no longer active.')
  return {
    body: { activeTenantId: tenant.tenantId, role: tenant.role },
    cookies: [sessionCookie(rotated.token, rotated.session.expiresAt)],
  }
})
