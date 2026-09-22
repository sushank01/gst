'use client'

import { useCallback, useMemo } from 'react'
import { ApiClientError, api } from '../../../lib/api.ts'
import { useAuth } from '../../../lib/auth.tsx'
import { useResource, useMutation } from '../../../lib/useResource.ts'
import { formatAmount } from '../../../lib/useWorkspaceSummary.ts'

/**
 * Sales & POS, from the server.
 *
 * Everything on these screens used to come from one browser object: the
 * documents, the till, the tax slabs and the thresholds the drawer is meant to
 * enforce. Four things change here.
 *
 *  * Money is a decimal STRING with the currency the server computed it in,
 *    end to end. `Number(total)` on an invoice is how 0.1 + 0.2 reaches a
 *    ledger, so the arithmetic below is done on integer minor units.
 *  * A count beside a list is the server's count for the filter, never the
 *    length of the page that loaded.
 *  * Every fetch state is represented, because an empty list standing in for a
 *    failed request is how "the server is down" reads as "you have no orders".
 *  * A write carries the version — or, for the two policy tables that have no
 *    version column, the timestamp — it read, so a stale save is a conflict
 *    somebody is told about.
 */

/* ------------------------------ money maths ------------------------------- */

const SCALE = 4n
const POW = 10n ** SCALE

/** A decimal string as integer minor units. Returns null for anything else. */
export function toMinor(amount: string | null | undefined): bigint | null {
  const text = String(amount ?? '').trim()
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const negative = text.startsWith('-')
  const [whole, fraction = ''] = text.replace('-', '').split('.')
  const padded = (fraction + '0'.repeat(Number(SCALE))).slice(0, Number(SCALE))
  const minor = BigInt(whole) * POW + BigInt(padded || '0')
  return negative ? -minor : minor
}

export function toDecimal(minor: bigint): string {
  const negative = minor < 0n
  const abs = negative ? -minor : minor
  return `${negative ? '-' : ''}${abs / POW}.${(abs % POW).toString().padStart(Number(SCALE), '0')}`
}

/** Exact sum of decimal strings. Anything unparseable is left out, not guessed at. */
export function addAmounts(...amounts: (string | null | undefined)[]): string {
  let total = 0n
  for (const amount of amounts) total += toMinor(amount) ?? 0n
  return toDecimal(total)
}

/** Truncating division, for an average of amounts the server already summed. */
export function divideAmount(amount: string, by: number): string | null {
  const minor = toMinor(amount)
  if (minor === null || by <= 0) return null
  return toDecimal(minor / BigInt(by))
}

/** Compares two decimal strings without going anywhere near a float. */
export function compareAmounts(left: string, right: string): number {
  const a = toMinor(left) ?? 0n
  const b = toMinor(right) ?? 0n
  return a < b ? -1 : a > b ? 1 : 0
}

/** The largest of several decimal strings, for scaling a set of bars. */
export function maxAmount(...amounts: string[]): string {
  let largest = 0n
  for (const amount of amounts) {
    const minor = toMinor(amount) ?? 0n
    if (minor > largest) largest = minor
  }
  return toDecimal(largest)
}

/**
 * A bar's share of the largest bar, as a whole percentage.
 *
 * Geometry rather than money: the ratio is taken in minor units and only the
 * resulting percentage becomes a number, so no amount is ever put through a
 * float on its way to the screen.
 */
export function barPercent(amount: string, largest: string): number {
  const value = toMinor(amount) ?? 0n
  const max = toMinor(largest) ?? 0n
  if (max <= 0n) return 0
  return Number(((value < 0n ? -value : value) * 100n) / max)
}

/** True when a string is an amount this code can work with exactly. */
export const isAmount = (value: string | null | undefined) => toMinor(value) !== null

/** Negation on the string, so a difference never needs a unary minus on a float. */
export function negateAmount(amount: string): string {
  const minor = toMinor(amount)
  return minor === null ? '0.0000' : toDecimal(-minor)
}

export function absAmount(amount: string): string {
  const minor = toMinor(amount) ?? 0n
  return toDecimal(minor < 0n ? -minor : minor)
}

/** `USD 1,234.50`. Never renders a currency the server did not state. */
export function money(amount: string | null | undefined, currency: string | null): string {
  if (amount === null || amount === undefined || toMinor(amount) === null) return 'Not available'
  return formatAmount(amount, currency)
}

/* --------------------------- kinds and statuses --------------------------- */

