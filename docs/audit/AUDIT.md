# Repository audit and frontend readiness

Audit date: 2026-09-21. Project: Apragya AI reproduction, despite the directory name `gst`. This is a multi-tenant AI productivity/agent platform and ERP suite, not just a GST application. Worktree: `/Users/sushank/.codex/worktrees/ac6c/gst`.

## Outcome and limits

The assumption that nearly all frontend functionality is complete is false. There is substantial visual coverage and useful local CRUD, but many essential screens, interactions, record relationships and business transitions are absent. No production backend exists. A production build passing is evidence of compilation and rendering, not application readiness. This pass makes frontend consistency/behavior fixes and specifies the remaining implementation; it does not build or deploy a speculative backend.

The complete source and interaction inventories are [COVERAGE-LEDGER.md](COVERAGE-LEDGER.md), [source-inventory.json](source-inventory.json), and [route-inventory.json](route-inventory.json). The generator visits every source file, retains data definitions and handlers, and marks controls UNVERIFIED by default. Human review concentrated on route dispatch, shared primitives, domain schemas, callback behavior and missing workflows. Browser coverage and exact checks are recorded separately in [VERIFICATION.md](VERIFICATION.md). Neither static parsing nor route smoke checks establish that every interactive state works.

Read [REQUIREMENTS.md](REQUIREMENTS.md) for the UI-to-backend matrix, [DATA-API.md](DATA-API.md) for schema/API/permissions, [DEPLOYMENT.md](DEPLOYMENT.md) for verified platform constraints, and [../IMPLEMENTATION-PROMPT.md](../IMPLEMENTATION-PROMPT.md) for the standalone numbered implementation program.

## Repository map

- `package.json`, lockfile: Next 16.3.5, React 19, TypeScript strict, Tailwind 4. There were only dev/build/start, broken `next lint`, and typecheck scripts. No prior tests, database client, auth library, payment library, provider SDK or background runtime. Dependency installation completed; npm reported zero known vulnerabilities at install time, not a security certification.
- `src/app`: thin route adapters and shared layouts/providers, 49 page files at initial inventory. Dynamic public catch-all pages resolve content tables; dynamic app slug pages resolve generic installed-app shells. There are no `route.ts` handlers, server actions, migrations or backend endpoints.
- `src/screens`: marketing/auth/onboarding plus domain screens. Large pane/settings files contain most UI behavior; route-file counts significantly understate the number of surfaces.
- `src/lib/*Data.ts`, `agentCatalog.ts`, `pages/*`: navigation, catalogs, field definitions, copied product/marketing claims, defaults and samples. These are requirements evidence, not proof of integrations.
- `src/lib/workspace.tsx`: 2,400-line global React context, localStorage persistence under one browser-wide key, 40+ exported record types and 87 mutation/action methods. Monolithic state mutation is the mock backend. No tenant/user partition, remote concurrency, relational integrity or authorization.
- `src/lib/auth.tsx`: delayed local session creation; password is not passed to signIn/signUp. OAuth buttons manufacture email identities. Protected.tsx redirects on client state; there is no server authentication.
- `src/components`: existing Chrome, layouts, headers, icons, theme, animations, record dialog and marketing helpers, plus new neutral primitives described below.
- `src/app/globals.css`: 831-line semantic light/dark tokens, responsive layout, global density overrides, animation and module styling. Global descendant rules mean replacing class names indiscriminately risks visual regressions. Intentional palette/density variants were preserved.
- `.claude/launch.json`: development launch configuration. `README.md` is a long historical reconstruction narrative, not an authoritative production specification. No applicable AGENTS.md found within the inspected worktree ancestry.

## Prioritized findings

