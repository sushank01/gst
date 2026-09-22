#!/usr/bin/env node
/**
 * Builds docs/implementation/coverage.csv.
 *
 * One row per requirement, with a stable id, where it came from in the source,
 * what it must do, and its status. Statuses are DISCOVERED, SPECIFIED,
 * IMPLEMENTED, VERIFIED, BLOCKED, APPROVED_OUT_OF_SCOPE.
 *
 * The rule that matters: VERIFIED requires a named evidence artefact — a test
 * name, a command, a captured response. A localStorage write, a state setter or
 * a passing build never earns it.
 *
 * Inputs:
 *   docs/implementation/map/*.json   domain maps (surfaces, operations)
 *   docs/implementation/verified.json  rows proven by tests/commands
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const MAP_DIR = path.join(ROOT, 'docs/implementation/map')
const OUT = path.join(ROOT, 'docs/implementation/coverage.csv')

const COLUMNS = [
  'id', 'domain', 'surface', 'tab', 'entity', 'operation', 'sourceFile', 'sourceLine',
  'currentBehaviour', 'requiredBehaviour', 'apiMethodPath', 'validation', 'authorization',
  'states', 'sideEffect', 'persistence', 'evidence', 'status', 'blockedBy',
]

const cell = (value) => {
  const text = value === undefined || value === null ? '' : String(value)
  // Leading =, +, - or @ are interpreted as formulas by spreadsheets.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

const slug = (text) =>
  String(text || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42)

async function loadMaps() {
  if (!existsSync(MAP_DIR)) return []
  const files = (await readdir(MAP_DIR)).filter((name) => name.endsWith('.json'))
  const maps = []
  for (const file of files) maps.push(JSON.parse(await readFile(path.join(MAP_DIR, file), 'utf8')))
  return maps.flat()
}

async function loadVerified() {
  const file = path.join(ROOT, 'docs/implementation/verified.json')
  if (!existsSync(file)) return []
  return JSON.parse(await readFile(file, 'utf8'))
}

const rows = []
const seen = new Set()
const push = (row) => {
  let id = row.id
  let n = 2
  while (seen.has(id)) id = `${row.id}-${n++}`
  seen.add(id)
  rows.push({ ...row, id })
}

for (const map of await loadMaps()) {
  const domain = map.domain ?? 'unknown'
  for (const operation of map.operations ?? []) {
    push({
      id: operation.id || `OP-${slug(domain)}-${slug(operation.entity)}-${slug(operation.action)}`,
      domain,
      surface: operation.surface,
      tab: '',
      entity: operation.entity,
      operation: operation.action,
      sourceFile: operation.sourceFile,
      sourceLine: operation.sourceLine ?? '',
      currentBehaviour: operation.currentBehaviour,
      requiredBehaviour: operation.requiredBehaviour,
      apiMethodPath: operation.apiMethodPath ?? '',
      validation: operation.validation ?? '',
      authorization: operation.authorization ?? '',
      states: '',
      sideEffect: operation.sideEffect ?? '',
      persistence: /localStorage|state only|setState|no-op|setTimeout|timer/i.test(operation.currentBehaviour ?? '')
        ? 'browser-only'
        : 'unknown',
      evidence: '',
      status: 'DISCOVERED',
    })
  }
  for (const surface of map.surfaces ?? []) {
    push({
      id: `SURF-${slug(domain)}-${slug(surface.route)}-${slug(surface.tab)}`,
      domain,
      surface: surface.route,
      tab: surface.tab ?? '',
      entity: '',
      operation: 'render',
      sourceFile: surface.screenFile,
      sourceLine: '',
      currentBehaviour: surface.verdict,
      requiredBehaviour: `All states present: ${(surface.statesMissing ?? []).join(', ') || 'complete'}`,
      apiMethodPath: '',
      validation: '',
      authorization: '',
      states: [...(surface.statesImplemented ?? []), ...(surface.statesMissing ?? []).map((s) => `MISSING:${s}`)].join(' '),
      sideEffect: '',
      persistence: '',
      evidence: '',
      status: 'DISCOVERED',
    })
  }
}

/** Verified rows override discovered ones and carry their evidence. */
for (const entry of await loadVerified()) {
  const existing = rows.find((row) => row.id === entry.id)
  if (existing) Object.assign(existing, entry)
  else push(entry)
}

await mkdir(path.dirname(OUT), { recursive: true })
await writeFile(OUT, [COLUMNS.join(','), ...rows.map((row) => COLUMNS.map((c) => cell(row[c])).join(','))].join('\n') + '\n')

const byStatus = rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {})
console.log(`coverage.csv: ${rows.length} rows`)
for (const [status, count] of Object.entries(byStatus).sort()) console.log(`  ${status.padEnd(22)} ${count}`)
