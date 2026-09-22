import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import type { Db } from './client.ts'

/**
 * Migration runner.
 *
 * Plain numbered `.sql` files are the source of truth — reviewable in a diff,
 * portable to any PostgreSQL, and not the output of a code generator. Each is
 * applied once inside a transaction and recorded with the SHA-256 of its
 * contents, so an edited migration that has already shipped is an error rather
 * than a silent divergence between environments.
 */

export const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations')

const LEDGER = `
create table if not exists schema_migrations (
  id           text primary key,
  checksum     text not null,
  applied_at   timestamptz not null default now(),
  duration_ms  integer not null
);`

export type AppliedMigration = { id: string; checksum: string; durationMs: number; skipped: boolean }

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

export async function listMigrationFiles(dir = MIGRATIONS_DIR): Promise<string[]> {
  const names = await readdir(dir)
  return names.filter((name) => name.endsWith('.sql')).sort()
}

export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<AppliedMigration[]> {
  await db.exec(LEDGER)
  const { rows } = await db.query<{ id: string; checksum: string }>('select id, checksum from schema_migrations')
  const applied = new Map(rows.map((row) => [row.id, row.checksum]))

  const results: AppliedMigration[] = []
  for (const file of await listMigrationFiles(dir)) {
    const id = file.replace(/\.sql$/, '')
    const body = await readFile(path.join(dir, file), 'utf8')
    const checksum = sha256(body)
    const previous = applied.get(id)

    if (previous) {
      if (previous !== checksum) {
        throw new Error(
          `Migration ${id} was modified after it was applied (recorded ${previous.slice(0, 12)}, ` +
            `file ${checksum.slice(0, 12)}). Add a new migration instead of editing a shipped one.`,
        )
      }
      results.push({ id, checksum, durationMs: 0, skipped: true })
      continue
    }

    const started = process.hrtime.bigint()
    await db.transaction(async (tx) => {
      await tx.exec(body)
      await tx.query('insert into schema_migrations (id, checksum, duration_ms) values ($1, $2, $3)', [
        id,
        checksum,
        0,
      ])
    })
    const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n)
    await db.query('update schema_migrations set duration_ms = $2 where id = $1', [id, durationMs])
    results.push({ id, checksum, durationMs, skipped: false })
  }
  return results
}

/** Every migration recorded in the database but missing from disk — a rollback hazard. */
export async function orphanedMigrations(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  const onDisk = new Set((await listMigrationFiles(dir)).map((f) => f.replace(/\.sql$/, '')))
  const { rows } = await db.query<{ id: string }>('select id from schema_migrations order by id')
  return rows.map((row) => row.id).filter((id) => !onDisk.has(id))
}
