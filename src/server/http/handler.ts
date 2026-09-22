import { randomUUID } from 'node:crypto'
import { getDb, type Db } from '../db/client.ts'
import { ApiError, badRequest, internal } from './errors.ts'
import { authenticate, withTenant, type AuthContext, type TenantContext } from '../tenancy/context.ts'
import { SESSION_COOKIE } from '../auth/session.ts'

/**
 * The single request boundary.
 *
 * Authentication, tenant binding, JSON parsing, the error envelope and the
 * request id all happen here, once. A route handler that forgets to check auth
 * is not possible: it asks for `tenantRoute` or it gets no context at all.
 *
 * Everything here speaks the Web standard `Request`/`Response` that Next route
 * handlers accept, with no framework import. That keeps the boundary testable
 * by calling it with a plain `new Request(...)` — the tests exercise the same
 * code the browser reaches, not a re-implementation of it.
 */

/** Minimal, spec-correct Set-Cookie serialisation. */
function serialiseCookie(cookie: CookieInstruction): string {
  const parts = [`${cookie.name}=${encodeURIComponent(cookie.value)}`]
  const { options } = cookie
  parts.push(`Path=${options.path ?? '/'}`)
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  if (options.httpOnly !== false) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  parts.push(`SameSite=${options.sameSite ?? 'lax'}`)
  return parts.join('; ')
}

function jsonResponse(body: unknown, status: number): Response {
  return status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body ?? null), { status, headers: { 'content-type': 'application/json' } })
}

export type CookieInstruction = {
  name: string
  value: string
  options: { httpOnly?: boolean; secure?: boolean; sameSite?: 'lax' | 'strict' | 'none'; path?: string; expires?: Date; maxAge?: number }
}

export type RouteResult = {
  status?: number
  body?: unknown
  headers?: Record<string, string>
  /** Applied by the boundary, so a handler never builds a response itself. */
  cookies?: CookieInstruction[]
  /**
   * Bytes rather than JSON — a file download. The filename is quoted and
   * stripped of anything that could break out of the header, because it comes
   * from whatever the uploader typed.
   */
  raw?: { body: Uint8Array; contentType: string; filename?: string }
}

const REQUEST_ID_HEADER = 'x-request-id'

/** Client-supplied ids are echoed for tracing but never trusted as identity. */
function requestIdOf(request: Request): string {
  const supplied = request.headers.get(REQUEST_ID_HEADER)
  return supplied && /^[\w-]{8,64}$/.test(supplied) ? supplied : randomUUID()
}

function sessionTokenOf(request: Request): string | undefined {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

/** Everything a filename may contain once it reaches a header. */
function safeFilename(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'download'
}

function respond(result: RouteResult, requestId: string): Response {
  const status = result.status ?? (result.body === undefined && !result.raw ? 204 : 200)
  const response = result.raw
    ? new Response(result.raw.body as unknown as BodyInit, {
        status,
        headers: {
          'content-type': result.raw.contentType,
          'content-length': String(result.raw.body.byteLength),
          // `attachment` so a stored HTML or SVG file can never execute on our
          // origin, and `nosniff` so the browser does not second-guess the type.
          'content-disposition': `attachment; filename="${safeFilename(result.raw.filename ?? 'download')}"`,
          'x-content-type-options': 'nosniff',
        },
      })
    : jsonResponse(result.body, status)
  response.headers.set(REQUEST_ID_HEADER, requestId)
  for (const [key, value] of Object.entries(result.headers ?? {})) response.headers.set(key, value)
  // `append`, not `set`: several cookies may be issued in one response.
  for (const cookie of result.cookies ?? []) response.headers.append('set-cookie', serialiseCookie(cookie))
  return response
}

function fail(error: unknown, requestId: string): Response {
  if (error instanceof ApiError) {
    const response = jsonResponse(error.toBody(requestId), error.status)
    response.headers.set(REQUEST_ID_HEADER, requestId)
    const retryAfter = error.detail?.retryAfterSeconds
    if (typeof retryAfter === 'number') response.headers.set('retry-after', String(retryAfter))
    return response
  }
  // An unexpected throw must not reach the client as a stack trace, and must
  // not be mistaken for a handled business error.
  console.error(`[${requestId}] unhandled`, error)
  const response = jsonResponse(internal().toBody(requestId), 500)
  response.headers.set(REQUEST_ID_HEADER, requestId)
  return response
}

export type PublicHandler = (input: { request: Request; db: Db; now: Date; requestId: string }) => Promise<RouteResult>
export type AuthHandler = (input: { request: Request; ctx: AuthContext }) => Promise<RouteResult>
export type TenantHandler = (input: { request: Request; ctx: TenantContext }) => Promise<RouteResult>

/** No session required — sign-in, sign-up, public content. */
export function publicRoute(handler: PublicHandler) {
  return async (request: Request): Promise<Response> => {
    const requestId = requestIdOf(request)
    try {
      const db = await getDb()
      return respond(await handler({ request, db, now: new Date(), requestId }), requestId)
    } catch (error) {
      return fail(error, requestId)
    }
  }
}

/** A valid session, but no tenant yet — used by tenant selection and account. */
export function authRoute(handler: AuthHandler) {
  return async (request: Request): Promise<Response> => {
    const requestId = requestIdOf(request)
    try {
      const db = await getDb()
      const ctx = await authenticate(db, sessionTokenOf(request), { now: new Date(), requestId })
      return respond(await handler({ request, ctx }), requestId)
    } catch (error) {
      return fail(error, requestId)
    }
  }
}

/**
 * A valid session bound to a tenant the user actually belongs to. This is the
 * default for business data — the tenant comes from the session row, so no
 * request can address another tenant by supplying its id.
 */
export function tenantRoute(handler: TenantHandler) {
  return async (request: Request): Promise<Response> => {
    const requestId = requestIdOf(request)
    try {
      const db = await getDb()
      const auth = await authenticate(db, sessionTokenOf(request), { now: new Date(), requestId })
      const ctx = await withTenant(auth)
      return respond(await handler({ request, ctx }), requestId)
    } catch (error) {
      return fail(error, requestId)
    }
  }
}

/** Body parsing that reports a bad payload as 400 rather than throwing a SyntaxError. */
export async function jsonBody(request: Request): Promise<unknown> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) throw badRequest('Send a JSON body with content-type: application/json.')
  const text = await request.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw badRequest('That request body is not valid JSON.')
  }
}

/**
 * A path segment counted from the end: `pathSegment(request, 0)` is the last.
 *
 * Routes read their own ids rather than taking Next's `params`, so the same
 * handler can be called from a test with a plain `new Request(url)`.
 */
export function pathSegment(request: Request, fromEnd = 0): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean)
  return segments[segments.length - 1 - fromEnd] ?? ''
}

export function searchParams(request: Request): Record<string, string> {
  const url = new URL(request.url)
  const out: Record<string, string> = {}
  for (const [key, value] of url.searchParams.entries()) out[key] = value
  return out
}
