# Implementation programme

Working directory: this worktree. It carries the audit's 53 uncommitted paths
plus this stage's work — do not switch to `/Users/sushank/Downloads/gst`, which
is clean at the same commit and has none of it.

## Read in this order

| File | What it is for |
|---|---|
| [baseline.md](baseline.md) | Loop 01 — what was reproduced, and the two environment blockers found |
| [decisions.md](decisions.md) | **D1–D5 need your answer.** 10 ADRs record what I decided and why |
| [architecture.md](architecture.md) | The request path and the rules that hold everywhere |
| [schema.md](schema.md) | 22 tables, and the reasoning behind each awkward constraint |
| [progress.md](progress.md) | Every loop, honestly graded, with evidence or the specific gap |
| [risks.md](risks.md) | Fifteen risks, each marked mitigated-with-a-test or open |
| [coverage.csv](coverage.csv) | 725 rows. 28 VERIFIED with named evidence, 2 BLOCKED, 695 DISCOVERED |
| [false-success.json](false-success.json) | 161 places the UI claims something happened that did not |
| [open-questions.json](open-questions.json) | 160 product semantics that could not be inferred — recorded, never invented |
| [map/](map/) | Per-domain entity, operation and surface maps |
| [evidence/](evidence/) | Raw command output |

## Reproducing

```bash
npm ci
npm run verify        # lint → typecheck → test → build
npm run db:migrate    # DATABASE_URL, or local PGlite if unset
npm run dev
```

No database daemon is required: with `DATABASE_URL` blank the app runs on
PGlite — real PostgreSQL 18.3 in-process — and the same migrations apply to a
managed Postgres unchanged.

## Regenerating the ledger

```bash
node scripts/coverage-ledger.mjs   # map/*.json + verified.json → coverage.csv
npm run audit:inventory            # source/route/control inventory
```

`verified.json` is hand-maintained and is the only route to a VERIFIED row.
Each entry must name the test or command that proves it. A copied count, a
state setter or a green build does not qualify — the generator will happily
emit a row, but the evidence column is what a reviewer reads.
