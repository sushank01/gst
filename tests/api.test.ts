import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * HTTP-level tests against the real route handlers.
 *
 * The handlers are imported and invoked with real `Request` objects, so the
 * boundary under test is the one the browser talks to — validation, the error
 * envelope, cookie handling and authorization all included. A UI that forgot to
 * hide a button cannot make any of these pass.
 */

/*
 * The routes resolve the database through `getDb()`, which caches one handle
 * per process. Pointing PGLITE_DIR at a throwaway directory before the first
 * call means the test and the handlers share that exact handle — no module
 * patching, and nothing test-only leaks into production code.
 */
process.env.PGLITE_DIR = await mkdtemp(join(tmpdir(), 'apragya-api-'))

const { getDb, resetDbHandle } = await import('../src/server/db/client.ts')
const { migrate } = await import('../src/server/db/migrate.ts')
const db = await getDb()
await migrate(db)

const register = (await import('../src/app/api/v1/auth/register/route.ts')).POST
const login = (await import('../src/app/api/v1/auth/login/route.ts')).POST
const logout = (await import('../src/app/api/v1/auth/logout/route.ts')).POST
const session = (await import('../src/app/api/v1/auth/session/route.ts')).GET
const members = await import('../src/app/api/v1/members/route.ts')
const tenants = await import('../src/app/api/v1/tenants/route.ts')

const PASSWORD = 'correct horse battery staple'
const json = (url: string, body: unknown, cookie?: string) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })

const cookieOf = (response: Response) => {
  const raw = response.headers.get('set-cookie') ?? ''
  const value = raw.split(';')[0]
  return value.includes('=') ? value : ''
}

test('register returns 201, sets an httpOnly cookie and queues verification', async () => {
  const response = await register(json('http://x/api/v1/auth/register', {
    email: 'ada@example.com', fullName: 'Ada Lovelace', password: PASSWORD,
  }))
  assert.equal(response.status, 201)
  const raw = response.headers.get('set-cookie') ?? ''
  assert.match(raw, /HttpOnly/i, 'the session cookie is not readable by scripts')
  assert.match(raw, /SameSite=lax/i)
  const body = await response.json()
  assert.equal(body.user.emailVerified, false)

  const { rows } = await db.query<{ topic: string }>("select topic from outbox where topic = 'email.verify'")
  assert.equal(rows.length, 1, 'the verification email is queued, not merely claimed')
})

test('register rejects unknown fields rather than ignoring them', async () => {
  const response = await register(json('http://x/api/v1/auth/register', {
    email: 'x@example.com', fullName: 'X', password: PASSWORD, isAdmin: true,
  }))
  assert.equal(response.status, 422)
  const body = await response.json()
  assert.equal(body.error.code, 'invalid_input')
  assert.match(JSON.stringify(body.error.fields), /Unknown field/)
})

test('register reports per-field validation errors', async () => {
  const response = await register(json('http://x/api/v1/auth/register', { email: 'nope', fullName: '', password: 'a' }))
  assert.equal(response.status, 422)
  const body = await response.json()
  assert.ok(body.error.fields.email)
  assert.ok(body.error.fields.password)
})

test('a malformed body is a 400, not a crash', async () => {
  const response = await register(
    new Request('http://x/api/v1/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json',
    }),
  )
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'bad_request')
})

test('a body without a JSON content-type is refused', async () => {
  const response = await register(
    new Request('http://x/api/v1/auth/register', { method: 'POST', body: 'email=x' }),
  )
  assert.equal(response.status, 400)
})

test('login with the wrong password is 401 with a non-committal message', async () => {
  const response = await login(json('http://x/api/v1/auth/login', { email: 'ada@example.com', password: 'wrong wrong wrong' }))
  assert.equal(response.status, 401)
  const body = await response.json()
  assert.equal(body.error.code, 'unauthorized')
  assert.equal(body.error.message, 'That email address and password do not match.')
  assert.equal(response.headers.get('set-cookie'), null, 'no cookie is issued on failure')
})

