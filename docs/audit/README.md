# Start here

1. [AUDIT.md](AUDIT.md): repository assessment, prioritized findings and actual frontend fixes.
2. [REQUIREMENTS.md](REQUIREMENTS.md): complete feature matrix, UI/backend traceability and decisions.
3. [DATA-API.md](DATA-API.md): domain schema, permissions, API contracts, state machines and tests.
4. [DEPLOYMENT.md](DEPLOYMENT.md): official platform constraints, cost assumptions, env/import and deployment runbook.
5. [VERIFICATION.md](VERIFICATION.md): what actually ran and what remains unverified.
6. [../IMPLEMENTATION-PROMPT.md](../IMPLEMENTATION-PROMPT.md): standalone 62-loop implementation instructions.
7. [COVERAGE-LEDGER.md](COVERAGE-LEDGER.md), [source-inventory.json](source-inventory.json), [route-inventory.json](route-inventory.json), [WORKSPACE-CONTRACTS.md](WORKSPACE-CONTRACTS.md): generated full-source/control/contract provenance. Regenerate with `npm run audit:inventory`; generated UNVERIFIED statuses are static inventory, not a persisted implementation-progress ledger.

The audit and prompt are a handoff for building the full application. This pass fixes frontend consistency; it does not claim to have implemented authentication, a database, external services or production jobs.
