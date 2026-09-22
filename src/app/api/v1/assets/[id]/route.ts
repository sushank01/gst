import { tenantRoute, jsonBody, pathSegment, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, money, optionalTrimmed, uuid } from '../../../../../server/http/validate.ts'
import { archiveAsset, depreciationOf, readAsset, updateAsset } from '../../../../../server/services/assets.ts'

/** One asset, its current holder, and its depreciation when the inputs for one exist. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const asset = await readAsset(ctx, pathSegment(request))
  // Null when the inputs for it were never supplied — the client shows
  // "not set", not a fabricated schedule.
  return { body: { asset, depreciation: depreciationOf(asset, ctx.now) } }
})

const Patch = z
  .object({
    version: z.coerce.number().int().min(0),
    name: optionalTrimmed(200),
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

/** Edits an asset. Takes the version last read. */
export const PATCH = tenantRoute(async ({ request, ctx }) => {
  const asset = await updateAsset(ctx, pathSegment(request), parseOrThrow(Patch, await jsonBody(request)))
  return { body: { asset } }
})

/** Archive, never delete: custody and financial history outlive the item. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  const { version } = parseOrThrow(z.object({ version: z.coerce.number().int().min(0) }).strict(), searchParams(request))
  await archiveAsset(ctx, pathSegment(request), version)
  return { status: 204 }
})
