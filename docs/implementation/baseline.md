# Loop 01 — Reconciled baseline

Date: 2026-09-21. Worktree: `/Users/sushank/.codex/worktrees/ac6c/gst` (git worktree of
`/Users/sushank/Downloads/gst`, detached at `82c134b`).

## Which tree is authoritative

| Tree | Revision | Working state |
|---|---|---|
| `/Users/sushank/Downloads/gst` | `82c134b` on `main` | clean — **does not contain the audit pass** |
| `/Users/sushank/.codex/worktrees/ac6c/gst` | `82c134b` detached | **53 uncommitted paths — the audit pass** |

The worktree is authoritative. Working in `Downloads/gst` would silently discard the audit
pass (new primitives, `lib/csv.ts`, `tests/`, `scripts/`, `docs/`, `.env.example`). All work
proceeds in the worktree and preserves those changes; nothing was reverted or reimplemented
from memory.

Uncommitted at baseline: 41 modified, 2 deleted (`src/app/[slug]/page.tsx`,
`src/screens/app/travel/shell.tsx` — both intentionally replaced), 10 untracked additions.

## Runtime

| Item | Value |
|---|---|
| Node | v26.7.0 |
| npm | 11.19.0 |
| TypeScript | 5.9.3 |
| OS | macOS 26.5.1, arm64 |
| Next.js | 16.3.5 (App Router, Turbopack) |
| React | 19 |

## Reproduced baseline commands

All run in the worktree; raw output in `evidence/loop01/baseline-1.txt`.

| Command | Result |
|---|---|
| `npm ci` | clean install from lockfile, 0 known vulnerabilities reported |
| `npm run typecheck` | passes, no output |
| `npm test` | 4 passing CSV regressions |
| `npm run build` | passes — 75 prerendered pages, dynamic routes compiled |

This matches `docs/audit/VERIFICATION.md`. **A green build is compilation evidence only.**

## Structural facts measured

| Measure | Count |
|---|---|
| Source files (`.ts`/`.tsx` under `src`) | 172 |
| Source lines | 30,119 |
| Route files (`page.tsx`/`layout.tsx`) | 52 |
| **API route handlers (`route.ts`)** | **0** |
| Server actions | 0 |
| Exported workspace record types | 50 |
| Workspace mutation methods | 82 |
| `src/lib/workspace.tsx` | 2,425 lines, one localStorage key |
| `src/lib/auth.tsx` | 134 lines, no password check |
| `src/app/globals.css` | 831 lines |

## Environment blockers found (not present in the audit)

| Blocker | Evidence | Resolution taken |
|---|---|---|
| No local PostgreSQL | `psql`/`postgres`/`initdb` all absent | See below |
| Docker daemon not running | `docker info` fails; CLI 29.5.2 present | Cannot rely on a container Postgres in this session |

**Resolution:** use PGlite (real PostgreSQL compiled to WASM) as the local and test database
driver. It executes genuine PostgreSQL DDL/DML in-process, so one set of SQL migrations runs
unchanged against a managed Postgres in production. This is a driver choice, not a dialect
change, and it removes the daemon dependency for `npm test` and CI. Recorded as ADR-0002.

## Acceptance

Baseline known and reproduced; audit changes preserved intact; no environment blocker left
unresolved or silently ignored. Loop 01 **PASSES**.
