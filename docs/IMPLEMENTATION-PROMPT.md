# Standalone implementation prompt: complete the Apragya application

You are the implementing agent. Work in the supplied repository/worktree, originally `/Users/sushank/Downloads/gst`, audited in `/Users/sushank/.codex/worktrees/ac6c/gst`. Inspect the actual working directory and preserve existing uncommitted changes. This prompt defines the next implementation stage, not another generic planning exercise. Build the real application represented by its frontend, with all accepted workflows and production evidence, using the numbered loops below. Do not claim completion from a mock demo, a green build, route smoke checks, or a large number of files.

## Product and current evidence

This is a Next.js 16.3.5 App Router / React 19 / strict TypeScript / Tailwind 4 reproduction of Apragya AI: marketing and acquisition; a multi-tenant workspace; CRM, HR/self-service, Travel & Expense, Asset Management, Support, Sales & POS, Pitch Pilot; a Business Suite of AI tools; two Agent Studio surfaces, Vibe Studio, copilot, runs/approvals/schedules; integrations/runners; governance/compliance and partner portal administration. Additional marketplace apps include Inventory, Projects, Purchase & Payables, Contracts, PPTX and gated Manufacturing, IDP, Payroll, event registration, request approvals and mobile proof of delivery. Do not infer that these last apps are implemented just because cards exist.

Thin route adapters are in `src/app`; screens/panes/settings in `src/screens`; catalogs/field specs in `src/lib/*Data.ts`, agentCatalog and pages; shared UI in components; visual tokens in globals.css. The 2,400-line `lib/workspace.tsx` stores all business state under a single localStorage key. `auth.tsx` creates arbitrary local identities without checking passwords or OAuth. There are no API handlers, database migrations or real external services. Most timeouts simulate results. Record CRUD often means generic name/field blobs. Employee pages are permanent empty/no-profile states. Some settings do not enforce anything. Static samples populate approvals/traces. Current code is a prototype.

The audit pass has already consolidated neutral UI primitives (EnterpriseUi, Dialog, StatCard, RecordList, NavGroup), repaired CRM/HR searches and filtered record rendering, CSV handling, query-tab navigation, trial label consistency, UTC preview and calendar coverage, nested public routes/proper 404 behavior, and addressed hydration initialization. Preserve these changes and verify the final current state rather than reimplementing from memory.

Read `docs/audit/AUDIT.md`, `REQUIREMENTS.md`, `DATA-API.md`, `DEPLOYMENT.md`, `VERIFICATION.md`, `COVERAGE-LEDGER.md`, `source-inventory.json` and `route-inventory.json` if present. They provide detailed evidence but do not replace source inspection. If only this prompt was handed to you, regenerate inventories and create equivalent specifications from the repository before implementing. `npm run audit:inventory` captures every source file/control/data definition. Original inventory had 49 page files and over 700 interactive call sites; mapped tabs/tools multiply them. Preserve explicit traceability instead of treating those counts as a success score.

## Binding constraints

- Keep one Next.js app on Vercel for UI and normal APIs. Do not split CRUD/auth into a separate backend just because AWS exists. Use one relational DB and binary object store initially; isolate modules by service/schema boundaries, not microservices.
- The user prefers AWS App Runner only for necessary background/long-running processing. Verify workload duration and official limits. As of the audit, App Runner is closed to new customers and has a 120-second HTTP timeout. It does not schedule jobs or promise reliable post-response background execution. A 5–10-minute uninterrupted task cannot be promised there. Existing eligible accounts may use bounded checkpointed steps plus external trigger/queue/dispatcher. If unsuitable, ask a precise execution-platform decision; do not silently substitute a paid Vercel Workflow/queue product or another AWS service. Continue independent work.
- Vercel Fluid limits verified at audit: Hobby 300s, Pro/Enterprise 800s GA, 1800s beta on supported runtimes. Vercel Hobby Cron is daily-only and cannot satisfy hourly UI jobs; verify current plan and commercial-use eligibility. Limits may change: recheck official documentation before deployment.
- Minimize recurring cost with workload estimates, current rates, resource caps and measured minimum footprint. App Runner's smallest listed 0.25vCPU/0.5GB is only a candidate for light steps, not a guarantee for document/browser workloads. Include idle/provisioned memory, DB, logs, queues, egress, provider tokens, backups, cold starts and availability tradeoffs.
- No Secrets Manager requirement. Use local ignored `.env` and complete safe `.env.example`, environment-injected production values and encrypted tenant credentials in DB under a server env key. Preserve existing values, never print or commit them. Production imports populate key/value configuration; do not promise a raw .env file mount/upload. Vercel `env pull` downloads, not uploads. Implement a safe import process if needed using a dotenv parser and structured API/stdin, never `source`/`eval`.
- Preserve existing visual design/semantic light-dark tokens and legitimate component variants. Reuse shared components; finish missing screens/states rather than replacing the product with a generic dashboard.
- No invented integrations, fake success, lorem ipsum business behavior or scope shrink disguised as completion. A gated feature needs a real implementation or an explicit release decision. No statutory/legal/tax/payroll policy invention from copied marketing content.
- Do not deploy/publish, send external messages, purchase services or run real payouts without task authorization. Prepare concrete reviewable artifacts first. Routine reversible local work is authorized. Do not spawn subagents unless authorized by user or applicable instructions.

