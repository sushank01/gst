/** Quoted CSV parser: preserves embedded commas/newlines and rejects malformed rows. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false, closed = false
  const input = text.replace(/^\uFEFF/, '')
  const pushCell = () => { row.push(cell); cell = ''; closed = false }
  const pushRow = () => { pushCell(); if (row.some((value) => value.trim())) rows.push(row); row = [] }
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') { quoted = false; closed = true }
      else cell += char
    } else if (char === ',') pushCell()
    else if (char === '\n' || char === '\r') { if (char === '\r' && input[i + 1] === '\n') i++; pushRow() }
    else if (char === '"' && !cell && !closed) quoted = true
    else if (closed || char === '"') throw new Error('Invalid CSV quoting.')
    else cell += char
  }
  if (quoted) throw new Error('Unclosed quoted CSV field.')
  if (cell || row.length || closed) pushRow()
  if (rows.some((cells) => cells.length !== rows[0].length)) throw new Error('CSV rows must have the same number of columns as the header.')
  return rows
}

/** Spreadsheet-safe export: formulas are always exported as text. */
export function csvCell(value: string): string {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function recordsCsv(records: readonly { title: string; fields: Record<string, string> }[]): string {
  const columns = [...new Set(records.flatMap((item) => Object.keys(item.fields)))].filter((key) => key !== 'Name')
  return [['Name', ...columns], ...records.map((item) => [item.title, ...columns.map((key) => item.fields[key] ?? '')])]
    .map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
