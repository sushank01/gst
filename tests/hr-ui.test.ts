import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * HTTP tests for the endpoints the HR screens were moved onto.
 *
 * The service tests in `hr.test.ts` prove the business rules. These prove the
 * screens can actually reach them: that each route parses the query the screen
 * sends, answers in the shape the screen reads, and refuses what it should.
 *
 * That distinction matters here more than anywhere else in the product. HR's
 * pages were written against a browser-local store, so every one of them
 * rendered convincingly with no server at all — a route that does not exist,
 * or that rejects the query string a filter produces, would have looked
 * exactly the same.
 */

process.env.PGLITE_DIR = await mkdtemp(join(tmpdir(), 'apragya-hr-ui-'))

const { getDb } = await import('../src/server/db/client.ts')
const { migrate } = await import('../src/server/db/migrate.ts')
const db = await getDb()
await migrate(db)

const register = (await import('../src/app/api/v1/auth/register/route.ts')).POST
const tenants = (await import('../src/app/api/v1/tenants/route.ts')).POST
const employees = await import('../src/app/api/v1/hr/employees/route.ts')
const exitEmployee = await import('../src/app/api/v1/hr/employees/[id]/exit/route.ts')
const transfer = await import('../src/app/api/v1/hr/employees/[id]/transfer/route.ts')
const vocabulary = await import('../src/app/api/v1/hr/vocabulary/route.ts')
const vocabularyEntry = await import('../src/app/api/v1/hr/vocabulary/[id]/route.ts')
const overview = await import('../src/app/api/v1/hr/overview/route.ts')
const lifecycle = await import('../src/app/api/v1/hr/lifecycle-changes/route.ts')
const documents = await import('../src/app/api/v1/hr/documents/route.ts')
const shifts = await import('../src/app/api/v1/hr/shifts/route.ts')
const shiftAssignments = await import('../src/app/api/v1/hr/shifts/assignments/route.ts')
const attendance = await import('../src/app/api/v1/hr/attendance/route.ts')
const settleAttendance = await import('../src/app/api/v1/hr/attendance/[employeeId]/route.ts')
const punch = await import('../src/app/api/v1/hr/attendance/punch/route.ts')
const overtime = await import('../src/app/api/v1/hr/overtime/route.ts')
const timesheets = await import('../src/app/api/v1/hr/timesheets/route.ts')
const leaveTypes = await import('../src/app/api/v1/hr/leave/types/route.ts')
const leaveType = await import('../src/app/api/v1/hr/leave/types/[id]/route.ts')
const allocations = await import('../src/app/api/v1/hr/leave/allocations/route.ts')
const leaveRequests = await import('../src/app/api/v1/hr/leave/requests/route.ts')
const me = await import('../src/app/api/v1/hr/me/route.ts')

const PASSWORD = 'correct horse battery staple'
const BASE = 'http://test.local'

const post = (path: string, body: unknown, cookie?: string) =>
  new Request(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
const get = (path: string, cookie: string) => new Request(BASE + path, { headers: { cookie } })
const del = (path: string, cookie: string) => new Request(BASE + path, { method: 'DELETE', headers: { cookie } })
const cookieOf = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0]

let seq = 0
async function owner(): Promise<string> {
  seq += 1
  const email = `hr-ui-${seq}@example.com`
  const signedUp = cookieOf(
    await register(post('/api/v1/auth/register', { email, fullName: `Owner ${seq}`, password: PASSWORD })),
  )
  const created = await tenants(post('/api/v1/tenants', { name: `HR workspace ${seq}` }, signedUp))
  assert.equal(created.status, 201, 'workspace creation failed')
  return cookieOf(created)
}

async function hire(cookie: string, fullName: string, extra: Record<string, unknown> = {}) {
  const created = await employees.POST(
    post('/api/v1/hr/employees', { fullName, joinedOn: '2026-01-05', ...extra }, cookie),
  )
  // The body is read once: a Response cannot be consumed twice, and reading it
  // for the failure message would leave nothing for the caller.
  const body = await created.json()
  assert.equal(created.status, 201, JSON.stringify(body))
  return body.employee as { id: string; version: number; fullName: string }
}

/* ------------------------------- directory -------------------------------- */

