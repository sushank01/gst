import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  listLeads, createLead, updateLead, archiveLead, restoreLead, convertLead, leadSummary,
  listPipelines, createPipeline, tenantCurrency,
  listParties, createParty, updateParty, archiveParty, restoreParty, duplicateParties,
  listDeals, createDeal, updateDeal, archiveDeal, addDecimals,
  listActivities, createActivity, updateActivity,
} from '../src/server/services/crm.ts'

async function twoTenants() {
  const db = await freshDb()
  const c = clock()
  const alice = await seedUser(db, { email: 'alice@example.com', fullName: 'Alice' })
  const mallory = await seedUser(db, { email: 'mallory@example.com', fullName: 'Mallory' })
  const acme = await createTenantWithOwner(db, alice, { name: 'Acme' }, c.now(), 'r1')
  const evil = await createTenantWithOwner(db, mallory, { name: 'Evil' }, c.now(), 'r2')
  const ctxFor = async (userId: string, tenantId: string) => {
    const { token } = await createSession(db, { userId, tenantId }, c.now())
    return withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))
  }
  return { db, c, acme, evil, aliceCtx: await ctxFor(alice, acme.tenantId), malloryCtx: await ctxFor(mallory, evil.tenantId) }
}

test('a lead creates its person and organisation as linked records, not name strings', async () => {
  const { db, aliceCtx } = await twoTenants()
  const lead = await createLead(aliceCtx, { name: 'Ada Lovelace', email: 'ada@acme.test', company: 'Acme Industries' })
  assert.equal(lead.company, 'Acme Industries')

  const { rows } = await db.query<{ kind: string; name: string; parent_name: string | null }>(
    `select p.kind, p.name, org.name as parent_name
       from parties p left join parties org on org.id = p.parent_id
      where p.tenant_id = $1 order by p.kind`,
    [aliceCtx.tenantId],
  )
  assert.equal(rows.length, 2, 'a person and an organisation')
  const person = rows.find((r) => r.kind === 'person')!
  assert.equal(person.parent_name, 'Acme Industries', 'linked by id, so renaming the org follows')
  await db.close()
})

test('two leads at the same company share one organisation record', async () => {
  const { db, aliceCtx } = await twoTenants()
  await createLead(aliceCtx, { name: 'Ada', email: 'ada@acme.test', company: 'Acme Industries' })
  await createLead(aliceCtx, { name: 'Grace', email: 'grace@acme.test', company: 'acme industries' })
  const { rows } = await db.query<{ n: string }>(
    "select count(*)::text as n from parties where tenant_id = $1 and kind = 'organisation'",
    [aliceCtx.tenantId],
  )
  assert.equal(rows[0].n, '1', 'case-insensitive match, not two spellings of one company')
  await db.close()
})

test('a duplicate email is refused rather than silently creating a second record', async () => {
  const { db, aliceCtx } = await twoTenants()
  await createLead(aliceCtx, { name: 'Ada', email: 'ada@acme.test' })
  await assert.rejects(() => createLead(aliceCtx, { name: 'Ada again', email: 'ADA@acme.test' }), /already uses that email/)
  await db.close()
})

test('ISOLATION: leads never cross tenants, by list or by id', async () => {
  const { db, aliceCtx, malloryCtx } = await twoTenants()
  const lead = await createLead(aliceCtx, { name: 'Ada', email: 'ada@acme.test' })
  await createLead(malloryCtx, { name: 'Eve', email: 'eve@evil.test' })

  assert.deepEqual((await listLeads(aliceCtx)).rows.map((l) => l.name), ['Ada'])
  assert.deepEqual((await listLeads(malloryCtx)).rows.map((l) => l.name), ['Eve'])

  await assert.rejects(() => updateLead(malloryCtx, lead.id, { version: lead.version, name: 'Owned' }), (e: any) => {
    assert.equal(e.status, 404, "another tenant's lead is not found, not forbidden")
    return true
  })
  await assert.rejects(() => archiveLead(malloryCtx, lead.id, lead.version), (e: any) => e.status === 404)

  const still = await listLeads(aliceCtx)
  assert.equal(still.rows[0].name, 'Ada', 'untouched')
  await db.close()
})

test('the same email may exist in two different tenants', async () => {
  const { db, aliceCtx, malloryCtx } = await twoTenants()
  await createLead(aliceCtx, { name: 'Ada', email: 'shared@example.com' })
  await createLead(malloryCtx, { name: 'Ada', email: 'shared@example.com' })
  assert.equal((await listLeads(aliceCtx)).total, 1)
  assert.equal((await listLeads(malloryCtx)).total, 1)
  await db.close()
})

test('search matches person, organisation and email; filters combine', async () => {
  const { db, aliceCtx } = await twoTenants()
  await createLead(aliceCtx, { name: 'Ada Lovelace', email: 'ada@acme.test', company: 'Acme', status: 'New', source: 'Website' })
  await createLead(aliceCtx, { name: 'Grace Hopper', email: 'grace@navy.test', company: 'Navy', status: 'Qualified', source: 'Referral' })

  assert.equal((await listLeads(aliceCtx, { query: 'lovelace' })).total, 1)
  assert.equal((await listLeads(aliceCtx, { query: 'navy' })).total, 1, 'matches the organisation')
  assert.equal((await listLeads(aliceCtx, { query: 'grace@' })).total, 1, 'matches the address')
  assert.equal((await listLeads(aliceCtx, { status: 'Qualified' })).total, 1)
  assert.equal((await listLeads(aliceCtx, { status: 'Qualified', query: 'ada' })).total, 0, 'filters are ANDed')
  assert.equal((await listLeads(aliceCtx, { source: 'Website' })).total, 1)
  await db.close()
})

