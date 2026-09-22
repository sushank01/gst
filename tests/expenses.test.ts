import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import { hireEmployee } from '../src/server/services/hr.ts'
import {
  attachExpense, convert, createCategory, decideReport, detachExpense, expenseSummary,
  importCardTransactions, listApprovalLevels, listCardTransactions, listCategories, listExpenses,
  listReimbursementRuns, listReports, matchCardTransaction, openReport, readReport, recordExpense,
  replaceApprovalLevels, runReimbursement, submitReport, updateCategory,
} from '../src/server/services/expenses.ts'

async function workspace() {
  const db = await freshDb()
  const c = clock()
  const finance = await seedUser(db, { email: 'fin@example.com', fullName: 'Finance' })
  const outsider = await seedUser(db, { email: 'out@example.com', fullName: 'Outsider' })
  const acme = await createTenantWithOwner(db, finance, { name: 'Acme' }, c.now(), 'r1')
  const rival = await createTenantWithOwner(db, outsider, { name: 'Rival' }, c.now(), 'r2')
  const ctxFor = async (userId: string, tenantId: string) => {
    const { token } = await createSession(db, { userId, tenantId }, c.now())
    return withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))
  }
  const ctx = await ctxFor(finance, acme.tenantId)
  const employee = await hireEmployee(ctx, { fullName: 'Ada Lovelace', joinedOn: '2026-01-05' })
  const other = await hireEmployee(ctx, { fullName: 'Grace Hopper', joinedOn: '2026-01-05' })
  // `ctxFor` is handed back so a test can act at a later instant: every
  // context carries the clock it was built with, and a turnaround is a
  // measurement across two of them.
  return { db, c, ctx, ctxFor: () => ctxFor(finance, acme.tenantId), rivalCtx: await ctxFor(outsider, rival.tenantId), employee, other }
}

const SPEND = { spentOn: '2026-03-02', amount: '1200.0000', currency: 'INR', baseCurrency: 'INR', merchant: 'Taxi Co' }

/* ------------------------------- conversion ------------------------------- */

test('conversion is exact at the recorded rate and rounds half up', () => {
  assert.equal(convert('100.0000', '1.0000'), '100.0000')
  assert.equal(convert('100.0000', '83.2500'), '8325.0000')
  // 10.005 x 1.5 = 15.0075 exactly; the fourth decimal is kept, not truncated.
  assert.equal(convert('10.0050', '1.5000'), '15.0075')
  // A rate that produces a fifth decimal rounds half up on the fourth.
  assert.equal(convert('1.0000', '0.33335'), '0.3334')
})

test('a cross-currency expense without a stated rate is refused, not guessed', async () => {
  const { db, ctx, employee } = await workspace()
  await assert.rejects(
    () => recordExpense(ctx, { ...SPEND, employeeId: employee.id, currency: 'USD', baseCurrency: 'INR' }),
    /State the rate/i,
    'inventing a rate is inventing a reimbursement amount',
  )

  const converted = await recordExpense(ctx, {
    ...SPEND,
    employeeId: employee.id,
    amount: '100.0000',
    currency: 'USD',
    baseCurrency: 'INR',
    fxRate: '83.2500',
  })
  assert.equal(converted.baseAmount, '8325.0000')
  assert.equal(converted.fxRate, '83.25000000', 'the rate used is kept, so the figure can be rebuilt')
  await db.close()
})

/* ---------------------------------- claims -------------------------------- */

test('DOUBLE CLAIM: an expense cannot sit on two reports', async () => {
  const { db, ctx, employee } = await workspace()
  const expense = await recordExpense(ctx, { ...SPEND, employeeId: employee.id })
  const first = await openReport(ctx, { employeeId: employee.id, title: 'March', currency: 'INR' })
  const second = await openReport(ctx, { employeeId: employee.id, title: 'March again', currency: 'INR' })

  await attachExpense(ctx, first.id, expense.id)
  await assert.rejects(
    () => attachExpense(ctx, second.id, expense.id),
    /already on another report/i,
    'the prototype held a total, so the same bill could sit in two claims',
  )

  // Detaching frees it, which is the legitimate way to move it.
  await detachExpense(ctx, first.id, expense.id)
  const moved = await attachExpense(ctx, second.id, expense.id)
  assert.equal(moved.totalAmount, '1200.0000')
  await db.close()
})

