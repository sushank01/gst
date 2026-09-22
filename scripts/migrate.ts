/**
 * Applies pending migrations to whatever database the environment points at.
 *
 * With no DATABASE_URL this migrates the local PGlite directory, so a fresh
 * checkout is one command away from a working database.
 */
import { getDb } from '../src/server/db/client.ts'
import { migrate, orphanedMigrations } from '../src/server/db/migrate.ts'

const db = await getDb()
const applied = await migrate(db)
const fresh = applied.filter((entry) => !entry.skipped)

console.log(
  fresh.length
    ? `Applied ${fresh.length} migration(s): ${fresh.map((entry) => `${entry.id} (${entry.durationMs}ms)`).join(', ')}`
    : `Already up to date (${applied.length} migration(s) recorded).`,
)

const orphans = await orphanedMigrations(db)
if (orphans.length) {
  console.warn(`Recorded but missing from disk: ${orphans.join(', ')} — a rollback may be incomplete.`)
}

await db.close()