test('the total reflects the filter, so the count and the rows agree', async () => {
  const { db, aliceCtx } = await twoTenants()
  for (let index = 0; index < 27; index += 1) {
    await createLead(aliceCtx, { name: `Lead ${index}`, email: `lead${index}@example.com`, status: index % 2 ? 'New' : 'Qualified' })
  }
  const page = await listLeads(aliceCtx, { limit: 10 })
  assert.equal(page.rows.length, 10)
  assert.equal(page.total, 27, 'the total is the match count, not the page size')

  const filtered = await listLeads(aliceCtx, { status: 'New' })
  assert.equal(filtered.total, 13)
  assert.equal(filtered.rows.length, 13)
  await db.close()
})

test('pagination does not repeat or drop rows', async () => {
  const { db, aliceCtx } = await twoTenants()
  for (let index = 0; index < 25; index += 1) {
    await createLead(aliceCtx, { name: `Lead ${index}`, email: `l${index}@example.com` })
  }
  const first = await listLeads(aliceCtx, { limit: 10, offset: 0 })
  const second = await listLeads(aliceCtx, { limit: 10, offset: 10 })
  const third = await listLeads(aliceCtx, { limit: 10, offset: 20 })
  const ids = [...first.rows, ...second.rows, ...third.rows].map((l) => l.id)
  assert.equal(ids.length, 25)
  assert.equal(new Set(ids).size, 25, 'no duplicates across pages')
  await db.close()
})

test('CONFLICT: a stale version is refused and reports the current one', async () => {
  const { db, aliceCtx } = await twoTenants()
  const lead = await createLead(aliceCtx, { name: 'Ada', email: 'ada@acme.test' })

  const updated = await updateLead(aliceCtx, lead.id, { version: lead.version, status: 'Contacted' })
  assert.equal(updated.status, 'Contacted')
  assert.equal(updated.version, lead.version + 1)

  await assert.rejects(
    () => updateLead(aliceCtx, lead.id, { version: lead.version, status: 'Qualified' }),
    (error: any) => {
      assert.equal(error.status, 409, 'the second editor is told, not silently overwritten')
      assert.equal(error.currentVersion, updated.version)
      return true
    },
  )
  const final = await listLeads(aliceCtx)
  assert.equal(final.rows[0].status, 'Contacted', 'the first edit survived')
  await db.close()
})

test('archive hides from the default list, restore brings it back, history is kept', async () => {
  const { db, aliceCtx } = await twoTenants()
  const lead = await createLead(aliceCtx, { name: 'Ada', email: 'ada@acme.test' })
  await archiveLead(aliceCtx, lead.id, lead.version)

  assert.equal((await listLeads(aliceCtx)).total, 0)
  assert.equal((await listLeads(aliceCtx, { includeArchived: true })).total, 1, 'the row still exists')

  await restoreLead(aliceCtx, lead.id)
  assert.equal((await listLeads(aliceCtx)).total, 1)
  await db.close()
})

test('conversion creates a deal, keeps the lead, and records the stage move', async () => {
  const { db, aliceCtx } = await twoTenants()
  const lead = await createLead(aliceCtx, { name: 'Ada', email: 'ada@acme.test', company: 'Acme Industries' })
  const { dealId } = await convertLead(aliceCtx, lead.id, {
    dealName: 'Acme platform rollout', amount: '42000.0000', currency: 'USD', version: lead.version,
  })

  const deal = await db.query<{ name: string; amount: string; currency: string; account_id: string | null }>(
    'select name, amount::text as amount, currency, account_id from deals where id = $1', [dealId])
  assert.equal(deal.rows[0].amount, '42000.0000', 'money is exact')
  assert.ok(deal.rows[0].account_id, 'the deal points at the organisation, not a typed name')

  const kept = await listLeads(aliceCtx, { includeArchived: true })
  assert.equal(kept.rows[0].status, 'Converted')
  assert.ok(kept.rows[0].convertedAt, 'the lead survives conversion')

  const history = await db.query<{ note: string }>('select note from deal_stage_history where deal_id = $1', [dealId])
  assert.equal(history.rows.length, 1)
  assert.match(history.rows[0].note, /Converted from lead/)
  await db.close()
})

test('a lead cannot be converted twice', async () => {
  const { db, aliceCtx } = await twoTenants()
  const lead = await createLead(aliceCtx, { name: 'Ada', email: 'ada@acme.test' })
  await convertLead(aliceCtx, lead.id, { dealName: 'D', amount: '1.0000', currency: 'USD', version: lead.version })
  await assert.rejects(
    () => convertLead(aliceCtx, lead.id, { dealName: 'D2', amount: '2.0000', currency: 'USD', version: lead.version + 1 }),
    /already been converted/,
  )
  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from deals')
  assert.equal(rows[0].n, '1', 'no duplicate deal from a repeated click')
  await db.close()
})

test('the default pipeline is created on first use with ordered stages', async () => {
  const { db, aliceCtx } = await twoTenants()
  const lead = await createLead(aliceCtx, { name: 'Ada', email: 'ada@acme.test' })
  await convertLead(aliceCtx, lead.id, { dealName: 'D', amount: '1.0000', currency: 'USD', version: lead.version })

  const stages = await db.query<{ name: string; position: number; outcome: string }>(
    'select name, position, outcome from pipeline_stages where tenant_id = $1 order by position', [aliceCtx.tenantId])
  assert.equal(stages.rows[0].name, 'New')
  assert.equal(stages.rows.at(-1)!.outcome, 'lost')
  assert.equal(stages.rows.filter((s) => s.outcome === 'won').length, 1, 'an explicit won stage, not a name guess')
  await db.close()
})

test('a viewer may read but not write', async () => {
  const { db, c, acme, aliceCtx } = await twoTenants()
  const viewerId = await seedUser(db, { email: 'viewer@example.com' })
  await db.query("insert into memberships (tenant_id, user_id, role) values ($1,$2,'viewer')", [acme.tenantId, viewerId])
  const { token } = await createSession(db, { userId: viewerId, tenantId: acme.tenantId }, c.now())
  const viewer = await withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))

  await createLead(aliceCtx, { name: 'Ada', email: 'ada@acme.test' })
  assert.equal((await listLeads(viewer)).total, 1, 'reading is allowed')
  await assert.rejects(() => createLead(viewer, { name: 'Nope' }), (e: any) => e.status === 403)
  await db.close()
})

