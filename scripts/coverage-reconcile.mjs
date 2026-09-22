/**
 * Reconciles the coverage ledger against the API that now exists.
 *
 * Each ledger row names the endpoint its operation would need. This checks
 * whether that endpoint is in `docs/api/openapi.json` — which is itself
 * generated from the route files — and updates the row's status.
 *
 * The status it can award is SERVED, and the distinction matters:
 *
 *   DISCOVERED  the operation exists in the UI; nothing serves it
 *   SERVED      an endpoint for it exists and is documented
 *   VERIFIED    a test proves the behaviour the row requires
 *   BLOCKED     waiting on a decision, not on work
 *
 * SERVED is NOT verification. It says a route is reachable, not that it does
 * the right thing, and not that the screen calls it. Promoting a row to
 * VERIFIED is a human act that names the test. This script will never do it.
 *
 * Run: node scripts/coverage-reconcile.mjs [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'

const LEDGER = 'docs/implementation/coverage.csv'
const DOCUMENT = 'docs/api/openapi.json'
const write = process.argv.includes('--write')

/** Minimal RFC 4180 reader: quoted fields, embedded commas and newlines. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; continue }
      if (ch === '"') { quoted = false; continue }
      field += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    if (ch === '\r') continue
    field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function toCsv(rows) {
  const escape = (value) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  return `${rows.map((row) => row.map(escape).join(',')).join('\n')}\n`
}

const rows = parseCsv(readFileSync(LEDGER, 'utf8')).filter((row) => row.length > 1)
const header = rows[0]
const index = Object.fromEntries(header.map((name, at) => [name, at]))

const document = JSON.parse(readFileSync(DOCUMENT, 'utf8'))
/** "get /api/v1/assets/{id}" for every documented operation. */
const served = new Set()
for (const [path, methods] of Object.entries(document.paths)) {
  for (const method of Object.keys(methods)) served.add(`${method} ${path}`)
}

/** A ledger row's `apiMethodPath` may name several endpoints, comma separated. */
function endpointsOf(cell) {
  return cell
    .split(/[,;]| and /)
    .map((part) => part.trim())
    .filter((part) => /^(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(part))
    .map((part) => {
      const [method, ...rest] = part.split(/\s+/)
      /*
       * Ledger rows were written with `:id` where the document uses `{id}`,
       * and several carry an example query string. The query is not part of
       * the path an OpenAPI document keys on, so it is dropped before matching
       * — otherwise `…/articles?categoryId=` never matches `…/articles`, which
       * understates the coverage rather than overstating it.
       */
      const path = rest
        .join(' ')
        .split('?')[0]
        .replace(/:(\w+)/g, '{$1}')
        .replace(/\/$/, '')
      return `${method.toLowerCase()} ${path}`
    })
}

let promoted = 0
const unmatched = new Map()
for (const row of rows.slice(1)) {
  const status = row[index.status]
  if (status === 'VERIFIED' || status === 'BLOCKED') continue
  const endpoints = endpointsOf(row[index.apiMethodPath] ?? '')
  if (!endpoints.length) continue
  if (endpoints.every((endpoint) => served.has(endpoint))) {
    row[index.status] = 'SERVED'
    promoted += 1
  } else {
    for (const endpoint of endpoints.filter((e) => !served.has(e))) {
      unmatched.set(endpoint, (unmatched.get(endpoint) ?? 0) + 1)
    }
  }
}

const counts = {}
for (const row of rows.slice(1)) counts[row[index.status]] = (counts[row[index.status]] ?? 0) + 1

console.log(`ledger: ${rows.length - 1} rows`)
console.log(`documented operations: ${served.size}`)
console.log(`promoted to SERVED this pass: ${promoted}`)
console.log('status counts:', counts)
console.log(`\nendpoints the ledger asks for that do not exist: ${unmatched.size}`)
for (const [endpoint, count] of [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${String(count).padStart(3)}x  ${endpoint}`)
}

/*
 * The inverse of the match is the more useful artefact: every endpoint the UI
 * needs that nothing serves, grouped by the domain that asks for it. That is a
 * work list, not a score.
 *
 * A caution the report repeats: these paths are the AUDIT's proposed names,
 * written before the API existed. Several are served by an endpoint under a
 * different name — the asset metrics row, for instance, is answered by
 * `/api/v1/reports/apps/{code}`. The count is therefore an upper bound on the
 * gap, and closing it means reading the rows, not renaming the paths.
 */
const byDomain = new Map()
for (const row of rows.slice(1)) {
  if (row[index.status] !== 'DISCOVERED') continue
  const missing = endpointsOf(row[index.apiMethodPath] ?? '').filter((endpoint) => !served.has(endpoint))
  if (!missing.length) continue
  const domain = (row[index.domain] ?? 'unknown').split('—')[0].split('(')[0].trim()
  if (!byDomain.has(domain)) byDomain.set(domain, new Map())
  const bucket = byDomain.get(domain)
  for (const endpoint of missing) {
    if (!bucket.has(endpoint)) bucket.set(endpoint, [])
    bucket.get(endpoint).push(row[index.id])
  }
}

const report = [
  '# Coverage gaps',
  '',
  'Generated by `node scripts/coverage-reconcile.mjs --write`. Every line is an',
  'endpoint a ledger row says the interface needs, which no route serves.',
  '',
  '**Read this as an upper bound.** The paths are the names the audit proposed',
  'before the API existed, and several are already answered under a different',
  'one — the asset metrics rows, for example, are served by',
  '`/api/v1/reports/apps/{code}`. Closing a line means reading the rows behind',
  'it and deciding what the operation actually needs, not renaming a path.',
  '',
  `At this pass: **${rows.length - 1} ledger rows**, ${served.size} documented operations,`,
  `${counts.SERVED ?? 0} SERVED, ${counts.VERIFIED ?? 0} VERIFIED, ${counts.BLOCKED ?? 0} BLOCKED,`,
  `${counts.DISCOVERED ?? 0} still DISCOVERED.`,
  '',
]
for (const [domain, endpoints] of [...byDomain].sort((a, b) => b[1].size - a[1].size)) {
  report.push(`## ${domain} — ${endpoints.size} endpoint(s)`, '')
  for (const [endpoint, ids] of [...endpoints].sort((a, b) => b[1].length - a[1].length)) {
    report.push(`- \`${endpoint}\` — ${ids.length} operation(s): ${ids.slice(0, 4).join(', ')}${ids.length > 4 ? ', …' : ''}`)
  }
  report.push('')
}

if (write) {
  writeFileSync(LEDGER, toCsv(rows))
  writeFileSync('docs/implementation/coverage-gaps.md', `${report.join('\n')}\n`)
  console.log(`\nwrote ${LEDGER}`)
  console.log('wrote docs/implementation/coverage-gaps.md')
} else {
  console.log('\n(dry run — pass --write to update the ledger and write the gap report)')
}
