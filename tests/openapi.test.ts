import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * The OpenAPI document must describe the API that exists.
 *
 * A hand-maintained API document drifts the moment somebody adds a route and
 * forgets it, and a stale document is worse than none — it is consulted and
 * believed. `npm run openapi` generates the document from the route files, and
 * these tests fail the build if the committed document no longer matches them.
 */

const DOCUMENT = 'docs/api/openapi.json'

type Operation = { summary: string; security: unknown[]; responses: Record<string, unknown>; requestBody?: unknown }
type Document = { paths: Record<string, Record<string, Operation>>; components: { securitySchemes: Record<string, unknown> } }

const document = JSON.parse(readFileSync(DOCUMENT, 'utf8')) as Document

function routeFiles(dir = 'src/app/api', out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) routeFiles(full, out)
    else if (name === 'route.ts') out.push(full)
  }
  return out
}

const pathOf = (file: string) =>
  `/api/${relative('src/app/api', file)
    .replace(/\/route\.ts$/, '')
    .split('/')
    .map((segment) => (segment.startsWith('[') ? `{${segment.slice(1, -1)}}` : segment))
    .join('/')}`

test('the committed document is exactly what the generator produces', () => {
  const before = readFileSync(DOCUMENT, 'utf8')
  execFileSync('node', ['scripts/openapi.mjs'], { stdio: 'pipe' })
  const after = readFileSync(DOCUMENT, 'utf8')
  assert.equal(after, before, 'docs/api/openapi.json is stale — run `npm run openapi` and commit the result')
})

test('every route on disk is described', () => {
  const missing: string[] = []
  for (const file of routeFiles()) {
    const apiPath = pathOf(file)
    const source = readFileSync(file, 'utf8')
    const methods = [...source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=/g)].map((m) => m[1].toLowerCase())
    for (const method of methods) {
      if (!document.paths[apiPath]?.[method]) missing.push(`${method.toUpperCase()} ${apiPath} (${file})`)
    }
  }
  assert.deepEqual(missing, [], 'these routes exist but are not in the document')
})

test('the document describes no route that does not exist', () => {
  const real = new Set<string>()
  for (const file of routeFiles()) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=/g)) {
      real.add(`${match[1].toLowerCase()} ${pathOf(file)}`)
    }
  }
  const phantom: string[] = []
  for (const [apiPath, methods] of Object.entries(document.paths)) {
    for (const method of Object.keys(methods)) {
      if (!real.has(`${method} ${apiPath}`)) phantom.push(`${method.toUpperCase()} ${apiPath}`)
    }
  }
  assert.deepEqual(phantom, [], 'these are documented but no longer exist')
})

test('every operation says what it does, rather than repeating its own URL', () => {
  const unexplained: string[] = []
  for (const [apiPath, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const summary = operation.summary?.trim() ?? ''
      if (!summary || summary.startsWith(`${method.toUpperCase()} /`) || summary.length < 20) {
        unexplained.push(`${method.toUpperCase()} ${apiPath}`)
      }
    }
  }
  assert.deepEqual(unexplained, [], 'add a doc comment above the handler — filler would be worse than nothing')
})

test('every business endpoint requires a session', () => {
  const open: string[] = []
  for (const [apiPath, methods] of Object.entries(document.paths)) {
    // The only endpoints that may be reached without a session are the ones
    // used to GET a session in the first place.
    if (apiPath.startsWith('/api/v1/auth/')) continue
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation.security?.length) open.push(`${method.toUpperCase()} ${apiPath}`)
    }
  }
  assert.deepEqual(open, [], 'an unauthenticated business endpoint is an open door')
})

test('no endpoint accepts a tenant id: the workspace comes from the session', () => {
  const offenders: string[] = []
  for (const [apiPath, methods] of Object.entries(document.paths)) {
    // Switching workspace is the one place a tenant id is legitimate, and the
    // service still checks the caller belongs to it.
    if (apiPath === '/api/v1/tenants/switch') continue
    for (const [method, operation] of Object.entries(methods)) {
      const body = JSON.stringify(operation.requestBody ?? {})
      if (/"tenantId"/.test(body)) offenders.push(`${method.toUpperCase()} ${apiPath}`)
    }
  }
  assert.deepEqual(offenders, [], 'a tenant id in a request body is a workspace somebody can name')
})

test('every operation documents the failures a client has to handle', () => {
  const incomplete: string[] = []
  for (const [apiPath, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      for (const status of ['401', '404', '409', '422']) {
        if (!operation.responses[status]) incomplete.push(`${method.toUpperCase()} ${apiPath} is missing ${status}`)
      }
    }
  }
  assert.deepEqual(incomplete, [])
})

test('the session cookie is documented as httpOnly and opaque', () => {
  const scheme = document.components.securitySchemes.sessionCookie as { in: string; name: string; description: string }
  assert.equal(scheme.in, 'cookie')
  assert.equal(scheme.name, 'apragya_session')
  assert.match(scheme.description, /httpOnly/i)
})