test('a report cannot mix currencies or hold somebody else s expense', async () => {
  const { db, ctx, employee, other } = await workspace()
  const report = await openReport(ctx, { employeeId: employee.id, title: 'March', currency: 'INR' })

  const theirs = await recordExpense(ctx, { ...SPEND, employeeId: other.id })
  await assert.rejects(() => attachExpense(ctx, report.id, theirs.id), /different person/i)

  const usd = await recordExpense(ctx, {
    ...SPEND,
    employeeId: employee.id,
    amount: '50.0000',
    currency: 'USD',
    baseCurrency: 'USD',
  })
  await assert.rejects(() => attachExpense(ctx, report.id, usd.id), /converts to USD/i)
  await db.close()
})

test('the report total is the sum of its lines, and excludes non-reimbursable ones', async () => {
  const { db, ctx, employee } = await workspace()
  const report = await openReport(ctx, { employeeId: employee.id, title: 'March', currency: 'INR' })
  const a = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '1200.0000' })
  const b = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '800.5000', merchant: 'Hotel' })
  const personal = await recordExpense(ctx, {
    ...SPEND,
    employeeId: employee.id,
    amount: '5000.0000',
    merchant: 'Minibar',
    reimbursable: false,
  })

  await attachExpense(ctx, report.id, a.id)
  await attachExpense(ctx, report.id, b.id)
  const withPersonal = await attachExpense(ctx, report.id, personal.id)
  assert.equal(withPersonal.totalAmount, '2000.5000', 'a non-reimbursable line is recorded but not claimed')

  const read = await readReport(ctx, report.id)
  assert.equal(read.expenses.length, 3)
  await db.close()
})

test('an empty report cannot be submitted, and a submitted one is frozen', async () => {
  const { db, ctx, employee } = await workspace()
  const report = await openReport(ctx, { employeeId: employee.id, title: 'March', currency: 'INR' })
  await assert.rejects(() => submitReport(ctx, report.id, report.version), /at least one reimbursable/i)

  const expense = await recordExpense(ctx, { ...SPEND, employeeId: employee.id })
  await attachExpense(ctx, report.id, expense.id)
  const submitted = await submitReport(ctx, report.id, report.version)
  assert.equal(submitted.status, 'submitted')

  const another = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, merchant: 'Cafe' })
  await assert.rejects(() => attachExpense(ctx, report.id, another.id), /cannot be changed/i)
  await assert.rejects(() => submitReport(ctx, report.id, submitted.version), /already submitted/i)
  await db.close()
})

test('policy flags are computed, not decorative: limits, receipts and duplicates', async () => {
  const { db, ctx, employee } = await workspace()
  const { rows } = await db.query<{ id: string }>(
    `insert into te_expense_categories (tenant_id, name, code, limit_amount, receipt_required_above)
     values ($1, 'Meals', 'MEAL', 1000, 500) returning id`,
    [ctx.tenantId],
  )
  const meals = rows[0].id

  const overLimit = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, categoryId: meals, amount: '1500.0000' })
  assert.deepEqual(
    overLimit.policyFlags.map((flag) => flag.code).sort(),
    ['over_category_limit', 'receipt_missing'],
  )

  const withReceipt = await recordExpense(ctx, {
    ...SPEND,
    employeeId: employee.id,
    categoryId: meals,
    amount: '600.0000',
    merchant: 'Cafe',
    receiptFileId: null,
  })
  assert.deepEqual(withReceipt.policyFlags.map((flag) => flag.code), ['receipt_missing'])

  const under = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, categoryId: meals, amount: '200.0000', merchant: 'Kiosk' })
  assert.deepEqual(under.policyFlags, [])

  // Same person, day, merchant and amount: flagged, not blocked.
  const duplicate = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, categoryId: meals, amount: '200.0000', merchant: 'Kiosk' })
  assert.ok(duplicate.policyFlags.some((flag) => flag.code === 'possible_duplicate'))
  await db.close()
})

test('submitting carries the lines flags up to the claim', async () => {
  const { db, ctx, employee } = await workspace()
  const { rows } = await db.query<{ id: string }>(
    `insert into te_expense_categories (tenant_id, name, code, receipt_required_above) values ($1,'Meals','MEAL',100) returning id`,
    [ctx.tenantId],
  )
  const report = await openReport(ctx, { employeeId: employee.id, title: 'March', currency: 'INR' })
  const expense = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, categoryId: rows[0].id })
  await attachExpense(ctx, report.id, expense.id)

  const submitted = await submitReport(ctx, report.id, report.version)
  assert.ok(
    submitted.policyFlags.some((flag) => flag.code === 'receipt_missing'),
    'an approver must see the problem on the claim, not only by opening each line',
  )
  await db.close()
})

