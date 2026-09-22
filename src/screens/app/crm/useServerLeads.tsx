'use client'

import { useCallback, useMemo, useState } from 'react'
import { ApiClientError, api } from '../../../lib/api.ts'
import { useResource, useMutation } from '../../../lib/useResource.ts'

/**
 * Leads, from the server.
 *
 * This is the reference for moving the rest of the app off `useWorkspace`.
 * Three things change compared with the browser-state version:
 *
 *  * filtering, searching and paging happen in SQL, so the count beside the
 *    list is the count of *matching* rows and not of whatever happened to be
 *    loaded into the browser
 *  * every state a real fetch has is represented — first load, refreshing,
 *    denied, retryable failure — instead of an empty array standing in for all
 *    of them, which is how a failed request ends up looking like "no leads"
 *  * writes send the version they read, so a stale save is a conflict the user
 *    is told about rather than a silent overwrite
 */

export type ServerLead = {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  status: string
  source: string | null
  score: number
  notes: string | null
  version: number
  createdAt: string
  convertedAt: string | null
}

export type LeadFilters = {
  query: string
  status: string
  source: string
  /** Ordering is a query parameter, so the top scorer is on the first page. */
  sort: 'recent' | 'score'
  limit: number
  offset: number
}

export function useServerLeads(filters: LeadFilters) {
  // The key is the request: change a filter and the resource refetches, which
  // is what keeps the visible count honest.
  const key = JSON.stringify(filters)

  const resource = useResource<{ leads: ServerLead[]; total: number }>(
    key,
    useCallback(
      (signal) =>
        api.get<{ leads: ServerLead[]; total: number }>(
          '/crm/leads',
          {
            q: filters.query || undefined,
            status: filters.status !== 'All' ? filters.status : undefined,
            source: filters.source || undefined,
            sort: filters.sort !== 'recent' ? filters.sort : undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
          signal,
        ),
      [filters.query, filters.status, filters.source, filters.sort, filters.limit, filters.offset],
    ),
  )

  const { refetch } = resource

  /**
   * Runs a write and reloads the list, on success and on conflict alike.
   *
   * The conflict half is the part that is easy to leave out. A 409 means the
   * version on screen is the one that lost, so without a reload the next click
   * sends the same stale number and fails identically forever — the error is
   * shown, and the screen is nevertheless stuck.
   */
  const writeThenReload = useCallback(
    async <T,>(run: () => Promise<T>): Promise<T> => {
      try {
        const result = await run()
        refetch()
        return result
      } catch (error) {
        if (error instanceof ApiClientError && error.isConflict) refetch()
        throw error
      }
    },
    [refetch],
  )

  const [createLead, createState] = useMutation((input: Partial<ServerLead> & { name: string }) =>
    writeThenReload(async () => {
      const created = await api.post<{ lead: ServerLead }>('/crm/leads', {
        name: input.name,
        email: input.email || undefined,
        phone: input.phone || undefined,
        company: input.company || undefined,
        status: input.status || undefined,
        source: input.source || undefined,
        score: input.score ?? undefined,
        notes: input.notes || undefined,
      })
      return created.lead
    }),
  )

  const [updateLead, updateState] = useMutation((id: string, version: number, patch: Partial<ServerLead>) =>
    writeThenReload(async () => {
      const updated = await api.patch<{ lead: ServerLead }>(`/crm/leads/${id}`, { version, ...patch })
      return updated.lead
    }),
  )

  const [archiveLead, archiveState] = useMutation((id: string, version: number) =>
    writeThenReload(() => api.delete(`/crm/leads/${id}`, { version })),
  )

  /*
   * Conversion was implemented and tested on the server and unreachable from
   * the screen, so a qualified lead could not become a deal. The amount is a
   * decimal string with an explicit currency, per ADR-0008.
   */
  const [convertLead, convertState] = useMutation(
    (id: string, version: number, input: { dealName: string; amount: string; currency: string }) =>
      writeThenReload(async () => {
        const created = await api.post<{ dealId: string }>(`/crm/leads/${id}/convert`, { ...input, version })
        return created.dealId
      }),
  )

  return useMemo(
    () => ({
      leads: resource.data?.leads ?? [],
      /** Rows matching the filter on the server, not the page length. */
      total: resource.data?.total ?? 0,
      /** True once a request has answered, so an empty list is a fact and not a guess. */
      loaded: resource.data !== undefined,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      createLead,
      updateLead,
      archiveLead,
      convertLead,
      writing: createState.pending || updateState.pending || archiveState.pending || convertState.pending,
      writeError: createState.error ?? updateState.error ?? archiveState.error ?? convertState.error,
      fieldErrors: createState.fieldErrors,
      convertError: convertState.error,
      /** Dismissing a write banner has to clear the state that renders it. */
      clearWriteError: () => {
        createState.reset()
        updateState.reset()
        archiveState.reset()
        convertState.reset()
      },
    }),
    [resource, refetch, createLead, updateLead, archiveLead, convertLead, createState, updateState, archiveState, convertState],
  )
}

/**
 * Lead counts per status, for the whole workspace.
 *
 * The Board view used to bucket the loaded page into status columns, so on a
 * 500-lead tenant each column counted a slice of 25 and presented it as the
 * total. These are the server's counts for every status.
 */
export function useLeadSummary() {
  const resource = useResource<{ byStatus: Record<string, number> }>(
    'crm-lead-summary',
    useCallback((signal) => api.get<{ byStatus: Record<string, number> }>('/crm/leads/summary', undefined, signal), []),
  )
  return {
    byStatus: resource.data?.byStatus,
    /**
     * Loaded, failed and still-in-flight are three different answers. Without
     * this a caller can only see "no counts", and a failed request then renders
     * as a permanent "loading…" that will never finish.
     */
    loaded: resource.data !== undefined,
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    denied: resource.denied,
    canRetry: resource.canRetry,
    refetch: resource.refetch,
  }
}

/** Shared filter state, so the toolbar and the list cannot disagree. */
export function useLeadFilters() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [source, setSource] = useState('')
  const [sort, setSort] = useState<'recent' | 'score'>('recent')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)

  const filters: LeadFilters = { query, status, source, sort, limit: pageSize, offset: page * pageSize }

  return {
    filters,
    query,
    status,
    source,
    sort,
    page,
    pageSize,
    setQuery: (value: string) => {
      setQuery(value)
      // A new search must start at page one, or the list looks empty.
      setPage(0)
    },
    setStatus: (value: string) => {
      setStatus(value)
      setPage(0)
    },
    setSource: (value: string) => {
      setSource(value)
      setPage(0)
    },
    setSort: (value: 'recent' | 'score') => {
      setSort(value)
      setPage(0)
    },
    setPageSize: (value: number) => {
      setPageSize(value)
      setPage(0)
    },
    setPage,
  }
}
