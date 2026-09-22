import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, optionalTrimmed, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { createVocabulary, listVocabulary } from '../../../../../server/services/hr.ts'

const Kind = z.enum(['department', 'designation', 'location'])

/** Departments, designations or locations. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(
    z.object({ kind: Kind, includeArchived: z.coerce.boolean().optional() }).strict(),
    searchParams(request),
  )
  return { body: { entries: await listVocabulary(ctx, query.kind, query.includeArchived) } }
})

const Body = z
  .object({
    kind: Kind,
    name: trimmed(120),
    code: optionalTrimmed(40),
    parentId: uuid.optional(),
    timezone: optionalTrimmed(60),
    calendarId: uuid.optional(),
  })
  .strict()

/** Adds a department, designation or location. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const { kind, ...input } = parseOrThrow(Body, await jsonBody(request))
  return { status: 201, body: { entry: await createVocabulary(ctx, kind, input) } }
})