/* -------------------------------- approvals ------------------------------- */

async function withLevels(thresholds: [number, string][]) {
  const context = await workspace()
  for (const [level, threshold] of thresholds) {
    await context.db.query(
      `insert into te_approval_levels (tenant_id, level, label, threshold, scope) values ($1,$2,$3,$4,'expense')`,
      [context.ctx.tenantId, level, `Level ${level}`, threshold],
    )
  }
  return context
}

test('a claim clears every level its amount requires, and only those', async () => {
  const { db, ctx, employee } = await withLevels([
    [1, '0'],
    [2, '5000'],
  ])

  // A small claim: one level.
  const small = await openReport(ctx, { employeeId: employee.id, title: 'Small', currency: 'INR' })
  const smallExpense = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '1000.0000' })
  await attachExpense(ctx, small.id, smallExpense.id)
  const smallSubmitted = await submitReport(ctx, small.id, small.version)
  const smallDecided = await decideReport(ctx, small.id, { decision: 'approved', version: smallSubmitted.version })
  assert.equal(smallDecided.status, 'approved', 'a small claim must not wait on a level that exists for large ones')

  // A large claim: two.
  const large = await openReport(ctx, { employeeId: employee.id, title: 'Large', currency: 'INR' })
  const largeExpense = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '9000.0000', merchant: 'Airline' })
  await attachExpense(ctx, large.id, largeExpense.id)
  const largeSubmitted = await submitReport(ctx, large.id, large.version)

  const afterOne = await decideReport(ctx, large.id, { decision: 'approved', version: largeSubmitted.version })
  assert.equal(afterOne.status, 'submitted')
  assert.equal(afterOne.currentLevel, 2)

  const afterTwo = await decideReport(ctx, large.id, { decision: 'approved', version: afterOne.version })
  assert.equal(afterTwo.status, 'approved')
  assert.equal(afterTwo.approvedAmount, '9000.0000')
  await db.close()
})

test('a level cannot be decided twice, so a double-click cannot skip one', async () => {
  const { db, ctx, employee } = await withLevels([
    [1, '0'],
    [2, '5000'],
  ])
  const report = await openReport(ctx, { employeeId: employee.id, title: 'Large', currency: 'INR' })
  const expense = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '9000.0000' })
  await attachExpense(ctx, report.id, expense.id)
  const submitted = await submitReport(ctx, report.id, report.version)

  const results = await Promise.allSettled([
    decideReport(ctx, report.id, { decision: 'approved', version: submitted.version }),
    decideReport(ctx, report.id, { decision: 'approved', version: submitted.version }),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)

  const { rows } = await db.query<{ n: string }>(
    'select count(*)::text as n from te_approvals where subject_id = $1',
    [report.id],
  )
  assert.equal(rows[0].n, '1', 'one decision per level, whatever the button does')
  await db.close()
})

test('a rejection stops the claim and an approver can reduce the amount', async () => {
  const { db, ctx, employee } = await withLevels([[1, '0']])
  const report = await openReport(ctx, { employeeId: employee.id, title: 'March', currency: 'INR' })
  const expense = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '1200.0000' })
  await attachExpense(ctx, report.id, expense.id)
  const submitted = await submitReport(ctx, report.id, report.version)

  const rejected = await decideReport(ctx, report.id, { decision: 'rejected', version: submitted.version, note: 'no receipt' })
  assert.equal(rejected.status, 'rejected')

  // Rejected returns it to an editable state so it can be corrected, and the
  // correction is decided afresh rather than inheriting the earlier decision.
  const fixed = await submitReport(ctx, report.id, rejected.version)
  assert.equal(fixed.status, 'submitted')
  assert.equal(fixed.approvalRound, 2, 'a resubmission is a new approval round')
  const reduced = await decideReport(ctx, report.id, {
    decision: 'approved',
    version: fixed.version,
    approvedAmount: '900.0000',
  })
  assert.equal(reduced.approvedAmount, '900.0000')
  await db.close()
})

/* ------------------------------ reconciliation ---------------------------- */

