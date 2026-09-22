# Progress

Status per loop from the implementation prompt. The vocabulary is deliberately
narrow: **DONE** means acceptance met with named evidence; **PARTIAL** means real
code exists and what is missing is stated; **BLOCKED** names the decision;
**NOT STARTED** is honest about not having begun.

A passing build, a route that renders, or a localStorage write never counts.

| Loop | Status | Evidence / what is missing |
|---|---|---|
| 01 Reconcile baseline | **DONE** | `baseline.md`; `npm ci`, typecheck, tests, build reproduced; audit's 53 uncommitted paths preserved; two environment blockers found and resolved (no local Postgres, Docker down) |
| 02 Enumerate surfaces | **PARTIAL** | **6 of 11 domains mapped** into `map/*.json`; 117 surfaces recorded. The remaining five — the core store, CRM, HR, Travel & Expense and admin/governance — were still running when the pass was stopped and must be re-run (`scripts/` + the workflow that produced `map/`) |
| 03 Trace interactions | **PARTIAL** | 695 operations in `coverage.csv` with actual current behaviour; 157 confirmed browser-only; 122 pieces of false-success copy catalogued |
| 04 Scope and decisions | **DONE** | `decisions.md` — D1–D5 stated with options and cost of being wrong; 10 ADRs recorded |
| 05 Architecture and workload | **PARTIAL** | `architecture.md`, ADRs, platform constraints verified in the audit. **No workload benchmarks** — there is nothing real to measure until extraction/rendering exist |
| 06 Dev and verification foundation | **DONE** | ESLint 9 flat config (type-aware) — 0 errors; `npm test` = 96 tests; isolated real PostgreSQL per test via PGlite; `npm run verify` |
| 07 Domain schema and migrations | **PARTIAL** | 22 tables, 3 migrations, checksummed runner, fresh-install and re-run verified. Covers identity, tenancy, jobs, CRM. Seven domains still unmodelled |
| 08 API contract | **PARTIAL** | Boundary, error envelope, strict DTOs, request ids, optimistic concurrency, 14 endpoints. **No OpenAPI document yet** |
| 09 Real identity and password login | **DONE** | scrypt, opaque DB sessions, lockout, verification and reset tokens, uniform failures. Wrong passwords fail, replays fail, logout revokes, protected APIs enforce independently — all tested, plus live browser proof |
| 10 OAuth and MFA | **BLOCKED (D3)** | Fabricated OAuth removed; buttons disabled and say why. No credentials exist |
| 11 Tenant and membership isolation | **DONE** | Tenant bound from session; cross-tenant read and write refused; 404 not 403; last-owner guard with row locks; removal revokes sessions. 17 tests including adversarial cases |
| 12 Onboarding and installation | **PARTIAL** | Tenant + primary company + owner membership + audit in one transaction; wizard navigates only after it commits. **App installs are still browser-local**; quota and gating not enforced |
| 13 UI persistence adapter | **PARTIAL** | `api.ts` + `useResource`/`useMutation` with every real fetch state; auth and CRM leads migrated and proven across a server restart. The other screens still read `workspace.tsx` |
| 14 Shared UI and accessibility | **PARTIAL** | Audit's consolidation preserved; 4 React purity bugs fixed; unsafe stringification fixed. **No systematic keyboard/contrast pass** |
| 15 Files and bulk IO | **NOT STARTED** | No object store. CSV import/export from the audit still works |
| 16 Audit, outbox, notifications | **PARTIAL** | Append-only audit with real actors and redaction; transactional outbox with leases, backoff, dead letters — tested. **No delivery adapter** (D3) |
| 17 Companies and accounting | **PARTIAL** | Company hierarchy, currency, primary-company constraint. **No journals or posting** |
| 18 Plans, entitlements, credits | **BLOCKED (D4)** | Prices and credit economics are copied marketing content, not commercial authorisation |
| 19 CRM party and lead lifecycle | **PARTIAL** | Party model, lead create/list/search/filter/paginate/update/archive/restore/convert, audited, with optimistic concurrency — 16 tests. Contacts, accounts, dedup and merge not yet done |
| 20 CRM pipeline and activities | **PARTIAL** | Pipelines, ordered stages with explicit outcomes, deals, stage history, activities schema. No UI yet |
| 21 CRM outbound and settings | **NOT STARTED** | — |
| 22–26 HR | **NOT STARTED** | Mapped only |
| 27–28 Travel & Expense | **NOT STARTED** | Mapped only |
| 29 Assets | **NOT STARTED** | Mapped (19 entities, 103 operations) |
| 30–31 Support | **NOT STARTED** | Mapped (34 entities, 99 operations) |
| 32–35 Sales & POS | **NOT STARTED** | Mapped (34 entities, 114 operations). The duplicate-invoicing sweep is unfixed in the UI, but the occurrence model that fixes it exists |
| 36–37 Pitch Pilot | **NOT STARTED** | Mapped (16 entities, 81 operations) |
| 38–39 Models and Business Suite | **BLOCKED (D3)** | Mapped (31 entities, 94 operations). No provider key |
| 40–41 Agent Studio and execution | **NOT STARTED** | Two Studio implementations still unreconciled |
| 42 Durable jobs and scheduling | **PARTIAL** | Cron with real DST handling, occurrence uniqueness, leases, fencing, checkpoints, retries, dead letters, missed-run recording, stuck-job reaper — 31 tests. **No production dispatcher** (D1) |
| 43 Execution-platform adapter | **BLOCKED (D1)** | — |
| 44 Vibe generation | **NOT STARTED** | — |
| 45 Copilot and Vippy | **NOT STARTED** | — |
| 46–48 Connectors and runners | **BLOCKED (D3)** | — |
| 49 Partner portal | **BLOCKED (D5)** | No external identity model |
| 50 Guardrails | **NOT STARTED** | — |
| 51 Compliance | **BLOCKED (D4)** | Legal position required |
| 52–54 Missing and gated apps | **BLOCKED (D2)** | Release catalogue undecided |
| 55 Cross-module reports | **NOT STARTED** | — |
| 56 Remove demo authority | **PARTIAL** | Fabricated auth removed. `workspace.tsx` still authoritative for most domains |
| 57 Security and concurrency | **PARTIAL** | Isolation, privilege escalation, enumeration, replay, fencing and stale-version paths all tested. **No CSRF, SSRF, XSS or file-access testing** — those surfaces do not exist yet |
| 58 End-to-end | **PARTIAL** | Sign-up → sign-in → workspace → lead, in a browser, surviving a server restart. Not extended to other domains |
| 59 Performance and cost | **NOT STARTED** | No load testing. Cost cannot be recomputed before D1 |
| 60 Environment and deployment | **PARTIAL** | `.env.example` marks live vs planned per variable; no secrets in git or the client bundle. Vercel/IAM steps not prepared |
| 61 Preview deployment | **NOT STARTED** | Not authorised, and D1/D3 unresolved |
| 62 Production release gate | **NOT STARTED** | Cannot pass while any accepted requirement is unverified |

## Verification commands

```bash
npm ci
npm run verify       # lint → typecheck → test → build
npm run db:migrate   # applies migrations to DATABASE_URL, or local PGlite
npm run dev
```

Current: **96 tests passing, 0 lint errors, typecheck clean, build passing.**
