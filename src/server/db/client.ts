/**
 * One database handle for the whole server.
 *
 * Production uses `pg` against DATABASE_URL. Local development and tests use
 * PGlite — genuine PostgreSQL compiled to WASM — so there is no daemon to
 * install and the *same* SQL migrations run in both places. This is a driver
 * choice, not a dialect change: every statement in `migrations/` is portable
 * PostgreSQL, and CI runs the identical files.
 *
 * The important detail is transactions. A transaction must run every statement
 * on ONE connection: `begin` on a pooled connection and the insert on another
 * gives no atomicity at all, and leaves the first connection with an open
 * transaction. So `transaction()` acquires a dedicated connection and hands the
 * callback a handle bound to it. PGlite is a single session, so there
 * "acquiring" means waiting for the previous transaction to finish — which is
 * also what makes concurrent transactions behave the way they will in
 * production rather than silently interleaving.
 */

export type SqlValue = string | number | boolean | null | Date | Buffer | SqlValue[] | Record<string, unknown>

export type QueryResult<Row> = { rows: Row[]; rowCount: number }

/** The minimum of PGlite this module needs, so `pg` is not a type dependency. */
type PgliteHandle = {
  query(text: string, params?: unknown[]): Promise<RawResult>
  exec(text: string): Promise<unknown>
  close(): Promise<void>
  dumpDataDir(compression: 'none' | 'gzip' | 'auto'): Promise<Blob | File>
}

export interface Db {
  /** Parameterised query. Never interpolate values into `text`. */
  query<Row = Record<string, unknown>>(text: string, params?: SqlValue[]): Promise<QueryResult<Row>>
  /** Multi-statement DDL. Not parameterised — migrations only. */
  exec(text: string): Promise<void>
  /**
   * Runs `fn` on a dedicated connection inside a transaction, rolling back on
   * any throw. A nested call joins the outer transaction rather than opening a
   * second one, so a service that transacts internally stays correct when
   * called from another service.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>
  close(): Promise<void>
  /**
   * The underlying PGlite instance, when there is one.
   *
   * Exposed for one purpose: the test helper snapshots a migrated database so
   * four hundred tests do not each spend eight seconds running the migrations.
   * Request code must never reach for this — it is undefined against a real
   * server, and anything that needs it is doing something PostgreSQL-specific
   * in the wrong layer.
   */
  readonly pglite?: PgliteHandle
}

type RawResult = { rows: unknown[]; rowCount?: number | null }

/** One connection's worth of capability. `release` returns it to its owner. */
type Connection = {
  query(text: string, params?: SqlValue[]): Promise<RawResult>
  exec(text: string): Promise<void>
  release(): void
}

type Driver = {
  /** Autocommit query — any connection will do. */
  query(text: string, params?: SqlValue[]): Promise<RawResult>
  exec(text: string): Promise<void>
  /** A connection held exclusively until released. */
  acquire(): Promise<Connection>
  end(): Promise<void>
}

/** Serialises access to a single-session driver. */
function mutex() {
  let tail: Promise<void> = Promise.resolve()
  return async function take(): Promise<() => void> {
    let release!: () => void
    const next = new Promise<void>((resolve) => {
      release = resolve
    })
    const wait = tail
    tail = tail.then(() => next)
    await wait
    return release
  }
}

function fromConnection(connection: Connection, depth: number): Db {
  return {
    async query<Row>(text: string, params: SqlValue[] = []) {
      const result = await connection.query(text, params)
      const rows = (result.rows ?? []) as Row[]
      return { rows, rowCount: result.rowCount ?? rows.length }
    },
    async exec(text: string) {
      await connection.exec(text)
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      // Already inside one, on this same connection — join it. Savepoints would
      // allow independent rollback, but every caller here wants all-or-nothing.
      return fn(fromConnection(connection, depth + 1))
    },
    close(): Promise<void> {
      // Not async: there is nothing to await. Closing the shared handle from
      // inside a transaction would strand the connection this one is holding.
      return Promise.reject(new Error('Cannot close the database from inside a transaction.'))
    },
  }
}

