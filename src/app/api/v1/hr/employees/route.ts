import { tenantRoute, jsonBody, searchParams } from '../../../../../server/http/handler.ts'
import { parseOrThrow, z, isoDate, optionalTrimmed, trimmed, uuid } from '../../../../../server/http/validate.ts'
import { hireEmployee, listEmployees } from '../../../../../server/services/hr.ts'

const Query = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.string().trim().max(40).optional(),
    departmentId: uuid.optional(),
    locationId: uuid.optional(),
    managerId: uuid.optional(),
    includeArchived: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()

/** People, filtered and paged. */
export const GET = tenantRoute(async ({ request, ctx }) => {
  const { rows, total } = await listEmployees(ctx, parseOrThrow(Query, searchParams(request)))
  return { body: { employees: rows, total } }
})

const Body = z
  .object({
    fullName: trimmed(200),
    employeeNo: optionalTrimmed(40),
    userId: uuid.optional(),
    preferredName: optionalTrimmed(120),
    workEmail: z.string().trim().email('Enter a valid email address.').optional().or(z.literal('')),
    personalEmail: z.string().trim().email('Enter a valid email address.').optional().or(z.literal('')),
    phone: optionalTrimmed(40),
    dateOfBirth: isoDate.optional(),
    employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern', 'consultant']).optional(),
    joinedOn: isoDate,
    probationEndsOn: isoDate.optional(),
    departmentId: uuid.optional(),
    designationId: uuid.optional(),
    locationId: uuid.optional(),
    managerId: uuid.optional(),
    status: z.enum(['pre_joining', 'probation', 'active']).optional(),
  })
  .strict()

/** Hires somebody: the record and its first position, in one transaction. */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const input = parseOrThrow(Body, await jsonBody(request))
  const employee = await hireEmployee(ctx, {
    ...input,
    workEmail: input.workEmail || null,
    personalEmail: input.personalEmail || null,
  })
  return { status: 201, body: { employee } }
})
