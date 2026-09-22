import { publicRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, emailField, trimmed, passwordField } from '../../../../../server/http/validate.ts'
import { registerUser, signIn } from '../../../../../server/auth/service.ts'
import { enqueue } from '../../../../../server/events/outbox.ts'
import { sessionCookie } from '../../../../../server/http/cookies.ts'

const Body = z
  .object({ email: emailField, fullName: trimmed(120), password: passwordField })
  .strict()

/**
 * Creates the account, queues its verification email in the same transaction as
 * the user row, then signs in. The account is usable but unverified — that
 * state is real and server-owned, not a flag the client can set.
 */
export const POST = publicRoute(async ({ request, db, now }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const { userId, verificationToken } = await registerUser(db, input, now)

  await enqueue(db, {
    topic: 'email.verify',
    payload: { userId, email: input.email, token: verificationToken },
    idempotencyKey: `verify:${userId}`,
  }, now)

  const signedIn = await signIn(
    db,
    {
      email: input.email,
      password: input.password,
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    },
    now,
  )

  return {
    status: 201,
    body: { user: { id: userId, email: input.email, fullName: input.fullName, emailVerified: false }, tenants: [] },
    cookies: [sessionCookie(signedIn.token, signedIn.session.expiresAt)],
  }
})
