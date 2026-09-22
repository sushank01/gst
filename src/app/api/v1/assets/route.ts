import { tenantRoute, jsonBody, searchParams } from '../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, money, optionalTrimmed, trimmed, uuid } from '../../../../server/http/validate.ts'
import { createAsset, listAssets } from '../../../../server/services/assets.ts'

const Query = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.string().trim().max(40).optional(),
    assetType: z.string().trim().max(60).optional(),
    location: z.string().trim().max(120).optional(),
    holderUserId: uuid.optional(),
    includeArchived: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** The asset register, filtered and paged. Archived assets are hidden unless asked for. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listAssets(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { assets: rows, total } }
})

const Body = z
  .object({
    name: trimmed(200),
    // Optional: left out, the server allocates the next tag from a locked
    // sequence, which is the only way two registrars cannot collide.
    tag: optionalTrimmed(40),
    assetType: optionalTrimmed(60),
    make: optionalTrimmed(120),
    model: optionalTrimmed(120),
    serialNumber: optionalTrimmed(120),
    condition: optionalTrimmed(60),
    location: optionalTrimmed(120),
    acquiredOn: isoDate.optional(),
    modeOfPurchase: optionalTrimmed(60),
    purchaseCost: money.optional(),
    currency: currency.optional(),
    supplierPartyId: uuid.optional(),
    invoiceRef: optionalTrimmed(120),
    warrantyExpiresOn: isoDate.optional(),
    usefulLifeMonths: z.coerce.number().int().min(1).max(1200).optional(),
    salvageValue: money.optional(),
    notes: optionalTrimmed(4000),
  })
  .strict()

/** Registers an asset, allocating the next tag from a locked sequence. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const asset = await createAsset(ctx, parseOrThrow(Body, await jsonBody(request)))
  return { status: 201, body: { asset } }
})
