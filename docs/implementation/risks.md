# Risks

Ordered by what would hurt most if ignored. "Mitigated" means there is code and
a test, not an intention.

| # | Risk | Status | Detail |
|---|---|---|---|
| R1 | One browser workspace shared by every account | **Mitigated for migrated domains** | Identity, tenancy and CRM leads are tenant-scoped in PostgreSQL with adversarial isolation tests. Everything still reading `workspace.tsx` retains the flaw — that is the single largest outstanding risk |
| R2 | Anyone can become anyone | **Mitigated** | Real password verification, opaque DB sessions, lockout, uniform failure messages. The fabricated login path is deleted, not disabled |
| R3 | Production executor undecided | **Open — D1** | App Runner is closed to new customers with a 120s cap; Hobby Cron is daily-only. Everything platform-independent is built and tested; only the adapter waits |
| R4 | Duplicate financial effects | **Mitigated in the model, unfixed in the UI** | Occurrence uniqueness, idempotency keys, fencing and lease expiry are implemented and tested. The POS subscription sweep still re-invoices on every click because POS is not migrated |
| R5 | Copied commercial and compliance claims | **Open — D4** | Prices, credit economics, trial length and compliance registers are marketing text. Charging or asserting compliance on them would be wrong |
| R6 | Catalogue promises undelivered apps | **Open — D2** | Inventory, Projects, P2P, Contracts, PPTX and the gated cards have no implementation behind them |
| R7 | No file storage | **Open** | Uploads are metadata or data URLs. Malicious-type, size and tenant-crossing checks cannot exist until there is a store |
| R8 | No provider integrations | **Open — D3** | Email, AI, OCR, OAuth and payments are all unimplemented. Outbox messages accumulate with no delivery adapter |
| R9 | Statutory invention | **Mitigated by policy** | No payroll, tax or legal behaviour has been written. Where semantics could not be inferred they are recorded as open questions, not guessed |
| R10 | Migration edited after shipping | **Mitigated** | Checksums recorded; an edited applied migration is a hard error |
| R11 | Money precision | **Mitigated** | `numeric(18,4)` end to end, proven by test. No float in the money path |
| R12 | Secrets in logs or audit | **Mitigated** | Audit detail redacts secret-shaped keys at any depth, tested; unexpected throws never return a stack trace |
| R13 | Async UI handlers swallow rejections | **Open** | Tracked as `UI-ASYNC-REJECT`. `no-misused-promises` is relaxed for JSX attributes with that note; the underlying handlers still need rejection paths |
| R14 | PGlite ≠ managed Postgres | **Accepted, bounded** | Same engine (PostgreSQL 18.3), same SQL. Connection pooling, extensions and performance must still be verified against the real target before release |
| R15 | Coverage ledger incomplete | **Open** | 695 operations are DISCOVERED, not SPECIFIED. **5 of 11 domain maps were never produced** — the core store (`workspace.tsx`), CRM, HR, Travel & Expense and admin/governance. Their operations are therefore absent from `coverage.csv` entirely, so the 725 rows are a floor, not a total |
