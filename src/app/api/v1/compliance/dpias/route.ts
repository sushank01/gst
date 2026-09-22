import { tenantRoute, jsonBody } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, optionalTrimmed, trimmed } from '../../../../../server/http/validate.ts'
import { addDpia, listDpias } from '../../../../../server/services/compliance.ts'

/** Data protection impact assessments this workspace has written. */
export const GET = tenantRoute(async ({ ctx }) => ({ body: { dpias: await listDpias(ctx) } }))

const Body = z
  .object({
    title: trimmed(200),
    processing: trimmed(4000),
    riskLevel: z.enum(['low', 'medium', 'high']).optional(),
    mitigations: optionalTrimmed(4000),
    nextReviewOn: isoDate.optional(),
  })
  .strict()

/** Opens an assessment as a draft. */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { dpia: await addDpia(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
