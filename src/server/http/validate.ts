import { z } from 'zod'
import { invalidInput } from './errors.ts'
import { passwordProblem } from '../auth/password.ts'

/**
 * Request validation.
 *
 * Every DTO is `.strict()`: an unknown field is a 422, not a silently ignored
 * key. That turns a client typo or a stale field name into a visible failure
 * instead of a value that quietly never gets saved.
 */

/** Flattens a Zod error into the `fields` map the error envelope carries. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.length ? issue.path.join('.') : '_'
    if (fields[path]) continue
    fields[path] =
      issue.code === 'unrecognized_keys'
        ? `Unknown field${(issue).keys.length > 1 ? 's' : ''}: ${(issue).keys.join(', ')}`
        : issue.message
  }
  return fields
}

export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) throw invalidInput(fieldErrors(result.error))
  return result.data
}

/* ------------------------------ shared shapes ----------------------------- */

export const uuid = z.uuid({ message: 'Expected an id.' })
export const trimmed = (max: number) => z.string().trim().min(1, 'This is required.').max(max, `Use at most ${max} characters.`)
export const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .transform((value) => (value === '' ? undefined : value))

/**
 * The password policy, applied at the boundary rather than only inside the
 * service. Otherwise a request with three bad fields reports two of them and
 * the form shows an error appearing one at a time. `passwordProblem` stays the
 * single source of truth; this only surfaces it earlier.
 */
export const passwordField = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value)
  if (problem) ctx.addIssue({ code: 'custom', message: problem })
})

export const emailField = z.string().trim().min(1, 'Enter your email address.').max(320).email('Enter a valid email address.')

/** ISO-4217. Stored uppercase so `usd` and `USD` cannot become two currencies. */
export const currency = z
  .string()
  .trim()
  .length(3, 'Use a 3-letter currency code.')
  .transform((value) => value.toUpperCase())

/**
 * Money arrives as a decimal *string*, never a JS number: 0.1 + 0.2 must not
 * reach an invoice. The string is validated here and handed to PostgreSQL
 * `numeric` unchanged.
 */
export const money = z
  .string()
  .trim()
  .regex(/^-?\d{1,14}(\.\d{1,4})?$/, 'Enter an amount with up to 4 decimal places.')

export const isoDate = z.iso.date('Use a YYYY-MM-DD date.')
export const isoDateTime = z.iso.datetime({ offset: true, message: 'Use an ISO timestamp with an offset.' })

export const pagination = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().trim().max(500).optional(),
    sort: z.string().trim().max(60).optional(),
    direction: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()

/** Optimistic concurrency. A mutation without it cannot silently clobber. */
export const versioned = z.object({ version: z.coerce.number().int().min(0) })

export { z }
