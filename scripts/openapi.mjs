/**
 * Generates the OpenAPI document from the route files themselves.
 *
 * Hand-written API documentation drifts the moment somebody adds a route and
 * forgets the document. This reads `src/app/api/**\/route.ts`, so the
 * document is a function of the code — and `tests/openapi.test.ts` fails the
 * build if a route exists that this cannot describe.
 *
 * What it reads is deliberately narrow, because every route in this codebase
 * is written the same way:
 *   - the exported HTTP methods (`export const GET = ...`)
 *   - which wrapper each uses, which IS the authorization requirement
 *   - the leading doc comment, which becomes the summary
 *   - the Zod schema literals, which become the parameter and body shapes
 *
 * Run: npm run openapi
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const API_ROOT = 'src/app/api'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name === 'route.ts') out.push(full)
  }
  return out
}

/** `src/app/api/v1/hr/employees/[id]/route.ts` -> `/api/v1/hr/employees/{id}` */
function pathOf(file) {
  const segments = relative(API_ROOT, file).replace(/\/route\.ts$/, '').split('/')
  return `/api/${segments.map((s) => (s.startsWith('[') ? `{${s.slice(1, -1)}}` : s)).join('/')}`
}

/** Reads a balanced `{...}` starting at `from`, returning its inner source. */
function balanced(source, from) {
  let depth = 0
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(from + 1, i)
    }
  }
  return ''
}

