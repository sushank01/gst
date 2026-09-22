import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  archiveCompany, createCompany, listCompanies, readCompany, setPrimaryCompany, updateCompany,
} from '../src/server/services/companies.ts'
import { listNotifications, markAllRead, markRead, notify, unreadCount } from '../src/server/services/notifications.ts'

async function workspace() {
  const db = await freshDb()
  const c = clock()
  const owner = await seedUser(db, { email: 'owner@example.com', fullName: 'Owner' })
  const other = await seedUser(db, { email: 'rival@example.com', fullName: 'Rival' })
  const acme = await createTenantWithOwner(db, owner, { name: 'Acme' }, c.now(), 'r1')
  const rival = await createTenantWithOwner(db, other, { name: 'Rival' }, c.now(), 'r2')
  const ctxFor = async (userId: string, tenantId: string) => {
    const { token } = await createSession(db, { userId, tenantId }, c.now())
    return withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))
  }
  return { db, c, owner, ctx: await ctxFor(owner, acme.tenantId), rivalCtx: await ctxFor(other, rival.tenantId) }
}

/* ------------------------------- companies -------------------------------- */

test('the primary entity is a real row created with the workspace', async () => {
  const { db, ctx } = await workspace()
  const companies = await listCompanies(ctx)
  assert.equal(companies.length, 1)
  assert.equal(companies[0].isPrimary, true)
  assert.equal(companies[0].name, 'Acme', 'the prototype derived this and stored nothing')
  assert.ok(companies[0].id, 'it has an id, so documents can reference it')
  await db.close()
})

test('a duplicate code is refused, whatever its case', async () => {
  const { db, ctx } = await workspace()
  await createCompany(ctx, { name: 'Acme Europe', code: 'ACE', currency: 'EUR' })
  await assert.rejects(() => createCompany(ctx, { name: 'Another', code: 'ace', currency: 'EUR' }), /already in use/i)
  await db.close()
})

test('a hierarchy cannot loop back on itself', async () => {
  const { db, ctx } = await workspace()
  const top = await createCompany(ctx, { name: 'Holdings', code: 'HLD', currency: 'INR' })
  const middle = await createCompany(ctx, { name: 'Europe', code: 'EUR1', currency: 'EUR', parentId: top.id })
  const bottom = await createCompany(ctx, { name: 'France', code: 'FR', currency: 'EUR', parentId: middle.id })

  await assert.rejects(() => updateCompany(ctx, top.id, { parentId: bottom.id }), /loop back/i)
  await assert.rejects(() => updateCompany(ctx, top.id, { parentId: top.id }), /its own parent/i)

  const read = await readCompany(ctx, bottom.id)
  assert.equal(read.parentName, 'Europe')
  await db.close()
})

test('the primary flag moves in one transaction, never leaving none', async () => {
  const { db, ctx } = await workspace()
  const second = await createCompany(ctx, { name: 'Acme Europe', code: 'ACE', currency: 'EUR' })
  assert.equal(second.isPrimary, false)

  const promoted = await setPrimaryCompany(ctx, second.id)
  assert.equal(promoted.isPrimary, true)

  const all = await listCompanies(ctx)
  assert.equal(all.filter((company) => company.isPrimary).length, 1)
  assert.equal(all[0].id, second.id, 'the primary sorts first')
  await db.close()
})

test('the primary entity cannot be archived, nor one with subsidiaries', async () => {
  const { db, ctx } = await workspace()
  const primary = (await listCompanies(ctx))[0]
  await assert.rejects(() => archiveCompany(ctx, primary.id), /primary entity cannot be archived/i)

  const parent = await createCompany(ctx, { name: 'Holdings', code: 'HLD', currency: 'INR' })
  const child = await createCompany(ctx, { name: 'Europe', code: 'EUR1', currency: 'EUR', parentId: parent.id })
  await assert.rejects(() => archiveCompany(ctx, parent.id), /still report to it/i)

  await updateCompany(ctx, child.id, { parentId: null })
  await archiveCompany(ctx, parent.id)
  assert.equal((await listCompanies(ctx)).length, 2)
  assert.equal((await listCompanies(ctx, true)).length, 3)
  await db.close()
})