## Coverage and loop protocol

Create `docs/implementation/coverage.csv` (or structured JSON) with one row per route/tab/subtab/control/field group and stable requirement ID: source file+line, source hash, actual route/query, role, entity/operation, API method/path, validation, loading/empty/error/success/denied/conflict states, external side effect, persistence, test IDs, evidence links and status. Expand mapped controls with catalog IDs. Cover every HR page/subtab, every CRM/settings entry, every AI tool/model/capability, every agent/connector, and each portal mask. Statuses: DISCOVERED, SPECIFIED, IMPLEMENTED, VERIFIED, BLOCKED, APPROVED_OUT_OF_SCOPE. A copied count, state setter or localStorage write never earns VERIFIED for production behavior. Record old→new provenance when refactoring shifts lines.

Maintain `progress.md`, `decisions.md`, `risks.md`, `architecture.md`, `schema.md`, `openapi.yaml`, `env.md`, `deployment.md`, and per-loop evidence. Each loop begins with dependencies and concrete input inspection, implements tasks, produces its output artifact, runs its specific verification, and either passes acceptance or records the exact failure and reworks. Shared acceptance for EVERY domain loop: real persisted typed records; server authorization and validation; all required states; refresh/cross-session consistency; meaningful tests including denial; coverage rows linked to evidence. Do not repeat passing tests absent a relevant change. Never mark a dependent loop complete while its prerequisite is blocked.

When a decision needs input, state options/impact precisely and continue independent work. Necessary decisions: approved release catalog; real provider credentials/contracts; legal entity/jurisdiction/prices/credit economics/residency; employee and partner identity strategy; App Runner eligibility and execution alternative if needed. Routine architecture/code choices are yours. Loops below can branch where dependencies permit; numbers are a traceable program, not a demand to inflate work.

## Numbered loops

### Loop 01 — Reconcile baseline

Inputs: working tree, repository instructions, package/lock/config, audit artifacts. Inventory all tracked/untracked files without reading secret values. Record exact revision/runtime and existing changes. Install reproducibly, run current typecheck/tests/build and reproduce reported failures. Output `baseline.md` and command evidence. Acceptance: known baseline and changes preserved; failure gate: resolve environment/build blockers or explicitly isolate them before claiming implementation success.

### Loop 02 — Enumerate every surface

Inputs: route adapters, screen dispatch maps, query tabs, catalog arrays and source ledger. Expand all runtime/public routes, nested tabs, mobile nav and dynamic tool/app routes. Follow every link; classify missing/invalid routes and duplicate Studio surfaces. Output full route/surface map, with screenshots and roles where possible. Acceptance: every source route and data registry accounted for; rework if any count difference lacks an explained mapping.

### Loop 03 — Trace all interactions

Inputs: each control's handler, called workspace method and field spec. Record actual effect: local state, browser storage, download, fake delay, redirect, no-op or real network. Include mapped controls and non-button click targets. Build the coverage ledger and identify false success copy. Acceptance: every interaction has a real proposed behavior, state requirements and test target; unresolved product semantics are named rather than fabricated.

### Loop 04 — Resolve scope and decisions

Inputs: feature matrix, marketplace/agent/tool claims, plan cards and compliance text. Separate verified UI requirements from necessary inference and speculative marketing. Present precise D1–D5 decisions; keep visible unmet scope tracked until explicitly changed. Output release scope and decision ledger. Acceptance: approved scope or explicit blockers; proceed with independent core work without pretending blocked features disappeared.

### Loop 05 — Architecture and workload evidence

Inputs: actual job candidates, platform official docs and account constraints. Benchmark sample RFP/OCR/deck/RAG/build workloads with safe representative inputs when implementations exist; initially record assumptions. Choose one Next.js normal API service, DB/storage and an executor interface. Output ADRs, timing/memory budget and conditional deployment paths. Gate: no automatic App Runner claim or unapproved paid orchestration; revisit after measured jobs.