/** Splits object-literal source on top-level commas. */
function topLevel(source) {
  const parts = []
  let depth = 0
  let current = ''
  let quote = null
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (quote) {
      if (ch === '\\') { current += ch + source[++i]; continue }
      if (ch === quote) quote = null
      current += ch
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; current += ch; continue }
    if ('([{'.includes(ch)) depth += 1
    if (')]}'.includes(ch)) depth -= 1
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

/** Maps a Zod expression to a JSON Schema fragment. Conservative by design. */
function schemaOf(expression) {
  const optional = /\.optional\(\)|\.nullable\(\)/.test(expression)
  const enumMatch = expression.match(/z\.enum\(\[([^\]]*)\]\)/)
  let schema
  if (enumMatch) {
    schema = { type: 'string', enum: enumMatch[1].split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) }
  } else if (/z\.enum\(([A-Z_]+)\)/.test(expression)) {
    schema = { type: 'string', description: `One of ${expression.match(/z\.enum\(([A-Z_]+)\)/)[1]}.` }
  } else if (/z\.array\(/.test(expression)) {
    schema = { type: 'array', items: {} }
  } else if (/z\.boolean\(\)|coerce\.boolean/.test(expression)) {
    schema = { type: 'boolean' }
  } else if (/coerce\.number|z\.number\(\)/.test(expression)) {
    schema = { type: expression.includes('.int()') ? 'integer' : 'number' }
  } else if (/z\.record\(/.test(expression)) {
    schema = { type: 'object', additionalProperties: true }
  } else if (/\buuid\b/.test(expression)) {
    schema = { type: 'string', format: 'uuid' }
  } else if (/\bisoDateTime\b/.test(expression)) {
    schema = { type: 'string', format: 'date-time' }
  } else if (/\bisoDate\b/.test(expression)) {
    schema = { type: 'string', format: 'date' }
  } else if (/\bmoney\b/.test(expression)) {
    schema = { type: 'string', description: 'A decimal amount as a string. Never a JSON number: 0.1 + 0.2 is not 0.3 in a double.' }
  } else if (/\bcurrency\b/.test(expression)) {
    schema = { type: 'string', minLength: 3, maxLength: 3, description: 'ISO 4217 code.' }
  } else if (/emailField|\.email\(/.test(expression)) {
    schema = { type: 'string', format: 'email' }
  } else {
    schema = { type: 'string' }
  }
  const max = expression.match(/(?:trimmed|optionalTrimmed)\((\d+)\)|\.max\((\d+)/)
  if (max && schema.type === 'string') schema.maxLength = Number(max[1] ?? max[2])
  return { schema, optional }
}

/** Finds `const <Name> = z.object({...})` declarations in a route file. */
function objectSchemas(source) {
  const found = {}
  const re = /const\s+(\w+)\s*=\s*z\s*\n?\s*\.object\(/g
  let match
  while ((match = re.exec(source))) {
    const brace = source.indexOf('{', match.index + match[0].length - 1)
    if (brace === -1) continue
    const body = balanced(source, brace)
    const fields = {}
    const required = []
    for (const entry of topLevel(body)) {
      const key = entry.match(/^([\w'"]+)\s*:/)
      if (!key) continue
      const name = key[1].replace(/^['"]|['"]$/g, '')
      const { schema, optional } = schemaOf(entry.slice(key[0].length))
      fields[name] = schema
      if (!optional) required.push(name)
    }
    found[match[1]] = { type: 'object', properties: fields, ...(required.length ? { required } : {}), additionalProperties: false }
  }
  return found
}

/** The doc comment immediately above an export, as a summary and description. */
function docFor(source, index) {
  const before = source.slice(0, index)
  const start = before.lastIndexOf('/**')
  if (start === -1) return null
  const end = before.indexOf('*/', start)
  if (end === -1 || end < before.lastIndexOf('\n\n', index)) return null
  // Only if nothing but whitespace separates the comment from the export.
  if (before.slice(end + 2).trim() !== '') return null
  const text = before
    .slice(start + 3, end)
    .split('\n')
    .map((line) => line.replace(/^\s*\*ppp?/, '').replace(/^\s*\* ?/, '').trimEnd())
    .join('\n')
    .trim()
  const [summary, ...rest] = text.split('\n\n')
  return { summary: summary.replace(/\s+/g, ' '), description: rest.join('\n\n').trim() || undefined }
}

const AUTH = {
  publicRoute: { security: [], note: 'No session required.' },
  authRoute: { security: [{ sessionCookie: [] }], note: 'A signed-in user; no workspace required.' },
  tenantRoute: { security: [{ sessionCookie: [] }], note: 'A signed-in user bound to a workspace they belong to.' },
}

const paths = {}
const files = walk(API_ROOT).sort()
let operations = 0

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const schemas = objectSchemas(source)
  const apiPath = pathOf(file)
  paths[apiPath] ??= {}

  const methodRe = /export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*(publicRoute|authRoute|tenantRoute)/g
  let match
  while ((match = methodRe.exec(source))) {
    const [, method, wrapper] = match
    const doc = docFor(source, match.index)
    const auth = AUTH[wrapper]
    const operation = {
      operationId: `${method.toLowerCase()}${apiPath.replace(/[^\w]+/g, '_')}`,
      summary: doc?.summary ?? `${method} ${apiPath}`,
      description: [doc?.description, auth.note].filter(Boolean).join('\n\n'),
      security: auth.security,
      tags: [apiPath.split('/')[3] ?? 'root'],
      responses: {
        200: { description: 'Success.' },
        401: { description: 'No valid session.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        403: { description: 'The session is valid but the role may not do this.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        404: { description: 'Not found — also returned for a record in another workspace, so ids cannot be probed.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        409: { description: 'A conflict. Carries `currentVersion` so the client can refetch and merge.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        422: { description: 'The body failed validation. Carries per-field messages.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    }

    // Path parameters, from the directory names.
    const params = [...apiPath.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }))

    const queryShape = schemas.Query
    if (method === 'GET' && queryShape) {
      for (const [name, schema] of Object.entries(queryShape.properties)) {
        params.push({ name, in: 'query', required: (queryShape.required ?? []).includes(name), schema })
      }
    }
    if (params.length) operation.parameters = params

    if (method !== 'GET' && method !== 'DELETE') {
      const bodyShape = schemas.Body ?? schemas.Patch ?? schemas.Section
      if (bodyShape) {
        operation.requestBody = { required: true, content: { 'application/json': { schema: bodyShape } } }
      }
    }

    paths[apiPath][method.toLowerCase()] = operation
    operations += 1
  }
}

const document = {
  openapi: '3.1.0',
  info: {
    title: 'Apragya AI API',
    version: '1.0.0',
    description: [
      'Generated from the route files by `npm run openapi`. It is not maintained by hand,',
      'and `tests/openapi.test.ts` fails if a route exists that is not described here.',
      '',
      'Conventions that hold everywhere:',
      '',
      '- The workspace comes from the session, never from the request. No endpoint takes a tenant id.',
      '- A record in another workspace answers 404, not 403, so ids cannot be probed.',
      '- Money crosses the boundary as a decimal STRING with an explicit currency.',
      '- Mutations on versioned records take the version last read and answer 409 with `currentVersion`.',
      '- Unknown fields are rejected rather than ignored.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'Same origin as the application.' }],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'apragya_session',
        description: 'Opaque, httpOnly. Set by the sign-in endpoints; never readable by scripts.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              fields: { type: 'object', additionalProperties: { type: 'string' }, description: 'Per-field messages for form display.' },
              currentVersion: { type: 'integer', description: 'On 409, the version to refetch against.' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
  },
  paths,
}

mkdirSync('docs/api', { recursive: true })
writeFileSync('docs/api/openapi.json', `${JSON.stringify(document, null, 2)}\n`)
console.log(`openapi: ${files.length} route files, ${operations} operations -> docs/api/openapi.json`)
