import { tenantRoute, jsonBody } from '../../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDateTime, optionalTrimmed, uuid } from '../../../../../../server/http/validate.ts'
import { punchIn, punchOut } from '../../../../../../server/services/attendance.ts'
import { selfEmployee } from '../../../../../../server/services/hr.ts'
import { notFound } from '../../../../../../server/http/errors.ts'

const Body = z
  .object({
    direction: z.enum(['in', 'out']),
    // Left out, the clock is the server's. A client-supplied time is only
    // honoured for an administrator correcting a record.
    employeeId: uuid.optional(),
    at: isoDateTime.optional(),
    note: optionalTrimmed(400),
  })
  .strict()

/**
 * Clocks in or out — the caller's own record, or somebody else's as a correction.
 *
 * Without `employeeId` this acts on the caller's own record, which is the
 * self-service path. With one it is an administrative correction and requires
 * the permission to update records — otherwise anybody could clock a colleague in.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))

  let employeeId = input.employeeId
  if (!employeeId) {
    const self = await selfEmployee(ctx)
    if (!self) throw notFound('Your employee record')
    employeeId = self.id
  } else {
    ctx.require('record.update')
  }

  const at = input.at ? new Date(input.at) : ctx.now
  const punch =
    input.direction === 'in'
      ? await punchIn(ctx, employeeId, { at, note: input.note })
      : await punchOut(ctx, employeeId, { at, note: input.note })
  return { body: { punch } }
})