test('re-importing a statement adds nothing, and a card line matches one expense', async () => {
  const { db, ctx, employee } = await workspace()
  const lines = [
    { externalRef: 'tx-1', postedOn: '2026-03-02', merchant: 'Taxi Co', amount: '1200.0000', currency: 'INR' },
    { externalRef: 'tx-2', postedOn: '2026-03-03', merchant: 'Hotel', amount: '8000.0000', currency: 'INR' },
  ]
  assert.deepEqual(await importCardTransactions(ctx, lines), { imported: 2, duplicates: 0 })
  assert.deepEqual(await importCardTransactions(ctx, lines), { imported: 0, duplicates: 2 }, 'a re-imported statement is not a second set of charges')

  const { rows: unmatched, total } = await listCardTransactions(ctx, { matched: false })
  assert.equal(unmatched.length, 2)
  assert.equal(total, 2)

  const expense = await recordExpense(ctx, { ...SPEND, employeeId: employee.id })
  await matchCardTransaction(ctx, unmatched[1].id, expense.id)

  await assert.rejects(() => matchCardTransaction(ctx, unmatched[0].id, expense.id), /already matched/i)
  await assert.rejects(() => matchCardTransaction(ctx, unmatched[1].id, expense.id), /already matched/i)
  assert.equal((await listCardTransactions(ctx, { matched: false })).total, 1)
  // The matched side has to be answerable too, or a "Matched" badge can only
  // ever be guessed from what the unmatched query left out.
  const matched = await listCardTransactions(ctx, { matched: true })
  assert.equal(matched.total, 1)
  assert.equal(matched.rows[0].matchedExpenseId, expense.id)
  assert.equal((await listCardTransactions(ctx, {})).total, 2, 'no filter means every line')
  await db.close()
})

/* ------------------------------ reimbursement ----------------------------- */

async function approvedReport(context: Awaited<ReturnType<typeof workspace>>, amount: string, title: string) {
  const report = await openReport(context.ctx, { employeeId: context.employee.id, title, currency: 'INR' })
  const expense = await recordExpense(context.ctx, { ...SPEND, employeeId: context.employee.id, amount, merchant: title })
  await attachExpense(context.ctx, report.id, expense.id)
  const submitted = await submitReport(context.ctx, report.id, report.version)
  return decideReport(context.ctx, report.id, { decision: 'approved', version: submitted.version })
}

test('DOUBLE PAYMENT: a report is reimbursed once, however often the run fires', async () => {
  const context = await workspace()
  const { db, ctx } = context
  await approvedReport(context, '1200.0000', 'March')
  await approvedReport(context, '800.0000', 'April')

  const first = await runReimbursement(ctx, { currency: 'INR' })
  assert.equal(first.paid, 2)
  assert.equal(first.total, '2000.0000')

  // The prototype's equivalent re-paid every approved report on every click.
  const second = await runReimbursement(ctx, { currency: 'INR' })
  assert.equal(second.paid, 0, 'nothing is left approved, so nothing is paid again')
  assert.equal(second.total, '0.0000')

  const { rows } = await db.query<{ n: string; total: string }>(
    'select count(*)::text as n, coalesce(sum(amount),0)::text as total from te_reimbursement_items',
  )
  assert.equal(rows[0].n, '2', 'two reports, two payments, ever')
  assert.equal(rows[0].total, '2000.0000')
  await db.close()
})

test('two concurrent payout runs cannot both pay the same report', async () => {
  const context = await workspace()
  const { db, ctx } = context
  await approvedReport(context, '1200.0000', 'March')

  const [a, b] = await Promise.allSettled([
    runReimbursement(ctx, { currency: 'INR' }),
    runReimbursement(ctx, { currency: 'INR' }),
  ])
  const paid = [a, b]
    .filter((result) => result.status === 'fulfilled')
    .reduce((total, result) => total + (result as PromiseFulfilledResult<{ paid: number }>).value.paid, 0)
  assert.equal(paid, 1, 'exactly one run may pay it')

  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from te_reimbursement_items where report_id is not null')
  assert.equal(rows[0].n, '1')
  await db.close()
})

test('only approved reports in the run s own currency are paid', async () => {
  const context = await workspace()
  const { db, ctx, employee } = context
  await approvedReport(context, '1200.0000', 'March')

  // Submitted but not approved.
  const pending = await openReport(ctx, { employeeId: employee.id, title: 'Pending', currency: 'INR' })
  const expense = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '500.0000', merchant: 'Pending' })
  await attachExpense(ctx, pending.id, expense.id)
  await submitReport(ctx, pending.id, pending.version)

  const run = await runReimbursement(ctx, { currency: 'INR' })
  assert.equal(run.paid, 1, 'an unapproved claim is not money owed')

  const usdRun = await runReimbursement(ctx, { currency: 'USD' })
  assert.equal(usdRun.paid, 0)
  await db.close()
})

