import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, optionalTrimmed, trimmed, uuid, money } from '../../../../../server/http/validate.ts'
import { DOCUMENT_KINDS, createDocument, listDocuments } from '../../../../../server/services/sales.ts'

const Query = z
  .object({
    kind: z.enum(DOCUMENT_KINDS).optional(),
    status: z.string().trim().max(40).optional(),
    customerId: uuid.optional(),
    q: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** Order-to-cash documents, filtered by kind, state or customer. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listDocuments(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { documents: rows, total } }
})

/*
 * Money crosses the boundary as a decimal string. A JSON number would be an
 * IEEE double, and 0.1 + 0.2 is not 0.3 in one — the server does this
 * arithmetic in integer minor units for exactly that reason.
 */
const Line = z
  .object({
    itemCode: optionalTrimmed(60),
    description: trimmed(400),
    quantity: money,
    unitPrice: money,
    discountPercent: money.optional(),
    taxCategoryId: uuid.optional(),
    taxRatePercent: money.optional(),
  })
  .strict()

const Body = z
  .object({
    kind: z.enum(DOCUMENT_KINDS),
    customerId: uuid.optional(),
    sourceDocumentId: uuid.optional(),
    currency,
    status: optionalTrimmed(40),
    issuedOn: isoDate.optional(),
    dueOn: isoDate.optional(),
    notes: optionalTrimmed(4000),
    lines: z.array(Line).min(1, 'Add at least one line.').max(500),
  })
  .strict()

/** Creates a document. Every total is computed on the server from the lines. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const document = await createDocument(ctx, parseOrThrow(Body, await jsonBody(request)))
  return { status: 201, body: { document } }
})
