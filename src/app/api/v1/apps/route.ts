import { tenantRoute, jsonBody } from '../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../server/http/validate.ts'
import { catalogFor, entitlement, setInstalledApps } from '../../../../server/services/installations.ts'

/** The catalogue, what is installed, and what the plan allows. */
export const GET = tenantRoute(async ({ ctx }) => {
  ctx.require('record.read')
  return { body: { apps: await catalogFor(ctx), entitlement: await entitlement(ctx.db, ctx) } }
})

const Body = z.object({ apps: z.array(z.string().trim().min(1).max(20)).max(50) }).strict()

/**
 * Sets the installed set — what onboarding sends.
 *
 * Reconciles rather than appends: an app left out of the list is uninstalled.
 * A set that exceeds the plan is refused whole, so the wizard never leaves a
 * workspace half-configured.
 */
export const PUT = tenantRoute(async ({ request, ctx }) => {
  const { apps } = parseOrThrow(Body, await jsonBody(request))
  return { body: await setInstalledApps(ctx, apps) }
})
