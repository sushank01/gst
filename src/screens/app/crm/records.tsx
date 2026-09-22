'use client'

import { useCallback, useMemo, useState } from 'react'
import { Action } from '../../../components/AppChrome'
import { ApiClientError, api } from '../../../lib/api.ts'
import { useResource } from '../../../lib/useResource.ts'
import type { ResourceState } from '../../../lib/useResource.ts'
import type { HrModal } from '../../../lib/hrData'
import { contactTypes } from '../../../lib/crmData'

/**
 * Everything the CRM panels read and write, from the server.
 *
 * This file used to hold `useRecords`, which read one localStorage bucket per
 * tab and called that persistence. Nine buckets became five real tables; the
 * hooks below are the same shape as `useServerLeads` so every panel handles the
 * same set of states — first load, refreshing, denied, retryable failure — and
 * every count is the server's count for the filter rather than the length of
 * whatever page happened to be loaded.
 *
 * Money never becomes a number here. A deal's amount crosses the API as a
 * decimal string with its own currency and is formatted, not arithmetic'd.
 */

/* --------------------------------- shapes --------------------------------- */

export type CrmParty = {
  id: string
  kind: 'person' | 'organisation'
  name: string
  email: string | null
  phone: string | null
  company: string | null
  companyId: string | null
  industry: string | null
  website: string | null
  employeeCount: number | null
  partyType: string | null
  notes: string | null
  version: number
  archivedAt: string | null
  createdAt: string
}

export type CrmStage = {
  id: string
  name: string
  position: number
  probability: number
  outcome: 'open' | 'won' | 'lost'
}

export type CrmPipeline = { id: string; name: string; isDefault: boolean; stages: CrmStage[] }

/** A sum kept beside the currency it is in. Two currencies are never added. */
export type MoneyTotal = { currency: string; amount: string }
export type MoneyBucket = { count: number; amounts: MoneyTotal[] }
export type CrmStageTotals = CrmStage & MoneyBucket

export type CrmDeal = {
  id: string
  name: string
  pipelineId: string
  stageId: string
  stageName: string
  stageOutcome: 'open' | 'won' | 'lost'
  accountId: string | null
  account: string | null
  primaryContactId: string | null
  primaryContact: string | null
  amount: string
  currency: string
  probability: number | null
  expectedClose: string | null
  closedAt: string | null
  outcome: 'won' | 'lost' | null
  lostReason: string | null
  source: string | null
  isFavourite: boolean
  version: number
  createdAt: string
}

export type CrmActivity = {
  id: string
  kind: string
  subject: string
  body: string | null
  occursAt: string | null
  timezone: string | null
  durationMinutes: number | null
  completedAt: string | null
  outcome: string | null
  version: number
  target: { kind: 'party' | 'deal' | 'lead'; id: string; name: string } | null
  createdAt: string
}

/* ------------------------------ fetch states ------------------------------ */

/** The subset of a resource every panel has to render before it renders rows. */
export type FetchState = Pick<ResourceState<unknown>, 'loading' | 'refreshing' | 'error' | 'canRetry' | 'denied' | 'refetch'>

export function Loading({ noun }: { noun: string }) {
  return (
    <div role="status" className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-[14px] text-fg-muted">
      Loading {noun}…
    </div>
  )
}

/**
 * A failed request, shown as a failure.
 *
 * Rendering an error as an empty list is how "the server is down" reaches
 * somebody as "you have no contacts", so every list in this app asks this
 * first and only reaches its empty state when the request actually succeeded.
 */
export function LoadFailed({ state, noun }: { state: FetchState; noun: string }) {
  if (!state.error) return null
  return (
    <div role="alert" className="rounded-2xl border border-bad/40 bg-bad-muted/30 px-6 py-10 text-center">
      <p className="text-[15px] font-medium text-fg">
        {state.denied ? `You do not have access to ${noun} in this workspace.` : `We could not load your ${noun}.`}
      </p>
      <p className="mt-1.5 text-[13px] text-fg-muted">{state.error.message}</p>
      {state.canRetry && (
        <div className="mt-4">
          <Action onClick={state.refetch}>Try again</Action>
        </div>
      )}
      {state.error.requestId && (
        <p className="mt-3 font-mono text-[11px] text-fg-muted">Reference {state.error.requestId}</p>
      )}
    </div>
  )
}