test('the directory filters by every control the toolbar offers', async () => {
  const cookie = await owner()
  const sales = await vocabulary.POST(post('/api/v1/hr/vocabulary', { kind: 'department', name: 'Sales' }, cookie))
  const { entry: department } = await sales.json()

  await hire(cookie, 'Ada Lovelace', { departmentId: department.id, employmentType: 'full_time' })
  await hire(cookie, 'Grace Hopper', { joinedOn: '2025-03-01', employmentType: 'contract' })

  /*
   * Each of these was a dropdown that opened, held a choice and filtered
   * nothing. If a filter is not in the query the route accepts, it cannot
   * narrow anything — and the count beside the list would still say two.
   */
  const byDepartment = await employees.GET(get(`/api/v1/hr/employees?departmentId=${department.id}`, cookie))
  assert.equal((await byDepartment.json()).total, 1)

  const byType = await employees.GET(get('/api/v1/hr/employees?employmentType=contract', cookie))
  assert.equal((await byType.json()).total, 1)

  const byJoined = await employees.GET(get('/api/v1/hr/employees?joinedFrom=2026-01-01', cookie))
  assert.equal((await byJoined.json()).total, 1)

  const searched = await employees.GET(get('/api/v1/hr/employees?q=lovelace', cookie))
  assert.equal((await searched.json()).total, 1)

  // The paged response still reports the count for the filter, which is what
  // the toolbar renders beside the rows.
  const paged = await employees.GET(get('/api/v1/hr/employees?limit=1', cookie))
  const page = await paged.json()
  assert.equal(page.employees.length, 1)
  assert.equal(page.total, 2)
})

test('an unknown filter is refused rather than silently ignored', async () => {
  const cookie = await owner()
  // A typo in a query the UI builds has to be visible; a route that ignores it
  // returns a full list that looks filtered.
  const response = await employees.GET(get('/api/v1/hr/employees?deparment=sales', cookie))
  assert.equal(response.status, 422)
})

test('recording an exit carries the version, and a stale one is a conflict', async () => {
  const cookie = await owner()
  const ada = await hire(cookie, 'Ada Lovelace')

  const stale = await exitEmployee.POST(
    post(`/api/v1/hr/employees/${ada.id}/exit`, { exitedOn: '2026-06-30', reason: 'Resigned', version: ada.version - 1 }, cookie),
  )
  assert.equal(stale.status, 409)
  assert.equal((await stale.json()).error.currentVersion, ada.version, 'the conflict carries the version to merge against')

  const recorded = await exitEmployee.POST(
    post(`/api/v1/hr/employees/${ada.id}/exit`, { exitedOn: '2026-06-30', reason: 'Resigned', version: ada.version }, cookie),
  )
  assert.equal(recorded.status, 200)
  assert.equal((await recorded.json()).employee.status, 'exited')

  // The record survives the exit: the directory still holds their history.
  const listed = await employees.GET(get('/api/v1/hr/employees?status=exited', cookie))
  assert.equal((await listed.json()).total, 1)
})

/* ------------------------------- vocabulary -------------------------------- */

test('a taxonomy entry can be added and retired over HTTP', async () => {
  const cookie = await owner()
  const created = await vocabulary.POST(post('/api/v1/hr/vocabulary', { kind: 'location', name: 'Pune' }, cookie))
  assert.equal(created.status, 201)
  const { entry } = await created.json()

  const removed = await vocabularyEntry.DELETE(del(`/api/v1/hr/vocabulary/${entry.id}?kind=location`, cookie))
  assert.equal(removed.status, 204, 'the Remove button has an endpoint behind it')

  const listed = await vocabulary.GET(get('/api/v1/hr/vocabulary?kind=location', cookie))
  assert.deepEqual((await listed.json()).entries, [])
})

/* -------------------------------- dashboard -------------------------------- */

test('the dashboard reads counts it can compute and names the ones it cannot', async () => {
  const cookie = await owner()
  await hire(cookie, 'Ada Lovelace')

  const response = await overview.GET(get('/api/v1/hr/overview', cookie))
  const { overview: figures } = await response.json()
  assert.equal(figures.headcount, 1)
  assert.equal(figures.byDepartment.length, 1)
  assert.deepEqual(figures.pendingApprovals, { leave: 0, timesheets: 0, overtime: 0 })
  assert.ok(
    figures.unavailable.some((entry: { metric: string }) => entry.metric === 'Attrition'),
    'a figure nothing can compute is named, not rendered as 0.0%',
  )
})