test('ISOLATION: expenses and reports never cross workspaces', async () => {
  const { db, ctx, rivalCtx, employee } = await workspace()
  const report = await openReport(ctx, { employeeId: employee.id, title: 'March', currency: 'INR' })
  const expense = await recordExpense(ctx, { ...SPEND, employeeId: employee.id })

  await assert.rejects(() => readReport(rivalCtx, report.id), /That report/)
  await assert.rejects(() => attachExpense(rivalCtx, report.id, expense.id), /That report/)
  assert.equal((await listExpenses(rivalCtx, {})).length, 0)
  assert.equal((await runReimbursement(rivalCtx, { currency: 'INR' })).paid, 0)
  await db.close()
})

/* ---------------------------------- travel -------------------------------- */

const { createTrip, submitTrip, decideTrip, addBooking, readTrip, listTrips, cancelTrip } = await import(
  '../src/server/services/travel.ts'
)

const TRIP = {
  purpose: 'Customer workshop',
  destination: 'Bengaluru',
  departsOn: '2026-05-04',
  returnsOn: '2026-05-07',
  estimatedCost: '40000.0000',
  currency: 'INR',
}

test('a trip is approved before it can be booked', async () => {
  const { db, ctx, employee } = await workspace()
  await db.query(
    `insert into te_approval_levels (tenant_id, level, label, threshold, scope) values ($1,1,'Manager',0,'travel')`,
    [ctx.tenantId],
  )
  const trip = await createTrip(ctx, { ...TRIP, employeeId: employee.id })
  assert.match(trip.reference, /^TRV-\d{4}-0001$/)

  await assert.rejects(
    () => addBooking(ctx, trip.id, { kind: 'flight', vendor: 'IndiGo', cost: '18000.0000', currency: 'INR' }),
    /cannot be booked yet/i,
    'booking an unapproved trip makes it a fait accompli',
  )

  const submitted = await submitTrip(ctx, trip.id, trip.version)
  const approved = await decideTrip(ctx, trip.id, { decision: 'approved', version: submitted.version })
  assert.equal(approved.status, 'approved')

  await addBooking(ctx, trip.id, { kind: 'flight', vendor: 'IndiGo', cost: '18000.0000', currency: 'INR' })
  const read = await readTrip(ctx, trip.id)
  assert.equal(read.status, 'booked', 'the first booking moves it on, so the list shows what is arranged')
  assert.equal(read.bookings.length, 1)
  await db.close()
})

test('overlapping trips for one person are refused', async () => {
  const { db, ctx, employee, other } = await workspace()
  const first = await createTrip(ctx, { ...TRIP, employeeId: employee.id })
  await submitTrip(ctx, first.id, first.version)

  await assert.rejects(
    () => createTrip(ctx, { ...TRIP, employeeId: employee.id, departsOn: '2026-05-06', returnsOn: '2026-05-09' }),
    /already covers those dates/i,
    'somebody cannot be in two places, and two live requests means two advances',
  )

  // A different person over the same dates is fine.
  const theirs = await createTrip(ctx, { ...TRIP, employeeId: other.id })
  assert.equal(theirs.status, 'draft')

  // So is the same person once the first trip is called off.
  await cancelTrip(ctx, first.id, first.version + 1)
  const replacement = await createTrip(ctx, { ...TRIP, employeeId: employee.id })
  assert.ok(replacement.id)
  await db.close()
})

test('a trip clears every threshold level, and a resubmission is decided afresh', async () => {
  const { db, ctx, employee } = await workspace()
  await db.query(
    `insert into te_approval_levels (tenant_id, level, label, threshold, scope)
     values ($1,1,'Manager',0,'travel'), ($1,2,'Finance',30000,'travel')`,
    [ctx.tenantId],
  )
  const trip = await createTrip(ctx, { ...TRIP, employeeId: employee.id })
  const submitted = await submitTrip(ctx, trip.id, trip.version)

  const afterOne = await decideTrip(ctx, trip.id, { decision: 'approved', version: submitted.version })
  assert.equal(afterOne.status, 'submitted')
  assert.equal(afterOne.currentLevel, 2)

  const rejected = await decideTrip(ctx, trip.id, { decision: 'rejected', version: afterOne.version, note: 'too expensive' })
  assert.equal(rejected.status, 'rejected')

  const resubmitted = await submitTrip(ctx, trip.id, rejected.version)
  assert.equal(resubmitted.approvalRound, 2)
  assert.equal(resubmitted.currentLevel, 1, 'a new round starts at the first level that applies')

  const roundTwo = await decideTrip(ctx, trip.id, { decision: 'approved', version: resubmitted.version })
  assert.equal(roundTwo.currentLevel, 2, 'the earlier round s approval does not carry over')

  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from te_approvals where subject_id = $1', [trip.id])
  assert.equal(rows[0].n, '3', 'both rounds stay on record — who approved what is not erased')
  await db.close()
})

