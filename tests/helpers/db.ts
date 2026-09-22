import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openPglite, type Db } from '../../src/server/db/client.ts'
import { migrate } from '../../src/server/db/migrate.ts'

/**
 * A fresh, fully migrated, in-memory PostgreSQL per call.
 *
 * Tests get real constraint enforcement — unique indexes, checks, foreign keys,
 * transactions — rather than a mock that agrees with whatever the code does.
 * In-memory means no shared state between test files and no cleanup to forget.
 *
 * Building that from the migrations takes about eight seconds now there are
 * eleven of them and 144 tables, and a suite of four hundred tests cannot
 * afford it: a test suite nobody runs is not a test suite. So the migrations
 * run ONCE, the result is snapshotted, and every later call restores the
 * snapshot — about a second and a half.
 *
 * The snapshot is keyed by a hash of the migration files themselves. Change
 * one and the key changes, so a stale template can never be silently reused —
 * which would be the one failure mode worse than being slow.
 */

const CACHE_DIR = join(tmpdir(), 'apragya-test-templates')

/** Fingerprint of every migration, so the cache invalidates when they change. */
async function migrationsHash(): Promise<string> {
  const names = (await readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()
  const hash = createHash('sha256')
  for (const name of names) {
    hash.update(name)
    hash.update(await readFile(join('migrations', name)))
  }
  return hash.digest('hex').slice(0, 16)
}

/** In-process memo, so repeated calls in one file do not re-read the file. */
let template: Promise<Uint8Array> | null = null

async function loadTemplate(): Promise<Uint8Array> {
  const key = await migrationsHash()
  const path = join(CACHE_DIR, `${key}.tar`)

  try {
    return new Uint8Array(await readFile(path))
  } catch {
    // Not built yet, or built for different migrations.
  }

  const db = await openPglite()
  await migrate(db)
  const dumped = await dump(db)
  await db.close()

  await mkdir(CACHE_DIR, { recursive: true })
  /*
   * Written under a unique name then renamed, because several test files run
   * as separate processes and may build the template at the same moment. A
   * half-written tar read by another process would fail in a way that looked
   * like a schema bug.
   */
  const staging = `${path}.${process.pid}`
  await writeFile(staging, dumped)
  const { rename } = await import('node:fs/promises')
  await rename(staging, path).catch(() => undefined)
  return dumped
}

/** Snapshots a migrated database through the handle `fromPglite` keeps. */
async function dump(db: Db): Promise<Uint8Array> {
  if (!db.pglite) throw new Error('This Db is not backed by PGlite, so it cannot be snapshotted.')
  const blob = await db.pglite.dumpDataDir('none')
  return new Uint8Array(await blob.arrayBuffer())
}

export async function freshDb(): Promise<Db> {
  template ??= loadTemplate()
  const bytes = await template
  const { PGlite } = await import('@electric-sql/pglite')
  const pg = await PGlite.create({ loadDataDir: new Blob([bytes as BlobPart]) })
  const { fromPglite } = await import('../../src/server/db/client.ts')
  return fromPglite(pg)
}

/** Deterministic clock. Tests must never depend on wall-clock timing. */
export function clock(iso = '2026-01-01T00:00:00.000Z') {
  let current = new Date(iso)
  return {
    now: () => new Date(current),
    advance(ms: number) {
      current = new Date(current.getTime() + ms)
      return new Date(current)
    },
  }
}

export async function seedUser(
  db: Db,
  opts: { email: string; fullName?: string; passwordHash?: string | null; status?: string; verified?: boolean },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into users (email, full_name, password_hash, status, email_verified_at)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      opts.email,
      opts.fullName ?? 'Test User',
      opts.passwordHash ?? null,
      opts.status ?? 'active',
      opts.verified === false ? null : new Date('2026-01-01T00:00:00.000Z'),
    ],
  )
  return rows[0].id
}

export async function seedTenant(db: Db, name: string, slug: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into tenants (name, slug) values ($1, $2) returning id',
    [name, slug],
  )
  return rows[0].id
}

export async function seedMembership(db: Db, tenantId: string, userId: string, role = 'owner'): Promise<void> {
  await db.query('insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)', [tenantId, userId, role])
}
