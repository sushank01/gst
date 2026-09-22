import { publicRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, emailField } from '../../../../../server/http/validate.ts'
import { signIn } from '../../../../../server/auth/service.ts'
import { listTenantsForUser } from '../../../../../server/services/tenancy.ts'
import { rotateSessionTenant } from '../../../../../server/auth/session.ts'
import { sessionCookie } from '../../../../../server/http/cookies.ts'

const Body = z.object({ email: emailField, password: z.string().min(1, 'Enter your password.') }).strict()

export const POST = publicRoute(async ({ request, db, now }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const signedIn = await signIn(
    db,
    { ...input, ip: request.headers.get('x-forwarded-for'), userAgent: request.headers.get('user-agent') },
    now,
  )

  const tenants = await listTenantsForUser(db, signedIn.userId)
  // Someone with exactly one workspace lands in it; with several, the client
  // asks. The tenant is still written to the session server-side either way.
  let token = signedIn.token
  let expiresAt = signedIn.session.expiresAt
  if (tenants.length === 1) {
    const rotated = await rotateSessionTenant(db, signedIn.session.id, tenants[0].id, now)
    if (rotated) {
      token = rotated.token
      expiresAt = rotated.session.expiresAt
    }
  }

  return {
    body: {
      user: { id: signedIn.userId, email: input.email, emailVerified: signedIn.emailVerified },
      tenants,
      activeTenantId: tenants.length === 1 ? tenants[0].id : null,
    },
    cookies: [sessionCookie(token, expiresAt)],
  }
})
