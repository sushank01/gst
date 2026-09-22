import { tenantRoute, jsonBody, pathSegment } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, optionalTrimmed } from '../../../../../../server/http/validate.ts'
import { updateDpia } from '../../../../../../server/services/compliance.ts'

const Patch = z
  .object({
    version: z.coerce.number().int().min(0),
    status: z.enum(['draft', 'in_review', 'approved', 'needs_review']).optional(),
    riskLevel: z.enum(['low', 'medium', 'high']).optional(),
    mitigations: optionalTrimmed(4000),
    reviewedOn: isoDate.optional(),
    nextReviewOn: isoDate.optional(),
  })
  .strict()

/** Moves an assessment through review. Takes the version last read. */
export const PATCH = tenantRoute(async ({ request, ctx }) => ({
  body: { dpia: await updateDpia(ctx, pathSegment(request), parseOrThrow(Patch, await jsonBody(request))) },
}))