test('every mutation writes an audit row with the real actor', async () => {
  const { db, aliceCtx } = await twoTenants()
  const lead = await createLead(aliceCtx, { name: 'Ada', email: 'ada@acme.test' })
  await updateLead(aliceCtx, lead.id, { version: lead.version, status: 'Contacted' })

  const { rows } = await db.query<{ action: string; actor_user_id: string }>(
    "select action, actor_user_id from audit_events where resource = 'lead' order by id",
    [],
  )
  assert.deepEqual(rows.map((r) => r.action), ['crm.lead_created', 'crm.lead_updated'])
  assert.equal(rows[0].actor_user_id, aliceCtx.userId)
  await db.close()
})

test('the dashboard summary counts real records per status', async () => {
  const { db, aliceCtx } = await twoTenants()
  await createLead(aliceCtx, { name: 'A', email: 'a@x.test', status: 'New' })
  await createLead(aliceCtx, { name: 'B', email: 'b@x.test', status: 'New' })
  await createLead(aliceCtx, { name: 'C', email: 'c@x.test', status: 'Qualified' })
  assert.deepEqual(await leadSummary(aliceCtx), { New: 2, Qualified: 1 })
  await db.close()
})

/* ------------------------------- pipelines -------------------------------- */

test('a workspace that has never created a deal has no pipeline, rather than a pretend one', async () => {
  const { db, aliceCtx } = await twoTenants()
  // Reading must not seed: the screen has to be able to say "none configured"
  // instead of showing a pipeline nobody chose.
  assert.deepEqual(await listPipelines(aliceCtx), [])
  await db.close()
})

test('a new pipeline gets the standard stages, each with an explicit outcome', async () => {
  const { db, aliceCtx } = await twoTenants()
  const pipeline = await createPipeline(aliceCtx, { name: 'Partner deals' })
  assert.equal(pipeline.stages.length, 8)
  assert.deepEqual(
    pipeline.stages.map((stage) => stage.position),
    [1, 2, 3, 4, 5, 6, 7, 8],
    'positions are dense and ordered, so a board renders columns in sequence',
  )
  assert.equal(pipeline.stages.filter((stage) => stage.outcome === 'won').length, 1)
  assert.equal(pipeline.stages.filter((stage) => stage.outcome === 'lost').length, 1)
  assert.equal(pipeline.isDefault, false, 'only the seeded pipeline is the default')
  await db.close()
})

test('duplicating a pipeline copies that pipeline stages, not the built-in list', async () => {
  const { db, aliceCtx } = await twoTenants()
  const source = await createPipeline(aliceCtx, { name: 'Source' })
  await aliceCtx.db.query('update pipeline_stages set name = $2 where id = $1', [source.stages[0].id, 'Sourced'])

  const copy = await createPipeline(aliceCtx, { name: 'Copy', duplicateOf: source.id })
  assert.equal(copy.stages[0].name, 'Sourced', 'the copy reflects the edited source')
  await db.close()
})

test("ISOLATION: a pipeline cannot be duplicated across tenants", async () => {
  const { db, aliceCtx, malloryCtx } = await twoTenants()
  const mine = await createPipeline(aliceCtx, { name: 'Mine' })
  await assert.rejects(
    () => createPipeline(malloryCtx, { name: 'Stolen', duplicateOf: mine.id }),
    (error: any) => error.status === 404,
  )
  assert.deepEqual(await listPipelines(malloryCtx), [])
  await db.close()
})

test("the deal currency comes from the workspace's own company, not a hard-coded dollar", async () => {
  const { db, aliceCtx } = await twoTenants()
  assert.equal(await tenantCurrency(aliceCtx), 'USD')
  await db.query('update companies set currency = $2 where tenant_id = $1', [aliceCtx.tenantId, 'INR'])
  assert.equal(await tenantCurrency(aliceCtx), 'INR')
  await db.close()
})

/* --------------------------- contacts & accounts --------------------------- */

test('a contact links to its employer by id, so renaming the account follows', async () => {
  const { db, aliceCtx } = await twoTenants()
  const contact = await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test', company: 'Acme' })
  assert.equal(contact.company, 'Acme')
  assert.ok(contact.companyId)

  await db.query('update parties set name = $2 where id = $1', [contact.companyId, 'Acme Industries'])
  const { rows } = await listParties(aliceCtx, 'person')
  assert.equal(rows[0].company, 'Acme Industries', 'the contact follows the rename rather than keeping a typed string')
  await db.close()
})

test('a contact and a lead at the same company share one organisation record', async () => {
  const { db, aliceCtx } = await twoTenants()
  await createLead(aliceCtx, { name: 'Grace', email: 'grace@acme.test', company: 'Acme' })
  await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test', company: 'acme' })
  const { total } = await listParties(aliceCtx, 'organisation')
  assert.equal(total, 1, 'case-insensitive match, so two spellings are not two accounts')
  await db.close()
})

test('contacts and accounts are separate lists even though they share a table', async () => {
  const { db, aliceCtx } = await twoTenants()
  await createParty(aliceCtx, 'person', { name: 'Ada', company: 'Acme' })
  await createParty(aliceCtx, 'organisation', { name: 'Globex', industry: 'Manufacturing', employeeCount: 40 })

  assert.deepEqual((await listParties(aliceCtx, 'person')).rows.map((row) => row.name), ['Ada'])
  const accounts = await listParties(aliceCtx, 'organisation')
  assert.deepEqual(accounts.rows.map((row) => row.name).sort(), ['Acme', 'Globex'])
  assert.equal(accounts.rows.find((row) => row.name === 'Globex')?.employeeCount, 40)
  await db.close()
})