/**
 * A surface with nothing behind it on this deployment.
 *
 * Used where the prototype kept a working-looking control that wrote to the
 * browser: saying so is the only honest option, because a disabled button is
 * better than one that appears to save and does not.
 */
export function NotAvailable({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center">
      <p className="text-[17px] font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-fg-muted">{reason}</p>
    </div>
  )
}

/** Formats a decimal-string amount for display without going through a float. */
export function formatMoney(amount: string, currency: string): string {
  const [whole, fraction = ''] = amount.split('.')
  const grouped = Number(whole).toLocaleString()
  const decimals = fraction.replace(/0+$/, '').slice(0, 2)
  return `${currency} ${grouped}${decimals ? `.${decimals.padEnd(2, '0')}` : ''}`
}

/**
 * A bucket as text.
 *
 * An empty bucket is a measured zero — the server counted no matching deals —
 * so it reads as zero in the workspace's currency. It is never used to stand in
 * for a figure nobody computed.
 */
export function formatBucket(bucket: MoneyBucket, fallbackCurrency: string | null): string {
  if (bucket.amounts.length) return bucket.amounts.map((entry) => formatMoney(entry.amount, entry.currency)).join(' · ')
  return fallbackCurrency ? formatMoney('0', fallbackCurrency) : '0'
}

/* --------------------------------- writing -------------------------------- */

/**
 * Runs a write, refetches, and lets the failure through.
 *
 * Both halves matter. The banner needs the error to show it, and the dialog
 * needs it *thrown* — `RecordDialog` keeps itself open and displays whatever
 * rejects, so swallowing the rejection here would close the dialog on a failed
 * save and lose what somebody typed. A 409 also refetches, because the next
 * attempt has to carry the version that actually won.
 */
function useWriter(refetch: () => void) {
  const [writeError, setWriteError] = useState<ApiClientError | null>(null)
  const [writing, setWriting] = useState(false)

  const write = useCallback(
    async <T,>(run: () => Promise<T>): Promise<T> => {
      setWriting(true)
      setWriteError(null)
      try {
        const result = await run()
        refetch()
        return result
      } catch (caught) {
        const error =
          caught instanceof ApiClientError ? caught : new ApiClientError(0, 'unknown', 'That could not be saved.')
        setWriteError(error)
        if (error.isConflict) refetch()
        throw error
      } finally {
        setWriting(false)
      }
    },
    [refetch],
  )

  return { write, writing, writeError, clearWriteError: useCallback(() => setWriteError(null), []) }
}

/** A write failure that happened outside a dialog — a row action, typically. */
export function WriteProblem({ error, onDismiss }: { error: ApiClientError | null; onDismiss: () => void }) {
  if (!error) return null
  return (
    <p role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-bad/40 bg-bad-muted/30 px-4 py-3 text-[13px] text-fg">
      <span>{error.message}</span>
      <button onClick={onDismiss} className="text-fg-muted transition hover:text-fg" aria-label="Dismiss">
        ✕
      </button>
    </p>
  )
}

/* -------------------------------- contacts -------------------------------- */

export type PartyFilters = { query: string; type: string; includeArchived: boolean; limit: number; offset: number }

/** Shared filter state, so a toolbar and the list it filters cannot disagree. */
export function usePartyFilters() {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('All')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)

  const filters: PartyFilters = { query, type, includeArchived, limit: pageSize, offset: page * pageSize }

  return {
    filters,
    query,
    type,
    includeArchived,
    page,
    pageSize,
    // Any change to what is being matched must return to page one, or the list
    // looks empty on a filter that has results.
    setQuery: (value: string) => { setQuery(value); setPage(0) },
    setType: (value: string) => { setType(value); setPage(0) },
    setIncludeArchived: (value: boolean) => { setIncludeArchived(value); setPage(0) },
    setPageSize: (value: number) => { setPageSize(value); setPage(0) },
    setPage,
  }
}

type PartyPayload = {
  name: string
  email?: string
  phone?: string
  company?: string
  industry?: string
  website?: string
  employees?: number
  type?: string
  notes?: string
}