test('an estimate without a currency is refused, and return-before-departure too', async () => {
  const { db, ctx, employee } = await workspace()
  await assert.rejects(
    () => createTrip(ctx, { ...TRIP, employeeId: employee.id, currency: undefined }),
    /State the currency/i,
  )
  await assert.rejects(
    () => createTrip(ctx, { ...TRIP, employeeId: employee.id, departsOn: '2026-05-09', returnsOn: '2026-05-04' }),
    /before the departure/i,
  )
  await db.close()
})

test('ISOLATION: trips never cross workspaces', async () => {
  const { db, ctx, rivalCtx, employee } = await workspace()
  const trip = await createTrip(ctx, { ...TRIP, employeeId: employee.id })
  await assert.rejects(() => readTrip(rivalCtx, trip.id), /That travel request/)
  await assert.rejects(() => submitTrip(rivalCtx, trip.id, trip.version), /That travel request/)
  assert.equal((await listTrips(rivalCtx, {})).total, 0)
  await db.close()
})

/* ------------------------------ expense policy ---------------------------- */

/** The Expense policy pane writes here; the engine reads it from the same place. */
async function savePolicy(
  context: Awaited<ReturnType<typeof workspace>>,
  section: string,
  value: Record<string, unknown>,
) {
  await context.db.query(
    `insert into app_settings (tenant_id, company_id, app_code, section, value) values ($1,$2,'TE',$3,$4)`,
    [context.ctx.tenantId, context.ctx.companyId, section, JSON.stringify(value)],
  )
}

async function claimOf(context: Awaited<ReturnType<typeof workspace>>, amount: string, merchant = 'Hotel') {
  const report = await openReport(context.ctx, { employeeId: context.employee.id, title: 'March', currency: 'INR' })
  const expense = await recordExpense(context.ctx, { ...SPEND, employeeId: context.employee.id, amount, merchant })
  await attachExpense(context.ctx, report.id, expense.id)
  return report
}

test('block mode refuses a claim that breaks policy; warn mode lets it through', async () => {
  const warned = await workspace()
  await savePolicy(warned, 'expense_policy', { enforcement: 'warn', receiptRequiredAbove: '500' })
  const flagged = await claimOf(warned, '1200.0000')
  const submitted = await submitReport(warned.ctx, flagged.id, flagged.version)
  assert.ok(
    submitted.policyFlags.some((flag) => flag.code === 'receipt_missing'),
    'warn mode is the default behaviour: flag it and let the approver decide',
  )
  await warned.db.close()

  const blocked = await workspace()
  await savePolicy(blocked, 'expense_policy', { enforcement: 'block', receiptRequiredAbove: '500' })
  const bad = await claimOf(blocked, '1200.0000')
  await assert.rejects(
    () => submitReport(blocked.ctx, bad.id, bad.version),
    /breaks policy/i,
    'the pane has always promised block mode stops submission; saving it must do that',
  )
  await blocked.db.close()
})

test('a category with its own receipt threshold overrides the workspace-wide one', async () => {
  const context = await workspace()
  const { db, ctx, employee } = context
  await savePolicy(context, 'expense_policy', { receiptRequiredAbove: '100' })
  const lenient = await createCategory(ctx, { name: 'Meals', code: 'MEAL', receiptRequiredAbove: '5000' })

  const uncategorised = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '600.0000' })
  assert.deepEqual(
    uncategorised.policyFlags.map((flag) => flag.code),
    ['receipt_missing'],
    'the workspace threshold applies where nothing more specific does',
  )

  const meal = await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '600.0000', categoryId: lenient.id, merchant: 'Cafe' })
  assert.deepEqual(meal.policyFlags, [], 'the more specific rule wins, rather than both being applied')
  await db.close()
})

test('turning duplicate detection off stops the flag being raised', async () => {
  const context = await workspace()
  const { db, ctx, employee } = context
  await savePolicy(context, 'expense_policy', { flagDuplicates: false })
  await recordExpense(ctx, { ...SPEND, employeeId: employee.id })
  const second = await recordExpense(ctx, { ...SPEND, employeeId: employee.id })
  assert.deepEqual(second.policyFlags, [], 'a checkbox that changes nothing is a checkbox that lies')
  await db.close()
})

