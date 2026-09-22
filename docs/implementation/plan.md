# Execution plan for the remaining loops

Ordered by dependency, not by loop number. Each phase states what it unblocks
and what evidence closes it. Anything that cannot be closed without D1–D5 is
built up to the decision boundary and marked BLOCKED there — never quietly
skipped, never faked.

## Phase A — finish discovery (Loops 02, 03)
Re-run the five domain maps that did not complete: the core store, CRM, HR,
Travel & Expense, admin/governance. Without them the ledger under-counts and
the schemas below would be guesses.
**Closes when:** 11/11 maps in `map/`, `coverage.csv` regenerated.

## Phase B — schema for every remaining domain (Loop 07)
Migrations 0004–0010: HR, Travel & Expense, Support, Assets, Sales & POS,
Pitch Pilot, platform (files, notifications, settings, guardrails).
**Closes when:** fresh install and re-run verified; every table tenant-scoped;
money `numeric` + currency everywhere.

## Phase C — services, APIs and tests per domain (Loops 08, 19–37)
For each domain: typed service with tenant scope and optimistic concurrency,
route handlers, audit on every mutation, and tests that include a denial case
and a cross-tenant case.
**Closes when:** each domain's acceptance tests pass.

## Phase D — move the UI off browser state (Loop 13, 56)
Screen by screen onto the server, using `useServerLeads` as the reference:
loading / refreshing / empty / filtered-empty / denied / retryable error.
**Closes when:** no production screen reads `workspace.tsx` for durable data.

## Phase E — platform services
- Loop 15 files: storage interface + local adapter, MIME/size checks, quarantine
- Loop 16 delivery: outbox dispatcher + transport interface (log transport in dev)
- Loop 42 worker: in-process dispatcher, reaper, run-now
- Loop 50 guardrails: evaluators wired at real checkpoints
- Loop 12 onboarding: installs and quota inside the tenant transaction
- Loop 17 companies/accounting primitives where Sales/P2P need them

## Phase F — cross-cutting verification
Loop 55 reports from authoritative events · Loop 57 security and concurrency ·
Loop 58 end-to-end journeys · Loop 59 what can be measured locally.

## Phase G — handoff (Loops 60, 62)
Env contract, deployment runbook, OpenAPI, final ledger reconciliation and a
handoff that separates implemented / locally verified / externally verified /
deployed / blocked.

## Standing rules

1. No statutory, tax, payroll or legal behaviour is invented. Where semantics
   cannot be inferred they go to `open-questions.json`.
2. No integration is faked. A provider-dependent path is built behind an
   interface with a sandbox implementation and marked BLOCKED for live proof.
3. VERIFIED requires a named test or captured command output.
4. Destructive deletes are replaced by archival wherever history matters.
