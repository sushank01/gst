import { tenantRoute, pathSegment, searchParams } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, versioned } from '../../../../../../server/http/validate.ts'
import { cancelDocument, readDocument } from '../../../../../../server/services/sales.ts'

/** One document with its lines and totals. */
export const GET = tenantRoute(async ({ request, ctx }) => ({ body: { document: await readDocument(ctx, pathSegment(request)) } }))

/**
 * Cancels a document; it is never erased.
 *
 * A numbered document that disappears leaves a gap in a sequence somebody has
 * to account for, so the row stays and is marked cancelled. A posted document
 * is refused outright — the correction for posted evidence is a credit note.
 */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(versioned.strict(), searchParams(request))
  return { body: await cancelDocument(ctx, pathSegment(request), version) }
})