/* --------------------------------- figures -------------------------------- */

test('the dashboard summary never adds two currencies into one figure', async () => {
  const context = await workspace()
  const { db, ctx, employee } = context

  const rupees = await openReport(ctx, { employeeId: employee.id, title: 'Mumbai', currency: 'INR' })
  await attachExpense(ctx, rupees.id, (await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '1200.0000' })).id)
  const dollars = await openReport(ctx, { employeeId: employee.id, title: 'Austin', currency: 'USD' })
  await attachExpense(
    ctx,
    dollars.id,
    (await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '90.0000', currency: 'USD', baseCurrency: 'USD', merchant: 'Cab' })).id,
  )

  const summary = await expenseSummary(ctx)
  const drafts = summary.byStatus.filter((row) => row.status === 'draft')
  assert.deepEqual(
    drafts.map((row) => [row.currency, row.total, row.reports]),
    [['INR', '1200.0000', 1], ['USD', '90.0000', 1]],
    'the screen this replaces printed 1290 with no currency at all',
  )
  await db.close()
})

test('average turnaround is absent until something has actually been reimbursed', async () => {
  const context = await workspace()
  const { db, ctx } = context
  assert.equal(await expenseSummary(ctx).then((s) => s.turnaround), null, 'no completed claim is not a turnaround of zero')

  await approvedReport(context, '1200.0000', 'March')
  context.c.advance(2 * 86_400_000)
  await runReimbursement(await context.ctxFor(), { currency: 'INR' })

  const summary = await expenseSummary(ctx)
  assert.ok(summary.turnaround)
  assert.equal(summary.turnaround.reports, 1)
  assert.equal(summary.turnaround.days, '2.0')
  await db.close()
})

test('spend by category is measured from the lines, and uncategorised spend says so', async () => {
  const context = await workspace()
  const { db, ctx, employee } = context
  const hotels = await createCategory(ctx, { name: 'Hotel', code: 'HOTEL' })
  const report = await openReport(ctx, { employeeId: employee.id, title: 'March', currency: 'INR' })
  await attachExpense(ctx, report.id, (await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '8000.0000', categoryId: hotels.id })).id)
  await attachExpense(ctx, report.id, (await recordExpense(ctx, { ...SPEND, employeeId: employee.id, amount: '500.0000', merchant: 'Kiosk' })).id)

  // Only approved spend counts; a draft claim is not spend anybody has agreed to.
  assert.deepEqual(await expenseSummary(ctx).then((s) => s.byCategory), [])

  const submitted = await submitReport(ctx, report.id, report.version)
  await decideReport(ctx, report.id, { decision: 'approved', version: submitted.version })

  assert.deepEqual(
    (await expenseSummary(ctx)).byCategory.map((row) => [row.name, row.currency, row.total]),
    [['Hotel', 'INR', '8000.0000'], [null, 'INR', '500.0000']],
    'the screen this replaces derived the category from the length of the title',
  )
  await db.close()
})

test('a claim carries when it was raised, and the range filter is applied in SQL', async () => {
  const context = await workspace()
  const { db, ctx, employee } = context
  const report = await openReport(ctx, { employeeId: employee.id, title: 'March', currency: 'INR' })
  // `created_at` is a column default, so it is the database's clock rather than
  // the context's — and that is the clock the range compares against.
  assert.match(report.createdAt, /^\d{4}-\d{2}-\d{2}T/)
  const raisedOn = report.createdAt.slice(0, 10)

  assert.equal((await listReports(ctx, { from: raisedOn, to: raisedOn })).total, 1, 'the day it was raised is inside the range')
  assert.equal(
    (await listReports(ctx, { from: '2099-01-01' })).total,
    0,
    'a range the screen filters client-side silently means nothing beyond the loaded page',
  )
  await db.close()
})

test('a payout run can be read back with the batch it paid', async () => {
  const context = await workspace()
  const { db, ctx } = context
  await approvedReport(context, '1200.0000', 'March')
  await approvedReport(context, '800.0000', 'April')
  const run = await runReimbursement(ctx, { currency: 'INR' })

  const { rows, total } = await listReimbursementRuns(ctx)
  assert.equal(total, 1)
  assert.equal(rows[0].reference, run.reference)
  assert.equal(rows[0].status, 'paid')
  assert.equal(rows[0].reports, 2, 'runs were written and never readable, so the screen kept its own copy')
  assert.equal(rows[0].totalAmount, '2000.0000')
  assert.equal(rows[0].currency, 'INR')
  await db.close()
})