test('login for an unknown address is identical to a wrong password', async () => {
  const response = await login(json('http://x/api/v1/auth/login', { email: 'ghost@example.com', password: PASSWORD }))
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.message, 'That email address and password do not match.')
})

test('PROTECTED: the session endpoint refuses an anonymous request', async () => {
  const response = await session(new Request('http://x/api/v1/auth/session'))
  assert.equal(response.status, 401)
})

test('PROTECTED: a forged cookie value does not authenticate', async () => {
  const response = await session(
    new Request('http://x/api/v1/auth/session', { headers: { cookie: 'apragya_session=made-up-token' } }),
  )
  assert.equal(response.status, 401)
})

test('PROTECTED: business endpoints refuse an anonymous request', async () => {
  assert.equal((await members.GET(new Request('http://x/api/v1/members'))).status, 401)
  assert.equal(
    (await members.POST(json('http://x/api/v1/members', { email: 'a@b.com', role: 'member' }))).status,
    401,
    'a POST with no session cannot invite anyone',
  )
})

test('a signed-in user with no workspace is 403 on business endpoints, not 500', async () => {
  const signedIn = await login(json('http://x/api/v1/auth/login', { email: 'ada@example.com', password: PASSWORD }))
  assert.equal(signedIn.status, 200)
  const cookie = cookieOf(signedIn)
  assert.ok(cookie)
  const response = await members.GET(new Request('http://x/api/v1/members', { headers: { cookie } }))
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error.code, 'forbidden')
})

test('full round trip: create a workspace, list members, invite, then sign out', async () => {
  const signedIn = await login(json('http://x/api/v1/auth/login', { email: 'ada@example.com', password: PASSWORD }))
  let cookie = cookieOf(signedIn)

  const created = await tenants.POST(json('http://x/api/v1/tenants', { name: 'Acme Industries' }, cookie))
  assert.equal(created.status, 201)
  cookie = cookieOf(created) || cookie

  const list = await members.GET(new Request('http://x/api/v1/members', { headers: { cookie } }))
  assert.equal(list.status, 200)
  const body = await list.json()
  assert.equal(body.members.length, 1)
  assert.equal(body.members[0].role, 'owner')

  const invited = await members.POST(json('http://x/api/v1/members', { email: 'bob@example.com', role: 'member' }, cookie))
  assert.equal(invited.status, 201)
  const invite = await invited.json()
  assert.ok(invite.invitationId)
  assert.equal(invite.token, undefined, 'the invitation token is never returned to the inviter')

  const signedOut = await logout(new Request('http://x/api/v1/auth/logout', { method: 'POST', headers: { cookie } }))
  assert.equal(signedOut.status, 204)

  const after = await session(new Request('http://x/api/v1/auth/session', { headers: { cookie } }))
  assert.equal(after.status, 401, 'the old cookie is dead server-side, not just cleared in the browser')
})

test('every response carries a request id for support and log correlation', async () => {
  const response = await session(new Request('http://x/api/v1/auth/session'))
  assert.match(response.headers.get('x-request-id') ?? '', /[\w-]{8,}/)
  assert.ok((await response.json()).error.requestId)
})

test('a supplied request id is echoed back', async () => {
  const response = await session(
    new Request('http://x/api/v1/auth/session', { headers: { 'x-request-id': 'trace-abc-123' } }),
  )
  assert.equal(response.headers.get('x-request-id'), 'trace-abc-123')
})

test('an invalid role on invite is rejected by the enum', async () => {
  const signedIn = await login(json('http://x/api/v1/auth/login', { email: 'ada@example.com', password: PASSWORD }))
  const cookie = cookieOf(signedIn)
  const response = await members.POST(json('http://x/api/v1/members', { email: 'x@example.com', role: 'superuser' }, cookie))
  assert.equal(response.status, 422)
})

test('teardown', async () => {
  await resetDbHandle()
})
