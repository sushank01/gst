import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * HTTP tests for the domain routes: support, sales, files, settings, credits.
 *
 * Service-level tests prove the business rules. These prove the rules are
 * actually reachable and actually enforced at the boundary a browser talks to —
 * that the route parses what the UI sends, rejects what it should, and returns
 * the shape the UI reads. A service can be perfect and still unreachable.
 */

process.env.PGLITE_DIR = await mkdtemp(join(tmpdir(), 'apragya-routes-'))

const { getDb } = await import('../src/server/db/client.ts')
const { migrate } = await import('../src/server/db/migrate.ts')
const db = await getDb()
await migrate(db)

const register = (await import('../src/app/api/v1/auth/register/route.ts')).POST
const tenants = (await import('../src/app/api/v1/tenants/route.ts')).POST
const tickets = await import('../src/app/api/v1/support/tickets/route.ts')
const ticket = await import('../src/app/api/v1/support/tickets/[id]/route.ts')
const messages = await import('../src/app/api/v1/support/tickets/[id]/messages/route.ts')
const assign = await import('../src/app/api/v1/support/tickets/[id]/assign/route.ts')
const documents = await import('../src/app/api/v1/sales/documents/route.ts')
const documentPost = await import('../src/app/api/v1/sales/documents/[id]/post/route.ts')
const documentLines = await import('../src/app/api/v1/sales/documents/[id]/lines/route.ts')
const uploads = await import('../src/app/api/v1/files/uploads/route.ts')
const uploadBytes = await import('../src/app/api/v1/files/uploads/[id]/route.ts')
const grant = await import('../src/app/api/v1/files/[id]/grant/route.ts')
const download = await import('../src/app/api/v1/files/download/route.ts')
const settings = await import('../src/app/api/v1/settings/[app]/route.ts')
const settingsChanges = await import('../src/app/api/v1/settings/[app]/changes/route.ts')
const credits = await import('../src/app/api/v1/credits/balance/route.ts')

const PASSWORD = 'correct horse battery staple'
const BASE = 'http://test.local'