/** What the screens call a document, and what the server's check constraint does. */
const KIND_TO_SERVER: Record<string, string> = { credit: 'credit_note' }

export const serverKind = (kind: string) => KIND_TO_SERVER[kind] ?? kind

/**
 * Statuses are display strings on screen and free lowercase text in the
 * column. One mapping, used by both the filter and the create body — the
 * subscription sweep matches `status = 'active'` exactly, so two spellings
 * mean the sweep silently bills nothing.
 */
export const serverStatus = (display: string) => display.trim().toLowerCase().replace(/\s+/g, '_')

export function displayStatus(status: string): string {
  const words = status.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The "show everything" entry every one of these filter lists starts with. */
export const isAllStatuses = (value: string) => /^all\b/i.test(value.trim())

/* ------------------------------- workspace -------------------------------- */

/**
 * The workspace's own currency.
 *
 * The till used to be hard-coded to USD and labelled "Org default", which was
 * true only by coincidence. Null until the session has loaded, so a screen can
 * wait rather than print a guess.
 */
export function useWorkspaceCurrency(): string | null {
  const { tenants, activeTenantId } = useAuth()
  return tenants.find((tenant) => tenant.id === activeTenantId)?.currency ?? null
}

/* ------------------------------- documents -------------------------------- */

export type SalesDocumentRow = {
  id: string
  kind: string
  reference: string
  customerId: string | null
  customerName: string | null
  status: string
  currency: string
  grandTotal: string
  paidTotal: string
  postedAt: string | null
  cancelledAt: string | null
  version: number
}

export type StatusRollup = { status: string; count: number; total: string; currencies: string[] }

type DocumentsResponse = { documents: SalesDocumentRow[]; total: number; byStatus: StatusRollup[] }

export type DocumentFilters = { kind: string; status?: string; q?: string; limit?: number; offset?: number }

export function useSalesDocuments(filters: DocumentFilters) {
  const kind = serverKind(filters.kind)
  const status = filters.status && !isAllStatuses(filters.status) ? serverStatus(filters.status) : undefined
  const query = filters.q?.trim() || undefined
  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0

  const resource = useResource<DocumentsResponse>(
    `sales-documents:${kind}:${status ?? ''}:${query ?? ''}:${limit}:${offset}`,
    useCallback(
      (signal) => api.get<DocumentsResponse>('/sales/documents', { kind, status, q: query, limit, offset }, signal),
      [kind, status, query, limit, offset],
    ),
  )

  const [createDocument, createState] = useMutation(
    async (input: {
      customerId: string
      currency: string
      status: string
      description: string
      total: string
      notes?: string
    }) => {
      const created = await api.post<{ document: SalesDocumentRow }>('/sales/documents', {
        kind,
        customerId: input.customerId,
        currency: input.currency,
        status: serverStatus(input.status),
        notes: input.notes || undefined,
        // The server computes every total from the lines and refuses an empty
        // document, so a dialog that collects one figure states it as one line.
        lines: [{ description: input.description, quantity: '1', unitPrice: input.total }],
      })
      resource.refetch()
      return created.document
    },
  )

  const [cancelDocument, cancelState] = useMutation(async (id: string, version: number) => {
    await api.delete(`/sales/documents/${id}`, { version })
    resource.refetch()
  })

  return useMemo(
    () => ({
      documents: resource.data?.documents ?? [],
      /** Rows matching the filter on the server, not the page length. */
      total: resource.data?.total ?? 0,
      /** Per-status counts and values for the whole kind, ignoring the chip. */
      byStatus: resource.data?.byStatus ?? [],
      loaded: resource.data !== undefined,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
      createDocument,
      cancelDocument,
      writing: createState.pending || cancelState.pending,
      writeError: createState.error ?? cancelState.error,
      fieldErrors: createState.fieldErrors,
    }),
    [resource, createDocument, cancelDocument, createState, cancelState],
  )
}

/** Total value of a rollup, and the currencies it spans — never summed across them. */
export function rollupValue(rollup: StatusRollup[], statuses?: string[]): { total: string; currencies: string[] } {
  const rows = statuses ? rollup.filter((row) => statuses.includes(row.status)) : rollup
  const currencies = [...new Set(rows.flatMap((row) => row.currencies))]
  return { total: addAmounts(...rows.map((row) => row.total)), currencies }
}

export const rollupCount = (rollup: StatusRollup[], statuses?: string[]) =>
  (statuses ? rollup.filter((row) => statuses.includes(row.status)) : rollup).reduce((sum, row) => sum + row.count, 0)

/* ------------------------------- customers -------------------------------- */

export type CustomerRow = {
  id: string
  name: string
  email: string | null
  code: string | null
  currency: string
  taxId: string | null
  groupId: string | null
  groupName: string | null
  active: boolean
  version: number
}

type CustomersResponse = { customers: CustomerRow[]; total: number }

export function useSalesCustomers(options: { q?: string; activeOnly?: boolean; limit?: number; offset?: number } = {}) {
  const query = options.q?.trim() || undefined
  const activeOnly = options.activeOnly ?? false
  const limit = options.limit ?? 50
  const offset = options.offset ?? 0

  const resource = useResource<CustomersResponse>(
    `sales-customers:${query ?? ''}:${activeOnly}:${limit}:${offset}`,
    useCallback(
      (signal) =>
        api.get<CustomersResponse>(
          '/sales/customers',
          { q: query, activeOnly: activeOnly || undefined, limit, offset },
          signal,
        ),
      [query, activeOnly, limit, offset],
    ),
  )

  const [createCustomer, createState] = useMutation(
    async (input: { name: string; currency: string; email?: string; taxId?: string; groupId?: string }) => {
      const created = await api.post<{ customer: CustomerRow }>('/sales/customers', {
        name: input.name,
        currency: input.currency,
        email: input.email || undefined,
        taxId: input.taxId || undefined,
        groupId: input.groupId || undefined,
      })
      resource.refetch()
      return created.customer
    },
  )

  return useMemo(
    () => ({
      customers: resource.data?.customers ?? [],
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
      createCustomer,
      writing: createState.pending,
      writeError: createState.error,
      fieldErrors: createState.fieldErrors,
    }),
    [resource, createCustomer, createState],
  )
}

/* --------------------------------- lists ---------------------------------- */

export type CustomerGroup = { id: string; name: string; discountPercent: string; customers: number }
export type TaxComponent = { name: string; percent: string }
export type TaxCategory = {
  id: string
  name: string
  ratePercent: string
  withinRegion: TaxComponent[]
  crossRegion: TaxComponent[]
}
export type LoyaltyProgramme = {
  id: string
  name: string
  pointsPerUnit: string
  pointValue: string
  currency: string
  active: boolean
}

/** The three master-data lists behave identically: read, create, archive. */
function useMasterList<T, Body>(key: string, path: string, unwrap: (body: Body) => T[]) {
  const resource = useResource<Body>(
    key,
    useCallback((signal) => api.get<Body>(path, undefined, signal), [path]),
  )
  const [create, createState] = useMutation(async (body: Record<string, unknown>) => {
    const created = await api.post(path, body)
    resource.refetch()
    return created
  })
  const [remove, removeState] = useMutation(async (id: string) => {
    await api.delete(`${path}/${id}`)
    resource.refetch()
  })

  return useMemo(
    () => ({
      rows: resource.data ? unwrap(resource.data) : [],
      loaded: resource.data !== undefined,
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
      create,
      remove,
      writing: createState.pending || removeState.pending,
      writeError: createState.error ?? removeState.error,
      fieldErrors: createState.fieldErrors,
    }),
    [resource, unwrap, create, remove, createState, removeState],
  )
}

export const useCustomerGroups = () =>
  useMasterList('sales-customer-groups', '/sales/customer-groups', unwrapGroups)

export const useTaxCategories = () =>
  useMasterList('sales-tax-categories', '/sales/tax-categories', unwrapCategories)

export const useLoyaltyProgrammes = () =>
  useMasterList('sales-loyalty-programmes', '/sales/loyalty-programmes', unwrapProgrammes)

// Declared once at module scope so the memo inside the hook has a stable
// identity; an inline arrow would change on every render.
const unwrapGroups = (body: { groups: CustomerGroup[] }) => body.groups
const unwrapCategories = (body: { categories: TaxCategory[] }) => body.categories
const unwrapProgrammes = (body: { programmes: LoyaltyProgramme[] }) => body.programmes

/* --------------------------------- reports -------------------------------- */

export type Aging = {
  asOf: string
  currency: string | null
  buckets: { label: string; amount: string; count: number }[]
  total: string
}

export function useAging() {
  return useResource<Aging>(
    'sales-aging',
    useCallback((signal) => api.get<Aging>('/sales/reports/aging', undefined, signal), []),
  )
}

export type Debtor = { customerId: string; name: string; outstanding: string; overdue: string; currency: string }

export function useTopDebtors(limit = 5) {
  return useResource<{ debtors: Debtor[] }>(
    `sales-top-debtors:${limit}`,
    useCallback((signal) => api.get<{ debtors: Debtor[] }>('/sales/reports/top-debtors', { limit }, signal), [limit]),
  )
}

export type OrderToCash = {
  currency: string | null
  quoted: string
  ordered: string
  delivered: string
  invoiced: string
  collected: string
}

export function useOrderToCash(from: string, to: string) {
  return useResource<OrderToCash>(
    `sales-order-to-cash:${from}:${to}`,
    useCallback((signal) => api.get<OrderToCash>('/sales/reports/order-to-cash', { from, to }, signal), [from, to]),
  )
}

export type RevenueSeries = {
  from: string
  to: string
  bucket: 'day' | 'month'
  currency: string | null
  otherCurrencies: string[]
  total: string
  invoices: number
  buckets: { bucket: string; amount: string; invoices: number }[]
}

export function useRevenue(from: string, to: string, bucket: 'day' | 'month', enabled = true) {
  return useResource<RevenueSeries>(
    `sales-revenue:${from}:${to}:${bucket}`,
    useCallback(
      (signal) => api.get<RevenueSeries>('/sales/reports/revenue', { from, to, bucket }, signal),
      [from, to, bucket],
    ),
    { enabled },
  )
}

/* ---------------------------------- till ---------------------------------- */

export type ShiftTotals = { sales: number; gross: string; byMethod: Record<string, string>; expectedCash: string }

export type Shift = {
  id: string
  cashierUserId: string
  cashierName: string | null
  currency: string
  openingFloat: string
  openedAt: string
  closedAt: string | null
  countedCash: string | null
  expectedCash: string | null
  variance: string | null
  varianceReason: string | null
  version: number
  totals: ShiftTotals
}

type ShiftsResponse = { rows: Shift[]; total: number; cashiers: number }

export function useShifts(options: { open?: boolean; closed?: boolean; closedFrom?: string; limit?: number } = {}) {
  const key = JSON.stringify(options)
  const resource = useResource<ShiftsResponse>(
    `pos-shifts:${key}`,
    useCallback(
      (signal) =>
        api.get<ShiftsResponse>(
          '/pos/shifts',
          {
            open: options.open || undefined,
            closed: options.closed || undefined,
            closedFrom: options.closedFrom,
            limit: options.limit,
          },
          signal,
        ),
      [options.open, options.closed, options.closedFrom, options.limit],
    ),
  )

  const [openShift, openState] = useMutation(
    async (input: { currency: string; openingFloat: string; warehouse?: string }) => {
      const opened = await api.post<{ shift: Shift }>('/pos/shifts', {
        currency: input.currency,
        openingFloat: input.openingFloat,
        warehouse: input.warehouse || undefined,
      })
      resource.refetch()
      return opened.shift
    },
  )

  const [closeShift, closeState] = useMutation(
    async (id: string, input: { countedCash: string; reason?: string; version: number }) => {
      const closed = await api.post<{ shift: Shift }>(`/pos/shifts/${id}/close`, {
        countedCash: input.countedCash,
        reason: input.reason || undefined,
        version: input.version,
      })
      resource.refetch()
      return closed.shift
    },
  )

  return useMemo(
    () => ({
      shifts: resource.data?.rows ?? [],
      total: resource.data?.total ?? 0,
      /** Distinct cashiers matching the filter, counted by the server. */
      cashiers: resource.data?.cashiers ?? 0,
      loaded: resource.data !== undefined,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
      openShift,
      closeShift,
      writing: openState.pending || closeState.pending,
      writeError: openState.error ?? closeState.error,
    }),
    [resource, openShift, closeShift, openState, closeState],
  )
}

export type VarianceReport = {
  shifts: number
  cashiers: number
  worst: string
  average: string
  total: string
  band: 'green' | 'amber' | 'red'
  byBand: { green: number; amber: number; red: number }
  bands: { amberWorstShift: string; redWorstShift: string; amberAverage: string; redAverage: string }
  unexplained: number
}

export function useVarianceReport(from?: string) {
  return useResource<VarianceReport>(
    `pos-variance:${from ?? ''}`,
    useCallback((signal) => api.get<VarianceReport>('/pos/variance', { from }, signal), [from]),
  )
}

/* -------------------------------- policies -------------------------------- */

export type VariancePolicy = {
  reasonRequiredAbove: string
  amberWorstShift: string
  redWorstShift: string
  amberAverage: string
  redAverage: string
  updatedAt: string | null
}

export type MatchPolicy = {
  priceTolerancePercent: string
  priceAction: 'warn' | 'block' | 'ignore'
  quantityTolerancePercent: string
  quantityAction: 'warn' | 'block' | 'ignore'
  requireOrder: boolean
  requireDelivery: boolean
  updatedAt: string | null
}

/**
 * A policy table with no version column.
 *
 * `cash_variance_policies` and `match_policies` predate optimistic versioning,
 * so the write carries back the `updatedAt` it read and the UPDATE matches on
 * it. A second admin saving over the first still gets a conflict rather than
 * quietly replacing thresholds the first one chose.
 */
function usePolicy<T extends { updatedAt: string | null }, Body>(key: string, path: string, unwrap: (body: Body) => T) {
  const resource = useResource<Body>(
    key,
    useCallback((signal) => api.get<Body>(path, undefined, signal), [path]),
  )
  const [save, saveState] = useMutation(async (value: T) => {
    const saved = await api.put(path, value)
    resource.refetch()
    return saved
  })

  return useMemo(
    () => ({
      policy: resource.data ? unwrap(resource.data) : undefined,
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
      save,
      saving: saveState.pending,
      saveError: saveState.error,
      fieldErrors: saveState.fieldErrors,
    }),
    [resource, unwrap, save, saveState],
  )
}

const unwrapVariancePolicy = (body: { policy: VariancePolicy }) => body.policy
const unwrapMatchPolicy = (body: { policy: MatchPolicy }) => body.policy

export const useVariancePolicy = () => usePolicy('pos-variance-policy', '/pos/variance-policy', unwrapVariancePolicy)

export const useMatchPolicy = () => usePolicy('sales-match-policy', '/sales/match-policy', unwrapMatchPolicy)

/* -------------------------------- settings -------------------------------- */

export type SettingsDocument<T> = { appCode: string; section: string; value: T; version: number; updatedAt: string | null }

/**
 * One versioned settings section for this app.
 *
 * `version` is what makes a save safe: the server refuses a write whose
 * version is not the current one and answers with the version that is, so a
 * second admin sees a conflict instead of overwriting the first.
 */
export function useAppSettings<T extends Record<string, unknown>>(section: string) {
  const resource = useResource<{ settings: SettingsDocument<Partial<T>> }>(
    `pos-settings:${section}`,
    useCallback(
      (signal) => api.get<{ settings: SettingsDocument<Partial<T>> }>('/settings/POS', { section }, signal),
      [section],
    ),
  )

  const [save, saveState] = useMutation(async (value: T, summary: string) => {
    const saved = await api.put<{ settings: SettingsDocument<T> }>('/settings/POS', {
      section,
      value,
      version: resource.data?.settings.version ?? 0,
      summary,
    })
    resource.refetch()
    return saved.settings
  })

  return useMemo(
    () => ({
      /** Undefined until it loads: a pane must not edit a document it has not read. */
      value: resource.data?.settings.value,
      version: resource.data?.settings.version ?? 0,
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
      save,
      saving: saveState.pending,
      saveError: saveState.error,
    }),
    [resource, save, saveState],
  )
}

export type SettingsChange = {
  id: string
  version: number
  summary: string
  changedBy: string | null
  changedByName: string | null
  changedAt: string
  reverted: boolean
}

export function useSettingsChanges() {
  const resource = useResource<{ changes: SettingsChange[] }>(
    'pos-settings-changes',
    useCallback((signal) => api.get<{ changes: SettingsChange[] }>('/settings/POS/changes', undefined, signal), []),
  )
  const [revert, revertState] = useMutation(async (id: string) => {
    await api.post(`/settings/changes/${id}/revert`)
    resource.refetch()
  })

  return useMemo(
    () => ({
      changes: resource.data?.changes ?? [],
      loaded: resource.data !== undefined,
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
      revert,
      reverting: revertState.pending,
      revertError: revertState.error,
    }),
    [resource, revert, revertState],
  )
}

/* ----------------------------- rate contracts ----------------------------- */

export type RateContract = {
  id: string
  reference: string
  customerId: string | null
  groupId: string | null
  currency: string
  validFrom: string
  validTo: string | null
  priority: number
  status: string
  lines: { itemCode: string; description: string | null; unitPrice: string; minQuantity: string; discountPercent: string }[]
}

export function useRateContracts() {
  const resource = useResource<{ contracts: RateContract[] }>(
    'sales-rate-contracts',
    useCallback((signal) => api.get<{ contracts: RateContract[] }>('/sales/rate-contracts', undefined, signal), []),
  )
  const [createContract, createState] = useMutation(
    async (input: {
      reference: string
      currency: string
      validFrom: string
      validTo?: string
      customerId?: string
      lines: { itemCode: string; unitPrice: string; minQuantity?: string }[]
    }) => {
      const created = await api.post<{ contract: RateContract }>('/sales/rate-contracts', {
        reference: input.reference,
        currency: input.currency,
        validFrom: input.validFrom,
        validTo: input.validTo || undefined,
        customerId: input.customerId || undefined,
        lines: input.lines,
      })
      resource.refetch()
      return created.contract
    },
  )

  return useMemo(
    () => ({
      contracts: resource.data?.contracts ?? [],
      loaded: resource.data !== undefined,
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
      createContract,
      writing: createState.pending,
      writeError: createState.error,
      fieldErrors: createState.fieldErrors,
    }),
    [resource, createContract, createState],
  )
}

/* --------------------------------- returns -------------------------------- */

export type ReturnableLine = {
  lineId: string
  description: string
  billed: string
  returned: string
  returnable: string
  unitPrice: string
}

/** What is still returnable on an invoice, computed against earlier returns. */
export function useReturnableLines(invoiceId: string | null) {
  return useResource<{ lines: ReturnableLine[] }>(
    `sales-returnable:${invoiceId ?? ''}`,
    useCallback(
      (signal) => api.get<{ lines: ReturnableLine[] }>(`/sales/documents/${invoiceId}/returnable`, undefined, signal),
      [invoiceId],
    ),
    { enabled: Boolean(invoiceId) },
  )
}

export async function createReturn(input: {
  invoiceId: string
  reason: string
  kind: 'return' | 'credit_note'
  lines: { sourceLineId: string; quantity: string }[]
}) {
  return api.post<{ document: SalesDocumentRow }>('/sales/returns', input)
}

/* ----------------------------- CSV import/export -------------------------- */

export type ImportProblem = { line: number; message: string }
export type StageResult = { kind: string; total: number; ready: number; problems: ImportProblem[] }
export type CommitResult = StageResult & { created: number; failed: ImportProblem[] }

/**
 * Posts a CSV file to the import endpoint.
 *
 * The one request in this domain that builds its own body: `api` speaks JSON
 * and an import sends the file itself. The error envelope is decoded the same
 * way, so a refusal still reaches the screen as a message rather than as a
 * silent failure.
 */
async function sendCsv<T>(path: string, text: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'text/csv' },
      body: text,
    })
  } catch {
    throw new ApiClientError(0, 'network_error', 'Could not reach the server. Check your connection and try again.')
  }
  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; problems?: ImportProblem[] } }
    | null
  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      payload?.error?.code ?? 'error',
      payload?.error?.message ?? 'That file could not be imported.',
      { problems: payload?.error?.problems },
    )
  }
  return payload as T
}