### Loop 06 — Development and verification foundation

Inputs: current scripts and compiler. Add real lint/config (Next 16 has no `next lint`), unit/integration test harness, isolated DB test setup, browser harness and CI with locked install. Preserve working CSV tests. Output scripts/config and a reproducible clean run. Gate: test failures must be visible, not skipped globally; establish meaningful behavior tests before changing business state.

### Loop 07 — Domain schema and migrations

Inputs: every workspace type, HrField/modal, document status and proposed entities. Design typed normalized schema including tenant/company relationships, money/date conventions, indexes/uniques and extension schemas. Produce ERD, SQL migrations, seed taxonomy only and rollback compatibility notes. Verify fresh DB install and upgrade from previous migration. Gate: no giant per-tenant JSON blob replacing actual relational business data.

### Loop 08 — API/service contract

Inputs: coverage operations and schema. Define DTO validators, error envelope, pagination/sort/filter, request IDs, version conflicts and idempotency contract. Implement service boundaries used by route handlers/actions with one authorization path. Generate/update OpenAPI and typed client. Acceptance: invalid/unknown fields rejected, contract tests pass, proposed endpoints no longer confused with implemented ones.

### Loop 09 — Real identity and password login

Inputs: Register/Login/auth/Protected. Select a maintained auth approach; implement credentials or approved provider identity, secure password handling, verification and cookie sessions. Remove fabricated login behavior outside explicitly isolated demo mode. Add verification/recovery/reset UI, rate limits, expiration and safe returnTo. Acceptance: wrong passwords fail, expired/replayed tokens fail, logout invalidates session and protected APIs enforce auth independently of frontend.

### Loop 10 — OAuth and MFA

Inputs: Google/Microsoft buttons and 2FA banner/account readout. Implement proper authorization code flow, state/PKCE where applicable, callback allowlists, identity linking protections and session rotation. MFA enrollment needs challenge verification and recovery; never enable by flag. Output provider setup and tests. Gate: without credentials mark live proof blocked; sandbox mocks may test contracts but cannot establish real OAuth success.

### Loop 11 — Tenant and membership isolation

Inputs: browser-wide workspace flaw, company/role requirements. Create tenant, membership, invitation and role model; bind tenant context from session and enforce it on queries, mutations, search/export/files. Implement ownership/role change safeguards and user switch behavior. Verify two tenants/two companies plus external identity adversarial tests. Gate: one unauthorized read/write is release-blocking; UI hiding does not count.

### Loop 12 — Onboarding and installation transaction

Inputs: three onboarding steps, default CRM/HR, marketplace quota/gates. Persist resumable onboarding; transactionally create tenant/company/entitlement and selected installs. Deselecting defaults must be meaningful and plan limits consistent with marketplace. Wire safe intent/return navigation. Verify retries, duplicate submits, interrupted onboarding and forbidden installs. Gate: no partial tenant with misleading completed wizard.

### Loop 13 — UI persistence adapter and states

Inputs: every workspace hook consumer and shared components. Incrementally replace browser authoritative state with typed server queries/mutations; split domain providers to avoid one giant rerendering context. Implement loading/error/retry/empty/denied/conflict and invalidation. Keep local state for unsaved UI/preferences only. Acceptance: browser refresh/new device sees durable records, two concurrent editors receive conflicts, and no server data is sourced from legacy localStorage.

### Loop 14 — Shared UI and accessibility completion

Inputs: Dialog/RecordDialog/NavGroup/StatCard/RecordList/Chrome, remaining repeated overlays/cards/tables, globals.css. Extract genuinely equivalent structures, retain semantic variants and eliminate nested interactive elements. Finish keyboard navigation, focus restoration, labels, live errors, contrast, reduced motion and mobile rails/overflow. Verify representative screens at 390/768/1440 widths in both themes. Gate: no universal component whose flags obscure domain behavior; no silent visual redesign.

### Loop 15 — Files and bulk IO

Inputs: receipts, HR docs, KB uploads, RFP/templates, exports and existing CSV helpers. Implement authorized presigned upload/complete, MIME+size checks, quarantine/scan or approved equivalent, binary metadata/versioning and expiring downloads. Stage imports, validate mappings/errors/dedup, commit atomically; exports use permission/filter snapshot and formula safety. Verify malicious types, oversized input, broken encoding/quotes and tenant-crossed object IDs. Gate: filename-only storage is not upload completion.

### Loop 16 — Audit, outbox and notifications

