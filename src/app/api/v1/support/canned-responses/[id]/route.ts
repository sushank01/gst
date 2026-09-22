import { tenantRoute, pathSegment } from '../../../../../../server/http/handler.ts'
import { archiveCanned, useCanned } from '../../../../../../server/services/knowledge.ts'

/** Counts a use, and returns the body to insert. The unused shortcut is the one to retire. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  body: { response: await useCanned(ctx, pathSegment(request)) },
}))

/** Archives it, freeing the shortcut for reuse. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await archiveCanned(ctx, pathSegment(request))
  return { status: 204 }
})