test('a duplicate contact address is refused rather than quietly creating a second record', async () => {
  const { db, aliceCtx } = await twoTenants()
  await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test' })
  await assert.rejects(
    () => createParty(aliceCtx, 'person', { name: 'Ada again', email: 'ADA@acme.test' }),
    (error: any) => error.status === 409,
  )
  await db.close()
})

test('editing a contact onto an address someone else uses is a conflict, not a database crash', async () => {
  const { db, aliceCtx } = await twoTenants()
  await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test' })
  const grace = await createParty(aliceCtx, 'person', { name: 'Grace', email: 'grace@acme.test' })
  await assert.rejects(
    () => updateParty(aliceCtx, 'person', grace.id, { version: grace.version, email: 'ada@acme.test' }),
    // Without the explicit check this is a unique-index violation, which the
    // boundary can only report as a 500 with no usable message.
    (error: any) => error.status === 409,
  )
  await db.close()
})

test('the contact total is the number matching the search, not the page length', async () => {
  const { db, aliceCtx } = await twoTenants()
  for (let index = 0; index < 12; index += 1) {
    await createParty(aliceCtx, 'person', { name: `Person ${index}`, email: `p${index}@x.test` })
  }
  const page = await listParties(aliceCtx, 'person', { limit: 5 })
  assert.equal(page.rows.length, 5)
  assert.equal(page.total, 12)
  assert.equal((await listParties(aliceCtx, 'person', { query: 'Person 1' })).total, 3, 'matches 1, 10 and 11')
  await db.close()
})

test('duplicates are found across the whole workspace, not within one loaded page', async () => {
  const { db, aliceCtx } = await twoTenants()
  for (let index = 0; index < 30; index += 1) {
    await createParty(aliceCtx, 'person', { name: `Filler ${index}`, email: `f${index}@x.test` })
  }
  await createParty(aliceCtx, 'person', { name: 'Ada Lovelace', email: 'ada1@x.test' })
  await createParty(aliceCtx, 'person', { name: 'ada lovelace', email: 'ada2@x.test' })

  const duplicates = await duplicateParties(aliceCtx, 'person')
  assert.equal(duplicates.total, 2, 'both rows are reported even though they are 30 records apart')
  assert.equal(duplicates.groups.length, 1)
  assert.equal(duplicates.groups[0].parties.length, 2)
  await db.close()
})

test('CONFLICT: a stale contact edit is refused and reports the current version', async () => {
  const { db, aliceCtx } = await twoTenants()
  const contact = await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test' })
  const updated = await updateParty(aliceCtx, 'person', contact.id, { version: contact.version, phone: '+44 20' })
  assert.equal(updated.phone, '+44 20')

  await assert.rejects(
    () => updateParty(aliceCtx, 'person', contact.id, { version: contact.version, name: 'Overwritten' }),
    (error: any) => {
      assert.equal(error.status, 409)
      assert.equal(error.currentVersion, updated.version)
      return true
    },
  )
  assert.equal((await listParties(aliceCtx, 'person')).rows[0].name, 'Ada', 'the first edit survived')
  await db.close()
})

test('archiving a contact hides it without destroying what refers to it', async () => {
  const { db, aliceCtx } = await twoTenants()
  const contact = await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test' })
  await archiveParty(aliceCtx, 'person', contact.id, contact.version)

  assert.equal((await listParties(aliceCtx, 'person')).total, 0)
  assert.equal((await listParties(aliceCtx, 'person', { includeArchived: true })).total, 1, 'the row still exists')
  await restoreParty(aliceCtx, 'person', contact.id)
  assert.equal((await listParties(aliceCtx, 'person')).total, 1)
  await db.close()
})

test('ISOLATION: contacts and accounts never cross tenants, by list or by id', async () => {
  const { db, aliceCtx, malloryCtx } = await twoTenants()
  const contact = await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test' })
  await createParty(malloryCtx, 'person', { name: 'Eve', email: 'eve@evil.test' })

  assert.deepEqual((await listParties(aliceCtx, 'person')).rows.map((row) => row.name), ['Ada'])
  await assert.rejects(
    () => updateParty(malloryCtx, 'person', contact.id, { version: contact.version, name: 'Owned' }),
    (error: any) => error.status === 404,
  )
  await assert.rejects(
    () => archiveParty(malloryCtx, 'person', contact.id, contact.version),
    (error: any) => error.status === 404,
  )
  await db.close()
})

test('a viewer may read contacts but not create one', async () => {
  const { db, c, acme, aliceCtx } = await twoTenants()
  const viewerId = await seedUser(db, { email: 'viewer-crm@example.com' })
  await db.query("insert into memberships (tenant_id, user_id, role) values ($1,$2,'viewer')", [acme.tenantId, viewerId])
  const { token } = await createSession(db, { userId: viewerId, tenantId: acme.tenantId }, c.now())
  const viewer = await withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))

  await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test' })
  assert.equal((await listParties(viewer, 'person')).total, 1)
  await assert.rejects(() => createParty(viewer, 'person', { name: 'Nope' }), (error: any) => error.status === 403)
  await db.close()
})

/* ---------------------------------- deals --------------------------------- */

test('decimal addition is exact, so a pipeline total is not a float artefact', () => {
  // 0.1 + 0.2 in IEEE754 is 0.30000000000000004; a pipeline value must not be.
  assert.equal(addDecimals('0.1000', '0.2000'), '0.3000')
  assert.equal(addDecimals('42000.0000', '0.5000'), '42000.5000')
  assert.equal(addDecimals('-5.0000', '2.5000'), '-2.5000')
})

test('a workspace with no pipeline reports no board at all, rather than empty columns', async () => {
  const { db, aliceCtx } = await twoTenants()
  const list = await listDeals(aliceCtx)
  assert.equal(list.pipelineId, null, 'null says "not configured", where an empty stage list would say "no deals"')
  assert.deepEqual(list.stages, [])
  assert.equal(list.total, 0)
  await db.close()
})