/* ------------------------- categories and approvals ----------------------- */

test('a spend limit without a currency is refused, and a null clears one', async () => {
  const { db, ctx } = await workspace()
  await assert.rejects(
    () => createCategory(ctx, { name: 'Meals', code: 'MEAL', limitAmount: '1000' }),
    /State the currency/i,
    'a cap with no currency cannot be compared with a converted amount',
  )

  const meals = await createCategory(ctx, { name: 'Meals', code: 'MEAL', limitAmount: '1000', limitCurrency: 'INR' })
  assert.equal(meals.limitAmount, '1000.0000')
  await assert.rejects(() => createCategory(ctx, { name: 'Meals again', code: 'meal' }), /already exists/i)

  const relaxed = await updateCategory(ctx, meals.id, { limitAmount: null, limitCurrency: null, glAccount: '5100' })
  assert.equal(relaxed.limitAmount, null, 'clearing a limit must be possible, not only raising it')
  assert.equal(relaxed.glAccount, '5100')

  const untouched = await updateCategory(ctx, meals.id, { receiptRequiredAbove: '250' })
  assert.equal(untouched.glAccount, '5100', 'an omitted key leaves its column alone')
  assert.equal((await listCategories(ctx)).length, 1)
  await db.close()
})

test('replacing the approval ladder renumbers it, and the chain then uses it', async () => {
  const context = await workspace()
  const { db, ctx } = context
  await replaceApprovalLevels(ctx, 'expense', [
    { label: 'Manager' },
    { label: 'Finance', threshold: '5000' },
  ])
  assert.deepEqual(
    (await listApprovalLevels(ctx, 'expense')).map((row) => [row.level, row.label, row.threshold]),
    [[1, 'Manager', '0.0000'], [2, 'Finance', '5000.0000']],
    'a blank threshold means the level always applies',
  )

  // Removing the first row renumbers the rest; done row by row this collides on
  // the unique (tenant, scope, level) key halfway through.
  await replaceApprovalLevels(ctx, 'expense', [{ label: 'Finance', threshold: '5000' }])
  assert.deepEqual(
    (await listApprovalLevels(ctx, 'expense')).map((row) => [row.level, row.label]),
    [[1, 'Finance']],
  )
  assert.deepEqual(await listApprovalLevels(ctx, 'travel'), [], 'the scopes are separate ladders')

  const small = await claimOf(context, '1000.0000')
  const submitted = await submitReport(ctx, small.id, small.version)
  assert.equal(
    (await decideReport(ctx, small.id, { decision: 'approved', version: submitted.version })).status,
    'approved',
    'a claim below every threshold clears the chain at once',
  )
  await db.close()
})

/* ---------------------------- travel advances ----------------------------- */

test('an advance above the policy share of the estimate is refused', async () => {
  const context = await workspace()
  const { db, ctx, employee } = context
  await assert.rejects(
    () => createTrip(ctx, { ...TRIP, employeeId: employee.id, advanceRequested: '1000.0000' }),
    /does not allow travel advances/i,
    'an unconfigured advance limit is not an unlimited one',
  )

  await savePolicy(context, 'travel_policy', { advancePercent: 50 })
  await assert.rejects(
    () => createTrip(ctx, { ...TRIP, employeeId: employee.id, advanceRequested: '25000.0000' }),
    /at most 50%/i,
  )
  const within = await createTrip(ctx, { ...TRIP, employeeId: employee.id, advanceRequested: '20000.0000' })
  assert.equal(within.status, 'draft')
  await db.close()
})

test('trips can be listed by a set of states, so "still live" is one query', async () => {
  const { db, ctx, employee, other } = await workspace()
  const live = await createTrip(ctx, { ...TRIP, employeeId: employee.id })
  await submitTrip(ctx, live.id, live.version)
  const calledOff = await createTrip(ctx, { ...TRIP, employeeId: other.id })
  await cancelTrip(ctx, calledOff.id, calledOff.version)

  assert.equal((await listTrips(ctx, { statuses: ['draft', 'submitted', 'approved', 'booked', 'in_progress'] })).total, 1)
  assert.equal((await listTrips(ctx, { statuses: ['rejected', 'completed', 'cancelled'] })).total, 1)
  assert.equal((await listTrips(ctx, {})).total, 2)
  await db.close()
})
