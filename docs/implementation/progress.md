# Progress

Status per loop from `docs/IMPLEMENTATION-PROMPT.md`. The vocabulary is
deliberately narrow:

- **DONE** — the acceptance condition is met, with named evidence.
- **PARTIAL** — real code exists and what is missing is stated.
- **BLOCKED** — names the decision that must come first.
- **NOT STARTED** — honest about not having begun.

A passing build, a route that renders, a state setter or a localStorage write
never counts. Neither does a number a screen displays: every figure claimed
below is cross-checked by a test against the query the module itself runs.

## Where the code stands

| | |
|---|---|
| Migrations | 10 files, **138 tables**, checksummed; editing a shipped migration is a hard error |
| Services | 25 modules under `src/server/services` |
| HTTP | **124 route files, 172 operations**, all behind one boundary with strict DTOs |
| Tests | **392**, 28 files, 7,003 lines — real PostgreSQL per test via PGlite |
| Quality gates | `npm run verify` = lint (0 errors) → typecheck → test → build, all clean |
| API document | `docs/api/openapi.json`, generated from the routes; a stale one fails the build |

## Per loop

| Loop | Status | Evidence / what is missing |
|---|---|---|
| 01 Reconcile baseline | **DONE** | `baseline.md`; install, typecheck, tests and build reproduced; the audit's 53 uncommitted paths preserved |
| 02 Enumerate surfaces | **PARTIAL** | 9 of 11 domains mapped into `map/*.json`. The mapping pass for CRM, HR and admin/governance failed on output limits and was not re-run — HR and Travel & Expense were instead modelled directly from source, so the gap is documentation rather than coverage |
| 03 Trace interactions | **PARTIAL** | 695 operations in `coverage.csv` with actual behaviour; 122 pieces of false-success copy catalogued. Not re-traced since the backend landed |
| 04 Scope and decisions | **DONE** | `decisions.md` — D1–D5 with options and the cost of being wrong; 10 ADRs |
| 05 Architecture and workload | **PARTIAL** | `architecture.md` and verified platform constraints. **No workload benchmarks** — extraction and rendering do not exist yet, so there is nothing real to measure |
| 06 Dev and verification foundation | **DONE** | ESLint 9 flat config (type-aware), `npm run verify`, isolated database per test |
| 07 Domain schema and migrations | **DONE** | 138 tables across identity, tenancy, jobs, CRM, platform, support, assets, sales, pitch, HR, travel and expense. Fresh install and re-run both verified |
| 08 API contract | **DONE** | 118 operations, one error envelope, strict DTOs, request ids, optimistic concurrency; OpenAPI generated from the routes with drift, coverage, auth and tenant-id checks as tests |
| 09 Real identity and password login | **DONE** | scrypt, opaque DB sessions, lockout, verification and reset tokens, uniform failures; entering a workspace rotates the token, which a test proves |
| 10 OAuth and MFA | **BLOCKED (D3)** | Fabricated OAuth removed; the buttons say single sign-on is not configured. No credentials exist |
| 11 Tenant and membership isolation | **DONE** | Tenant bound from the session; cross-tenant reads and writes refused as 404; last-owner guard under a row lock; removal revokes sessions |
| 12 Onboarding and installation | **DONE** | Tenant + primary company + owner membership + audit in one transaction. Apps install through the server: unticking uninstalls, the plan quota is enforced under a lock, a selection that exceeds it is refused whole, and an app with no implementation is refused with that reason |
| 13 UI persistence adapter | **PARTIAL** | `api.ts` + `useResource`/`useMutation` with every real fetch state. Auth, CRM leads, the dashboard, the app catalogue and both app-metric tabs are server-backed. **Most feature screens still read `workspace.tsx`** — the services and routes they need exist; the wiring does not |
| 14 Shared UI and accessibility | **PARTIAL** | The audit's consolidation preserved; React purity bugs fixed. **No systematic keyboard or contrast pass** |
| 15 Files and bulk IO | **DONE** | Begin/complete upload with magic-byte sniffing and a measured size, a rejected state that leaves a trail, single-use expiring download grants, `attachment` + `nosniff` on the response. Server-side CSV import stages before it writes, reports every problem with its line, refuses a whole file rather than half-applying it, and writes each row through the ordinary service so it cannot bypass a rule the form obeys; exports neutralise spreadsheet formulas |
| 16 Audit, outbox, notifications | **PARTIAL** | Append-only audit with redaction; outbox with leases, backoff and dead letters; a dispatcher that never marks delivered what was not delivered, and returns an unroutable message untouched. **The only real transport is a webhook** — email and chat need D3 |
| 17 Companies and accounting | **PARTIAL** | Company hierarchy, currency, primary-company constraint. **No journals or posting** |
| 18 Plans, entitlements, credits | **PARTIAL** | Credits are a real immutable ledger with reservations under an advisory lock; quotas and the trial countdown are computed from stored rows. **Prices remain BLOCKED (D4)** — nothing asserts a price is authorised |
| 19 CRM party and lead lifecycle | **PARTIAL** | Party model, full lead lifecycle, audited, with optimistic concurrency. Contacts, accounts, dedup and merge not done |
| 20 CRM pipeline and activities | **PARTIAL** | Pipelines, ordered stages with explicit outcomes, deals, stage history, activities. No UI |
| 21 CRM outbound and settings | **NOT STARTED** | — |
| 22 HR people and recruitment | **PARTIAL** | Employment as a history: hire opens a position, a transfer closes it the day before the next begins, an exit closes it and refuses to orphan reports; manager cycles refused. Recruitment tables exist (requisitions, candidates, applications, interviews, offers) but **have no service or routes** |
| 23 HR attendance and scheduling | **DONE** | Attendance derived from punches with at most one open interval per person (index-enforced), settlement idempotent, overnight shifts credited to the day worked, lateness and overtime measured against the shift, abandoned punches closed at the shift end rather than at whenever somebody noticed |
| 24 HR leave, overtime, timesheets | **DONE** | Leave is a balance LEDGER with a once-key: approving twice deducts once, cancelling writes a visible restoration, overlapping days are refused, pending requests are held against the balance, and day counts come from the working calendar. Timesheets lock on approval; one live overtime claim per person per day |
| 25 HR development, care, communication | **PARTIAL** | Tables for training, appraisals, announcements and care cases. **No service or routes** |
| 26 Employee self-service | **PARTIAL** | The portal resolves a real linked employee record (`/hr/me`), with balances and any open punch; the link is unique per account. The self-service screens themselves are not migrated |
| 27–28 Travel and expense | **DONE** | An expense belongs to one report, a card line matches one expense, a report is paid at most once — all unique indexes. FX conversion records the rate used at eight decimals. Threshold approval levels, one decision per level per round, a resubmission decided afresh. Trips approved before they can be booked; overlapping trips refused |
| 29 Asset lifecycle and custody | **DONE** | One open custody row per asset (index-enforced, proven under concurrency), retirement once and never while issued, service that does not silently take an asset off its holder, straight-line depreciation that reconciles and is null when the inputs were never supplied |
| 30–31 Support | **DONE** | SLA clocks with business-hours arithmetic across DST, pause and resume on waiting, first response satisfied only by a public reply, escalations that fire once however often they sweep, one CSAT per ticket, internal notes never in a requester view. Knowledge base where draft-versus-published is an access control the query enforces, published edits keep their previous text, and configuration — teams, vocabularies, SLA policies, escalation rules, calendars — is editable and validated against what the engine can actually do |
| 32–35 Sales and POS | **PARTIAL** | Totals in integer minor units, gapless locked numbering, posting idempotent and one-way, payments with an idempotency key, subscription billing that claims a period before invoicing it. The till reconciles cash against the tenders and refuses to close an unexplained variance; customers are shared party records; returns are bounded by what was billed and priced at what was charged; contract pricing resolves by priority then volume break; receivables age by how late each invoice is. **Loyalty, tax categories and the remaining dashboard reports are not built** |
| 36–37 Pitch Pilot | **NOT STARTED** | Schema exists (16 entities). Real extraction and rendering also depend on D3 |
| 38–39 Models and Business Suite | **BLOCKED (D3)** | No provider credential exists |
| 40–41 Agent Studio and execution | **NOT STARTED** | Two Studio implementations still unreconciled |
| 42 Durable jobs and scheduling | **PARTIAL** | Cron with real DST handling, occurrence uniqueness, leases, fencing tokens, checkpoints, retries, dead letters, missed-run recording, a stuck-job reaper. **No production dispatcher process** (D1) |
| 43 Execution-platform adapter | **BLOCKED (D1)** | — |
| 44–45 Vibe, Copilot, Vippy | **NOT STARTED** | Generation depends on D3 |
| 46–48 Connectors and runners | **BLOCKED (D3)** | — |
| 49 Partner portal | **BLOCKED (D5)** | No external identity model |
| 50 Guardrails | **PARTIAL** | Keyword, PII, spend and schema evaluators run at their checkpoint; the strictest match wins; a kind with no evaluator throws into its failure mode, so fail-closed blocks; violation excerpts are masked before storage. **`content` and `rate` have no evaluator** and say so rather than passing |
| 51 Compliance | **BLOCKED (D4)** | Legal position required |
| 52–54 Missing and gated apps | **PARTIAL / BLOCKED (D2)** | The server catalogue marks six applications releasable and nine not. The unreleasable ones are refused with that reason instead of installing an empty shell. Which become releasable is D2 |
| 55 Cross-module reports and search | **DONE** | Every figure computed from the rows the module itself reads, cross-checked in tests against those modules' own queries; anything uncomputable is null with a reason, never a zero. Search spans five modules, tenant-scoped in each branch |
| 56 Remove demo authority | **PARTIAL** | Fabricated auth removed; the dashboard, catalogue and app metrics are server-backed. `workspace.tsx` is still authoritative for most feature screens |
| 57 Security and concurrency | **PARTIAL** | Isolation, privilege escalation, enumeration, replay, fencing, stale versions, session rotation, and eleven concurrency races each proven to have exactly one winner. `tests/sql.test.ts` statically proves no query interpolates caller data, no parameter list is padded, and no query picks its text with a ternary — the last after that shape produced the same bug three times. CSV exports neutralise spreadsheet formula injection. **No CSRF, SSRF or XSS testing** |
| 58 End-to-end and failure recovery | **PARTIAL** | Sign-up → workspace → app selection → dashboard verified in a browser against a fresh database, with records created through the API moving the figures. Not extended to every domain, and no failure-injection rehearsal |
| 59 Performance, cost, footprint | **NOT STARTED** | No load testing. Cost cannot be recomputed before D1 |
| 60 Environment and deployment | **PARTIAL** | `.env.example` marks live versus planned per variable; no secrets in git or the client bundle; `docs/implementation/deployment.md` written. Not rehearsed against a real environment |
| 61 Preview deployment | **NOT STARTED** | Not authorised, and D1/D3 unresolved |
| 62 Production release gate | **NOT STARTED** | Cannot pass while any accepted requirement is unverified. This table is the gate's input |

## What a reader should not conclude

The backend is real and tested; the product is not finished. The largest
remaining gap is the one Loop 13 names: most feature screens still read the
browser prototype store even though the services and routes behind them exist
and are tested. A screen that renders is not a screen that is connected.

Everything marked BLOCKED is waiting on a decision, not on work. Those loops
are built up to the decision boundary and stop there rather than guessing —
a fabricated OAuth flow or an invented price is worse than an absent one.

## Verification

```bash
npm ci
npm run verify       # lint → typecheck → test → build
npm run openapi      # regenerate the API document
npm run db:migrate   # applies migrations to DATABASE_URL
npm run dev          # local PGlite, migrated on first open
```
