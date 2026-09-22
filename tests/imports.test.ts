import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import { commitImport, exportCsv, stageImport } from '../src/server/services/imports.ts'
import { csvCell, parseCsv, toCsv } from '../src/server/io/csv.ts'
import { listCustomers } from '../src/server/services/customers.ts'
import { listAssets } from '../src/server/services/assets.ts'

async function workspace() {
  const db = await freshDb()
  const c = clock()
  const owner = await seedUser(db, { email: 'owner@example.com', fullName: 'Owner' })
  const acme = await createTenantWithOwner(db, owner, { name: 'Acme' }, c.now(), 'r1')
  const { token } = await createSession(db, { userId: owner, tenantId: acme.tenantId }, c.now())
  return { db, c, ctx: await withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' })) }
}

/* ------------------------------- the parser ------------------------------- */

test('quoted fields keep their commas and newlines', () => {
  const rows = parseCsv('Name,Note\r\n"Acme, Inc.","Line one\nLine two"\r\n')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].Name, 'Acme, Inc.')
  assert.equal(rows[0].Note, 'Line one\nLine two')
})

test('a short or long row is an error, not silently padded', () => {
  assert.throws(() => parseCsv('Name,Code\r\nAcme\r\n'), /1 column\(s\) where the heading has 2/)
  assert.throws(() => parseCsv('Name,Code\r\nAcme,A,B\r\n'), /3 column\(s\)/)
})

test('two columns with the same heading are refused', () => {
  assert.throws(() => parseCsv('Name,Name\r\nA,B\r\n'), /share a heading/)
})

test('malformed quoting is reported with its line', () => {
  assert.throws(() => parseCsv('Name\r\n"unclosed\r\n'), /never closed/)
  const error = (() => {
    try {
      parseCsv('Name,Code\r\nA,B\r\nC\r\n')
      return null
    } catch (caught) {
      return caught as { line?: number }
    }
  })()
  // Header is line 1, "A,B" is line 2, the short row is line 3.
  assert.equal(error?.line, 3, 'the line number is what makes a problem findable in the file')
})