const post = (path: string, body: unknown, cookie?: string) =>
  new Request(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
const put = (path: string, body: unknown, cookie: string) =>
  new Request(BASE + path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
const get = (path: string, cookie: string) => new Request(BASE + path, { headers: { cookie } })
const cookieOf = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0]

/**
 * A signed-in owner with a workspace. Each caller gets its own, so tests do not
 * share state.
 *
 * Creating a workspace ROTATES the session token — entering a tenant is a
 * privilege change, and the old token is revoked. The cookie that matters is
 * therefore the one on the tenant response, not the one from registration;
 * reusing the registration cookie earns a 401, correctly.
 */
let seq = 0
async function owner(): Promise<string> {
  seq += 1
  const email = `owner${seq}@example.com`
  const signedUp = cookieOf(await register(post('/api/v1/auth/register', { email, fullName: `Owner ${seq}`, password: PASSWORD })))
  const created = await tenants(post('/api/v1/tenants', { name: `Workspace ${seq}` }, signedUp))
  assert.equal(created.status, 201, 'workspace creation failed')
  return cookieOf(created)
}

test('SESSION ROTATION: the pre-workspace token stops working once a workspace exists', async () => {
  seq += 1
  const email = `rotation${seq}@example.com`
  const before = cookieOf(await register(post('/api/v1/auth/register', { email, fullName: 'Rotation', password: PASSWORD })))
  const created = await tenants(post('/api/v1/tenants', { name: `Rotation ${seq}` }, before))
  const after = cookieOf(created)

  assert.notEqual(before, after, 'entering a workspace must issue a new token')
  assert.equal((await tickets.GET(get('/api/v1/support/tickets', before))).status, 401)
  assert.equal((await tickets.GET(get('/api/v1/support/tickets', after))).status, 200)
})

/* --------------------------------- support -------------------------------- */

test('a ticket is created, listed, read and replied to over HTTP', async () => {
  const cookie = await owner()

  const created = await tickets.POST(
    post('/api/v1/support/tickets', { subject: 'Card reader offline', body: 'It shows a red light.', priority: 'high' }, cookie),
  )
  assert.equal(created.status, 201)
  const { ticket: made } = await created.json()
  assert.equal(made.subject, 'Card reader offline')
  assert.match(made.reference, /\w/)

  const listed = await tickets.GET(get('/api/v1/support/tickets?status=new', cookie))
  const list = await listed.json()
  assert.equal(listed.status, 200)
  assert.equal(list.total, 1)

  const detail = await ticket.GET(get(`/api/v1/support/tickets/${made.id}`, cookie))
  const body = await detail.json()
  assert.equal(body.ticket.id, made.id)
  assert.ok(Array.isArray(body.sla), 'the detail view carries the SLA clocks')

  const replied = await messages.POST(
    post(`/api/v1/support/tickets/${made.id}/messages`, { body: 'An engineer is on the way.', visibility: 'public' }, cookie),
  )
  assert.equal(replied.status, 201)
})

test('CONFIDENTIALITY: the requester view of a thread omits internal notes', async () => {
  const cookie = await owner()
  const { ticket: made } = await (
    await tickets.POST(post('/api/v1/support/tickets', { subject: 'Refund', body: 'Where is it?' }, cookie))
  ).json()

  await messages.POST(
    post(`/api/v1/support/tickets/${made.id}/messages`, { body: 'Known fraud risk — check manually.', visibility: 'internal' }, cookie),
  )

  const agentView = await (await messages.GET(get(`/api/v1/support/tickets/${made.id}/messages`, cookie))).json()
  const requesterView = await (
    await messages.GET(get(`/api/v1/support/tickets/${made.id}/messages?view=requester`, cookie))
  ).json()

  assert.equal(agentView.messages.length, 2)
  assert.equal(requesterView.messages.length, 1, 'the internal note reached the requester view')
  assert.ok(!JSON.stringify(requesterView).includes('fraud risk'), 'internal text leaked through the requester view')
})

test('a ticket id from another workspace reads as not found', async () => {
  const mine = await owner()
  const theirs = await owner()
  const { ticket: hidden } = await (
    await tickets.POST(post('/api/v1/support/tickets', { subject: 'Theirs', body: 'Private' }, theirs))
  ).json()

  const response = await ticket.GET(get(`/api/v1/support/tickets/${hidden.id}`, mine))
  assert.equal(response.status, 404, 'a cross-tenant id must not be distinguishable from a missing one')
})

test('the boundary rejects an unknown field and a bad enum', async () => {
  const cookie = await owner()
  const unknown = await tickets.POST(post('/api/v1/support/tickets', { subject: 'x', body: 'y', isAdmin: true }, cookie))
  assert.equal(unknown.status, 422)

  const { ticket: made } = await (
    await tickets.POST(post('/api/v1/support/tickets', { subject: 'Enum', body: 'y' }, cookie))
  ).json()
  const bad = await messages.POST(
    post(`/api/v1/support/tickets/${made.id}/messages`, { body: 'hi', visibility: 'secret' }, cookie),
  )
  assert.equal(bad.status, 422)
})

test('assigning to a stranger is refused at the boundary', async () => {
  const cookie = await owner()
  const stranger = await owner()
  const strangerId = (await (await (await import('../src/app/api/v1/auth/session/route.ts')).GET(get('/api/v1/auth/session', stranger))).json()).user.id
  const { ticket: made } = await (
    await tickets.POST(post('/api/v1/support/tickets', { subject: 'Assign', body: 'y' }, cookie))
  ).json()

  const response = await assign.POST(
    post(`/api/v1/support/tickets/${made.id}/assign`, { userId: strangerId, version: made.version }, cookie),
  )
  assert.ok(response.status >= 400, `expected a refusal, got ${response.status}`)
})

test('no route answers without a session', async () => {
  const anonymous = [
    await tickets.GET(new Request(`${BASE}/api/v1/support/tickets`)),
    await documents.GET(new Request(`${BASE}/api/v1/sales/documents`)),
    await credits.GET(new Request(`${BASE}/api/v1/credits/balance`)),
    await settings.GET(new Request(`${BASE}/api/v1/settings/support?section=sla`)),
  ]
  for (const response of anonymous) assert.equal(response.status, 401)
})

/* ---------------------------------- sales --------------------------------- */

test('a sales document computes its totals server-side and posts once', async () => {
  const cookie = await owner()
  const created = await documents.POST(
    post(
      '/api/v1/sales/documents',
      {
        kind: 'invoice',
        currency: 'INR',
        lines: [
          { description: 'Consulting', quantity: '3', unitPrice: '1000.00', taxRatePercent: '18' },
          { description: 'Licence', quantity: '1', unitPrice: '500.00', discountPercent: '10', taxRatePercent: '18' },
        ],
      },
      cookie,
    ),
  )
  assert.equal(created.status, 201)
  const { document } = await created.json()

  /*
   * Presented the way an invoice is read: gross, less discount, plus tax.
   *   gross      3 x 1000 + 1 x 500        = 3500
   *   discount   10% of the 500 line       =   50
   *   net                                  = 3450
   *   tax        18% of each net line      =  621
   *   total                                = 4071
   * Every figure is computed on the server in integer minor units; none of it
   * is taken from the client.
   */
  assert.equal(document.subtotal, '3500.0000')
  assert.equal(document.discountTotal, '50.0000')
  assert.equal(document.taxTotal, '621.0000')
  assert.equal(document.grandTotal, '4071.0000')

  const posted = await documentPost.POST(post(`/api/v1/sales/documents/${document.id}/post`, { version: document.version }, cookie))
  assert.equal(posted.status, 200)
  const first = await posted.json()

  const again = await documentPost.POST(post(`/api/v1/sales/documents/${document.id}/post`, { version: document.version }, cookie))
  assert.equal((await again.json()).postedAt, first.postedAt, 'posting twice must not post twice')
})

test('a posted document refuses a line edit, and a stale version is a 409', async () => {
  const cookie = await owner()
  const { document } = await (
    await documents.POST(
      post('/api/v1/sales/documents', { kind: 'quotation', currency: 'INR', lines: [{ description: 'A', quantity: '1', unitPrice: '10' }] }, cookie),
    )
  ).json()

  const stale = await documentLines.PUT(
    put(`/api/v1/sales/documents/${document.id}/lines`, { version: document.version + 5, lines: [{ description: 'B', quantity: '1', unitPrice: '20' }] }, cookie),
  )
  assert.equal(stale.status, 409)
  assert.equal((await stale.json()).error.currentVersion, document.version, 'a 409 must tell the client what to refetch')

  await documentPost.POST(post(`/api/v1/sales/documents/${document.id}/post`, { version: document.version }, cookie))
  const afterPost = await documentLines.PUT(
    put(`/api/v1/sales/documents/${document.id}/lines`, { version: document.version + 1, lines: [{ description: 'C', quantity: '1', unitPrice: '30' }] }, cookie),
  )
  assert.ok(afterPost.status >= 400, 'a posted document must be immutable')
})

test('a document with no lines, or an invented kind, is refused at the boundary', async () => {
  const cookie = await owner()
  const empty = await documents.POST(post('/api/v1/sales/documents', { kind: 'invoice', currency: 'INR', lines: [] }, cookie))
  assert.equal(empty.status, 422)

  // The database has a check constraint for this, but reaching it means a 500.
  // The boundary knows the same vocabulary and answers 422.
  const invented = await documents.POST(
    post('/api/v1/sales/documents', { kind: 'proforma', currency: 'INR', lines: [{ description: 'A', quantity: '1', unitPrice: '1' }] }, cookie),
  )
  assert.equal(invented.status, 422)
})

/* ---------------------------------- files --------------------------------- */

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)])