function fromDriver(driver: Driver): Db {
  const db: Db = {
    async query<Row>(text: string, params: SqlValue[] = []) {
      const result = await driver.query(text, params)
      const rows = (result.rows ?? []) as Row[]
      return { rows, rowCount: result.rowCount ?? rows.length }
    },
    async exec(text: string) {
      await driver.exec(text)
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      const connection = await driver.acquire()
      try {
        await connection.exec('begin')
        let out: T
        try {
          out = await fn(fromConnection(connection, 1))
        } catch (error) {
          await connection.query('rollback').catch(() => undefined)
          throw error
        }
        await connection.exec('commit')
        return out
      } finally {
        connection.release()
      }
    },
    async close() {
      await driver.end()
    },
  }
  return db
}

/*
 * The PROMISE, not the resolved handle.
 *
 * Memoising the handle leaves a window: the first caller awaits the open while
 * a second finds `shared` still null and opens a second database. Against
 * PGlite that is two processes on one directory; against `pg` it is a second
 * pool nobody will ever close. Memoising the promise means every concurrent
 * caller at cold start waits on the same open — and, below, on the same
 * migration.
 */
let shared: Promise<Db> | null = null

/** Wraps an already-open PGlite instance. The test helper restores one from a snapshot. */
export function fromPglite(pg: PgliteHandle): Db {
  const take = mutex()

  const db = fromDriver({
    query: (text, params) => pg.query(text, params),
    exec: async (text) => {
      await pg.exec(text)
    },
    /*
     * PGlite has exactly one session, so a transaction must hold it alone.
     * Queueing here is not a limitation to work around — it is what stops two
     * transactions interleaving their statements and corrupting each other,
     * and it makes a concurrency test mean the same thing it will against a
     * real server.
     */
    acquire: async () => {
      const release = await take()
      return {
        query: (text, params) => pg.query(text, params),
        exec: async (text) => {
          await pg.exec(text)
        },
        release,
      }
    },
    end: () => pg.close(),
  })
  return { ...db, pglite: pg }
}

/** Opens a PGlite database. `dir` undefined means in-memory (tests). */
export async function openPglite(dir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  if (dir) {
    // PGlite creates its own data directory but not the parents above it.
    const { mkdir } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    await mkdir(dirname(dir), { recursive: true })
  }
  const pg = dir ? await PGlite.create(dir) : await PGlite.create()
  return fromPglite(pg)
}

/** Opens a pooled connection to a real PostgreSQL server. */
export async function openPostgres(url: string): Promise<Db> {
  const { Pool } = await import('pg')
  // A small pool: serverless functions are short-lived and a large pool
  // exhausts server-side connection slots faster than it helps.
  const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 5) })

  return fromDriver({
    query: (text, params) => pool.query(text, params as unknown[]),
    exec: async (text) => {
      await pool.query(text)
    },
    acquire: async () => {
      // A checked-out client, so every statement in the transaction — begin,
      // the work, commit — runs on the same connection.
      const client = await pool.connect()
      return {
        query: (text, params) => client.query(text, params as unknown[]),
        exec: async (text) => {
          await client.query(text)
        },
        release: () => client.release(),
      }
    },
    end: () => pool.end(),
  })
}

/**
 * The process-wide handle. Chosen by environment, never by a caller, so no
 * request handler can accidentally talk to a different database than the one
 * migrations ran against.
 */
export function getDb(): Promise<Db> {
  shared ??= open()
  return shared
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim()
  if (url) {
    /*
     * A real server. Migrations are NOT applied here: schema changes on a
     * shared database are a deliberate deploy step (`npm run db:migrate`), not
     * something that happens because a request arrived. Several instances
     * starting at once would otherwise race to migrate.
     */
    return openPostgres(url)
  }

  /*
   * Local PGlite. Here migrations ARE applied on open, so a fresh checkout
   * works from `npm run dev` without a separate step — the alternative is a
   * 500 saying `relation "users" does not exist`, which tells a newcomer
   * nothing. Because the promise above is what is memoised, a request that
   * arrives mid-migration waits for it rather than reading a half-built schema.
   */
  const db = await openPglite(process.env.PGLITE_DIR || '.data/pg')
  const { migrate } = await import('./migrate.ts')
  await migrate(db)
  return db
}

/** Test/teardown hook. Not for request code. */
export async function resetDbHandle(): Promise<void> {
  const current = shared
  shared = null
  if (current) await current.then((db) => db.close()).catch(() => undefined)
}
