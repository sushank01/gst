# Deployment

What this document is: the steps to run this application against a real
PostgreSQL database, and the gates that must pass first. What it is not: a
record of a deployment that happened. Nothing here has been rehearsed against a
real environment — that is Loop 61, and it is not authorised.

## Before anything

`npm run verify` must pass: lint, typecheck, 306 tests, build. The tests use
PGlite, which is genuine PostgreSQL 18 compiled to WASM, running the same
migration files a server will run. A test suite that passes against a mock
would tell you nothing about the deployment; this one runs the real SQL.

## 1. The database

Provision PostgreSQL 16 or later. The schema uses `gen_random_uuid()`,
`jsonb`, partial and expression indexes, `percentile_cont`, array parameters
and advisory locks — all core PostgreSQL, no extensions to install.

```bash
export DATABASE_URL='postgres://user:password@host:5432/apragya'
npm run db:migrate
```

Migrations are **not** applied automatically when `DATABASE_URL` is set. That
is deliberate: schema change on a shared database is a deploy step somebody
decides to take, and several instances starting at once would otherwise race to
migrate. Local development, where the database is one developer's file, does
migrate on first open — so a fresh checkout runs without a separate command.

Each migration is checksummed on the way in. Editing a file that has already
been applied is a hard error rather than a silent divergence, so the schema in
front of you is the schema that ran.

### Rollback

There are no down-migrations. A schema change that has to be undone is undone
by a new forward migration, because a down-migration is code that has, by
definition, never been run against production data. Restoring from a snapshot
is the other option, and the one to prefer when data has already been written
under the new shape.

## 2. Environment

Copy `.env.example` to `.env` and fill in what you need. Every variable is
marked `[live]` (a consumer exists in the code today) or `[planned]` (the name
is reserved for a capability that is specified but not built). Nothing is
`NEXT_PUBLIC`, so nothing reaches the browser bundle.

The minimum for a working deployment:

| Variable | Why |
|---|---|
| `APP_URL` | Canonical origin for links and callbacks. |
| `DATABASE_URL` | Pooled connection. Leave blank only for local development. |
| `DATABASE_POOL_MAX` | Keep small on serverless; each instance holds its own pool and server connection slots are finite. |
| `STORAGE_DIR` | Where uploaded files live. On a platform with an ephemeral filesystem this must point at a mounted volume, or uploads vanish on redeploy. |

The session cookie's `Secure` flag is set when `NODE_ENV=production`, not from
`APP_URL` — so a production build served over plain HTTP will set a cookie the
browser refuses. Terminate TLS in front of the application.

`.env` and `.env.*` are gitignored, with `.env.example` the single exception.
No secret is read, printed or committed by any script here.

## 3. What is not wired, and will not pretend to be

- **Email.** Verification, recovery and invitation messages are written to the
  outbox and wait there. With no transport registered for their topic the
  dispatcher returns them to `pending` untouched and does not spend their retry
  budget. They are not lost, and they are not delivered. Blocked on D3.
- **OAuth.** The buttons say single sign-on is not configured. There are no
  credentials.
- **Payments.** Plan prices in the marketing content are not authorised as
  commercial commitments (D4). Nothing charges anybody.
- **Agent execution.** No provider credential exists (D3), so there is no
  runtime behind the studio surfaces.

Deploying does not change any of that. Each is waiting on a decision.

## 4. Running the dispatcher

The outbox needs a process to call `dispatchOnce` on a schedule. It is written
as one pass rather than a long-lived loop, so it suits a cron invocation, a
worker container, or a platform scheduled function equally:

```ts
import { getDb } from './src/server/db/client.ts'
import { dispatchOnce, webhookTransport } from './src/server/events/dispatcher.ts'

const transports = process.env.OUTBOX_WEBHOOK_URL
  ? {
      'ticket.created': webhookTransport({
        url: process.env.OUTBOX_WEBHOOK_URL,
        secret: process.env.OUTBOX_WEBHOOK_SECRET,
      }),
    }
  : {}

await dispatchOnce(await getDb(), { transports, worker: process.env.HOSTNAME ?? 'worker-1', now: new Date() })
```

Several dispatchers may run at once: claiming uses `for update skip locked`
with a lease, so no two take the same message and one that dies mid-flight has
its work released by timeout rather than stranding it. A test proves eight
messages across two concurrent dispatchers are delivered exactly once each.

Choosing where that process runs is decision D1, which also governs scheduled
jobs. Until it is made, the queue accumulates rather than delivering — which is
visible in `outbox.status` and is the honest behaviour.

## 5. After deploying

Check, in this order:

1. `GET /api/v1/auth/session` without a cookie answers **401**, not 500. A 500
   means the database is unreachable and every request will fail.
2. Register an account, create a workspace, and confirm the session cookie is
   `HttpOnly`, `SameSite=lax` and `Secure`.
3. `GET /api/v1/reports/overview` returns figures, and `unavailable` explains
   anything it could not compute. Zeroes here are real zeroes.
4. `select count(*) from schema_migrations` matches the number of files in
   `migrations/`.
5. `select status, count(*) from outbox group by status` — a growing `pending`
   count with no transport configured is expected; a growing `dead` count is not.

## 6. Backups

Nothing in the application performs them. The data that cannot be reconstructed
is all of it: the credit ledger, the leave ledger, audit events and file rows
are append-only precisely so history survives, which is worth nothing without a
backup. Set point-in-time recovery on the database and verify a restore before
the first real tenant, not after.