Inputs: fabricated audit/notify callbacks, Inbox and side effects. Implement append-only server audit and transactional outbox. Per-user notification read state, event templates, delivery/retry/bounce handling and preferences. Replace invite flag with invitation delivery and acceptance lifecycle. Verify no duplicate side effects across retry and no secret/personal payload leakage. Gate: audit records derive real actors/outcomes and cannot be edited by client.

### Loop 17 — Companies and accounting foundation

Inputs: Companies, intercompany pairs and consolidation claims. Implement company hierarchy/context/currencies, fiscal periods, account/journal model when required by Sales/P2P reports, and posting primitives with balanced entries. Define FX source and rate snapshot. Verify cycles, cross-company grants, immutable posted periods and trial balance totals. Gate: no report claims consolidation from unrelated browser totals; accounting policies needing jurisdiction remain explicit decisions.

### Loop 18 — Plans, entitlements and credits

Inputs: pricing cards, fixed trial/quota/credits, spend and recordRun. Build approved plan catalog/version, trial expiry, feature/user/app entitlements, immutable credit ledger and atomic reserve/settle/refund. Integrate billing only with selected provider and signed/replay-safe webhooks. Test parallel credit use, cancellation/refund, downgrade/uninstall and webhook ordering. Gate: copied prices are not commercial authorization; no credits deducted for fake outputs or double charged on retries.

### Loop 19 — CRM party and lead lifecycle

Inputs: leads/contacts/companies forms/filters/import, status/source vocabularies. Implement shared party/contact schemas, lead detail/edit/archive/restore, ownership, dedup suggestions and audited merge/conversion. Replace name-only relationships and make list/filter/count/export coherent. Verify conversion preserves history, duplicate merge rehomes references, permission-scoped CSV and invalid email/contact fields. Gate: “Prospects only” cannot open an unrelated create form; all controls get correct semantics.

### Loop 20 — CRM pipeline and activities

Inputs: pipelineStages, deals board/table, activity/calendar/task panes. Implement stage/pipeline settings, deal amounts/currency/probabilities, stage transition/history, event attendees/timezones and follow-up task completion. Wire favorites, owners, sources, dates and pagination. Verify drag/update conflict, won/lost totals, calendar boundaries and views. Gate: every view represents the same records; no visual selector with an unchanged dataset.

### Loop 21 — CRM outbound, inbound and settings

Inputs: every settingsGroups entry, sequences, channels and reports. Implement sequence steps/enrollment/send windows/limits, suppression/unsubscribe/bounce/reply stop, templates, assignment/scoring rules, inbound forms/email and selected channel adapters. Settings must affect runtime. Verify schedule timezone, idempotent send, throttling, opt-out and inbound dedup. Gate: provider-inaccessible channels clearly blocked; a saved configuration row is not execution evidence.

### Loop 22 — HR people and recruitment

Inputs: recruitment/offers/onboarding/employees/lifecycle/documents/separation specs and all nested tabs. Implement typed forms/detail/edit/transitions and relationships, staffing plans/applicants/interviews/referrals/offers/templates, employee/user/reporting links and date-effective changes. Build missing org chart from reporting structure. Verify permissions/history, cycle/overlap and required field constraints. Gate: generic create dialogs cannot stand in for interview scheduling, issue letters or separation settlements.

### Loop 23 — HR attendance and scheduling

Inputs: shifts, roster/attendance/admin/calendar and biometric integration claims. Implement shifts/holidays/punches, daily attendance calculation, regularization and timezones; render real calendar events in month/week/day/list. Verify 28–31-day months and six-week layouts, overnight shifts/DST, duplicate punches and approved corrections. Gate: selecting employee/date must alter results; a calendar skeleton is not attendance functionality.

### Loop 24 — HR leave, overtime and timesheets

Inputs: leaves/team approvals/overtime/reports/timesheets and policies. Implement request state machines, balances/accrual ledger, overlap/holiday rules, approval chains, overtime calculation and project time entries. Employee and manager routes share services with different scopes. Test double approval, self-approval denial, cancellation/balance reversal and date boundaries. Gate: report filters/export must use real records and policies, not generic records created on report screens.

### Loop 25 — HR development, care and communication

Inputs: performance/training/skills/care/announcements and settings. Build review cycles/goals/feedback, training sessions/enrollment/completion, employee skill levels/coverage, care requests and audience-targeted announcements/read receipts. All taxonomy/default/approval/email branding settings must be persisted and used. Verify sensitive feedback visibility, document scope, training capacity and audience isolation. Gate: no hardcoded aggregate counts or static notice after successful creation.

