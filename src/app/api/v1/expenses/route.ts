import { tenantRoute, jsonBody, searchParams } from '../../../../server/http/handler.ts'
import { parseOrThrow, z, currency, isoDate, money, optionalTrimmed, uuid } from '../../../../server/http/validate.ts'
import { listExpenses, recordExpense } from '../../../../server/services/expenses.ts'

const Query = z
  .object({
    employeeId: uuid.optional(),
    reportId: uuid.optional(),
    unfiled: z.coerce.boolean().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict()

export const GET = tenantRoute(async ({ request, ctx }) => ({
  body: { expenses: await listExpenses(ctx, parseOrThrow(Query, searchParams(request))) },
}))

const Body = z
  .object({
    employeeId: uuid,
    spentOn: isoDate,
    amount: money,
    currency,
    baseCurrency: currency,
    /*
     * Eight decimals, matching the column and what a rate feed publishes.
     * Rounding a rate to four quietly changes what somebody is paid.
     */
    fxRate: z.string().regex(/^\d+(\.\d{1,8})?$/, 'Use a rate with up to eight decimals.').optional(),
    categoryId: uuid.optional(),
    merchant: optionalTrimmed(200),
    description: optionalTrimmed(2000),
    receiptFileId: uuid.optional(),
    reimbursable: z.boolean().optional(),
  })
  .strict()

export const POST = tenantRoute(async ({ request, ctx }) => ({
  status: 201,
  body: { expense: await recordExpense(ctx, parseOrThrow(Body, await jsonBody(request))) },
}))
