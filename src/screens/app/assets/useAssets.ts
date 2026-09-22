'use client'

import { useCallback, useMemo, useState } from 'react'
import { API_BASE, ApiClientError, api } from '../../../lib/api.ts'
import { useResource, useMutation } from '../../../lib/useResource.ts'

/**
 * Asset Management, from the server.
 *
 * Everything these screens used to read out of the browser context is a
 * request here, which changes three things. Filtering and counting happen in
 * SQL, so the number beside a list is the number of matching rows rather than
 * the number that happened to be loaded. Every fetch state exists — first
 * load, refreshing, denied, retryable failure — instead of an empty array
 * standing in for all of them. And every write sends the version it read, so
 * a stale save is a conflict somebody is told about rather than a silent
 * overwrite.
 */

export type AssetHolder = {
  userId: string | null
  partyId: string | null
  label: string | null
  name: string | null
  dueBackOn: string | null
}

export type ServerAsset = {
  id: string
  tag: string
  name: string
  assetType: string | null
  make: string | null
  model: string | null
  serialNumber: string | null
  status: string
  condition: string | null
  location: string | null
  acquiredOn: string | null
  purchaseCost: string | null
  currency: string | null
  invoiceRef: string | null
  warrantyExpiresOn: string | null
  usefulLifeMonths: number | null
  salvageValue: string | null
  holder: AssetHolder | null
  archivedAt: string | null
  version: number
}

/**
 * Statuses, spelled the way the database constrains them.
 *
 * The prototype's six stages and the server's six statuses are not the same
 * six: 'Allocated' and 'Awaiting check' were never stored anywhere, and
 * 'lost' and 'disposed' had no chip. Showing a stage the register cannot hold
 * makes the chip counts refuse to add up to the total, so these are the only
 * ones offered.
 */
export const assetStatuses = ['in_stock', 'assigned', 'in_service', 'retired', 'lost', 'disposed'] as const

export const statusLabels: Record<string, string> = {
  in_stock: 'In Stock',
  assigned: 'Issued',
  in_service: 'In Repair',
  retired: 'Retired',
  lost: 'Lost',
  disposed: 'Disposed',
}

/** A status a retired unit is in: no longer part of the estate. */
export const goneStatuses = ['retired', 'lost', 'disposed']

export const statusLabel = (status: string) => statusLabels[status] ?? status

export const requestStatusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  issued: 'Issued',
  cancelled: 'Cancelled',
}

export const requestStatusLabel = (status: string) => requestStatusLabels[status] ?? status

/** Days until a date, negative once it has passed. Null when there is no date. */
export const daysUntil = (date: string | null): number | null =>
  date ? Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / 86_400_000) : null

export type AssetFilters = {
  query: string
  status: string
  assetType: string
  location: string
  limit: number
  offset: number
}

/** Shared filter state, so the toolbar and the list cannot disagree. */
export function useAssetFilters() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [assetType, setAssetType] = useState('')
  const [location, setLocation] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)

  const filters: AssetFilters = { query, status, assetType, location, limit: pageSize, offset: page * pageSize }

  // Every filter change returns to page one: page four of a narrower result
  // is empty, which reads as "nothing matches".
  const reset = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(0)
  }

  return {
    filters,
    query,
    status,
    assetType,
    location,
    page,
    pageSize,
    setQuery: reset(setQuery),
    setStatus: reset(setStatus),
    setAssetType: reset(setAssetType),
    setLocation: reset(setLocation),
    setPageSize: reset(setPageSize),
    setPage,
  }
}

export type CreateAssetInput = {
  name: string
  assetType?: string
  location?: string
  invoiceRef?: string
  warrantyExpiresOn?: string
  acquiredOn?: string
}

