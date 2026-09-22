import { publicRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../server/http/validate.ts'
import { verifyEmail } from '../../../../../server/auth/service.ts'
import { badRequest } from '../../../../../server/http/errors.ts'

const Body = z.object({ token: z.string().min(1) }).strict()

/** Confirms an email address with the token from the verification message. */
export const POST = publicRoute(async ({ request, db, now }) => {
  const { token } = parseOrThrow(Body, await jsonBody(request))
  const userId = await verifyEmail(db, token, now)
  if (!userId) throw badRequest('That verification link is invalid or has already been used.')
  return { body: { verified: true } }
})
