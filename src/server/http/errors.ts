/**
 * One error shape for every API response.
 *
 * Handlers throw `ApiError`; a single boundary converts it to JSON. That keeps
 * status codes, machine-readable codes and field errors consistent instead of
 * each route inventing its own envelope — and it means an unexpected throw
 * cannot leak a stack trace to a client, because anything that is not an
 * ApiError becomes a generic 500.
 */

export type FieldErrors = Record<string, string>

export type ErrorBody = {
  error: {
    code: string
    message: string
    /** Per-field messages for form display. Absent when the failure is not field-level. */
    fields?: FieldErrors
    /** Echoed back so a user can quote it in a support ticket and it can be found in logs. */
    requestId?: string
    /** Present on 409 conflicts so the client can refetch and merge. */
    currentVersion?: number
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: FieldErrors
  readonly currentVersion?: number
  /** Extra context for the server log only. Never serialised to the client. */
  readonly detail?: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    message: string,
    options: { fields?: FieldErrors; currentVersion?: number; detail?: Record<string, unknown> } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = options.fields
    this.currentVersion = options.currentVersion
    this.detail = options.detail
  }

  toBody(requestId?: string): ErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
        ...(this.currentVersion !== undefined ? { currentVersion: this.currentVersion } : {}),
        ...(requestId ? { requestId } : {}),
      },
    }
  }
}

export const badRequest = (message: string, fields?: FieldErrors) =>
  new ApiError(400, 'bad_request', message, { fields })

export const invalidInput = (fields: FieldErrors) =>
  new ApiError(422, 'invalid_input', 'Some fields need attention.', { fields })

/**
 * Deliberately vague and identical for every authentication failure — unknown
 * address, wrong password, unverified, locked. Distinguishing them turns the
 * login form into an account-enumeration oracle.
 */
export const unauthorized = (message = 'Sign in to continue.') => new ApiError(401, 'unauthorized', message)

export const forbidden = (message = 'You do not have access to this.') => new ApiError(403, 'forbidden', message)

/**
 * Used for a record in another tenant as well as one that does not exist. A
 * 403 there would confirm the record exists, which is itself a leak.
 */
export const notFound = (what = 'That record') => new ApiError(404, 'not_found', `${what} was not found.`)

export const conflict = (message: string, currentVersion?: number) =>
  new ApiError(409, 'conflict', message, { currentVersion })

export const tooManyRequests = (message = 'Too many attempts. Try again shortly.', retryAfterSeconds?: number) =>
  new ApiError(429, 'too_many_requests', message, { detail: { retryAfterSeconds } })

export const unprocessable = (code: string, message: string) => new ApiError(422, code, message)

export const notImplemented = (code: string, message: string) => new ApiError(501, code, message)

/** A configured-but-unreachable third party. Distinct from our own 500. */
export const providerUnavailable = (message: string) => new ApiError(502, 'provider_unavailable', message)

export const internal = (detail?: Record<string, unknown>) =>
  new ApiError(500, 'internal_error', 'Something went wrong on our side.', { detail })
