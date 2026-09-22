import { tenantRoute, jsonBody, pathSegment } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, optionalTrimmed, uuid } from '../../../../../server/http/validate.ts'
import { archiveCompany, readCompany, updateCompany } from '../../../../../server/services/companies.ts'

/** One entity, with the name of its parent. */
export const GET = tenantRoute(async ({ request, ctx }) => ({ body: { company: await readCompany(ctx, pathSegment(request)) } }))

const Patch = z
  .object({
    name: optionalTrimmed(160),
    currency: currency.optional(),
    timezone: optionalTrimmed(60),
    country: optionalTrimmed(2).nullable().optional(),
    taxId: optionalTrimmed(40).nullable().optional(),
    /** `null` detaches it from its parent; a cycle is refused. */
    parentId: uuid.nullable().optional(),
  })
  .strict()

/** Edits an entity, including where it sits in the hierarchy. */
export const PATCH = tenantRoute(async ({ request, ctx }) => ({
  body: { company: await updateCompany(ctx, pathSegment(request), parseOrThrow(Patch, await jsonBody(request))) },
}))

/** Archives it — refused for the primary entity, and while it has subsidiaries. */
export const DELETE = tenantRoute(async ({ request, ctx }) => {
  await archiveCompany(ctx, pathSegment(request))
  return { status: 204 }
})