| ID | Severity for production | Evidence | Consequence / required resolution |
|---|---|---|---|
| A01 | Critical blocker | `lib/auth.tsx`, `screens/Login.tsx`, `Register.tsx`, `routes/Protected.tsx` | Arbitrary identity creation, ignored password, fake OAuth, client-only gating. Implement real auth, verified identities, sessions, recovery and server authorization. |
| A02 | Critical blocker | `lib/workspace.tsx` STORAGE_KEY/read/update; providers at root | All accounts on a browser share one workspace, editable by the browser; sign-out leaves data. Replace with tenant-scoped DB and authorization; provide explicit demo migration, never infer ownership of legacy storage. |
| A03 | High | workspace spend/recordRun/publishArtifact; `appData.sampleTrace` | Spend race, no atomic credit cap, every run copies a successful CRM trace even for another agent; publishing increments metadata only. Durable execution, real traces and transactional credit reservations are missing. |
| A04 | High | Overview two-factor/checklist; Account; Governance | Enabling 2FA and inviting people only change flags; audit rows are fabricated/client editable. Require enrollment challenge, delivery/membership lifecycle and server audit. |
| A05 | High | ScheduledJobs/AdminScheduledJobs, module schedules | Definitions/toggle/manual fake run exist, no timer, cron/timezone persistence or dispatcher. Real hourly scheduling is required by the UI. UTC preview mismatch fixed, execution still absent. |
| A06 | High | `screens/app/portals.tsx` | Employee self-service always reports no linked profile, regardless of HR records; documents/announcements/approvals are fixed empties. All success/detail/edit flows must be built. |
| A07 | High | `GenericPortal.tsx`, appData catalog | INV, PM, P2P, CTR, PPTX and gated MFG/IDP/PAY lack bespoke business screens. Generic “create a record” copy has no create action. Visible catalog scope must be delivered or explicitly narrowed by product decision. |
| A08 | High | CRM records/panels, HR panels/RecordDialog | Loose name/fields blobs replace schemas, edit/detail workflows absent, many HR buttons open generic create dialogs regardless of semantics. Empty selects/disabled nested entries remain. Search/list bugs fixed; business workflows still incomplete. |
| A09 | High | business/Tool, Chat, PromptLab, both AgentStudios, VibeStudio, CopilotDock | Timers and stock sentences replace provider calls. Tools all have the same prompt form; builder canvas is not executable, model selectors not consistently connected, RAG/file pipelines absent. |
| A10 | High | support/settings/panes, travel/settings, assets/settings, POS settings | Settings often persist but have no enforcement path; SLA, escalation, receipt email, CSAT, auto agents, taxes, reconciliation and retention cannot be considered operational. |
| A11 | High | POS SalesPos/runSubscriptionSweep, workspace POS callbacks | Each manual sweep invoices every active subscription again, no due period or idempotency. Totals/status strings stand in for accounting, line items, stock, tax and settlement. |
| A12 | High | Integrations/Runners and connectorData | Connections save hints only; OAuth screens do not authorize; runners only generate local tokens and never heartbeat. No executable connector adapters or secure tenant credentials. |
| A13 | High | Pitch panes/BrandKit and workspace RFP/KB types | Extraction uses delay, uploads primarily metadata, no parsed content/real deck/export pipeline. Brand images can be local data URLs; binary storage and verification needed. |
| A14 | High | ComplianceCenter/complianceData | Registers describe data/services not implemented; default data includes sensitive-industry examples. Recording a retention policy/DPIA does not enforce retention or establish compliance. |
| A15 | Medium | appData/appNav/ClientPortal links | Nonexistent CRM/HR nested links produced 404s. Existing links now target real query tabs; missing org chart is not invented, payroll belongs to PAY. |
| A16 | Medium | crm/records.tsx and HR export | Naive comma splitting corrupts quoted/multiline CSV; duplicate Name headers and formula interpretation risks. Shared parser/export and regression tests added. Other bespoke exports remain separately inventoried. |
| A17 | Medium | repeated Dialog/Stat/NavGroup/record lists; travel/shell imports | Cross-feature dependencies and duplicated behavior caused accessibility/design drift. Consolidated the directly equivalent primitives while retaining variants. |
| A18 | Medium | HR/CRM badges and AdminScheduledJobs | Trial badge differed by one day by route; fixed. Trial itself remains a constant, not a real expiry date. UTC preview fixed; actual schedules still need machine timestamps/timezone rules. |
| A19 | Medium | global CSS and fixed-width rails, dialog implementations | Shared native dialog and RecordDialog now have focus containment/Escape/background inertness; Other bespoke overlays still need the full accessibility pass. Responsive and keyboard completeness are not established by desktop compilation. |
| A20 | Medium | .gitignore/package.json | `.env` was not ignored; safe patterns added, no secrets read or replaced. Removed unusable Next 16 lint command rather than claim linting ran. Add a real lint configuration in the implementation stage. |
| A21 | Medium | router adapter, Login redirect | Navigate accepts but discards state; original destination is lost across login. Login recovery points to an unrelated surface. Proper returnTo and missing recovery screens remain in auth scope. |
| A22 | Medium | Onboarding apps vs install defaults/quota | Deselecting default apps does not uninstall them; onboarding can install beyond catalog quota and gated offerings. Need one entitlement-aware transaction, consistent with marketplace. |
| A24 | Medium | `src/app/[slug]` and not-found redirect | Nested public Vibe/legal slugs returned 404 and the homepage redirect concealed failures. Replaced with a catch-all route and real 404 screen after browser reproduction. |
| A23 | Medium | marketing SiteLayout/ProductPage/Landing | Buttons nested inside links in some CTA compositions; catalog counts/prices/security claims are copied content. Verify semantics, ownership, plan catalog, legal text and commercial commitments before release. |

