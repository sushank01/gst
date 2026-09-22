'use client'

/**
 * The browser's only route to the server.
 *
 * Every call goes through here so the error envelope is decoded once: a 422
 * arrives as field errors a form can render, a 409 carries the version to merge
 * against, and a 401 is distinguishable from a network failure. Screens then
 * handle *states* rather than re-parsing responses.
 */

export type FieldErrors = Record<string, string>

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: FieldErrors
  readonly currentVersion?: number
  readonly requestId?: string

  constructor(
    status: number,
    code: string,
    message: string,
    extra: { fields?: FieldErrors; currentVersion?: number; requestId?: string } = {},
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.fields = extra.fields
    this.currentVersion = extra.currentVersion
    this.requestId = extra.requestId
  }

  /** True when retrying the same request could plausibly succeed. */
  get retryable() {
    return this.status >= 500 || this.status === 0 || this.status === 429
  }
  get isAuth() {
    return this.status === 401
  }
  get isDenied() {
    return this.status === 403
  }
  get isConflict() {
    return this.status === 409
  }
}

export const API_BASE = '/api/v1'

type RequestOptions = {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
}

function withQuery(path: string, query: RequestOptions['query']): string {
  if (!query) return `${API_BASE}${path}`
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const suffix = params.toString()
  return `${API_BASE}${path}${suffix ? `?${suffix}` : ''}`
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options

  let response: Response
  try {
    response = await fetch(withQuery(path, query), {
      method,
      signal,
      // Cookies carry the session; nothing is read from or written to storage.
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    // Offline, DNS, CORS — a real network failure, not a server answer. Status
    // 0 keeps that distinguishable from a 500 the server chose to send.
    if ((error as Error).name === 'AbortError') throw error
    throw new ApiClientError(0, 'network_error', 'Could not reach the server. Check your connection and try again.')
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      throw new ApiClientError(response.status, 'bad_response', 'The server sent a response we could not read.')
    }
  }

  if (!response.ok) {
    const envelope = (payload as { error?: { code?: string; message?: string; fields?: FieldErrors; currentVersion?: number; requestId?: string } })?.error
    throw new ApiClientError(
      response.status,
      envelope?.code ?? 'error',
      envelope?.message ?? 'Something went wrong.',
      {
        fields: envelope?.fields,
        currentVersion: envelope?.currentVersion,
        requestId: envelope?.requestId ?? response.headers.get('x-request-id') ?? undefined,
      },
    )
  }

  return payload as T
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    apiRequest<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, query?: RequestOptions['query']) => apiRequest<T>(path, { method: 'DELETE', query }),
}