### Loop 26 — Employee self-service

Inputs: all `/app/me` route files and portals.tsx. Implement linked employee profile, attendance, leave balances/requests, payslips, timesheets, documents, onboarding checklist, announcements and team approvals. Preserve an accurate no-profile path. Verify member→employee link, manager assignment, own-only files and deep-link permissions. Gate: adding an HR employee and linking the user must unlock the corresponding functional pages; payroll-dependent screens remain blocked until payroll is real.

### Loop 27 — Travel expenses and receipts

Inputs: expense dashboard/reports/cards/policy and receipt email settings. Build expense items/receipts/currencies, policy validation, duplicate detection, submit/review/reject/approve and corporate card import/match/unmatch. Receipt intake pipeline links real files and extraction evidence. Verify split/duplicate transaction semantics, policy threshold edge cases and safe imports. Gate: amount equality alone must not auto-link unrelated expenses; every match is scoped and auditable.

### Loop 28 — Travel requests, approvals and payouts

Inputs: travel/agency review/approval inbox/reimbursements/GL/notifications. Implement segments/quotes, dates/budgets/per diem, advance/settlement, assigned reviewers and reimbursement batches with selected payout integration or documented authorized export. Verify approval separation, exactly-once inclusion/payment/reconciliation and provider uncertain-success recovery. Gate: “Reimbursed” must mean confirmed payment or explicitly recorded authorized manual settlement, not a next-status button.

### Loop 29 — Asset lifecycle and custody

Inputs: register/my asset/requests/master taxonomies/settings/reports. Build tagged asset detail/edit, acquisition/warranty, unique identity, assignment/custody/return/service/retirement and request approval/issue. Implement taxonomy dependency validation, custom fields and actual policy/agent settings. Verify one active custodian, approval before issue, transfer/retirement history and report totals. Gate: destructive deletion of financial/custody history must be replaced by appropriate archived/event behavior.

### Loop 30 — Support ticket operations

Inputs: tickets/my requests, fields/status behavior, replies/tags/priority/assignment. Build full ticket detail/thread, public replies/internal notes, attachments, transitions and participants. Implement real request creation via widget/email/portal where enabled. Verify dedup/threading, internal-note confidentiality and requester/team access. Gate: initial ticket forms and list rows alone do not complete the support lifecycle.

### Loop 31 — Support SLA, knowledge and settings

Inputs: KB/canned replies/reports, SLA/routing gates, all support settings (mailboxes/channels/hours/escalations/CSAT/report exports/tier/search). Implement article version/publish/search, response suggestions with citations, business-calendar SLA clocks, escalation actions, CSAT send/answer/review and scheduled exports. Verify pause/resume, resolved/reopened ticket deadlines, duplicate email/CSAT suppression and access-filtered retrieval. Gate: settings require execution evidence and histories; plan gates cannot conceal absent backend behavior.

### Loop 32 — Sales master data and quoting

Inputs: POS customer/group/tax/loyalty/contract/quotation screens. Implement shared customers, price/rate contracts, line items, configurable approved tax calculation, quote version/expiry/conversion and discounts. Validate currency precision, quantity/tax/discount bounds and approved price override rules. Test contract precedence and quote-to-order idempotency. Gate: totals are computed from lines server-side, not trusted numbers or text fields.

### Loop 33 — Orders, delivery and invoicing

Inputs: sales orders/delivery notes/invoices/match settings. Implement linked partial fulfillment, stock reservation/movement/COGS where promised, invoice posting, payment allocation and AR. Add explicit mismatch warn/block behavior and immutable posted corrections. Test transactional failure between stock and journal, overdelivery, duplicate posting and stale edits. Gate: actual inventory/accounting prerequisites must pass; “Posted” cannot be an arbitrary browser status patch.

### Loop 34 — Till, shifts, returns and subscriptions

Inputs: POS till/shifts/returns/subscriptions/AR reports. Implement sale/tenders, cash counts/variance reasons, refunds/credit notes and recurring invoice periods. Replace current sweep that invoices every active subscription on every click with due dates and unique period keys. Test concurrent till closes, partial refund ceiling, payment replay and retry around invoice creation. Gate: no duplicate receipt/invoice/payout from repeated actions or dispatcher retries.

### Loop 35 — Sales reports and settings history

Inputs: every POS report tab, match settings, tax/groups/loyalty/custom fields/agents/change history. Derive sales tracker, customer/cohort/margin/daily/aging metrics from authoritative events with date/company/currency scopes. Implement reversible settings versions where valid; posted historical documents retain their original rules. Verify exports/totals and precision. Gate: output MIME matches label; CSV is never passed off as Excel.

