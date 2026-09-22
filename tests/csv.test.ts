import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, recordsCsv, csvCell } from '../src/lib/csv.ts'

test('export/import preserves commas, quotes, multiline notes, Unicode and no duplicate Name header', () => {
  const csv = recordsCsv([{ title: 'Acme, "India"', fields: { Name: 'Acme, "India"', Notes: 'Line 1\nLine 2 ₹' } }])
  assert.deepEqual(parseCsv(csv), [['Name','Notes'], ['Acme, "India"','Line 1\nLine 2 ₹']])
})
test('empty, BOM, CRLF and empty last cell', () => {
  assert.deepEqual(parseCsv(''), [])
  assert.deepEqual(parseCsv('\uFEFFName,Notes\r\nA,\r\n'), [['Name','Notes'],['A','']])
})
test('reject malformed quotes and mismatched columns before importing any records', () => {
  for (const csv of ['Name,Notes\nA', 'Name\n"Unclosed', 'Name\n"a"b']) assert.throws(() => parseCsv(csv))
})
test('formula-like spreadsheet cells are inert text', () => {
  for (const value of ['=HYPERLINK("url")', '+cmd', '-cmd', '@SUM(1)', '  =1']) assert.ok(csvCell(value).startsWith('"\''))
})