test('a deal records its opening stage in history, so a funnel knows when it entered', async () => {
  const { db, aliceCtx } = await twoTenants()
  const deal = await createDeal(aliceCtx, { name: 'Rollout', amount: '1000.0000', currency: 'USD' })
  const { rows } = await db.query<{ note: string; from_stage_id: string | null }>(
    'select note, from_stage_id from deal_stage_history where deal_id = $1',
    [deal.id],
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].from_stage_id, null)
  assert.equal(deal.stageName, 'New')
  assert.equal(deal.outcome, null)
  await db.close()
})

test('per-stage totals count and sum the real rows, and the list total matches the filter', async () => {
  const { db, aliceCtx } = await twoTenants()
  await createDeal(aliceCtx, { name: 'One', amount: '100.0000', currency: 'USD' })
  await createDeal(aliceCtx, { name: 'Two', amount: '250.5000', currency: 'USD' })
  const list = await listDeals(aliceCtx)

  const first = list.stages.find((stage) => stage.name === 'New')!
  assert.equal(first.count, 2)
  assert.deepEqual(first.amounts, [{ currency: 'USD', amount: '350.5000' }])
  assert.equal(list.summary.open.count, 2)
  assert.equal(list.total, 2)

  const searched = await listDeals(aliceCtx, { query: 'one' })
  assert.equal(searched.total, 1, 'the count follows the search')
  assert.equal(searched.stages.find((stage) => stage.name === 'New')!.count, 1)
  await db.close()
})

test('two currencies are reported separately rather than added into one wrong number', async () => {
  const { db, aliceCtx } = await twoTenants()
  await createDeal(aliceCtx, { name: 'Dollars', amount: '100.0000', currency: 'USD' })
  await createDeal(aliceCtx, { name: 'Euros', amount: '100.0000', currency: 'EUR' })

  const stage = (await listDeals(aliceCtx)).stages.find((entry) => entry.name === 'New')!
  assert.equal(stage.count, 2)
  assert.equal(stage.amounts.length, 2, 'USD 100 plus EUR 100 is not 200 of anything')
  assert.deepEqual(
    [...stage.amounts].sort((a, b) => a.currency.localeCompare(b.currency)).map((entry) => entry.currency),
    ['EUR', 'USD'],
  )
  await db.close()
})

test('a stage filter narrows the rows but keeps every board column', async () => {
  const { db, aliceCtx } = await twoTenants()
  const deal = await createDeal(aliceCtx, { name: 'One', amount: '100.0000', currency: 'USD' })
  const board = await listDeals(aliceCtx)
  const negotiation = board.stages.find((stage) => stage.name === 'Negotiation')!
  await updateDeal(aliceCtx, deal.id, { version: deal.version, stageId: negotiation.id })

  const filtered = await listDeals(aliceCtx, { stageId: negotiation.id })
  assert.equal(filtered.total, 1)
  assert.equal(filtered.stages.length, 8, 'a selected column must not delete the other seven')
  await db.close()
})

test('a stage move writes history and takes the outcome from the stage, not its name', async () => {
  const { db, aliceCtx } = await twoTenants()
  const created = await createDeal(aliceCtx, { name: 'Rollout', amount: '1000.0000', currency: 'USD' })
  const board = await listDeals(aliceCtx)
  const wonStage = board.stages.find((stage) => stage.outcome === 'won')!
  // Renaming the stage must not change what it means: reports read `outcome`.
  await db.query('update pipeline_stages set name = $2 where id = $1', [wonStage.id, 'Signed'])

  const won = await updateDeal(aliceCtx, created.id, { version: created.version, stageId: wonStage.id })
  assert.equal(won.outcome, 'won')
  assert.ok(won.closedAt)
  assert.equal(won.stageName, 'Signed')
  assert.equal((await listDeals(aliceCtx)).summary.won.count, 1)

  const { rows } = await db.query<{ n: string }>(
    'select count(*)::text as n from deal_stage_history where deal_id = $1',
    [created.id],
  )
  assert.equal(rows[0].n, '2', 'creation and the move, so time-in-stage is derivable')
  await db.close()
})

test('a deal moved back into an open stage is re-opened rather than staying closed', async () => {
  const { db, aliceCtx } = await twoTenants()
  const created = await createDeal(aliceCtx, { name: 'Rollout', amount: '1000.0000', currency: 'USD' })
  const board = await listDeals(aliceCtx)
  const won = await updateDeal(aliceCtx, created.id, {
    version: created.version,
    stageId: board.stages.find((stage) => stage.outcome === 'won')!.id,
  })
  const reopened = await updateDeal(aliceCtx, created.id, {
    version: won.version,
    stageId: board.stages.find((stage) => stage.name === 'Demo')!.id,
  })
  assert.equal(reopened.outcome, null, 'a mistaken win must be undoable, or the report stays wrong forever')
  assert.equal(reopened.closedAt, null)
  assert.equal((await listDeals(aliceCtx)).summary.won.count, 0)
  await db.close()
})

test('the money a deal was created with survives a round trip unchanged', async () => {
  const { db, aliceCtx } = await twoTenants()
  const deal = await createDeal(aliceCtx, { name: 'Precise', amount: '1234567.8900', currency: 'INR' })
  assert.equal(deal.amount, '1234567.8900')
  assert.equal(deal.currency, 'INR')
  await db.close()
})

test('CONFLICT: a stale deal edit is refused and reports the current version', async () => {
  const { db, aliceCtx } = await twoTenants()
  const deal = await createDeal(aliceCtx, { name: 'Rollout', amount: '10.0000', currency: 'USD' })
  const updated = await updateDeal(aliceCtx, deal.id, { version: deal.version, isFavourite: true })
  assert.equal(updated.isFavourite, true)

  await assert.rejects(
    () => updateDeal(aliceCtx, deal.id, { version: deal.version, name: 'Overwritten' }),
    (error: any) => {
      assert.equal(error.status, 409)
      assert.equal(error.currentVersion, updated.version)
      return true
    },
  )
  await db.close()
})

