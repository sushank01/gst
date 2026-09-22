import { authRoute } from '../../../../../server/http/handler.ts'
import { listTenantsForUser } from '../../../../../server/services/tenancy.ts'

/** Who am I, according to the server. The client never decides this. */
export const GET = authRoute(async ({ ctx }) => ({
  body: {
    user: {
      id: ctx.session.user.id,
      email: ctx.session.user.email,
      fullName: ctx.session.user.fullName,
      emailVerified: Boolean(ctx.session.user.emailVerifiedAt),
    },
    activeTenantId: ctx.session.tenantId,
    tenants: await listTenantsForUser(ctx.db, ctx.userId),
    expiresAt: ctx.session.expiresAt.toISOString(),
  },
}))
