/**
 * CSV on the server.
 *
 * The browser has its own parser for reading a file the user picked; this one
 * exists because an import that is validated only in the browser is validated
 * by whoever holds the browser. Every row that reaches the database has passed
 * through here.
 *
 * Two properties carry weight.
 *
 * Formula injection: a cell beginning `=`, `+`, `-`, `@` or a control
 * character is executed by Excel and Sheets when the export is opened. Exports
 * prefix those with an apostrophe, so a customer named `=cmd|...` is text
 * rather than a command on somebody's machine.
 *
 * Staging: an import is parsed and validated in full BEFORE anything is
 * written. A partly applied import is worse than a refused one, because the
 * person now has to work out which half landed.
 */

export type CsvRow = Record<string, string>

export class CsvError extends Error {
  readonly line: number
  constructor(message: string, line: number) {
    super(message)
    this.name = 'CsvError'
    this.line = line
  }
}

/**
 * Parses CSV into rows keyed by header.
 *
 * Quoted fields keep embedded commas and newlines. A row whose column count
 * differs from the header is an error rather than being padded: padding turns
 * a shifted column into silently wrong data.
 */
export function parseCsv(text: string): CsvRow[] {
  const input = text.replace(/^\uFEFF/, '')
  const grid: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let closed = false
  let line = 1

  const pushCell = () => {
    row.push(cell)
    cell = ''
    closed = false
  }
  const pushRow = () => {
    pushCell()
    if (row.some((value) => value.trim())) grid.push(row)
    row = []
  }

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
        closed = true
      } else {
        if (char === '\n') line += 1
        cell += char
      }
      continue
    }
    if (char === ',') {
      pushCell()
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1
      line += 1
      pushRow()
    } else if (char === '"' && !cell && !closed) {
      quoted = true
    } else if (closed || char === '"') {
      throw new CsvError('A quoted field has text after its closing quote.', line)
    } else {
      cell += char
    }
  }
  if (quoted) throw new CsvError('A quoted field is never closed.', line)
  if (cell || row.length || closed) pushRow()

  if (!grid.length) throw new CsvError('The file is empty.', 1)
  const header = grid[0].map((name) => name.trim())
  if (new Set(header).size !== header.length) {
    throw new CsvError('Two columns share a heading, so their values cannot be told apart.', 1)
  }

  return grid.slice(1).map((cells, index) => {
    if (cells.length !== header.length) {
      throw new CsvError(
        `This row has ${cells.length} column(s) where the heading has ${header.length}.`,
        index + 2,
      )
    }
    return Object.fromEntries(header.map((name, at) => [name, cells[at].trim()]))
  })
}

/** Quotes a value, neutralising anything a spreadsheet would execute. */
export function csvCell(value: string): string {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

/** Renders rows to CSV with the given columns, in the given order. */
export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => string | number | null | undefined }[]): string {
  const lines = [columns.map((column) => csvCell(column.header)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(String(column.value(row) ?? ''))).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

export type RowProblem = { line: number; column?: string; message: string }

export type Staged<T> = {
  /** Rows that passed every check and are ready to write. */
  valid: T[]
  problems: RowProblem[]
  total: number
}

/**
 * Validates every row before any is written.
 *
 * `convert` returns the row to write, or throws with a message. Collecting all
 * the problems rather than stopping at the first means somebody fixing a
 * hundred-row file learns about every mistake in one pass instead of one per
 * upload.
 */
export function stage<T>(rows: CsvRow[], convert: (row: CsvRow, line: number) => T): Staged<T> {
  const valid: T[] = []
  const problems: RowProblem[] = []

  rows.forEach((row, index) => {
    // +2: one for the header, one because people count from 1.
    const line = index + 2
    try {
      valid.push(convert(row, line))
    } catch (error) {
      problems.push({ line, message: error instanceof Error ? error.message : String(error) })
    }
  })
  return { valid, problems, total: rows.length }
}

/** Reads a required column, or explains which one is missing. */
export function required(row: CsvRow, column: string): string {
  const value = row[column]
  if (value === undefined) throw new Error(`There is no "${column}" column.`)
  if (!value.trim()) throw new Error(`"${column}" is empty.`)
  return value.trim()
}

export function optional(row: CsvRow, column: string): string | null {
  const value = row[column]
  return value?.trim() ? value.trim() : null
}

/** Reads a decimal amount, refusing anything a currency field must not hold. */
export function decimal(row: CsvRow, column: string, { allowBlank = false } = {}): string | null {
  const value = row[column]?.trim()
  if (!value) {
    if (allowBlank) return null
    throw new Error(`"${column}" is empty.`)
  }
  // Grouping separators are how spreadsheets export numbers; strip them rather
  // than rejecting a file that looks correct to the person who made it.
  const cleaned = value.replace(/[\s,]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) throw new Error(`"${column}" is not a number: ${value}`)
  return cleaned
}

/** Reads an ISO date, refusing ambiguous regional formats outright. */
export function isoDate(row: CsvRow, column: string, { allowBlank = false } = {}): string | null {
  const value = row[column]?.trim()
  if (!value) {
    if (allowBlank) return null
    throw new Error(`"${column}" is empty.`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    /*
     * 03/04/2026 is two different days depending on where the file came from,
     * and guessing produces records that are wrong by months. Refusing is the
     * only honest option.
     */
    throw new Error(`"${column}" must be a YYYY-MM-DD date: ${value}`)
  }
  if (Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) throw new Error(`"${column}" is not a real date: ${value}`)
  return value
}