function usePartyList(
  path: '/crm/contacts' | '/crm/companies',
  key: 'contacts' | 'companies',
  filters: PartyFilters,
) {
  const resource = useResource<Record<string, unknown> & { total: number }>(
    `${path}:${JSON.stringify(filters)}`,
    useCallback(
      (signal) =>
        api.get<Record<string, unknown> & { total: number }>(
          path,
          {
            q: filters.query || undefined,
            type: filters.type !== 'All' ? filters.type : undefined,
            includeArchived: filters.includeArchived || undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
          signal,
        ),
      [path, filters.query, filters.type, filters.includeArchived, filters.limit, filters.offset],
    ),
  )

  const { refetch } = resource
  const { write, writing, writeError, clearWriteError } = useWriter(refetch)
  const single = key === 'contacts' ? 'contact' : 'company'

  const create = useCallback(
    (input: PartyPayload) => write(() => api.post<Record<string, CrmParty>>(path, input).then((body) => body[single])),
    [write, path, single],
  )

  const archive = useCallback(
    (id: string, version: number) => write(() => api.delete(`${path}/${id}`, { version })),
    [write, path],
  )

  return useMemo(
    () => ({
      rows: (resource.data?.[key] as CrmParty[] | undefined) ?? [],
      /** Rows matching the filter on the server, not the page length. */
      total: resource.data?.total ?? 0,
      /** True once a request has answered, so an empty list is a fact. */
      loaded: resource.data !== undefined,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      create,
      archive,
      writing,
      writeError,
      clearWriteError,
    }),
    [resource, key, refetch, create, archive, writing, writeError, clearWriteError],
  )
}

export const useContacts = (filters: PartyFilters) => usePartyList('/crm/contacts', 'contacts', filters)
export const useCompanies = (filters: PartyFilters) => usePartyList('/crm/companies', 'companies', filters)

export type DuplicateGroup = { name: string; parties: CrmParty[] }

/**
 * Same-name contacts across the whole workspace.
 *
 * The prototype compared only the rows the browser had loaded, so the number
 * beside "Find duplicates" meant nothing on any tenant with more than a page.
 */
export function useContactDuplicates() {
  const resource = useResource<{ groups: DuplicateGroup[]; total: number }>(
    'crm-contact-duplicates',
    useCallback((signal) => api.get<{ groups: DuplicateGroup[]; total: number }>('/crm/contacts/duplicates', undefined, signal), []),
  )
  const groups = resource.data?.groups ?? []
  return {
    groups,
    /** Contacts involved in a collision — absent, not zero, until it loads. */
    total: resource.data?.total,
    /**
     * How many of those actually came back. The query is capped, so a workspace
     * with more collisions than one page returns fewer rows than `total` — and
     * saying "no more duplicates" under a truncated list would be a lie.
     */
    shown: groups.reduce((sum, group) => sum + group.parties.length, 0),
    /** True once a request has answered, so "no duplicates" is a fact. */
    loaded: resource.data !== undefined,
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    denied: resource.denied,
    canRetry: resource.canRetry,
    refetch: resource.refetch,
  }
}

/* -------------------------------- pipelines ------------------------------- */

export function usePipelines() {
  const resource = useResource<{ pipelines: CrmPipeline[] }>(
    'crm-pipelines',
    useCallback((signal) => api.get<{ pipelines: CrmPipeline[] }>('/crm/pipelines', undefined, signal), []),
  )
  const { refetch } = resource
  const { write, writing, writeError, clearWriteError } = useWriter(refetch)

  const create = useCallback(
    (input: { name: string; duplicateOf?: string }) =>
      write(() => api.post<{ pipeline: CrmPipeline }>('/crm/pipelines', input).then((body) => body.pipeline)),
    [write],
  )

  return useMemo(
    () => ({
      pipelines: resource.data?.pipelines ?? [],
      loaded: resource.data !== undefined,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      create,
      writing,
      writeError,
      clearWriteError,
    }),
    [resource, refetch, create, writing, writeError, clearWriteError],
  )
}

/* ---------------------------------- deals --------------------------------- */

export type DealFilters = {
  pipelineId: string
  stageId: string
  query: string
  source: string
  favourites: boolean
  mine: boolean
  limit: number
  offset: number
}

export function useDealFilters() {
  const [pipelineId, setPipelineId] = useState('')
  const [stageId, setStageId] = useState('')
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('')
  const [favourites, setFavourites] = useState(false)
  const [mine, setMine] = useState(false)
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(0)

  const filters: DealFilters = { pipelineId, stageId, query, source, favourites, mine, limit: pageSize, offset: page * pageSize }

  return {
    filters,
    pipelineId,
    stageId,
    query,
    source,
    favourites,
    mine,
    page,
    pageSize,
    // A pipeline change invalidates the stage: stage ids belong to one pipeline.
    setPipelineId: (value: string) => { setPipelineId(value); setStageId(''); setPage(0) },
    setStageId: (value: string) => { setStageId(value); setPage(0) },
    setQuery: (value: string) => { setQuery(value); setPage(0) },
    setSource: (value: string) => { setSource(value); setPage(0) },
    setFavourites: (value: boolean) => { setFavourites(value); setPage(0) },
    setMine: (value: boolean) => { setMine(value); setPage(0) },
    setPageSize: (value: number) => { setPageSize(value); setPage(0) },
    setPage,
  }
}

export type DealsResponse = {
  deals: CrmDeal[]
  total: number
  pipelineId: string | null
  pipelineName: string | null
  stages: CrmStageTotals[]
  summary: { open: MoneyBucket; won: MoneyBucket; lost: MoneyBucket }
  defaultCurrency: string | null
}

export type NewDeal = {
  name: string
  amount: string
  currency: string
  stageId?: string
  pipelineId?: string
  accountId?: string
  primaryContactId?: string
  expectedClose?: string
  source?: string
}

export type DealOption = { id: string; name: string; pipelineName: string }

/**
 * Every deal in the workspace, for a target picker.
 *
 * Not `useDeals`, which answers for one pipeline because a board is a
 * pipeline. An activity may be about any deal, and reading the board meant a
 * workspace with a second pipeline could only ever log one against a deal in
 * the default.
 */
type DealOptions = { deals: DealOption[]; capped: boolean }

export function useDealOptions() {
  const resource = useResource<DealOptions>(
    'crm-deal-options',
    useCallback((signal) => api.get<DealOptions>('/crm/deals/options', undefined, signal), []),
  )
  return useMemo(
    () => ({
      deals: resource.data?.deals ?? [],
      /** The server read one row past the limit, so this is measured, not guessed. */
      capped: resource.data?.capped ?? false,
      loaded: resource.data !== undefined,
      loading: resource.loading,
      error: resource.error,
    }),
    [resource],
  )
}

/**
 * One pipeline's deals, with the board columns and the KPI totals the server
 * computed over the same filter — so a column header, the row count beside it
 * and the dashboard cannot tell three different stories.
 */
export function useDeals(filters: DealFilters) {
  const resource = useResource<DealsResponse>(
    `crm-deals:${JSON.stringify(filters)}`,
    useCallback(
      (signal) =>
        api.get<DealsResponse>(
          '/crm/deals',
          {
            pipelineId: filters.pipelineId || undefined,
            stageId: filters.stageId || undefined,
            q: filters.query || undefined,
            source: filters.source || undefined,
            favourites: filters.favourites || undefined,
            mine: filters.mine || undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
          signal,
        ),
      [filters.pipelineId, filters.stageId, filters.query, filters.source, filters.favourites, filters.mine, filters.limit, filters.offset],
    ),
  )

  const { refetch } = resource
  const { write, writing, writeError, clearWriteError } = useWriter(refetch)

  const create = useCallback(
    (input: NewDeal) => write(() => api.post<{ deal: CrmDeal }>('/crm/deals', input).then((body) => body.deal)),
    [write],
  )

  /** Every write names the version it read, so a stale save is a 409 and not a silent overwrite. */
  const update = useCallback(
    (id: string, version: number, patch: { name?: string; stageId?: string; isFavourite?: boolean; lostReason?: string }) =>
      write(() => api.patch<{ deal: CrmDeal }>(`/crm/deals/${id}`, { version, ...patch }).then((body) => body.deal)),
    [write],
  )

  const archive = useCallback(
    (id: string, version: number) => write(() => api.delete(`/crm/deals/${id}`, { version })),
    [write],
  )

  return useMemo(
    () => ({
      deals: resource.data?.deals ?? [],
      total: resource.data?.total ?? 0,
      pipelineId: resource.data?.pipelineId ?? null,
      pipelineName: resource.data?.pipelineName ?? null,
      stages: resource.data?.stages ?? [],
      summary: resource.data?.summary,
      defaultCurrency: resource.data?.defaultCurrency ?? null,
      /** True only once a request has actually answered, so an empty board is a fact. */
      loaded: resource.data !== undefined,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      create,
      update,
      archive,
      writing,
      writeError,
      clearWriteError,
    }),
    [resource, refetch, create, update, archive, writing, writeError, clearWriteError],
  )
}

/* ------------------------------- activities ------------------------------- */

export type ActivityFilters = { kind: string; query: string; from: string; to: string; limit: number; offset: number }

export type NewActivity = {
  kind: string
  subject: string
  body?: string
  partyId?: string
  dealId?: string
  leadId?: string
  occursAt?: string
  timezone?: string
}

export function useActivities(filters: ActivityFilters) {
  const resource = useResource<{ activities: CrmActivity[]; total: number }>(
    `crm-activities:${JSON.stringify(filters)}`,
    useCallback(
      (signal) =>
        api.get<{ activities: CrmActivity[]; total: number }>(
          '/crm/activities',
          {
            kind: filters.kind && filters.kind !== 'All' ? filters.kind : undefined,
            q: filters.query || undefined,
            from: filters.from || undefined,
            to: filters.to || undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
          signal,
        ),
      [filters.kind, filters.query, filters.from, filters.to, filters.limit, filters.offset],
    ),
  )

  const { refetch } = resource
  const { write, writing, writeError, clearWriteError } = useWriter(refetch)

  const create = useCallback(
    (input: NewActivity) =>
      write(() => api.post<{ activity: CrmActivity }>('/crm/activities', input).then((body) => body.activity)),
    [write],
  )

  const update = useCallback(
    (id: string, version: number, patch: { completed?: boolean; outcome?: string }) =>
      write(() => api.patch<{ activity: CrmActivity }>(`/crm/activities/${id}`, { version, ...patch }).then((body) => body.activity)),
    [write],
  )

  return useMemo(
    () => ({
      activities: resource.data?.activities ?? [],
      total: resource.data?.total ?? 0,
      loaded: resource.data !== undefined,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      create,
      update,
      writing,
      writeError,
      clearWriteError,
    }),
    [resource, refetch, create, update, writing, writeError, clearWriteError],
  )
}

/* ------------------------------- form specs ------------------------------- */

/**
 * The field specs behind CRM's generic create dialogs.
 *
 * Only fields the API actually accepts survive here. The prototype's deal,
 * activity, event and sequence specs collected values — a free-text "Company",
 * an attendee list, a step count — that no column could hold, so they were
 * filled in and thrown away. Those entities now have their own dialogs that
 * pick real records, and this is what is left.
 */
export const crmModals: Record<string, HrModal> = {
  'crm.contacts': {
    title: 'Add contact',
    submit: 'Add contact',
    fields: [
      { kind: 'text', label: 'Name', required: true, span: 2 },
      { kind: 'select', label: 'Type', value: 'Prospect', options: contactTypes.filter((item) => item !== 'All'), span: 1 },
      { kind: 'text', label: 'Email', span: 2 },
      { kind: 'text', label: 'Phone', span: 1 },
      { kind: 'text', label: 'Company', span: 3 },
    ],
  },
  'crm.companies': {
    title: 'Add Company',
    submit: 'Add Company',
    fields: [
      { kind: 'text', label: 'Name', required: true, span: 2 },
      { kind: 'text', label: 'Industry', span: 1 },
      { kind: 'text', label: 'Website', span: 2 },
      { kind: 'number', label: 'Employees', value: '', span: 1 },
    ],
  },
  'crm.pipelines': {
    title: 'New pipeline',
    submit: 'Create pipeline',
    // `pipelines` has a name and nothing else; a description field here would
    // collect text with nowhere to put it.
    fields: [{ kind: 'text', label: 'Name', required: true, span: 2 }],
  },
}

/** Maps a generic dialog's filled fields onto the contacts endpoint's body. */
export function contactBody(fields: Record<string, string>): PartyPayload {
  return {
    name: fields.Name ?? '',
    email: fields.Email,
    phone: fields.Phone,
    company: fields.Company,
    type: fields.Type,
  }
}

export function companyBody(fields: Record<string, string>): PartyPayload {
  return {
    name: fields.Name ?? '',
    industry: fields.Industry,
    website: fields.Website,
    // An empty employee count is unknown, which is not the same as zero staff.
    employees: fields.Employees ? Number(fields.Employees) : undefined,
  }
}