### Loop 36 — RFP intake and extraction

Inputs: Pitch new/inbox/schema/knowledge and RFP statuses. Implement binary upload, parsing/OCR, schema-versioned extraction, source spans/confidence, error/retry and reviewer corrections. Create durable jobs with progress and encrypted/authorized files. Test corrupted PDFs, oversized docs, prompt injection in source, missing fields and restart during extraction. Gate: timed status changes or metadata-only uploads cannot satisfy this loop.

### Loop 37 — Proposal and deck production

Inputs: Pitch templates/brand/dashboard/analytics and exported artifact promises. Implement KB indexing/retrieval, brand/template assets, grounded proposal drafting, editable/reviewable versioned content and actual PPTX/PDF rendering/export. Test binary validity by opening/rendering, fonts/images/overflow and source citations; capture actual processing time/cost. Gate: a “published” metadata row or renamed text file is not a deck. Feed measured workload back into Loop 05/D1.

### Loop 38 — Model registry, usage and prompt lab

Inputs: inconsistent model lists, PromptLab controls/templates and shared credit pool. Create approved provider/model registry with capabilities/limits/cost, normalized generation request/response and token metering. Implement prompt variables, temperature/max-token validation, versioned templates/evaluations and error/cancel behavior. Test provider timeout/rate limit/malformed output and reserve/settle/refund. Gate: do not expose unsupported UI model choices or manufactured latency/token counts.

### Loop 39 — Business Suite and conversation persistence

Inputs: every `suiteCategories` tool, quick/featured routes and Chat. Define tool-specific input/output schemas and provider capability mapping; build necessary image/audio/file inputs and actual result/download components. Persist conversations/messages/generations and company tags. Verify each tool slug with a positive, validation and provider-failure case; test streaming/cancel/reload. Gate: a shared generic prompt UI is acceptable only when the tool's semantics truly fit it; stock output sentences are forbidden.

### Loop 40 — Agent definition and Studio reconciliation

Inputs: both AgentStudio implementations and studio workspace/library/data/template sections. Define one versioned agent/workflow model; reconcile entry routes and workspace IDs. Implement node/edge editing, inspector config, tools/knowledge bindings, tests/fixtures and publish permissions. Validate graphs, supported node types, cycles/limits and required secrets. Gate: every editor/library action persists correctly; one fake fixed canvas/run does not represent all agents.

### Loop 41 — Execution engine, runs and human review

Inputs: agent catalog, RunStep/Run, approvals and guardrails. Implement real execution bound to immutable published version, persisted steps/tool calls/checkpoints, status/progress/cancel/retry, human review pause/modify/reject/resume. Authorize side effects per current grants; validate modified fields. Test worker crash, late callback, double review, denied tool and resume after deployment. Gate: no copied sample trace, fabricated success or in-memory approval wait.

### Loop 42 — Durable jobs and scheduled execution

Inputs: job schema/contracts, admin/user schedules and all business timers. Implement occurrence calculation, timezone/DST/overlap/missed-run policy, atomic claim/lease/fencing, finite retries/dead letters, outbox delivery and stuck-job reaper. Wire run-now/pause/resume/edit and actual next/last outcome displays. Test multiple dispatchers and browser closed. Gate: local worker tests may pass before D1; production executor remains blocked until approved and verified.

### Loop 43 — Execution-platform adapter

Inputs: D1, measured workloads, official platform docs. Implement only the approved bounded Vercel/App Runner/AWS task adapter, with authenticated dispatch and health/termination/recovery. For App Runner verify eligibility, <120s steps, external trigger+queue+dispatcher and DB checkpoints; never background work after response as the only guarantee. Benchmark minimum RAM/CPU/concurrency and cost. Gate: no production-ready claim from a Dockerfile alone; unsuitable 5–10-minute tasks trigger explicit platform decision.

### Loop 44 — Vibe generation and isolated previews

Inputs: every capability in vibeData/appData, build artifact/version/publish UI. Implement structured spec→generate→validate→preview→review→publish stages with actual sources/artifacts. Separate document/media generation from code/RPA/mobile capabilities and sandbox untrusted execution with network/resource/secret controls. Test malicious generated code, failed builds, cancel/retry and valid artifact output. Gate: user-approved scope controls ambitious capabilities; unresolved sandbox/build platform is explicit, not silently replaced by metadata.

### Loop 45 — Copilot and public Vippy