export function useAssets(filters: AssetFilters) {
  const key = `assets:${JSON.stringify(filters)}`
  const resource = useResource<{ assets: ServerAsset[]; total: number }>(
    key,
    useCallback(
      (signal) =>
        api.get<{ assets: ServerAsset[]; total: number }>(
          '/assets',
          {
            q: filters.query || undefined,
            status: filters.status || undefined,
            assetType: filters.assetType || undefined,
            location: filters.location || undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
          signal,
        ),
      [filters.query, filters.status, filters.assetType, filters.location, filters.limit, filters.offset],
    ),
  )
  const { refetch } = resource

  const [createAsset, createState] = useMutation(async (input: CreateAssetInput) => {
    const created = await api.post<{ asset: ServerAsset }>('/assets', {
      name: input.name,
      assetType: input.assetType || undefined,
      location: input.location || undefined,
      invoiceRef: input.invoiceRef || undefined,
      warrantyExpiresOn: input.warrantyExpiresOn || undefined,
      acquiredOn: input.acquiredOn || undefined,
    })
    refetch()
    return created.asset
  })

  /*
   * Issued to an account where there is one.
   *
   * A holder recorded as a typed string is custody nothing can match: it
   * never reaches that person's My Asset page, and the leaver report cannot
   * see it. So the caller sends a `userId` whenever it has one, and a label
   * only for somebody who has no account here.
   */
  const [issueAsset, issueState] = useMutation(
    async (id: string, holder: { userId?: string; label?: string }, dueBackOn: string) => {
      const issued = await api.post<{ asset: ServerAsset }>(`/assets/${id}/assign`, {
        holderUserId: holder.userId || undefined,
        holderLabel: holder.userId ? undefined : holder.label || undefined,
        dueBackOn: dueBackOn || undefined,
      })
      refetch()
      return issued.asset
    },
  )

  const [returnAsset, returnState] = useMutation(async (id: string) => {
    const returned = await api.post<{ asset: ServerAsset }>(`/assets/${id}/return`, {})
    refetch()
    return returned.asset
  })

  const [retireAsset, retireState] = useMutation(async (id: string, reason: string, retiredOn: string) => {
    const retired = await api.post<{ asset: ServerAsset }>(`/assets/${id}/retire`, { reason, retiredOn })
    refetch()
    return retired.asset
  })

  // Archiving is version-checked and refused while the asset is still out,
  // so the button cannot assume it worked.
  const [archiveAsset, archiveState] = useMutation(async (id: string, version: number) => {
    await api.delete(`/assets/${id}`, { version })
    refetch()
  })

  const writing =
    createState.pending || issueState.pending || returnState.pending || retireState.pending || archiveState.pending
  // The first refusal still on screen: a conflict from an archive matters as
  // much as a validation failure from a create.
  const writeError = createState.error ?? issueState.error ?? returnState.error ?? retireState.error ?? archiveState.error

  return useMemo(
    () => ({
      assets: resource.data?.assets ?? [],
      /** Rows matching the filter on the server, not the length of this page. */
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      createAsset,
      issueAsset,
      returnAsset,
      retireAsset,
      archiveAsset,
      writing,
      writeError,
      fieldErrors: createState.fieldErrors,
    }),
    [
      resource,
      refetch,
      createAsset,
      issueAsset,
      returnAsset,
      retireAsset,
      archiveAsset,
      writing,
      writeError,
      createState.fieldErrors,
    ],
  )
}

/**
 * The equipment one person currently holds.
 *
 * Scoped by the holder's user id rather than by matching a name, so it
 * answers "what is out with you" from the custody rows themselves. An empty
 * answer means nothing is issued to you — not that something is unlinked.
 */
export function useMyAssets(userId: string | null | undefined) {
  return useResource<{ assets: ServerAsset[]; total: number }>(
    `my-assets:${userId ?? 'none'}`,
    useCallback(
      (signal) =>
        api.get<{ assets: ServerAsset[]; total: number }>('/assets', { holderUserId: userId ?? undefined, limit: 100 }, signal),
      [userId],
    ),
    { enabled: Boolean(userId) },
  )
}

export type AssetFacets = {
  byStatus: Record<string, number>
  byType: Record<string, number>
  byLocation: Record<string, number>
  pendingRequests: number
  outOfWarranty: number
  warrantyExpiring: number
  warrantyWithinDays: number
}

/**
 * The counts behind the chips and tiles.
 *
 * `scope` is the rest of the register's filter. Passed, the counts are over
 * the rows that filter selects — a chip reading "In Stock 40" beside a list
 * of three is a number nobody can act on. Left out, they cover the whole
 * register, which is what the dashboard wants.
 */
export function useAssetFacets(
  warrantyWithinDays: number,
  scope?: { q?: string; assetType?: string; location?: string },
  options: { enabled?: boolean } = {},
) {
  const q = scope?.q ?? ''
  const assetType = scope?.assetType ?? ''
  const location = scope?.location ?? ''
  return useResource<AssetFacets>(
    `asset-facets:${warrantyWithinDays}:${q}:${assetType}:${location}`,
    useCallback(
      (signal) =>
        api.get<AssetFacets>(
          '/assets/facets',
          { warrantyWithinDays, q: q || undefined, assetType: assetType || undefined, location: location || undefined },
          signal,
        ),
      [warrantyWithinDays, q, assetType, location],
    ),
    options,
  )
}

/* ------------------------------ taxonomies -------------------------------- */

export type TaxonomyEntry = { value: string; label: string; tagPrefix: string | null }
export type TaxonomyDocument = {
  taxonomies: Record<string, TaxonomyEntry[]>
  version: number
  updatedAt: string | null
}

export function useAssetTaxonomies() {
  const resource = useResource<TaxonomyDocument>(
    'asset-taxonomies',
    useCallback((signal) => api.get<TaxonomyDocument>('/assets/taxonomies', undefined, signal), []),
  )
  const { refetch } = resource

  const [saveTaxonomy, saveState] = useMutation(async (code: string, entries: TaxonomyEntry[], version: number) => {
    const saved = await api.put<TaxonomyDocument>(`/assets/taxonomies/${code}`, { entries, version })
    refetch()
    return saved
  })

  return {
    taxonomies: resource.data?.taxonomies ?? {},
    version: resource.data?.version ?? 0,
    loading: resource.loading,
    error: resource.error,
    denied: resource.denied,
    canRetry: resource.canRetry,
    refetch,
    saveTaxonomy,
    saving: saveState.pending,
    saveError: saveState.error,
  }
}

/** Entries of one taxonomy, for the dropdowns that read it. */
export function useTaxonomy(code: string): { entries: TaxonomyEntry[]; loading: boolean; failed: boolean } {
  const resource = useResource<TaxonomyDocument>(
    'asset-taxonomies',
    useCallback((signal) => api.get<TaxonomyDocument>('/assets/taxonomies', undefined, signal), []),
  )
  return {
    entries: resource.data?.taxonomies[code] ?? [],
    loading: resource.loading,
    // A failed load is not an empty list: a dropdown with nothing in it would
    // otherwise look like a workspace that has configured nothing.
    failed: Boolean(resource.error),
  }
}

/* ------------------------------- requests --------------------------------- */

export type ServerAssetRequest = {
  id: string
  reference: string
  requesterUserId: string
  requesterName: string | null
  assetType: string | null
  assetId: string | null
  quantity: number
  reason: string | null
  neededBy: string | null
  status: string
  currentLevel: number
  decidedByName: string | null
  decidedAt: string | null
  version: number
}

export type RequestFilters = { scope: 'all' | 'mine' | 'pending'; assetType: string; status: string; limit: number; offset: number }

export function useAssetRequests(filters: RequestFilters) {
  const key = `asset-requests:${JSON.stringify(filters)}`
  const resource = useResource<{ requests: ServerAssetRequest[]; total: number }>(
    key,
    useCallback(
      (signal) =>
        api.get<{ requests: ServerAssetRequest[]; total: number }>(
          '/assets/requests',
          {
            mine: filters.scope === 'mine' ? true : undefined,
            status: filters.scope === 'pending' ? 'submitted' : filters.status || undefined,
            assetType: filters.assetType || undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
          signal,
        ),
      [filters.scope, filters.status, filters.assetType, filters.limit, filters.offset],
    ),
  )
  const { refetch } = resource

  const [raiseRequest, raiseState] = useMutation(async (input: { assetType: string; reason: string; quantity?: number }) => {
    const created = await api.post<{ request: ServerAssetRequest }>('/assets/requests', {
      assetType: input.assetType || undefined,
      reason: input.reason || undefined,
      quantity: input.quantity ?? undefined,
    })
    refetch()
    return created.request
  })

  const [decideRequest, decideState] = useMutation(
    async (id: string, decision: 'approved' | 'rejected', version: number) => {
      const decided = await api.post<{ request: ServerAssetRequest }>(`/assets/requests/${id}/decision`, {
        decision,
        version,
      })
      refetch()
      return decided.request
    },
  )

  // Issuing hands the asset to whoever raised the request and closes the
  // request in the same call, so the two cannot drift apart.
  const [issueAgainstRequest, issueState] = useMutation(
    async (id: string, assetId: string, version: number, dueBackOn?: string) => {
      const issued = await api.post<{ request: ServerAssetRequest; asset: ServerAsset }>(
        `/assets/requests/${id}/issue`,
        { assetId, version, dueBackOn: dueBackOn || undefined },
      )
      refetch()
      return issued
    },
  )

  return {
    requests: resource.data?.requests ?? [],
    total: resource.data?.total ?? 0,
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    denied: resource.denied,
    canRetry: resource.canRetry,
    refetch,
    raiseRequest,
    decideRequest,
    issueAgainstRequest,
    writing: raiseState.pending || decideState.pending || issueState.pending,
    writeError: raiseState.error ?? decideState.error ?? issueState.error,
    fieldErrors: raiseState.fieldErrors,
  }
}

/** In-stock assets of a type, for choosing what to hand over against a request. */
export function useIssuableAssets(assetType: string | null) {
  const resource = useResource<{ assets: ServerAsset[]; total: number }>(
    `issuable:${assetType ?? 'any'}`,
    useCallback(
      (signal) =>
        api.get<{ assets: ServerAsset[]; total: number }>(
          '/assets',
          { status: 'in_stock', assetType: assetType || undefined, limit: 100 },
          signal,
        ),
      [assetType],
    ),
  )
  return {
    assets: resource.data?.assets ?? [],
    total: resource.data?.total ?? 0,
    loading: resource.loading,
    error: resource.error,
  }
}

/* -------------------------------- reports --------------------------------- */

export type WarrantyLine = {
  id: string
  tag: string
  name: string
  assetType: string | null
  status: string
  warrantyExpiresOn: string
  daysLeft: number
  holderLabel: string | null
}

export type WarrantyReport = {
  rows: WarrantyLine[]
  total: number
  expired: number
  expiring: number
  withinDays: number
}

export function useWarrantyReport(withinDays: number, includeExpired = true) {
  return useResource<WarrantyReport>(
    `asset-warranty:${withinDays}:${includeExpired}`,
    useCallback(
      (signal) => api.get<WarrantyReport>('/assets/reports/warranty', { withinDays, includeExpired }, signal),
      [withinDays, includeExpired],
    ),
  )
}

export type LeaverHolding = {
  assetId: string
  tag: string
  name: string
  holderName: string
  employeeNo: string
  exitedOn: string | null
  assignedAt: string
  dueBackOn: string | null
}

export type LeaverHoldings = {
  rows: LeaverHolding[]
  /** Every outstanding holding, counted on the server; `rows` is the first page of them. */
  total: number
  /** How much of the workforce this can see; a zero with no employees is not a measurement. */
  employees: number
  exited: number
  exitedUnlinked: number
  /** Open custody recorded against a typed name, which no employee match can reach. */
  unlinkedCustody: number
}

export function useLeaverHoldings() {
  return useResource<LeaverHoldings>(
    'asset-leaver-holdings',
    useCallback((signal) => api.get<LeaverHoldings>('/assets/reports/leaver-holdings', undefined, signal), []),
  )
}

export type StockLine = {
  key: string
  count: number
  value: string
  currency: string | null
  /** 0: nothing priced. 1: `value` is a total. More: the costs cannot be added up. */
  currencies: number
}

export function useStockReport(groupBy: 'type' | 'location' | 'status') {
  return useResource<{ lines: StockLine[] }>(
    `asset-stock:${groupBy}`,
    useCallback((signal) => api.get<{ lines: StockLine[] }>('/assets/reports/stock', { groupBy }, signal), [groupBy]),
  )
}

/* --------------------------- approval levels ------------------------------ */

export type ApprovalLevel = {
  level: number
  approverKind: 'role' | 'user'
  approverRole: string | null
  userIds: string[]
}

export function useApprovalLadder() {
  const resource = useResource<{ levels: ApprovalLevel[]; version: number }>(
    'asset-approval-levels',
    useCallback((signal) => api.get<{ levels: ApprovalLevel[]; version: number }>('/assets/approval-levels', undefined, signal), []),
  )
  const { refetch } = resource

  const [saveLadder, saveState] = useMutation(async (levels: ApprovalLevel[], version: number) => {
    const saved = await api.put<{ levels: ApprovalLevel[]; version: number }>('/assets/approval-levels', {
      levels: levels.map((level) => ({
        level: level.level,
        approverKind: level.approverKind,
        approverRole: level.approverRole,
        userIds: level.userIds,
      })),
      version,
    })
    refetch()
    return saved
  })

  return {
    levels: resource.data?.levels ?? [],
    version: resource.data?.version ?? 0,
    loaded: Boolean(resource.data),
    loading: resource.loading,
    error: resource.error,
    denied: resource.denied,
    canRetry: resource.canRetry,
    refetch,
    saveLadder,
    saving: saveState.pending,
    saveError: saveState.error,
  }
}

/* -------------------------------- settings -------------------------------- */

export const ASSET_APP_CODE = 'ITAM'

export type SettingsDocument<T> = { appCode: string; section: string; value: T; version: number; updatedAt: string | null }

/**
 * One settings section of this app, read and written as a whole document.
 *
 * The write is version-checked, which is why the panes hold a draft and save
 * once: a request per keystroke against a versioned document is a conflict
 * per keystroke.
 */
export function useAssetSettings<T extends Record<string, unknown>>(section: string, fallback: T) {
  const resource = useResource<{ settings: SettingsDocument<T> }>(
    `asset-settings:${section}`,
    useCallback(
      (signal) => api.get<{ settings: SettingsDocument<T> }>(`/settings/${ASSET_APP_CODE}`, { section }, signal),
      [section],
    ),
  )
  const { refetch } = resource

  const [save, saveState] = useMutation(async (value: T, version: number, summary: string) => {
    const saved = await api.put<{ settings: SettingsDocument<T> }>(`/settings/${ASSET_APP_CODE}`, {
      section,
      value,
      version,
      summary,
    })
    refetch()
    return saved.settings
  })

  return {
    /*
     * Merged over the fallback, because the server deliberately refuses to
     * take defaults from whoever is reading: a section nobody has saved comes
     * back empty, and a pane that then reads `undefined.length` is a crash
     * rather than an empty pane.
     */
    value: { ...fallback, ...(resource.data?.settings.value ?? {}) },
    version: resource.data?.settings.version ?? 0,
    loaded: Boolean(resource.data),
    loading: resource.loading,
    error: resource.error,
    denied: resource.denied,
    canRetry: resource.canRetry,
    refetch,
    save,
    saving: saveState.pending,
    saveError: saveState.error,
  }
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

/**
 * How many entries one read of the change log returns.
 *
 * The endpoint answers a page, not a count: there is no `total` behind it. So
 * the page size is named here and the screen says "the most recent N" when
 * the page comes back full, rather than reporting its length as the number of
 * changes ever made.
 */
export const SETTINGS_CHANGE_PAGE = 200

export function useSettingsChanges() {
  const resource = useResource<{ changes: SettingsChange[] }>(
    'asset-settings-changes',
    useCallback(
      (signal) =>
        api.get<{ changes: SettingsChange[] }>(
          `/settings/${ASSET_APP_CODE}/changes`,
          { limit: SETTINGS_CHANGE_PAGE },
          signal,
        ),
      [],
    ),
  )
  const { refetch } = resource

  const [revert, revertState] = useMutation(async (changeId: string) => {
    await api.post(`/settings/changes/${changeId}/revert`)
    refetch()
  })

  const changes = resource.data?.changes ?? []
  return {
    changes,
    /** True when the page came back full: there may be older changes it does not include. */
    capped: changes.length >= SETTINGS_CHANGE_PAGE,
    loading: resource.loading,
    error: resource.error,
    denied: resource.denied,
    canRetry: resource.canRetry,
    refetch,
    revert,
    reverting: revertState.pending,
    revertError: revertState.error,
  }
}

export type WorkspaceMember = { userId: string; fullName: string; email: string; role: string; status: string }

/**
 * The workspace directory, for naming an approver.
 *
 * Reading it needs `member.read`, which not every role has — so the caller is
 * told when the list could not be read rather than being shown an empty
 * picker that looks like an empty workspace.
 */
export function useWorkspaceMembers() {
  const resource = useResource<{ members: WorkspaceMember[] }>(
    'members',
    useCallback((signal) => api.get<{ members: WorkspaceMember[] }>('/members', undefined, signal), []),
  )
  return {
    members: (resource.data?.members ?? []).filter((member) => member.status === 'active'),
    loading: resource.loading,
    error: resource.error,
    denied: resource.denied,
  }
}

export type CreditBalance = { granted: number; used: number; reserved: number; available: number }

export function useCreditBalance() {
  return useResource<{ credits: CreditBalance }>(
    'credits',
    useCallback((signal) => api.get<{ credits: CreditBalance }>('/credits/balance', undefined, signal), []),
  )
}

/* ---------------------------- import and export ---------------------------- */

/**
 * CSV crosses the wire as text, not JSON.
 *
 * The shared client sends and parses JSON, and the import endpoint takes a
 * raw `text/csv` body while the export returns a raw CSV response — so these
 * two call `fetch` directly and decode the same error envelope by hand rather
 * than asking the JSON client to handle a body it cannot.
 */
async function csvRequest<T>(path: string, body: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'text/csv' },
      body,
    })
  } catch {
    throw new ApiClientError(0, 'network_error', 'Could not reach the server. Check your connection and try again.')
  }
  const text = await response.text()
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : null
  if (!response.ok) {
    const envelope = (payload as { error?: { code?: string; message?: string; problems?: { line: number; message: string }[] } })
      ?.error
    throw new ApiClientError(response.status, envelope?.code ?? 'error', envelope?.message ?? 'That import failed.', {
      problems: envelope?.problems,
    })
  }
  return payload as T
}

