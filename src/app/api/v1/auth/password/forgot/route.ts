import { publicRoute, jsonBody } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, emailField } from '../../../../../../server/http/validate.ts'
import { requestPasswordReset } from '../../../../../../server/auth/service.ts'
import { enqueue } from '../../../../../../server/events/outbox.ts'

const Body = z.object({ email: emailField }).strict()

/**
 * Always answers the same way. Telling the caller whether the address exists
 * would turn this form into an account-enumeration oracle.
 */
export const POST = publicRoute(async ({ request, db, now }) => {
  const { email } = parseOrThrow(Body, await jsonBody(request))
  const requested = await requestPasswordReset(db, email, now)
  if (requested) {
    await enqueue(db, {
      topic: 'email.password_reset',
      payload: { userId: requested.userId, email, token: requested.token },
      idempotencyKey: `reset:${requested.userId}:${now.toISOString().slice(0, 13)}`,
    }, now)
  }
  return { body: { sent: true } }
})