test('a favourites filter reads the column, so the count is the filtered count', async () => {
  const { db, aliceCtx } = await twoTenants()
  const one = await createDeal(aliceCtx, { name: 'One', amount: '10.0000', currency: 'USD' })
  await createDeal(aliceCtx, { name: 'Two', amount: '20.0000', currency: 'USD' })
  await updateDeal(aliceCtx, one.id, { version: one.version, isFavourite: true })

  const favourites = await listDeals(aliceCtx, { favouritesOnly: true })
  assert.equal(favourites.total, 1)
  assert.equal(favourites.summary.open.count, 1, 'the totals honour the filter the rows honour')
  await db.close()
})

test('archiving a deal removes it from the board without destroying its history', async () => {
  const { db, aliceCtx } = await twoTenants()
  const deal = await createDeal(aliceCtx, { name: 'Rollout', amount: '10.0000', currency: 'USD' })
  await archiveDeal(aliceCtx, deal.id, deal.version)
  assert.equal((await listDeals(aliceCtx)).total, 0)
  assert.equal((await listDeals(aliceCtx, { includeArchived: true })).total, 1)

  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from deal_stage_history where deal_id = $1', [deal.id])
  assert.equal(rows[0].n, '1')
  await db.close()
})

test('ISOLATION: deals never cross tenants, and a foreign party cannot be attached', async () => {
  const { db, aliceCtx, malloryCtx } = await twoTenants()
  const account = await createParty(aliceCtx, 'organisation', { name: 'Acme' })
  const deal = await createDeal(aliceCtx, { name: 'Rollout', amount: '10.0000', currency: 'USD', accountId: account.id })
  assert.equal(deal.account, 'Acme')

  assert.equal((await listDeals(malloryCtx)).total, 0)
  await assert.rejects(
    () => updateDeal(malloryCtx, deal.id, { version: deal.version, name: 'Owned' }),
    (error: any) => error.status === 404,
  )
  await assert.rejects(
    () => createDeal(malloryCtx, { name: 'Theirs', amount: '1.0000', currency: 'USD', accountId: account.id }),
    (error: any) => error.status === 404,
  )
  await db.close()
})

/* ------------------------------- activities ------------------------------- */

test('an activity must be about exactly one thing, reported as a field error', async () => {
  const { db, aliceCtx } = await twoTenants()
  const contact = await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test' })
  const deal = await createDeal(aliceCtx, { name: 'Rollout', amount: '10.0000', currency: 'USD' })

  // The database constraint would reach the browser as an unexplained 500.
  await assert.rejects(
    () => createActivity(aliceCtx, { kind: 'Call', subject: 'Nothing in particular' }),
    (error: any) => error.status === 422,
  )
  await assert.rejects(
    () => createActivity(aliceCtx, { kind: 'Call', subject: 'Both', partyId: contact.id, dealId: deal.id }),
    (error: any) => error.status === 422,
  )
  const logged = await createActivity(aliceCtx, { kind: 'Call', subject: 'Intro call', partyId: contact.id })
  assert.deepEqual(logged.target, { kind: 'party', id: contact.id, name: 'Ada' })
  await db.close()
})

test('a scheduled time without a zone is refused: "3pm" is not a time', async () => {
  const { db, aliceCtx } = await twoTenants()
  const contact = await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test' })
  await assert.rejects(
    () => createActivity(aliceCtx, { kind: 'Meeting', subject: 'Demo', partyId: contact.id, occursAt: '2026-03-04T15:00:00.000Z' }),
    (error: any) => error.status === 422,
  )
  const scheduled = await createActivity(aliceCtx, {
    kind: 'Meeting', subject: 'Demo', partyId: contact.id,
    occursAt: '2026-03-04T15:00:00.000Z', timezone: 'Europe/London',
  })
  assert.equal(scheduled.timezone, 'Europe/London')
  await db.close()
})

test('the calendar window selects by timestamp, not by a formatted date string', async () => {
  const { db, aliceCtx } = await twoTenants()
  const contact = await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test' })
  for (const at of ['2026-02-28T23:30:00.000Z', '2026-03-01T00:30:00.000Z', '2026-04-02T09:00:00.000Z']) {
    await createActivity(aliceCtx, { kind: 'Meeting', subject: at, partyId: contact.id, occursAt: at, timezone: 'UTC' })
  }
  const march = await listActivities(aliceCtx, { from: '2026-03-01T00:00:00.000Z', to: '2026-04-01T00:00:00.000Z' })
  assert.equal(march.total, 1)
  assert.equal(march.rows[0].subject, '2026-03-01T00:30:00.000Z')
  await db.close()
})

test('activity search and kind filters combine, and the total follows both', async () => {
  const { db, aliceCtx } = await twoTenants()
  const contact = await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test' })
  await createActivity(aliceCtx, { kind: 'Call', subject: 'Pricing call', partyId: contact.id })
  await createActivity(aliceCtx, { kind: 'Email', subject: 'Pricing email', partyId: contact.id })
  await createActivity(aliceCtx, { kind: 'Email', subject: 'Renewal', partyId: contact.id })

  assert.equal((await listActivities(aliceCtx, { kind: 'Email' })).total, 2)
  assert.equal((await listActivities(aliceCtx, { query: 'pricing' })).total, 2)
  assert.equal((await listActivities(aliceCtx, { kind: 'Email', query: 'pricing' })).total, 1)
  assert.equal((await listActivities(aliceCtx, { query: 'ada' })).total, 3, 'the target name is searchable too')
  await db.close()
})