/* --------------------------- lifecycle and shifts -------------------------- */

test('a transfer appears under lifecycle changes with what it changed from', async () => {
  const cookie = await owner()
  const sales = await (await vocabulary.POST(post('/api/v1/hr/vocabulary', { kind: 'department', name: 'Sales' }, cookie))).json()
  const support = await (await vocabulary.POST(post('/api/v1/hr/vocabulary', { kind: 'department', name: 'Support' }, cookie))).json()
  const ada = await hire(cookie, 'Ada Lovelace', { departmentId: sales.entry.id })

  const moved = await transfer.POST(
    post(
      `/api/v1/hr/employees/${ada.id}/transfer`,
      { effectiveFrom: '2026-04-01', departmentId: support.entry.id, reason: 'Transfer to Support', version: ada.version },
      cookie,
    ),
  )
  assert.equal(moved.status, 200)

  const listed = await lifecycle.GET(get('/api/v1/hr/lifecycle-changes?kind=transfer', cookie))
  const body = await listed.json()
  assert.equal(body.total, 1)
  assert.equal(body.changes[0].departmentFrom, 'Sales')
  assert.equal(body.changes[0].departmentTo, 'Support')
})

test('a shift can be defined and assigned, which is what makes lateness measurable', async () => {
  const cookie = await owner()
  const ada = await hire(cookie, 'Ada Lovelace')

  const created = await shifts.POST(
    post(
      '/api/v1/hr/shifts',
      { name: 'General', startsMinute: 540, endsMinute: 1080, breakMinutes: 60, graceMinutes: 10, weekdays: [1, 2, 3, 4, 5] },
      cookie,
    ),
  )
  assert.equal(created.status, 201)
  const { shift } = await created.json()

  const assigned = await shiftAssignments.POST(
    post('/api/v1/hr/shifts/assignments', { employeeId: ada.id, shiftId: shift.id, effectiveFrom: '2026-01-05' }, cookie),
  )
  assert.equal(assigned.status, 201)

  const listed = await shiftAssignments.GET(get('/api/v1/hr/shifts/assignments', cookie))
  const body = await listed.json()
  assert.equal(body.total, 1)
  assert.equal(body.assignments[0].employeeName, 'Ada Lovelace')
  assert.equal(body.assignments[0].shiftName, 'General')

  /*
   * With the shift in place, a settled day can report overtime. Without one it
   * could not — which is why the report says so rather than showing zero.
   */
  await punch.POST(post('/api/v1/hr/attendance/punch', { direction: 'in', employeeId: ada.id, at: '2026-01-05T09:00:00Z' }, cookie))
  await punch.POST(post('/api/v1/hr/attendance/punch', { direction: 'out', employeeId: ada.id, at: '2026-01-05T20:00:00Z' }, cookie))
  const settled = await settleAttendance.POST(post(`/api/v1/hr/attendance/${ada.id}`, { on: '2026-01-05' }, cookie))
  assert.equal(settled.status, 200)

  const report = await attendance.GET(
    get('/api/v1/hr/attendance?from=2026-01-01&to=2026-01-31&minOvertimeMinutes=1', cookie),
  )
  const days = await report.json()
  assert.equal(days.total, 1)
  assert.equal(days.totals.overtimeMinutes, 660 - 480)
  assert.equal(days.days[0].employeeName, 'Ada Lovelace')
})

test('attendance without a date range is refused, so a screen cannot ask for everything', async () => {
  const cookie = await owner()
  const response = await attendance.GET(get('/api/v1/hr/attendance', cookie))
  assert.equal(response.status, 422)
})

/* -------------------------- overtime and timesheets ------------------------ */

test('an overtime claim can be listed, which it never could before', async () => {
  const cookie = await owner()
  const ada = await hire(cookie, 'Ada Lovelace')

  const claimed = await overtime.POST(
    post('/api/v1/hr/overtime', { employeeId: ada.id, workedOn: '2026-02-02', minutes: 90, reason: 'Release' }, cookie),
  )
  assert.equal(claimed.status, 201)

  const listed = await overtime.GET(get('/api/v1/hr/overtime?status=submitted', cookie))
  const body = await listed.json()
  assert.equal(body.total, 1)
  assert.equal(body.overtime[0].employeeName, 'Ada Lovelace')
  assert.equal(body.overtime[0].minutes, 90)
  assert.ok(typeof body.overtime[0].version === 'number', 'the row carries the version its decision must send')
})