test('ISOLATION: companies never cross workspaces', async () => {
  const { db, ctx, rivalCtx } = await workspace()
  const ours = await createCompany(ctx, { name: 'Acme Europe', code: 'ACE', currency: 'EUR' })
  await assert.rejects(() => readCompany(rivalCtx, ours.id), /That company/)
  await assert.rejects(() => updateCompany(rivalCtx, ours.id, { name: 'Stolen' }), /That company/)
  await assert.rejects(() => setPrimaryCompany(rivalCtx, ours.id), /That company/)
  assert.equal((await listCompanies(rivalCtx)).length, 1, 'only their own primary')
  await db.close()
})

/* ----------------------------- notifications ------------------------------ */

test('the unread count is per person, not per workspace', async () => {
  const { db, ctx, owner } = await workspace()
  const colleague = await seedUser(db, { email: 'sam@example.com', fullName: 'Sam' })
  await db.query(`insert into memberships (tenant_id, user_id, role, status) values ($1,$2,'member','active')`, [
    ctx.tenantId,
    colleague,
  ])
  const { token } = await createSession(db, { userId: colleague, tenantId: ctx.tenantId }, ctx.now)
  const theirs = await withTenant(await authenticate(db, token, { now: ctx.now, requestId: 'r' }))

  const id = await notify(db, ctx, { kind: 'approval', title: 'A claim needs approving', recipients: [owner, colleague] })
  assert.ok(id)
  assert.equal(await unreadCount(ctx), 1)
  assert.equal(await unreadCount(theirs), 1)

  await markRead(ctx, id)
  assert.equal(await unreadCount(ctx), 0)
  assert.equal(await unreadCount(theirs), 1, 'one person reading it must not clear everybody s badge')
  await db.close()
})

test('reading twice keeps the first timestamp, and somebody else s is not found', async () => {
  const { db, ctx, owner, rivalCtx } = await workspace()
  const id = await notify(db, ctx, { kind: 'approval', title: 'Yours', recipients: [owner] })

  const first = await markRead(ctx, id!)
  assert.equal(first.unread, 0)
  const again = await markRead(ctx, id!)
  assert.equal(again.unread, 0, 'idempotent, not a second event')

  await assert.rejects(() => markRead(rivalCtx, id!), /That notification/)
  await db.close()
})

test('a notification with no recipients is not written at all', async () => {
  const { db, ctx } = await workspace()
  assert.equal(await notify(db, ctx, { kind: 'x', title: 'Nobody', recipients: [] }), null)
  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from notifications')
  assert.equal(rows[0].n, '0', 'a row nobody will ever read is not worth keeping')
  await db.close()
})

test('the list filters to unread, and marking all clears only this person', async () => {
  const { db, ctx, owner } = await workspace()
  const first = await notify(db, ctx, { kind: 'a', title: 'One', recipients: [owner] })
  await notify(db, ctx, { kind: 'b', title: 'Two', recipients: [owner] })
  await markRead(ctx, first!)

  assert.equal((await listNotifications(ctx, {})).rows.length, 2)
  assert.equal((await listNotifications(ctx, { unreadOnly: true })).rows.length, 1)

  const cleared = await markAllRead(ctx)
  assert.equal(cleared.marked, 1, 'only the one still unread')
  assert.equal(cleared.unread, 0)
  await db.close()
})

test('ISOLATION: a notification raised in one workspace is invisible in another', async () => {
  const { db, ctx, owner, rivalCtx } = await workspace()
  await notify(db, ctx, { kind: 'approval', title: 'Ours', recipients: [owner] })
  assert.equal(await unreadCount(rivalCtx), 0)
  assert.deepEqual((await listNotifications(rivalCtx, {})).rows, [])
  await db.close()
})