test('completing an activity is version-checked and reversible', async () => {
  const { db, aliceCtx } = await twoTenants()
  const contact = await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test' })
  const logged = await createActivity(aliceCtx, { kind: 'Task', subject: 'Send quote', partyId: contact.id })
  assert.equal((await listActivities(aliceCtx, { completed: false })).total, 1)

  const done = await updateActivity(aliceCtx, logged.id, { version: logged.version, completed: true, outcome: 'Sent' })
  assert.ok(done.completedAt)
  assert.equal(done.outcome, 'Sent')
  assert.equal((await listActivities(aliceCtx, { completed: true })).total, 1)

  await assert.rejects(
    () => updateActivity(aliceCtx, logged.id, { version: logged.version, subject: 'Overwritten' }),
    (error: any) => error.status === 409,
  )
  const reopened = await updateActivity(aliceCtx, logged.id, { version: done.version, completed: false })
  assert.equal(reopened.completedAt, null)
  await db.close()
})

test('ISOLATION: activities never cross tenants, and a foreign target is refused', async () => {
  const { db, aliceCtx, malloryCtx } = await twoTenants()
  const contact = await createParty(aliceCtx, 'person', { name: 'Ada', email: 'ada@acme.test' })
  const logged = await createActivity(aliceCtx, { kind: 'Call', subject: 'Intro', partyId: contact.id })

  assert.equal((await listActivities(malloryCtx)).total, 0)
  await assert.rejects(
    () => createActivity(malloryCtx, { kind: 'Call', subject: 'Snoop', partyId: contact.id }),
    (error: any) => error.status === 404,
  )
  await assert.rejects(
    () => updateActivity(malloryCtx, logged.id, { version: logged.version, subject: 'Owned' }),
    (error: any) => error.status === 404,
  )
  await db.close()
})

/* ------------------------------ over HTTP -------------------------------- */

/**
 * The boundary, not just the service.
 *
 * A service can be correct and unreachable: these call the same route handlers
 * a browser reaches, with a real session cookie, to prove the routes parse what
 * the screens send and refuse what they should.
 */
process.env.PGLITE_DIR = await mkdtemp(join(tmpdir(), 'apragya-crm-routes-'))

const register = (await import('../src/app/api/v1/auth/register/route.ts')).POST
const tenantRoutes = (await import('../src/app/api/v1/tenants/route.ts')).POST
const contactRoutes = await import('../src/app/api/v1/crm/contacts/route.ts')
const contactRoute = await import('../src/app/api/v1/crm/contacts/[id]/route.ts')
const duplicateRoute = await import('../src/app/api/v1/crm/contacts/duplicates/route.ts')
const companyRoutes = await import('../src/app/api/v1/crm/companies/route.ts')
const dealRoutes = await import('../src/app/api/v1/crm/deals/route.ts')
const dealRoute = await import('../src/app/api/v1/crm/deals/[id]/route.ts')
const activityRoutes = await import('../src/app/api/v1/crm/activities/route.ts')
const pipelineRoutes = await import('../src/app/api/v1/crm/pipelines/route.ts')
const leadSummaryRoute = await import('../src/app/api/v1/crm/leads/summary/route.ts')

const BASE = 'http://test.local'
const PASSWORD = 'correct horse battery staple'