/** Validates the whole file and writes nothing, so every problem is reported at once. */
export const stageCustomerImport = (text: string) => sendCsv<StageResult>('/imports?kind=customers', text)

/** Writes, having been shown the problems. Refused whole unless `partial` is set. */
export const commitCustomerImport = (text: string, partial: boolean) =>
  sendCsv<CommitResult>(`/imports?kind=customers&commit=true${partial ? '&partial=true' : ''}`, text)

/**
 * The export URL.
 *
 * A link rather than a fetch: the server quotes every field and neutralises
 * anything a spreadsheet would execute, which the browser-side writer this
 * replaces did not.
 */
export const customerExportUrl = '/api/v1/exports?kind=customers'

/* ------------------------------ subscriptions ----------------------------- */

export type SweepSummary = { invoiced: number; alreadyBilled: number; periods: string[] }

export const runSubscriptionSweep = () => api.post<SweepSummary>('/sales/subscriptions/billing', {})

export const scheduleSubscriptionPeriods = (subscriptionId: string, count: number, cadenceDays: number) =>
  api.post<{ created: number }>(`/sales/subscriptions/${subscriptionId}/periods`, { count, cadenceDays })

/* --------------------------------- dates ---------------------------------- */

export const isoDay = (date: Date) => date.toISOString().slice(0, 10)

export const daysAgo = (days: number) => isoDay(new Date(Date.now() - days * 86_400_000))