Inputs: CopilotDock/VippyWidget and UI action promises. Implement contextual conversation with authorized retrieval/tools, structured confirmation for impactful actions, genuine errors and usage accounting. Anonymous Vippy must not access tenant context or internal tools; signed-in copilot uses the same service policies as APIs. Test prompt injection, forged tool arguments, cross-tenant retrieval and rejected confirmation. Gate: natural-language response alone does not establish that an action happened.

### Loop 46 — Connector registry and tenant credentials

Inputs: all 27 connectorData entries, custom OpenAPI forms and auth types. Implement versioned operation schema/validation, tested connection status, credential encryption/rotation and revoke flows. Secure outbound URL handling against SSRF/DNS rebinding/metadata access; use runner for explicitly authorized private networks. Verify OAuth refresh concurrency and redacted logs. Gate: secret hints are not credentials; “Connected” requires provider validation, not successful form submission.

### Loop 47 — Concrete integration adapters

Inputs: approved release connectors and provider contracts. Implement SMTP, Google/Microsoft, CRM/chat/storage/DB and remaining selected connectors using official SDK/API specifications and narrow scopes. For SAP RFC, biometric, KYC/credit/health/logistics/e-invoice, identify licenses/network/runtime needs and test fixtures. Produce per-operation request/response/retry/error evidence. Gate: every catalog connector explicitly supported/tested/blocked/out-of-scope; never let a catalog description impersonate an adapter.

### Loop 48 — Tenant runner lifecycle

Inputs: Runners UI and private-network connector requirements. Build enrollment-token exchange, authenticated device credentials, installer/runtime, heartbeat/offline detection, capability-scoped claim/result and revocation. Distinguish platform AWS worker from tenant on-prem runner. Verify token reuse/expiry, unauthorized tenant claim, lost heartbeat, job lease loss and safe upgrade. Gate: a pairing token and pending UI row alone are not a runnable agent.

### Loop 49 — Partner portal delivery

Inputs: ClientPortal/portalData tab grants/roles/masked fields, CRM contacts and sales/project records. Build missing external portal routes/auth/invitations, party-scoped record views/comments/downloads and server-side field projections. Implement role/default changes with audit. Test every mask and scope through detail/list/search/export/download, not just visual hiding. Gate: external user cannot access any unrelated tenant/party/company or hidden field through API.

### Loop 50 — Guardrail enforcement and governance

Inputs: guardrail types/checkpoints/actions, Governance audit/roles/settings. Implement actual keyword/content/PII/spend/rate/schema evaluators at correct input/output/tool boundaries, versioned policy and violation history. Human-review routing and redaction affect actual subsequent execution. Verify block/warn/redact/HITL, failure policy and bypass attempts. Gate: storing a policy without enforced runtime behavior is incomplete; audit cannot be locally fabricated.

### Loop 51 — Compliance and lifecycle enforcement

Inputs: inventory/flow/DPIA/automated decisions/retention UI and copied data catalog. Reconcile actual collected data, providers/regions and legal bases with approved policy. Implement register workflow, retention/purge jobs across DB/files/indexes, legal holds and evidence. Verify deletion/retry/restoration constraints and permissioned exports. Gate: avoid unsupported legal compliance claims; statutory interpretations and sensitive-domain scope require documented product/legal input.

### Loop 52 — Missing Inventory and Projects applications

Inputs: INV/PM catalog/agent descriptions and cross-module dependencies. Build minimum complete inventory warehouse/bin/item/movement/reservation/valuation and project/task/sprint/milestone/time-log flows with dedicated screens/detail/forms/reports. Integrate Sales/P2P stock and HR project time. Verify transactional stock consistency and project access. Gate: a generic installed-app landing card is not an application; unresolved product specifics must be explicit.

### Loop 53 — Missing Purchase, Contracts and PPTX apps

Inputs: P2P/CTR/PPTX catalogs and agent descriptions. Implement requisition→RFQ→PO→receipt→vendor bill→3-way match→authorized payment, contract upload/version/clause review/obligation/renewal, and standalone deck generation/download reusing real document pipeline. Verify segregation of duties, mismatches and renewal schedules. Gate: no financial posting/payment or legal outcome fabricated; permissions and business policies must be approved.

### Loop 54 — Gated catalog delivery or explicit exclusion

Inputs: D2 and MFG/IDP/PAY/EVT/RQA/POD cards. If accepted: implement BOM/work order/job card/production/downtime; document intake/classify/extract/validate; salary/payrun/payslip/statutory adapter; public event sessions/registration; typed request/approval routing; delivery proof capture/offline sync. Each becomes its own expanded child loop with schema/UI/API/tests. If not accepted, record approved exclusion and accurate UI availability. Gate: do not invent statutory behavior or claim the full original catalog complete after excluding it.

