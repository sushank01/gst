import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openPglite } from '../src/server/db/client.ts'
import { migrate, listMigrationFiles, orphanedMigrations } from '../src/server/db/migrate.ts'
import { freshDb } from './helpers/db.ts'

test('a fresh database applies every migration and records each one', async () => {
  const db = await openPglite()
  const applied = await migrate(db)
  const files = await listMigrationFiles()
  assert.equal(applied.length, files.length, 'every migration file is applied')
  assert.ok(applied.every((m) => !m.skipped), 'none skipped on a fresh database')
  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from schema_migrations')
  assert.equal(rows[0].n, String(files.length))
  await db.close()
})

test('re-running migrations is a no-op, not a second apply', async () => {
  const db = await freshDb()
  const second = await migrate(db)
  assert.ok(second.every((m) => m.skipped), 'all skipped on the second run')
  assert.deepEqual(await orphanedMigrations(db), [], 'nothing recorded that is missing from disk')
  await db.close()
})

test('editing an already-applied migration is refused', async () => {
  const db = await freshDb()
  await db.query("update schema_migrations set checksum = 'tampered' where id = (select min(id) from schema_migrations)")
  await assert.rejects(() => migrate(db), /modified after it was applied/)
  await db.close()
})

test('money survives the round trip exactly — no float drift', async () => {
  const db = await freshDb()
  await db.exec('create table money_probe (amount numeric(18,4) not null)')
  await db.query('insert into money_probe (amount) values ($1), ($2), ($3)', ['0.1', '0.2', '19.9999'])
  const { rows } = await db.query<{ total: string }>('select sum(amount)::text as total from money_probe')
  assert.equal(rows[0].total, '20.2999', 'numeric sums exactly; a float column would not')
  await db.close()
})

test('tenant cascade removes its own rows and nothing else', async () => {
  const db = await freshDb()
  const { rows: a } = await db.query<{ id: string }>("insert into tenants (name, slug) values ('A','a') returning id")
  const { rows: b } = await db.query<{ id: string }>("insert into tenants (name, slug) values ('B','b') returning id")
  await db.query("insert into companies (tenant_id, name, code, currency) values ($1,'A Ltd','A1','USD')", [a[0].id])
  await db.query("insert into companies (tenant_id, name, code, currency) values ($1,'B Ltd','B1','USD')", [b[0].id])
  await db.query('delete from tenants where id = $1', [a[0].id])
  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from companies')
  assert.equal(rows[0].n, '1', "the other tenant's company is untouched")
  await db.close()
})

test('a tenant cannot have two primary companies', async () => {
  const db = await freshDb()
  const { rows } = await db.query<{ id: string }>("insert into tenants (name, slug) values ('A','a') returning id")
  const tenant = rows[0].id
  await db.query("insert into companies (tenant_id, name, code, currency, is_primary) values ($1,'A','A','USD',true)", [tenant])
  await assert.rejects(
    () => db.query("insert into companies (tenant_id, name, code, currency, is_primary) values ($1,'B','B','USD',true)", [tenant]),
    /duplicate key|unique/i,
    'the database refuses a second primary, not just the UI',
  )
  await db.close()
})

test('company codes and tenant slugs are case-insensitively unique', async () => {
  const db = await freshDb()
  const { rows } = await db.query<{ id: string }>("insert into tenants (name, slug) values ('A','acme') returning id")
  await assert.rejects(() => db.query("insert into tenants (name, slug) values ('A2','ACME')"), /duplicate key|unique/i)
  await db.query("insert into companies (tenant_id, name, code, currency) values ($1,'A','hq','USD')", [rows[0].id])
  await assert.rejects(
    () => db.query("insert into companies (tenant_id, name, code, currency) values ($1,'B','HQ','USD')", [rows[0].id]),
    /duplicate key|unique/i,
  )
  await db.close()
})

test('a rolled back transaction leaves nothing behind', async () => {
  const db = await freshDb()
  await assert.rejects(
    () =>
      db.transaction(async (tx) => {
        await tx.query("insert into tenants (name, slug) values ('Ghost','ghost')")
        throw new Error('boom')
      }),
    /boom/,
  )
  const { rows } = await db.query<{ n: string }>("select count(*)::text as n from tenants where slug = 'ghost'")
  assert.equal(rows[0].n, '0')
  await db.close()
})
