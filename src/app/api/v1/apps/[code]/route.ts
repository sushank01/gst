import { tenantRoute, jsonBody, pathSegment } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../../server/http/validate.ts'
import { installApp, setAppEnabled, uninstallApp } from '../../../../../server/services/installations.ts'

/** Installs one application, if the plan has room and the application is real. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: { installations: await installApp(ctx, pathSegment(request).toUpperCase()) },
}))

const Patch = z.object({ enabled: z.boolean() }).strict()

/** Disabling closes the app to users but keeps the installation and its data. */
export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const { enabled } = parseOrThrow(Patch, await jsonBody(request))
  return { body: { installations: await setAppEnabled(ctx, pathSegment(request).toUpperCase(), enabled) } }
})

/** Uninstalls an application. The row survives so its data is found again on reinstall. */
export const DELETE = tenantRoute(async ({ request, ctx }) => ({
  body: { installations: await uninstallApp(ctx, pathSegment(request).toUpperCase()) },
}))
