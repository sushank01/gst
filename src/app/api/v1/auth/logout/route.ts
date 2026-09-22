import { authRoute } from '../../../../../server/http/handler.ts'
import { revokeSession } from '../../../../../server/auth/session.ts'
import { clearedSessionCookie } from '../../../../../server/http/cookies.ts'

/** Revokes server-side first; clearing the cookie alone would leave a live session. */
export const POST = authRoute(async ({ ctx }) => {
  await revokeSession(ctx.db, ctx.session.id, ctx.now)
  return { status: 204, cookies: [clearedSessionCookie()] }
})