test('a timesheet list carries the employee name and the count for the filter', async () => {
  const cookie = await owner()
  const ada = await hire(cookie, 'Ada Lovelace')
  await timesheets.POST(post('/api/v1/hr/timesheets', { employeeId: ada.id, periodStart: '2026-03-02', periodEnd: '2026-03-06' }, cookie))
  await timesheets.POST(post('/api/v1/hr/timesheets', { employeeId: ada.id, periodStart: '2026-03-09', periodEnd: '2026-03-13' }, cookie))

  const listed = await timesheets.GET(get('/api/v1/hr/timesheets?limit=1', cookie))
  const body = await listed.json()
  assert.equal(body.timesheets.length, 1)
  assert.equal(body.total, 2)
  assert.equal(body.timesheets[0].employeeName, 'Ada Lovelace')
})

/* ----------------------------------- leave --------------------------------- */

test('the leave library, the ledger and the request queue are all reachable', async () => {
  const cookie = await owner()
  const ada = await hire(cookie, 'Ada Lovelace')

  const type = await leaveTypes.POST(post('/api/v1/hr/leave/types', { name: 'Annual leave', code: 'AL' }, cookie))
  assert.equal(type.status, 201)
  const { leaveType: annual } = await type.json()

  const library = await leaveTypes.GET(get('/api/v1/hr/leave/types', cookie))
  const libraryBody = await library.json()
  assert.equal(libraryBody.leaveTypes.length, 1)
  assert.equal(libraryBody.leaveTypes[0].requiresApproval, true, 'the library carries the rules each type applies')

  const granted = await allocations.POST(
    post(
      '/api/v1/hr/leave/allocations',
      { employeeId: ada.id, leaveTypeId: annual.id, year: 2026, days: '12', reason: 'opening balance' },
      cookie,
    ),
  )
  assert.equal(granted.status, 201)

  // Idempotent: the same grant submitted twice reports that it changed nothing
  // rather than doubling the opening balance.
  const again = await allocations.POST(
    post(
      '/api/v1/hr/leave/allocations',
      { employeeId: ada.id, leaveTypeId: annual.id, year: 2026, days: '12', reason: 'opening balance' },
      cookie,
    ),
  )
  assert.equal(again.status, 200)
  assert.equal((await again.json()).recorded, false)

  const ledger = await allocations.GET(get('/api/v1/hr/leave/allocations?kind=grant', cookie))
  const ledgerBody = await ledger.json()
  assert.equal(ledgerBody.total, 1)
  assert.equal(ledgerBody.entries[0].employeeName, 'Ada Lovelace')

  const booked = await leaveRequests.POST(
    post(
      '/api/v1/hr/leave/requests',
      { employeeId: ada.id, leaveTypeId: annual.id, startsOn: '2026-05-04', endsOn: '2026-05-05' },
      cookie,
    ),
  )
  assert.equal(booked.status, 201)

  const queue = await leaveRequests.GET(get('/api/v1/hr/leave/requests?status=submitted', cookie))
  const queueBody = await queue.json()
  assert.equal(queueBody.total, 1)
  assert.equal(queueBody.requests[0].employeeName, 'Ada Lovelace')
  assert.equal(queueBody.requests[0].leaveTypeName, 'Annual leave', 'the queue names the type rather than its id')

  // Retiring a type with an undecided request against it is refused, whatever
  // the dates: somebody still has to answer that request.
  const refused = await leaveType.DELETE(del(`/api/v1/hr/leave/types/${annual.id}`, cookie))
  assert.equal(refused.status, 422)
})

/* -------------------------------- documents -------------------------------- */

test('the document count is the server count, and an empty store answers zero', async () => {
  const cookie = await owner()
  const response = await documents.GET(get('/api/v1/hr/documents', cookie))
  const body = await response.json()
  assert.equal(body.total, 0)
  assert.deepEqual(body.documents, [], 'zero documents is a real answer, not a hard-coded "0 documents"')
})

/* ------------------------------ self-service ------------------------------- */

test('self-service answers null honestly for an account with no employee record', async () => {
  const cookie = await owner()
  const response = await me.GET(get('/api/v1/hr/me', cookie))
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.employee, null, 'the "no employee profile" message is now a fact about this account')
  assert.deepEqual(body.balances, [])
})
