import { openPglite, type Db } from '../../src/server/db/client.ts'
import { migrate } from '../../src/server/db/migrate.ts'

/**
 * A fresh, fully migrated, in-memory PostgreSQL per call.
 *
 * Tests get real constraint enforcement — unique indexes, checks, foreign keys,
 * transactions — rather than a mock that agrees with whatever the code does.
 * In-memory means no shared state between test files and no cleanup to forget.
 */
export async function freshDb(): Promise<Db> {
  const db = await openPglite()
  await migrate(db)
  return db
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