const bytes = (path: string, body: Buffer, cookie: string, token: string) =>
  new Request(BASE + path, {
    method: 'PUT',
    headers: { cookie, 'x-upload-token': token, 'content-length': String(body.byteLength) },
    body: body as unknown as BodyInit,
  })

test('a file round-trips: begin, upload, grant, download', async () => {
  const cookie = await owner()
  const begun = await uploads.POST(
    post('/api/v1/files/uploads', { filename: 'logo.png', contentType: 'image/png', byteSize: PNG.byteLength, ownerKind: 'brand' }, cookie),
  )
  assert.equal(begun.status, 201)
  const { fileId, uploadToken } = await begun.json()

  const completed = await uploadBytes.PUT(bytes(`/api/v1/files/uploads/${fileId}`, PNG, cookie, uploadToken))
  assert.equal(completed.status, 200)
  const stored = await completed.json()
  assert.equal(stored.status, 'clean')
  assert.equal(stored.byteSize, PNG.byteLength)

  const granted = await grant.POST(post(`/api/v1/files/${fileId}/grant`, {}, cookie))
  const { token } = await granted.json()

  const first = await download.GET(get(`/api/v1/files/download?token=${encodeURIComponent(token)}`, cookie))
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('x-content-type-options'), 'nosniff')
  assert.match(first.headers.get('content-disposition') ?? '', /attachment/)
  assert.equal(Buffer.from(await first.arrayBuffer()).byteLength, PNG.byteLength)

  const replay = await download.GET(get(`/api/v1/files/download?token=${encodeURIComponent(token)}`, cookie))
  assert.equal(replay.status, 404, 'a download grant must be single-use')
})

