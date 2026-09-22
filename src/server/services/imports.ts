import { unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { CsvError, decimal, isoDate, optional, parseCsv, required, stage, toCsv, type Staged } from '../io/csv.ts'
import { createAsset, listAssets } from './assets.ts'
import { createCustomer, listCustomers } from './customers.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Bulk import and export.
 *
 * An import is a two-step operation on purpose: STAGE reads the whole file,
 * validates every row and reports every problem; COMMIT writes only if the
 * caller asked to proceed. Writing as we parse would leave a partly applied
 * import when row eighty is wrong, and the person then has to work out which
 * half landed.
 *
 * Nothing here trusts the file. Dates must be unambiguous, numbers must be
 * numbers, and exports neutralise anything a spreadsheet would execute.
 */

export type ImportKind = 'customers' | 'assets'

export type StageResult = {
  kind: ImportKind
  total: number
  ready: number
  problems: { line: number; message: string }[]
}

type CustomerImport = {
  name: string
  code: string | null
  currency: string
  creditLimit: string | null
  paymentTermsDays: number
  taxId: string | null
}

type AssetImport = {
  name: string
  tag: string | null
  assetType: string | null
  serialNumber: string | null
  location: string | null
  acquiredOn: string | null
  purchaseCost: string | null
  currency: string | null
  warrantyExpiresOn: string | null
}

function stageCustomers(text: string): Staged<CustomerImport> {
  return stage(parseCsv(text), (row) => ({
    name: required(row, 'Name'),
    code: optional(row, 'Code'),
    currency: (() => {
      const value = required(row, 'Currency').toUpperCase()
      if (!/^[A-Z]{3}$/.test(value)) throw new Error(`"Currency" must be a three-letter code: ${value}`)
      return value
    })(),
    creditLimit: decimal(row, 'Credit limit', { allowBlank: true }),
    paymentTermsDays: (() => {
      const value = optional(row, 'Payment terms (days)')
      if (!value) return 0
      if (!/^\d+$/.test(value)) throw new Error(`"Payment terms (days)" must be a whole number: ${value}`)
      return Number(value)
    })(),
    taxId: optional(row, 'Tax ID'),
  }))
}

function stageAssets(text: string): Staged<AssetImport> {
  return stage(parseCsv(text), (row) => ({
    name: required(row, 'Name'),
    tag: optional(row, 'Tag'),
    assetType: optional(row, 'Type'),
    serialNumber: optional(row, 'Serial number'),
    location: optional(row, 'Location'),
    acquiredOn: isoDate(row, 'Acquired on', { allowBlank: true }),
    purchaseCost: decimal(row, 'Purchase cost', { allowBlank: true }),
    currency: optional(row, 'Currency')?.toUpperCase() ?? null,
    warrantyExpiresOn: isoDate(row, 'Warranty expires on', { allowBlank: true }),
  }))
}

/** Parses and validates without writing anything. */
export function stageImport(kind: ImportKind, text: string): StageResult {
  let staged: Staged<CustomerImport | AssetImport>
  try {
    staged = kind === 'customers' ? stageCustomers(text) : stageAssets(text)
  } catch (error) {
    // A file that will not parse at all is one problem, not a hundred.
    if (error instanceof CsvError) {
      return { kind, total: 0, ready: 0, problems: [{ line: error.line, message: error.message }] }
    }
    throw error
  }
  return {
    kind,
    total: staged.total,
    ready: staged.valid.length,
    problems: staged.problems.map((problem) => ({ line: problem.line, message: problem.message })),
  }
}

export type CommitResult = StageResult & { created: number; failed: { line: number; message: string }[] }

/**
 * Validates, then writes.
 *
 * Refuses outright when any row is invalid, unless `partial` is set — which a
 * caller must choose deliberately, having seen the problems from staging. The
 * default is all-or-nothing because that is the behaviour somebody expects
 * when they upload a spreadsheet and see no warning.
 *
 * Each row is written through the ordinary service, so an import cannot
 * bypass a rule a form obeys: duplicate codes, unknown currencies and tag
 * collisions are refused here exactly as they would be one at a time.
 */
export async function commitImport(
  ctx: TenantContext,
  kind: ImportKind,
  text: string,
  options: { partial?: boolean } = {},
): Promise<CommitResult> {
  ctx.require('record.create')

  const staged = kind === 'customers' ? stageCustomers(text) : stageAssets(text)
  const problems = staged.problems.map((problem) => ({ line: problem.line, message: problem.message }))

  if (problems.length && !options.partial) {
    throw unprocessable(
      'import_has_problems',
      `${problems.length} of ${staged.total} row(s) cannot be imported. Fix them, or ask for a partial import.`,
      { problems },
    )
  }

  const failed: { line: number; message: string }[] = []
  let created = 0

  for (const [index, row] of staged.valid.entries()) {
    const line = index + 2
    try {
      if (kind === 'customers') {
        const customer = row as CustomerImport
        await createCustomer(ctx, {
          name: customer.name,
          currency: customer.currency,
          code: customer.code,
          creditLimit: customer.creditLimit,
          paymentTermsDays: customer.paymentTermsDays,
          taxId: customer.taxId,
        })
      } else {
        const asset = row as AssetImport
        await createAsset(ctx, {
          name: asset.name,
          tag: asset.tag ?? undefined,
          assetType: asset.assetType,
          serialNumber: asset.serialNumber,
          location: asset.location,
          acquiredOn: asset.acquiredOn,
          purchaseCost: asset.purchaseCost,
          currency: asset.currency,
          warrantyExpiresOn: asset.warrantyExpiresOn,
        })
      }
      created += 1
    } catch (error) {
      // A row the service refused — a duplicate code, a tag already in use.
      // Reported against its line so it can be found in the file.
      failed.push({ line, message: error instanceof Error ? error.message : String(error) })
    }
  }

  await recordAudit(ctx.db, ctx, {
    action: `import.${kind}`,
    resource: 'import',
    detail: { total: staged.total, created, rejected: problems.length, failed: failed.length },
  })

  return { kind, total: staged.total, ready: staged.valid.length, problems, created, failed }
}

/** Renders the current records as CSV, with formulas neutralised. */
export async function exportCsv(ctx: TenantContext, kind: ImportKind): Promise<string> {
  ctx.require('record.read')

  if (kind === 'customers') {
    const { rows } = await listCustomers(ctx, { limit: 200 })
    return toCsv(rows, [
      { header: 'Name', value: (row) => row.name },
      { header: 'Code', value: (row) => row.code },
      { header: 'Currency', value: (row) => row.currency },
      { header: 'Credit limit', value: (row) => row.creditLimit },
      { header: 'Payment terms (days)', value: (row) => row.paymentTermsDays },
      { header: 'Tax ID', value: (row) => row.taxId },
      { header: 'Active', value: (row) => (row.active ? 'yes' : 'no') },
    ])
  }

  const { rows } = await listAssets(ctx, { limit: 200 })
  return toCsv(rows, [
    { header: 'Tag', value: (row) => row.tag },
    { header: 'Name', value: (row) => row.name },
    { header: 'Type', value: (row) => row.assetType },
    { header: 'Serial number', value: (row) => row.serialNumber },
    { header: 'Status', value: (row) => row.status },
    { header: 'Location', value: (row) => row.location },
    { header: 'Acquired on', value: (row) => row.acquiredOn },
    { header: 'Purchase cost', value: (row) => row.purchaseCost },
    { header: 'Currency', value: (row) => row.currency },
    { header: 'Warranty expires on', value: (row) => row.warrantyExpiresOn },
    { header: 'Holder', value: (row) => row.holder?.label ?? row.holder?.userId ?? '' },
  ])
}