## Frontend changes in this pass

- `components/EnterpriseUi.tsx` owns neutral Panel, EmptyBlock, Label/input styles; features no longer import their shared UI from Travel & Expense. Feature-specific POS empty/stat styling remains intentional.
- `components/StatCard.tsx` centralizes standard/pos/dashboard KPI markup and preserves three original typography variants. Travel, POS and overview use it.
- `components/Dialog.tsx` replaces three duplicate modal shells, retaining width variants. Native dialog provides an inert background, with explicit Tab wrapping verified in Chromium; effect cleanup restores scroll/focus and Escape invokes the controlled close callback. RecordDialog now uses the same native shell with a structured header/footer variant.
- `components/NavGroup.tsx` replaces identical Support/POS grouped nav markup.
- `components/RecordList.tsx` removes duplicated CRM/HR rows; HR grid/list toggles now change layout.
- CRM searches now filter record collections, and contacts/leads render the same filtered rows their counters use. Lead source/score filters, board mode and page controls are connected; the old fake scoring button accurately describes sorting existing scores. CRM creation selects use existing vocabularies for status/source/type/stage/activity. HR search is connected and pages remount by ID to reset local filters.
- `lib/csv.ts` centralizes CRM/HR exports, handles quoted/newline input, rejects malformed imports before writing and protects spreadsheet formula-like cells. Import errors are visible. Excel buttons that exported CSV are accurately labeled where changed.
- A shared accessible mobile workspace menu restores navigation where the desktop sidebar is hidden. Portal empty-state markup is shared with PageHeader while preserving spacing. Attendance calendars include all required weeks.
- Query-tab links, trial badges and schedule UTC preview corrected. Explicit window guards avoid reading Node's localStorage during build. Auth/workspace now hydrate from storage after mount, with a protected loading state, fixing the React hydration errors reproduced in the browser sweep. Real server auth/isolation remains implementation work.

This is substantive consolidation, not a claim that all repeated markup should be a single universal component. Domain-specific table cells, review panels, specialized sidebars and marketing cards have distinct semantics. Remaining candidates and controls are in the ledger; future changes should extract proven equivalence and avoid a giant component with dozens of boolean variants.

## Completion assessment

Visual shell: broad. Frontend business completion: partial. Persistence: browser prototype. Authentication/authorization: absent. Real AI/connectors/payments/files: absent. Scheduled execution: absent. Production readiness: blocked until the numbered implementation program and deployment gates pass. No percentage would accurately summarize those independent dimensions.
