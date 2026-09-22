import { authRoute, jsonBody } from '../../../../server/http/handler.ts'
import { parseOrThrow, z, trimmed, optionalTrimmed, currency } from '../../../../server/http/validate.ts'
import { createTenantWithOwner, listTenantsForUser } from '../../../../server/services/tenancy.ts'
import { rotateSessionTenant } from '../../../../server/auth/session.ts'
import { sessionCookie } from '../../../../server/http/cookies.ts'

/** The workspaces this account belongs to. */
export const GET = authRoute(async ({ ctx }) => ({ body: { tenants: await listTenantsForUser(ctx.db, ctx.userId) } }))

const Body = z
  .object({
    name: trimmed(120),
    companyName: optionalTrimmed(120),
    currency: currency.optional(),
    timezone: optionalTrimmed(60),
  })
  .strict()

/** Creating a workspace also switches into it, which rotates the session token. */
export const POST = authRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const created = await createTenantWithOwner(ctx.db, ctx.userId, input, ctx.now, ctx.requestId)
  const rotated = await rotateSessionTenant(ctx.db, ctx.session.id, created.tenantId, ctx.now)
  return {
    status: 201,
    body: { tenant: { id: created.tenantId, slug: created.slug, name: input.name }, companyId: created.companyId },
    cookies: rotated ? [sessionCookie(rotated.token, rotated.session.expiresAt)] : [],
  }
})
