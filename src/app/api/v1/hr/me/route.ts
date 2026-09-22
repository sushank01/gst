import { tenantRoute } from '../../../../../server/http/handler.ts'
import { selfEmployee } from '../../../../../server/services/hr.ts'
import { openPunch } from '../../../../../server/services/attendance.ts'
import { leaveBalances } from '../../../../../server/services/leave.ts'

/**
 * Employee self-service.
 *
 * Answers `{employee: null}` when the signed-in account has no employee
 * record, which is a real state and not an error. The prototype reported that
 * for everybody because nothing was ever linked; here it means what it says.
 */
export const GET = tenantRoute(async ({ ctx }) => {
  const employee = await selfEmployee(ctx)
  if (!employee) return { body: { employee: null, balances: [], openPunch: null } }
  return {
    body: {
      employee,
      balances: await leaveBalances(ctx, employee.id, ctx.now.getUTCFullYear()),
      openPunch: await openPunch(ctx, employee.id),
    },
  }
})