test('bytes that do not match the declared type are rejected, not stored', async () => {
  const cookie = await owner()
  const script = Buffer.from('<script>alert(1)</script>')
  const { fileId, uploadToken } = await (
    await uploads.POST(
      post('/api/v1/files/uploads', { filename: 'evil.png', contentType: 'image/png', byteSize: script.byteLength, ownerKind: 'brand' }, cookie),
    )
  ).json()

  const response = await uploadBytes.PUT(bytes(`/api/v1/files/uploads/${fileId}`, script, cookie, uploadToken))
  assert.ok(response.status >= 400, 'a PNG that is not a PNG must be refused')

  const { rows } = await db.query<{ status: string }>('select status from files where id = $1', [fileId])
  assert.equal(rows[0].status, 'rejected', 'the attempt must leave a trail rather than vanish')
})

test('an upload without its token is refused', async () => {
  const cookie = await owner()
  const { fileId } = await (
    await uploads.POST(
      post('/api/v1/files/uploads', { filename: 'a.png', contentType: 'image/png', byteSize: PNG.byteLength, ownerKind: 'brand' }, cookie),
    )
  ).json()
  const response = await uploadBytes.PUT(
    new Request(`${BASE}/api/v1/files/uploads/${fileId}`, { method: 'PUT', headers: { cookie }, body: PNG as unknown as BodyInit }),
  )
  assert.equal(response.status, 400)
})

test('an executable content type is refused before any bytes are sent', async () => {
  const cookie = await owner()
  const response = await uploads.POST(
    post('/api/v1/files/uploads', { filename: 'x.exe', contentType: 'application/x-msdownload', byteSize: 10, ownerKind: 'brand' }, cookie),
  )
  assert.equal(response.status, 422)
})

/* -------------------------------- settings -------------------------------- */

test('settings write, re-read, record history and refuse a stale version', async () => {
  const cookie = await owner()
  const written = await settings.PUT(
    put('/api/v1/settings/support', { section: 'sla', value: { firstResponseMinutes: 60 }, version: 0, summary: 'Set first response to 1h' }, cookie),
  )
  assert.equal(written.status, 200)
  const { settings: saved } = await written.json()
  assert.equal(saved.version, 1)

  const read = await settings.GET(get('/api/v1/settings/support?section=sla', cookie))
  assert.equal((await read.json()).settings.value.firstResponseMinutes, 60)

  const stale = await settings.PUT(
    put('/api/v1/settings/support', { section: 'sla', value: { firstResponseMinutes: 30 }, version: 0, summary: 'Race' }, cookie),
  )
  assert.equal(stale.status, 409, 'two admins editing one pane must not silently overwrite')

  const history = await settingsChanges.GET(get('/api/v1/settings/support/changes?section=sla', cookie))
  const { changes } = await history.json()
  assert.equal(changes.length, 1)
  assert.equal(changes[0].summary, 'Set first response to 1h')
})

/* --------------------------------- credits -------------------------------- */

test('a new workspace reports a real, computed credit balance', async () => {
  const cookie = await owner()
  const response = await credits.GET(get('/api/v1/credits/balance', cookie))
  assert.equal(response.status, 200)
  const { credits: balance } = await response.json()
  assert.equal(typeof balance.available, 'number')
  assert.equal(balance.available, 0, 'credits must come from the ledger, not a seeded number')
})
