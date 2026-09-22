import { publicRoute, jsonBody } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, passwordField } from '../../../../../../server/http/validate.ts'
import { resetPassword } from '../../../../../../server/auth/service.ts'
import { badRequest } from '../../../../../../server/http/errors.ts'
import { clearedSessionCookie } from '../../../../../../server/http/cookies.ts'

const Body = z.object({ token: z.string().min(1), password: passwordField }).strict()

export const POST = publicRoute(async ({ request, db, now }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const userId = await resetPassword(db, input.token, input.password, now)
  if (!userId) throw badRequest('That reset link is invalid or has expired.')
  // Every session was revoked, including possibly this browser's.
  return { body: { reset: true }, cookies: [clearedSessionCookie()] }
})
