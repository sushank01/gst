import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, optionalTrimmed, uuid } from '../../../../../server/http/validate.ts'
import { listAssetRequests, requestAsset } from '../../../../../server/services/assets.ts'

const Query = z
  .object({
    status: z.string().trim().max(40).optional(),
    requesterUserId: uuid.optional(),
    assetType: z.string().trim().max(60).optional(),
    /** The caller's own requests — what an employee's self-service list shows. */
    mine: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Asset requests, filtered by state, type or who raised them. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listAssetRequests(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { requests: rows, total } }
})

const Body = z
  .object({
    assetType: optionalTrimmed(60),
    assetId: uuid.optional(),
    quantity: z.coerce.number().int().min(1).max(999).optional(),
    reason: optionalTrimmed(2000),
    neededBy: isoDate.optional(),
  })
  .strict()

/**
 * Raises a request. With no approval levels configured it is approved on
 * submission, rather than waiting for an approver who does not exist.
 */
export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { request: await requestAsset(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
