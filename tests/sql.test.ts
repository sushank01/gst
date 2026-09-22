/**
 * Static checks over every SQL literal in the server.
 *
 * These caught three real bugs: a padded parameter list PostgreSQL rejects with
 * "could not determine data type of parameter $1", and two queries left
 * referencing a placeholder after an edit removed its argument. All three only
 * fail on the branch that builds them, so a type checker never sees them and a
 * test only catches them if it exercises that exact path.
 */
import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

/** Splits a parameter array's source on commas that are not inside a nested term. */
function topLevelArgs(src: string): string[] {
  const args: string[] = []
  let depth = 0
  let current = ''
  let quote: string | null = null
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quote) {
      if (ch === '\\') {
        current += ch + src[i + 1]
        i += 1
        continue
      }
      if (ch === quote) quote = null
      current += ch
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      current += ch
      continue
    }
    if ('([{'.includes(ch)) depth += 1
    if (')]}'.includes(ch)) depth -= 1
    if (ch === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) args.push(current.trim())
  return args
}

type Call = { file: string; line: number; sql: string; params: number }

/**
 * Reads the argument list of a call whose `(` is at `open`, by balanced scan.
 *
 * A regex cannot do this. The first version of this file used a lazy
 * `\[([\s\S]*?)\]` to grab the parameter array, and it stopped at the first
 * `]` followed by `)` — which is inside `JSON.stringify(x ?? [])`, and again
 * at the `[]` of an `as never[]` cast. It therefore reported parameter counts
 * that were simply wrong, and a static check that cries wolf gets switched
 * off. Balanced scanning is the only thing that reads code correctly.
 */
