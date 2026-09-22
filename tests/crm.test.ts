import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  listLeads, createLead, updateLead, archiveLead, restoreLead, convertLead, leadSummary,
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