### Loop 55 — Cross-module reports, search and consistency

Inputs: every report/dashboard/global search/export and preceding domain histories. Implement real aggregates with tenant/company/date/currency/role scopes, consistent shared parties/employees/files and live counters. Verify row-level results reconcile to source records and exports; indexing honors access/deletion. Gate: empty data yields honest zero/empty; unavailable source/error cannot masquerade as successful empty chart.

### Loop 56 — Remove demo authority and migrate safely

Inputs: remaining localStorage keys/sample data/fake timeouts/constants. Remove production authoritative mocks and fake approvals/traces, preserve optional clearly isolated demo fixtures. Design explicit opt-in local demo import with tenant ownership confirmation and schema validation; no automatic migration of browser-wide data between accounts. Verify no production handler references mock runtime. Gate: demo routes/data cannot leak into real tenants or charge credits.

### Loop 57 — Security and concurrency verification

Inputs: threat boundaries and all public/server/machine APIs. Test tenant/company/party isolation, privilege escalation, CSRF/session fixation, injection/XSS/SSRF, file access, webhook signatures/replay, rate-limit abuse, secret exposure and generated-code sandbox escape boundaries. Test parallel financial/credit/approval/scheduling operations and stale versions. Produce actionable findings/fixes/retests. Gate: no unresolved critical/high exploitable finding or silently skipped security check.

### Loop 58 — End-to-end and failure recovery

Inputs: coverage ledger and real integration environment. Execute full acquisition→onboarding→install→create→approve→execute→export journeys for every accepted domain, all roles/states, plus external portal and self-service. Kill workers, interrupt network, replay webhook, close browser, restart server and recover DB-backed jobs. Verify binary exports and emails/provider records, with authorized safe test data. Gate: every VERIFIED row needs evidence; mocked E2E cannot prove external integration.

### Loop 59 — Performance, cost and minimal footprint

Inputs: measured usage and candidate deployments. Load test CRUD/list/search/jobs with realistic pagination/files/concurrency; inspect DB plans, bundle size, memory/CPU, connection exhaustion and queue age. Choose smallest configuration meeting targets, bound concurrency and provider budgets, document degraded/availability behavior. Recompute monthly cost with actual current rates and assumptions. Gate: no arbitrary “tiny container is enough” or unsupported free-commercial-hosting claim.

### Loop 60 — Environment and deployment preparation

Inputs: selected providers/executor, env consumers and infrastructure. Complete `.env.example` and conditional validation; verify every variable documented/used, no secrets in git/build/client bundle. Prepare Vercel key/value import, optional AWS plain runtime env import, IAM, storage policy, health checks, migrations and CI. Output exact deployment commands/config templates with safe placeholders. Gate: local .env does not imply production file upload; no Secrets Manager dependency introduced.

### Loop 61 — Preview deployment and restore rehearsal

Inputs: authorized preview target and prepared artifacts. Deploy only when authorized, run migration+seed taxonomy, verify auth callbacks/files/webhooks/scheduler and real continuing jobs under platform constraints. Backup/restore into isolated resources; rollback compatible application version with in-flight jobs. Capture URLs/build IDs/logs and success/failure evidence. Gate: no readiness claim from local-only tests; if deployment authorization/credentials absent, provide concrete prepared result and exact blocker.

### Loop 62 — Production release gate and handoff

Inputs: complete ledger, decisions, tests, cost, env/deployment/restore evidence. Reconcile every accepted requirement and every public claim; audit docs/code/API/schema consistency and remove stale instructions. Prepare production release/rollback and monitoring runbook; deploy only within authorization, then run safe production smoke/integration probes. Final handoff lists actual shipped scope, evidence, ongoing costs, operational owners, remaining explicit exclusions/blockers and artifact paths. Full completion requires no unexplained UNVERIFIED/BLOCKED accepted requirement. Do not convert blockers into “done” to end the task.

## Objective final acceptance

Real identity/session/role isolation; persistent typed business entities; every accepted route/control/state meaningful; real integrations and downloadable binaries; server-enforced workflows and settings; durable scheduling/retries/review; accurate costs/credits/audit; responsive accessible coherent design; security/concurrency/failure tests; validated env/deployment/restore. The final report must distinguish implemented, locally verified, externally verified, deployed and blocked. If any of those levels are missing, say exactly which and why. Leave the repository in a reproducible reviewable state with the coverage ledger and runbook sufficient for another engineer to operate it.