test('EXPORT SAFETY: a formula is exported as text', () => {
  // Opened in Excel or Sheets, an unescaped one of these executes.
  assert.equal(csvCell('=cmd|/c calc'), `"'=cmd|/c calc"`)
  assert.equal(csvCell('+1234'), `"'+1234"`)
  assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`)
  assert.equal(csvCell('-5'), `"'-5"`)
  assert.equal(csvCell('Acme "Quoted" Ltd'), '"Acme ""Quoted"" Ltd"')
  assert.equal(csvCell('ordinary'), '"ordinary"')
})

test('a round trip survives commas, quotes and newlines', () => {
  const written = toCsv([{ a: 'Acme, Inc.', b: 'He said "no"\nthen left' }], [
    { header: 'Name', value: (row) => row.a },
    { header: 'Note', value: (row) => row.b },
  ])
  const read = parseCsv(written)
  assert.equal(read[0].Name, 'Acme, Inc.')
  assert.equal(read[0].Note, 'He said "no"\nthen left')
})

/* -------------------------------- staging --------------------------------- */

const CUSTOMERS = [
  'Name,Code,Currency,Credit limit,Payment terms (days),Tax ID',
  'Nimbus Industries,NIM,INR,"50,000.00",30,29ABCDE1234F1Z5',
  'Contoso,CON,inr,,0,',
].join('\r\n')

test('staging validates without writing anything', async () => {
  const { db, ctx } = await workspace()
  const staged = stageImport('customers', CUSTOMERS)
  assert.equal(staged.total, 2)
  assert.equal(staged.ready, 2)
  assert.deepEqual(staged.problems, [])
  assert.equal((await listCustomers(ctx, {})).total, 0, 'staging writes nothing')
  await db.close()
})

test('every problem is reported at once, with its line', () => {
  const bad = [
    'Name,Code,Currency,Credit limit,Payment terms (days),Tax ID',
    ',NIM,INR,,0,',
    'Contoso,CON,RUPEES,,0,',
    'Fabrikam,FAB,INR,not-a-number,0,',
    'Northwind,NW,INR,,half,',
  ].join('\r\n')

  const staged = stageImport('customers', bad)
  assert.equal(staged.ready, 0)
  assert.deepEqual(
    staged.problems.map((problem) => problem.line),
    [2, 3, 4, 5],
    'somebody fixing a file learns about every mistake in one pass, not one per upload',
  )
  assert.match(staged.problems[0].message, /"Name" is empty/)
  assert.match(staged.problems[1].message, /three-letter code/)
  assert.match(staged.problems[2].message, /not a number/)
  assert.match(staged.problems[3].message, /whole number/)
})

test('an ambiguous date is refused rather than guessed', () => {
  const rows = ['Name,Acquired on', 'Laptop,03/04/2026'].join('\r\n')
  const staged = stageImport('assets', rows)
  assert.equal(staged.ready, 0)
  assert.match(
    staged.problems[0].message,
    /YYYY-MM-DD/,
    '03/04/2026 is two different days depending on where the file came from',
  )
})

test('a file that will not parse is one problem, not a hundred', () => {
  const staged = stageImport('customers', 'Name,Code\r\n"unclosed\r\n')
  assert.equal(staged.total, 0)
  assert.equal(staged.problems.length, 1)
  assert.match(staged.problems[0].message, /never closed/)
})

/* ------------------------------- committing ------------------------------- */

test('an import with any bad row is refused whole by default', async () => {
  const { db, ctx } = await workspace()
  const mixed = [
    'Name,Code,Currency,Credit limit,Payment terms (days),Tax ID',
    'Good Co,GOOD,INR,,0,',
    ',BAD,INR,,0,',
  ].join('\r\n')

  await assert.rejects(
    () => commitImport(ctx, 'customers', mixed),
    (error: unknown) => {
      const problems = (error as { problems?: { line: number }[] }).problems
      return problems?.length === 1 && problems[0].line === 3
    },
  )
  assert.equal((await listCustomers(ctx, {})).total, 0, 'a partly applied import is worse than a refused one')
  await db.close()
})

test('a partial import is available, but must be asked for', async () => {
  const { db, ctx } = await workspace()
  const mixed = [
    'Name,Code,Currency,Credit limit,Payment terms (days),Tax ID',
    'Good Co,GOOD,INR,,0,',
    ',BAD,INR,,0,',
  ].join('\r\n')

  const result = await commitImport(ctx, 'customers', mixed, { partial: true })
  assert.equal(result.created, 1)
  assert.equal(result.problems.length, 1)
  assert.equal((await listCustomers(ctx, {})).total, 1)
  await db.close()
})

test('a good import writes every row, normalising as the form would', async () => {
  const { db, ctx } = await workspace()
  const result = await commitImport(ctx, 'customers', CUSTOMERS)
  assert.equal(result.created, 2)

  const { rows } = await listCustomers(ctx, {})
  const nimbus = rows.find((row) => row.code === 'NIM')!
  assert.equal(nimbus.creditLimit, '50000.0000', 'the spreadsheet s thousands separator is handled')
  assert.equal(nimbus.paymentTermsDays, 30)
  assert.equal(rows.find((row) => row.code === 'CON')!.currency, 'INR', 'normalised, as the form would')
  await db.close()
})

test('an import cannot bypass a rule the form obeys', async () => {
  const { db, ctx } = await workspace()
  await commitImport(ctx, 'customers', CUSTOMERS)

  // The same codes again: each row is written through the ordinary service.
  const again = await commitImport(ctx, 'customers', CUSTOMERS, { partial: true })
  assert.equal(again.created, 0)
  assert.equal(again.failed.length, 2)
  assert.match(again.failed[0].message, /already in use/i)
  assert.equal(again.failed[0].line, 2, 'reported against the line it came from')
  assert.equal((await listCustomers(ctx, {})).total, 2, 'no duplicates were created')
  await db.close()
})

test('assets import with their tags, or take the next one', async () => {
  const { db, ctx } = await workspace()
  const rows = [
    'Name,Tag,Type,Serial number,Location,Acquired on,Purchase cost,Currency,Warranty expires on',
    'ThinkPad X1,LAB-1,laptop,PF0ABCDE,Pune,2026-01-05,120000.00,INR,2029-01-05',
    'Dell Monitor,,monitor,,Pune,,,,',
  ].join('\r\n')

  const result = await commitImport(ctx, 'assets', rows)
  assert.equal(result.created, 2)

  const assets = await listAssets(ctx, {})
  const tagged = assets.rows.find((asset) => asset.tag === 'LAB-1')!
  assert.equal(tagged.purchaseCost, '120000.0000')
  assert.equal(tagged.warrantyExpiresOn, '2029-01-05')
  assert.ok(assets.rows.some((asset) => /^AST-\d+$/.test(asset.tag)), 'a blank tag takes the next from the sequence')
  await db.close()
})

/* -------------------------------- exporting ------------------------------- */

test('an export round-trips back through the importer', async () => {
  const { db, ctx } = await workspace()
  await commitImport(ctx, 'customers', CUSTOMERS)

  const exported = await exportCsv(ctx, 'customers')
  const reread = parseCsv(exported)
  assert.equal(reread.length, 2)
  assert.ok(reread.every((row) => row.Currency === 'INR'))

  const staged = stageImport('customers', exported)
  assert.equal(staged.problems.length, 0, 'what we write, we can read')
  await db.close()
})

test('EXPORT SAFETY: a hostile customer name leaves as text', async () => {
  const { db, ctx } = await workspace()
  await commitImport(
    ctx,
    'customers',
    ['Name,Code,Currency,Credit limit,Payment terms (days),Tax ID', '"=cmd|\'/c calc\'!A1",EVIL,INR,,0,'].join('\r\n'),
  )

  const exported = await exportCsv(ctx, 'customers')
  assert.ok(exported.includes(`"'=cmd`), 'a name that would execute on somebody else s machine is quoted as text')
  await db.close()
})

test('ISOLATION: an export contains only this workspace', async () => {
  const { db, ctx } = await workspace()
  const mallory = await seedUser(db, { email: 'mallory@example.com', fullName: 'Mallory' })
  const evil = await createTenantWithOwner(db, mallory, { name: 'Evil' }, ctx.now, 'r2')
  const { token } = await createSession(db, { userId: mallory, tenantId: evil.tenantId }, ctx.now)
  const theirs = await withTenant(await authenticate(db, token, { now: ctx.now, requestId: 'r' }))

  await commitImport(ctx, 'customers', CUSTOMERS)
  const exported = await exportCsv(theirs, 'customers')
  assert.ok(!exported.includes('Nimbus'))
  assert.equal(parseCsv(exported).length, 0)
  await db.close()
})