export type ImportReport = {
  kind: string
  total: number
  ready: number
  problems: { line: number; message: string }[]
  created?: number
  failed?: { line: number; message: string }[]
}

/** Validates the whole file and writes nothing, reporting every bad row. */
export const stageAssetImport = (csv: string) => csvRequest<ImportReport>('/imports?kind=assets', csv)

/** Writes, having been shown the problems. Refused whole if any row is invalid. */
export const commitAssetImport = (csv: string) => csvRequest<ImportReport>('/imports?kind=assets&commit=true', csv)

/**
 * The columns the importer reads, by header name.
 *
 * Order does not matter — rows are read by header — and anything else in the
 * file is ignored, including the Status and Holder columns the export writes,
 * which no import can set.
 */
export const assetImportColumns = 'Name, Tag, Type, Serial number, Location, Acquired on, Purchase cost, Currency, Warranty expires on'

/**
 * Downloads the register the server exports.
 *
 * The response is a CSV file rather than JSON, so the browser is handed the
 * bytes the server produced — including its spreadsheet-injection guard —
 * instead of a file the screen assembles from whatever page it had loaded.
 */
export async function downloadAssetExport(): Promise<number> {
  const response = await fetch(`${API_BASE}/exports?kind=assets`, { credentials: 'same-origin' })
  if (!response.ok) {
    throw new ApiClientError(response.status, 'export_failed', 'That export could not be produced.')
  }
  const csv = await response.text()
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `asset-register-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
  /*
   * The rows the file actually contains, counted rather than assumed: the
   * export endpoint caps what it writes, so a register larger than the cap
   * downloads short. The caller compares this with the register total and
   * says so instead of letting a partial file pass as the whole register.
   */
  return countCsvRows(csv)
}

/** Data rows in a CSV, header excluded and quoted newlines respected. */
function countCsvRows(csv: string): number {
  let rows = 0
  let quoted = false
  let cell = false
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]
    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') index += 1
        else quoted = false
      }
      continue
    }
    if (character === '"') {
      quoted = true
      cell = true
    } else if (character === '\n') {
      if (cell) rows += 1
      cell = false
    } else if (character !== '\r') {
      cell = true
    }
  }
  if (cell) rows += 1
  return Math.max(0, rows - 1)
}
