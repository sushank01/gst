# Architecture

One Next.js application on Vercel; one PostgreSQL database; one object store
when files land. Module boundaries are service and schema boundaries, not
network hops. See `decisions.md` for the ADRs behind each choice.

```
browser
  │  fetch, cookies only — no token in JS reach
  ▼
src/app/api/v1/**/route.ts        thin adapters: parse, call, return
  │
  ▼
src/server/http/handler.ts        THE boundary
  │   requestId · session → tenant · JSON parse · error envelope · cookies
  ▼
src/server/tenancy/context.ts     THE authorization path
  │   TenantContext { tenantId, role, can(), require() }
  ▼
src/server/services/*.ts          business rules, transactions, audit, outbox
  │
  ▼
src/server/db/client.ts           pg (production) | PGlite (dev + tests)
  │
  ▼
migrations/*.sql                  the schema's source of truth
```

## The rules that hold everywhere

**A tenant id never arrives from a client.** `withTenant` looks up the
membership for `(session.tenantId, session.userId)`. A request that names a
tenant must still be a member of it. `assertScope` throws if a service is ever
about to run a business query without one, so the failure is a loud exception
rather than a query that quietly returns another tenant's rows.

**Not-found beats forbidden.** A record in another tenant answers 404. A 403
would confirm it exists, which is itself a disclosure.

**Nothing is authorised by the UI.** Every mutation re-checks a permission on
the server. Hiding a button is a courtesy, not a control — and the tests assert
the server refuses a viewer even when the client asks nicely.

**Side effects are transactional.** An effect is enqueued in the outbox inside
the transaction that justifies it, so "invitation sent" cannot be true while the
invitation row is missing. Delivery is at-least-once, so consumers are idempotent.

**Money is `numeric(18,4)` plus a currency.** It crosses the API as a decimal
string and reaches PostgreSQL unchanged. There is no float in the money path.

**Concurrency is explicit.** Mutations carry the version the client read; a
stale write is a 409 with the current version, not a silent overwrite. Jobs
carry a fence token; a late result from a superseded worker is rejected.

## What runs where

| Concern | Where | Why |
|---|---|---|
| UI, auth, CRUD APIs | Next.js on Vercel | one deployable, one session model |
| Business state | PostgreSQL | relational integrity the browser store never had |
| Short background work | bounded handler + job row | survives the browser closing |
| Long background work | **undecided — D1** | App Runner's 120s cap cannot promise 5–10 min |
| Files | object store, presigned | **not yet implemented** |

The job tables, occurrence calculation, leases, fencing, retries and the
dead-letter path are all implemented and tested against a local worker. They are
deliberately independent of *where* execution finally happens, so D1 changes one
adapter rather than the design.

## What has actually moved off the browser store

`src/lib/workspace.tsx` (2,425 lines, one localStorage key) is still the source
for most screens. Migrated so far: identity and sessions, tenants, companies,
memberships, invitations, audit, and CRM leads. `useServerLeads.tsx` is the
reference for the rest — it shows the states a real fetch has and that the
prototype's always-present data could not express: first load, refreshing,
filtered-empty, denied, and a retryable failure that must never be rendered as
an empty list.
