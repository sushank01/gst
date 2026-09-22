# Verification record

2026-09-21. Local worktree only; no deployment, external messaging, billing/provider calls, database or real authentication was implemented or verified.

## Executed checks

- `npm ci`: succeeded using the repository lockfile; npm reported 0 known vulnerabilities at installation. This does not establish application security.
- `npm run typecheck`: passed after frontend changes.
- `npm test`: 4 passing CSV regressions: multiline/comma/quote/Unicode round trip without duplicate Name header; BOM/CRLF/empty handling; malformed quoting/column count rejection; formula-like cells exported as text.
- `npm run build`: final production build passed (75 prerendered pages; dynamic routes also compiled), including the final dialog keyboard fix. The initial Node localStorage warnings were resolved by explicit browser guards and mount-time hydration.
- `git diff --check`: passed.
- `npm run audit:inventory`: source/route/control/operation artifacts generated. The source files' SHA-256 hashes allow checking snapshot freshness. This is structural/static coverage, not per-control acceptance proof.
- Browser automation uses agent-browser 0.38.1 plus its installed Playwright Chromium runtime against `npm start -- --port 3100`. The production browser—not just HTTP responses—was inspected. A fabricated local account completed the existing login/onboarding flow with a dummy email; this confirmed the stub behavior, not valid authentication.
- A first 224-route sweep found 227 React hydration-error events. Auth and workspace now start from server-consistent state, read browser storage after mount, and protected routes wait for auth readiness. The second 224-route sweep completed with 0 failed routes and 0 console/page errors.
- The expanded public-route sweep exposed 12 broken nested Vibe/legal pages (single-segment route could not match slash-containing slugs), plus five public network-idle timeouts. Replaced the public route with a catch-all and the redirecting 404 with an honest 404 screen. The timeouts did not recur; their exact cause was not independently isolated.
- The final expanded sweep passed **253 routes, 0 failed routes, 0 console/page errors**, covering all public content slugs, static app routes, domain query tabs, Pitch sections and every Business Suite tool slug. `browser-results.json` retains the actual per-route results; do not infer control completeness from route success.
- The only source change after that sweep was explicit Tab wrapping in the shared dialog, followed by another successful production build and **5 passing targeted browser checks** in `browser-regressions.json`: 27-record lead pagination, combined source/score filters and board mode, modal Tab focus containment/Escape, correct unknown-route HTTP 404 without redirect, and nested legal-page rendering. Native dialog alone let Tab reach browser chrome at the boundary; the explicit wrap resolved the reproduced failure. Fixtures are explicitly browser-local demo data.
- Behavior checks create two CRM leads with different statuses, assert status filtering excludes the unrelated row, and assert text search excludes the unrelated row. Shared integration modal opens and Escape closes. Mobile menu navigates to Inbox and closes. Screenshots record desktop CRM filtering, shared dialog and mobile rendering/navigation.

## Reproduction

`npm ci && npm run typecheck && npm test && npm run build`, then `npm start -- --port 3100` in another terminal. Install a local browser automation runtime if needed. `scripts/browser-audit.mjs` accepts `PLAYWRIGHT_MODULE` (path to playwright-core's index.mjs or installed playwright), `AUDIT_BASE_URL` (localhost-only), and `AUDIT_STORAGE_STATE` (a disposable demo storage-state JSON). Create the dummy session by exercising login and onboarding in the browser; select CRM, HR, TE, ITAM, PP, POS and SUP, then save its storage state outside the repository. Default state path is `/tmp/gst-audit-state.json`. Do not use real customer credentials/storage for this script. It creates test leads and stores screenshots under docs/audit.

The source-inventory generator is repeatable and dependency-free beyond the repository's TypeScript dependency. It resets generated static controls to UNVERIFIED intentionally. The future implementing agent must maintain a separate persisted verification ledger, not lose acceptance evidence by regenerating this static snapshot.

## Explicit limits

No server endpoints, migrations, auth/session provider, DB persistence, live AI, OAuth, mail delivery, payments, tax/payroll, runner protocol, queued execution or cloud deployment exists to test. There was no independent legal/security compliance certification or exhaustive security scan. Real job execution and App Runner availability were researched from official documentation, not provisioned experimentally.

Not every one of the 700+ control call sites or every nested settings/modal/state was exercised manually. The 32 requirement groups, exact field/data registry, full handler inventory and workspace operation ledger identify the remaining work, including inert filters/HR generic actions, missing detail/edit flows, generic catalog apps and static self-service. The final implementation prompt requires per-control acceptance rather than inheriting an unsupported “frontend complete” claim.

Desktop and mobile screenshots are representative visual checks, not a comprehensive screenshot regression suite. Browser route smoke checks cover empty/demo state and selected mutated CRM state. Static source/config review plus these browser checks found useful real defects; they do not prove every screen state or legitimate variant identical to the external original site. No external-site comparison session was performed in this audit.
