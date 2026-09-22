# Decision ledger

Two kinds of entry. **ADRs** are architecture choices I made and own — they are
recorded so they can be reviewed and reversed, not so they can be re-litigated.
**D1–D5** are decisions I cannot make for you: they need commercial authority,
credentials, or a legal position. Each states the options, what it costs to be
wrong, and exactly what is blocked until it is answered.

Independent work continues around every open decision. Nothing below is treated
as resolved by assumption.

---

## Open decisions for you

### D1 — Execution platform for long-running work · BLOCKS Loops 42, 43, and production 36/37/44

**The question.** Where do jobs longer than a request actually run?

**What is now known, not assumed.** The audit verified AWS App Runner is closed
to new customers, has a hard 120-second HTTP timeout, does not schedule work,
and makes no promise about execution continuing after a response. So the 5–10
minute uninterrupted task your preference implies **cannot be promised there**,
and a new AWS account cannot provision it at all.

| Option | Fits if | Cost of being wrong |
|---|---|---|
| **A. Vercel-only, bounded + checkpointed** — DB job table, authenticated dispatcher, each step ≤ the plan's function limit | Steps can be checkpointed into ≤300s (Hobby) or ≤800s (Pro) slices | Hobby Cron is **daily only**, so the hourly automations the UI advertises are impossible on Hobby. Needs Pro. |
| **B. Existing eligible App Runner account** — EventBridge → SQS → dispatcher → bounded ≤90s App Runner step | You already have an App Runner-eligible account **and** the work checkpoints | Extra moving parts (scheduler, queue, DLQ, dispatcher) with their own cost; no new feature investment from AWS |
| **C. ECS/Fargate on-demand tasks** — started by scheduler/dispatcher, Next.js stays on Vercel | Any task genuinely cannot be interrupted | Task startup, image pull, NAT/egress and log costs; more infrastructure to operate |

**What I need from you:** (1) is there an existing App Runner-eligible AWS
account? (2) which Vercel plan is this on, and is it commercially eligible?
(3) if neither A nor B fits, do you approve C?

**Until answered:** the durable job schema, occurrence calculation, lease/fencing
and a local worker are being built and tested — they are platform-independent.
Only the production executor adapter is blocked.

### D2 — Which catalogue is actually being shipped · BLOCKS Loops 52, 53, 54

The marketplace advertises apps with no implementation behind them: Inventory,
Projects, Purchase & Payables, Contracts, PPTX, and the gated Manufacturing,
IDP, Payroll, Event registration, Request approvals and Proof-of-delivery cards.

These are not partially built. They are catalogue entries.

**Options:** (a) approve a release scope and I build those apps properly;
(b) mark the rest as coming-soon in the UI with honest availability; (c) remove
the cards.

**Cost of being wrong:** option (a) is, realistically, the largest single block
of work in this programme — Payroll alone implies statutory calculation that
must not be invented. Option (b) is honest and cheap.

**My recommendation:** (b) now, (a) per app on explicit request. I will not
invent statutory payroll, tax or legal behaviour under any option.

### D3 — Provider credentials and contracts · BLOCKS Loops 10, 38, 39, 46, 47, and live proof in 27/30/31

No live proof of OAuth, email, AI inference, OCR, storage or payments is
possible without real credentials. Contract-level tests against sandboxes can be
written and will be; they cannot establish that a real integration works.

Needed, per provider you want live: Google and/or Microsoft OAuth client
(with exact callback allowlist), an SMTP sender and authorised domain, an AI
provider key plus the approved model list, an S3-compatible bucket, and — only
if billing is in scope — a payment provider with sandbox and live separation.

**Until answered:** every one of these is implemented behind an adapter
interface with a sandbox/fake implementation, and marked BLOCKED for live proof.

### D4 — Commercial and legal position · BLOCKS Loops 18, 51, and release claims in 17

The pricing cards, plan limits, credit economics, trial length, compliance
registers and security claims in the UI are **copied marketing content**. They
are not authorisation to charge anyone or to assert compliance.

Needed: legal entity and jurisdiction, whether the listed prices are real, the
credit-to-cost model, data residency commitments, and who signs off the
compliance text. Statutory interpretation needs your legal input, not my
inference.