function callArguments(source: string, open: number): string | null {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (quote) {
      if (ch === '\\') {
        i += 1
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if ('([{'.includes(ch)) depth += 1
    else if (')]}'.includes(ch)) {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return null
}

function queryCalls(): Call[] {
  const calls: Call[] = []
  for (const file of walk('src/server')) {
    const text = readFileSync(file, 'utf8')
    // The call site only — the arguments are read by balanced scan below.
    const re = /\.query(?:<[\s\S]*?>)?\(/g
    let match: RegExpExecArray | null
    while ((match = re.exec(text))) {
      const open = match.index + match[0].length - 1
      const args = callArguments(text, open)
      if (args === null) continue

      const parts = topLevelArgs(args)
      if (parts.length < 2) continue
      const sql = parts[0].trim()
      if (!/^[`']/.test(sql)) continue
      // A template with an interpolation builds its placeholders dynamically;
      // those shapes are covered by the tests that exercise them.
      if (/\$\{/.test(sql)) continue

      // Strip a trailing `as never[]`-style cast before counting.
      const paramsSource = parts[1].replace(/\s+as\s+[\w[\]<>| ]+$/, '').trim()
      if (!paramsSource.startsWith('[')) continue
      const inner = callArguments(paramsSource, 0)
      if (inner === null) continue

      calls.push({
        file,
        line: text.slice(0, match.index).split('\n').length,
        sql,
        params: topLevelArgs(inner).length,
      })
    }
  }
  return calls
}

test('the server has SQL to check', () => {
  assert.ok(queryCalls().length > 100, 'expected the scan to find the query calls')
})

test('every parameter a query passes is referenced by a placeholder', () => {
  const bad: string[] = []
  for (const call of queryCalls()) {
    const used = new Set([...call.sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))
    for (let i = 1; i <= call.params; i += 1) {
      if (!used.has(i)) bad.push(`${call.file}:${call.line} passes ${call.params} params but never uses $${i}`)
    }
  }
  assert.deepEqual(bad, [])
})

test('every placeholder a query references has a parameter', () => {
  const bad: string[] = []
  for (const call of queryCalls()) {
    const used = [...call.sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]))
    const max = used.length ? Math.max(...used) : 0
    if (max > call.params) bad.push(`${call.file}:${call.line} references $${max} but passes only ${call.params}`)
  }
  assert.deepEqual(bad, [])
})

test('no query interpolates a value into its text', () => {
  /*
   * The invariant is not "never interpolate" — a variable-length `in (...)` or
   * an optional `where` fragment has to be composed. It is that a hole may only
   * ever be a PLACEHOLDER INDEX or a CLAUSE built by joining fragments:
   *
   *   `... where id = $${params.length}`   the hole follows a literal $
   *   `... where ${where}`                 where = filters.join(' and ')
   *
   * Anything else — `where status = '${options.status}'` — puts caller data
   * into the statement text, which is how injection happens.
   */
  const bad: string[] = []
  for (const file of walk('src/server')) {
    const text = readFileSync(file, 'utf8')
    // Names in this file that are provably composed from a fragment list.
    const composed = new Set(
      [...text.matchAll(/(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*[\w.[\]]+\.join\(/g)].map((m) => m[1]),
    )
    /*
     * SQL fragment constants: any `const name = '...'` or backticked literal
     * with no holes of its own, at any indentation. These are part of the
     * statement an author wrote, not data — the point of the rule is that
     * nothing a CALLER supplies reaches the text, and a literal cannot carry
     * caller data however it is spelled.
     */
    const constants = new Set(
      /*
       * A literal may contain `$1` — those are placeholders, which is the
       * whole point. What disqualifies it is `${`, an interpolation, because
       * that is where caller data could enter.
       */
      [...text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:`(?:[^`$]|\$(?!\{))*`|'[^']*')/g)].map((m) => m[1]),
    )
    const re = /query(?:<[^(]*?>)?\(\s*`([^`]*)`/g
    let match: RegExpExecArray | null
    while ((match = re.exec(text))) {
      const sql = match[1]
      const line = text.slice(0, match.index).split('\n').length
      for (const hole of sql.matchAll(/\$\{([^}]*)\}/g)) {
        const expression = hole[1].trim()
        const isPlaceholderIndex = hole.index > 0 && sql[hole.index - 1] === '$'
        if (isPlaceholderIndex) continue
        if (/^\w+$/.test(expression) && (composed.has(expression) || constants.has(expression))) continue
        // `x.join(', ')` inline is the same composition, written in place.
        if (/^[\w.[\]]+\.join\(/.test(expression)) continue
        /*
         * A ternary whose BOTH arms are string literals — `cond ? 'a' : 'b'`.
         * Whatever the condition, the text that lands in the statement is one
         * of two fragments the author wrote, so no caller data can reach it.
         * This is how an optional `and archived_at is null`, or a choice of
         * `order by`, is legitimately expressed.
         */
        if (/^[^?]+\?\s*(?:'[^']*'|`[^`$]*`)\s*:\s*(?:'[^']*'|`[^`$]*`)$/.test(expression)) continue
        bad.push(`${file}:${line} interpolates \${${expression}} into SQL text`)
      }
    }
  }
  assert.deepEqual(bad, [])
})

test('a composed clause only ever receives placeholder fragments', () => {
  /*
   * The other half of the rule above: the fragments pushed into a clause list
   * must themselves be placeholder-only. A single `filters.push(\`status =
   * '${value}'\`)` would defeat the whole scheme, and it would pass the check
   * above because the join is still a join.
   */
  const bad: string[] = []
  for (const file of walk('src/server')) {
    const text = readFileSync(file, 'utf8')
    // Every backtick argument to a clause-list push, however it is composed.
    for (const push of text.matchAll(/\b(?:filters|clauses|conditions|sets|fragments|predicates)\.push\(([^\n]*)/g)) {
      const line = text.slice(0, push.index).split('\n').length
      for (const literal of push[1].matchAll(/`([^`]*)`/g)) {
        const fragment = literal[1]
        for (const hole of fragment.matchAll(/\$\{([^}]*)\}/g)) {
          if (hole.index > 0 && fragment[hole.index - 1] === '$') continue
          bad.push(`${file}:${line} pushes a clause containing \${${hole[1].trim()}}`)
        }
      }
    }
  }
  assert.deepEqual(bad, [])
})

test('no query picks its text with a ternary', () => {
  /*
   * `db.query(cond ? A : B, cond ? paramsA : paramsB)` is a shape I got wrong
   * three times: the branches take different parameters, a list padded to fit
   * both leaves a placeholder unused, and PostgreSQL rejects that only on the
   * branch that builds it — so the bug hides until exactly that path runs.
   *
   * The checks above cannot see inside a ternary, because neither branch is
   * the literal argument. Rather than teach them to, this refuses the shape:
   * two `query` calls in an if/else are as short to write and cannot be wrong.
   */
  const bad: string[] = []
  for (const file of walk('src/server')) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/query(?:<[^(]*?>)?\(\s*\n?\s*[\w.!?]+\s*(?:\.length\s*)?\?/g)) {
      bad.push(`${file}:${text.slice(0, match.index).split('\n').length} chooses its SQL with a ternary`)
    }
  }
  assert.deepEqual(bad, [], 'use an if/else with one query call in each branch')
})

