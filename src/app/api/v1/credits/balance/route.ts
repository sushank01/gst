import { tenantRoute } from '../../../../../server/http/handler.ts'
import { balance } from '../../../../../server/services/credits.ts'

/** Computed from the ledger on read. A stored running total can drift; a sum cannot. */
export const GET = tenantRoute(async ({ ctx }) => {
  ctx.require('record.read')
  return { body: { credits: await balance(ctx.db, ctx.tenantId) } }
})