### D5 — Employee and partner identity · BLOCKS Loops 26, 49, and parts of 22

Three populations exist in the UI and only one has an identity model today:
platform users (have one), employees (HR records with no login link), and
external portal parties (no authentication at all).

**Options for employees:** (a) an employee record links to a platform user by
invitation; (b) employees get their own credential type; (c) self-service stays
available only to invited platform users. **For portal parties:** a separate
external identity with per-party scoping is required either way.

**My recommendation:** (a) — it reuses one identity system and one session
model. I have built the membership model so this links cleanly.

---

## ADRs — decisions I made and own

### ADR-0001 — One Next.js application, one relational database

Keep UI, auth, domain services and ordinary APIs in a single Next.js app on
Vercel, with one PostgreSQL database and one object store. Module boundaries are
enforced by service and schema, not by network hops. A second backend would add
deployment, auth-propagation and consistency problems without removing any.

### ADR-0002 — PGlite for local and test PostgreSQL

**Context.** There is no local PostgreSQL on this machine and the Docker daemon
is not running, so tests could not reach a database at all.

**Decision.** Use PGlite — real PostgreSQL 18.3 compiled to WASM — as the driver
for development and tests; `pg` against `DATABASE_URL` in production. The same
SQL migration files run in both.

**Consequence.** `npm test` gives every test a fresh, fully migrated database
with genuine constraint enforcement and no daemon. Verified: `numeric(18,4)`
round-trips exactly, unique/partial indexes and foreign keys are enforced, and
transactions roll back. This is a driver choice, not a dialect change.

### ADR-0003 — Hand-written SQL migrations as the source of truth

Numbered `.sql` files, applied once inside a transaction and recorded with a
SHA-256 checksum. Editing an already-applied migration is a hard error rather
than a silent divergence between environments. Chosen over a generate-from-TS
ORM so the reviewable artefact is the SQL that actually runs.

### ADR-0004 — Opaque database sessions, not stateless tokens

The cookie carries 256 bits of randomness and nothing else; only its SHA-256 is
stored. Every request resolves it against the database. This costs one indexed
lookup per request and buys immediate revocation: suspending a user or removing
a membership takes effect on their next request rather than at token expiry.
A JWT would make "log out everywhere" and "remove this member" unenforceable
without a denylist that reintroduces the same lookup.

### ADR-0005 — scrypt from `node:crypto` for passwords

Memory-hard, built in, no native module to compile on a deploy target. Cost
parameters are encoded inside each hash, so they can be raised later without
locking anyone out — a correct password on an old hash is silently upgraded.

### ADR-0006 — Framework-free HTTP boundary

Route handlers speak the Web standard `Request`/`Response` with no `next/server`
import. The boundary is therefore callable from a plain Node test with a real
`Request`, so the tests exercise the same code the browser reaches rather than a
re-implementation of it.

### ADR-0007 — Tenant comes from the session, never from the request

`withTenant` reads the membership for `(session.tenantId, session.userId)`. A
client cannot address another tenant by supplying an id, and a service cannot
accidentally run an unscoped query because `assertScope` throws without a tenant.
A record in another tenant returns 404, not 403 — a 403 confirms it exists.

### ADR-0008 — Money is `numeric(18,4)` plus an explicit currency

Never a float, and never a bare number in JSON either: money crosses the API as
a decimal string and reaches PostgreSQL `numeric` unchanged. Verified by test.

### ADR-0009 — Transactional outbox for every side effect

A side effect is enqueued in the same transaction as the state change that
justifies it. "Invitation sent" cannot be true while the invitation row is
missing. Delivery is at-least-once with leases, exponential backoff and a
dead-letter state; consumers must be idempotent.

### ADR-0010 — Lint is about correctness, not formatting

ESLint 9 flat config with type-aware rules, because the rules that catch real
defects here — floating promises, unsafe stringification, React purity — need
types. Two deliberate exceptions are documented in the config: promise-returning
JSX attributes, and `set-state-in-effect`, which fires on the audit's deliberate
mount-time hydration fix. Both stay visible as warnings rather than switched off.