const httpPost = (path: string, body: unknown, cookie?: string) =>
  new Request(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
const httpPatch = (path: string, body: unknown, cookie: string) =>
  new Request(BASE + path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
const httpGet = (path: string, cookie: string) => new Request(BASE + path, { headers: { cookie } })
const httpDelete = (path: string, cookie: string) => new Request(BASE + path, { method: 'DELETE', headers: { cookie } })
const cookieOf = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0]

let seq = 0
async function owner(): Promise<string> {
  seq += 1
  const signedUp = cookieOf(
    await register(httpPost('/api/v1/auth/register', { email: `crm${seq}@example.com`, fullName: `Owner ${seq}`, password: PASSWORD })),
  )
  const created = await tenantRoutes(httpPost('/api/v1/tenants', { name: `CRM Workspace ${seq}` }, signedUp))
  assert.equal(created.status, 201, 'workspace creation failed')
  return cookieOf(created)
}

test('HTTP: no CRM route answers without a session', async () => {
  const anonymous = (path: string) => new Request(BASE + path)
  for (const call of [
    contactRoutes.GET(anonymous('/api/v1/crm/contacts')),
    companyRoutes.GET(anonymous('/api/v1/crm/companies')),
    dealRoutes.GET(anonymous('/api/v1/crm/deals')),
    activityRoutes.GET(anonymous('/api/v1/crm/activities')),
    pipelineRoutes.GET(anonymous('/api/v1/crm/pipelines')),
    duplicateRoute.GET(anonymous('/api/v1/crm/contacts/duplicates')),
    leadSummaryRoute.GET(anonymous('/api/v1/crm/leads/summary')),
  ]) {
    assert.equal((await call).status, 401)
  }
})

test('HTTP: a contact is created, searched, archived and restored', async () => {
  const cookie = await owner()

  const created = await contactRoutes.POST(
    httpPost('/api/v1/crm/contacts', { name: 'Ada Lovelace', email: 'ada@acme.test', company: 'Acme', type: 'Prospect' }, cookie),
  )
  assert.equal(created.status, 201)
  const { contact } = await created.json()
  assert.equal(contact.company, 'Acme')

  const searched = await contactRoutes.GET(httpGet('/api/v1/crm/contacts?q=lovelace', cookie))
  const found = await searched.json()
  assert.equal(found.total, 1, 'the total is the server count for the search')

  const archived = await contactRoute.DELETE(httpDelete(`/api/v1/crm/contacts/${contact.id}?version=${contact.version}`, cookie))
  assert.equal(archived.status, 204)
  assert.equal((await (await contactRoutes.GET(httpGet('/api/v1/crm/contacts', cookie))).json()).total, 0)
  assert.equal((await (await contactRoutes.GET(httpGet('/api/v1/crm/contacts?includeArchived=true', cookie))).json()).total, 1)

  const restored = await contactRoute.PATCH(
    httpPatch(`/api/v1/crm/contacts/${contact.id}`, { version: contact.version, restore: true }, cookie),
  )
  assert.equal(restored.status, 204)
})

test('HTTP: the boundary refuses an unknown field and a malformed address', async () => {
  const cookie = await owner()
  // `.strict()` everywhere: a stale field name must fail loudly rather than be
  // dropped, which is how a value quietly never gets saved.
  const unknown = await contactRoutes.POST(httpPost('/api/v1/crm/contacts', { name: 'Ada', nickname: 'A' }, cookie))
  assert.equal(unknown.status, 422)
  assert.match(JSON.stringify(await unknown.json()), /nickname/)

  const bad = await contactRoutes.POST(httpPost('/api/v1/crm/contacts', { name: 'Ada', email: 'not-an-address' }, cookie))
  assert.equal(bad.status, 422)
  assert.ok((await bad.json()).error.fields.email, 'the form gets a field error, not a generic failure')
})

test('HTTP: deals carry money as a decimal string and report their own currency', async () => {
  const cookie = await owner()
  const account = await (await companyRoutes.POST(httpPost('/api/v1/crm/companies', { name: 'Globex' }, cookie))).json()

  const created = await dealRoutes.POST(
    httpPost('/api/v1/crm/deals', { name: 'Platform rollout', amount: '42000.50', currency: 'usd', accountId: account.company.id }, cookie),
  )
  assert.equal(created.status, 201)
  const { deal } = await created.json()
  assert.equal(deal.amount, '42000.5000', 'PostgreSQL numeric, not a float')
  assert.equal(deal.currency, 'USD', 'the code is normalised so usd and USD are one currency')
  assert.equal(deal.account, 'Globex')

  const board = await (await dealRoutes.GET(httpGet('/api/v1/crm/deals', cookie))).json()
  assert.equal(board.total, 1)
  assert.equal(board.summary.open.count, 1)
  assert.deepEqual(board.summary.open.amounts, [{ currency: 'USD', amount: '42000.5000' }])
  assert.equal(board.defaultCurrency, 'USD', "the workspace's own currency, not a hard-coded dollar")
  assert.equal(board.stages.length, 8)
})

test('HTTP: a float amount is refused, because 0.1 + 0.2 must not reach an invoice', async () => {
  const cookie = await owner()
  const refused = await dealRoutes.POST(httpPost('/api/v1/crm/deals', { name: 'Loose', amount: 1000, currency: 'USD' }, cookie))
  assert.equal(refused.status, 422)
  assert.ok((await refused.json()).error.fields.amount)
})

test('HTTP: a stale deal edit is a 409 that names the version to merge against', async () => {
  const cookie = await owner()
  const { deal } = await (await dealRoutes.POST(httpPost('/api/v1/crm/deals', { name: 'Rollout', amount: '10', currency: 'USD' }, cookie))).json()

  const first = await dealRoute.PATCH(httpPatch(`/api/v1/crm/deals/${deal.id}`, { version: deal.version, isFavourite: true }, cookie))
  assert.equal(first.status, 200)

  const stale = await dealRoute.PATCH(httpPatch(`/api/v1/crm/deals/${deal.id}`, { version: deal.version, name: 'Clobbered' }, cookie))
  assert.equal(stale.status, 409)
  const body = await stale.json()
  assert.equal(body.error.currentVersion, deal.version + 1, 'the client is told what to refetch')
})

test('HTTP: an activity with no target is a field error, not a database crash', async () => {
  const cookie = await owner()
  const { contact } = await (await contactRoutes.POST(httpPost('/api/v1/crm/contacts', { name: 'Ada' }, cookie))).json()

  const orphan = await activityRoutes.POST(httpPost('/api/v1/crm/activities', { kind: 'Call', subject: 'Nobody' }, cookie))
  assert.equal(orphan.status, 422)

  const logged = await activityRoutes.POST(
    httpPost('/api/v1/crm/activities', { kind: 'Call', subject: 'Intro', partyId: contact.id }, cookie),
  )
  assert.equal(logged.status, 201)

  const window = await (
    await activityRoutes.GET(httpGet('/api/v1/crm/activities?kind=Email', cookie))
  ).json()
  assert.equal(window.total, 0, 'the kind filter actually filters')
})

test('HTTP: pipelines are listed as configured, and duplicated with their stages', async () => {
  const cookie = await owner()
  assert.deepEqual((await (await pipelineRoutes.GET(httpGet('/api/v1/crm/pipelines', cookie))).json()).pipelines, [])

  await dealRoutes.POST(httpPost('/api/v1/crm/deals', { name: 'First', amount: '1', currency: 'USD' }, cookie))
  const listed = await (await pipelineRoutes.GET(httpGet('/api/v1/crm/pipelines', cookie))).json()
  assert.equal(listed.pipelines.length, 1, 'the first deal seeds the default pipeline')
  assert.equal(listed.pipelines[0].stages.length, 8)

  const copy = await pipelineRoutes.POST(
    httpPost('/api/v1/crm/pipelines', { name: 'Partner deals', duplicateOf: listed.pipelines[0].id }, cookie),
  )
  assert.equal(copy.status, 201)
  assert.equal((await copy.json()).pipeline.stages.length, 8)
})

test('HTTP: duplicate contacts and lead counts are workspace-wide', async () => {
  const cookie = await owner()
  await contactRoutes.POST(httpPost('/api/v1/crm/contacts', { name: 'Ada Lovelace', email: 'a1@x.test' }, cookie))
  await contactRoutes.POST(httpPost('/api/v1/crm/contacts', { name: 'ada lovelace', email: 'a2@x.test' }, cookie))

  const duplicates = await (await duplicateRoute.GET(httpGet('/api/v1/crm/contacts/duplicates', cookie))).json()
  assert.equal(duplicates.total, 2)
  assert.equal(duplicates.groups.length, 1)

  const summary = await (await leadSummaryRoute.GET(httpGet('/api/v1/crm/leads/summary', cookie))).json()
  assert.deepEqual(summary.byStatus, {}, 'no leads is an empty map, not a set of zeroes')
})
