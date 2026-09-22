'use client'

import { useCallback, useMemo, useState } from 'react'
import { api } from '../../../lib/api.ts'
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
            limit: filters.limit,
            offset: filters.offset,
          },
          signal,
        ),
      [filters.query, filters.status, filters.source, filters.limit, filters.offset],
    ),
  )

  const [createLead, createState] = useMutation(async (input: Partial<ServerLead> & { name: string }) => {
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
    resource.refetch()
    return created.lead
  })

  const [updateLead, updateState] = useMutation(async (id: string, version: number, patch: Partial<ServerLead>) => {
    const updated = await api.patch<{ lead: ServerLead }>(`/crm/leads/${id}`, { version, ...patch })
    resource.refetch()
    return updated.lead
  })

  const [archiveLead, archiveState] = useMutation(async (id: string, version: number) => {
    await api.delete(`/crm/leads/${id}`, { version })
    resource.refetch()
  })

  return useMemo(
    () => ({
      leads: resource.data?.leads ?? [],
      /** Rows matching the filter on the server, not the page length. */
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
      createLead,
      updateLead,
      archiveLead,
      writing: createState.pending || updateState.pending || archiveState.pending,
      writeError: createState.error ?? updateState.error ?? archiveState.error,
      fieldErrors: createState.fieldErrors,
    }),
    [resource, createLead, updateLead, archiveLead, createState, updateState, archiveState],
  )
}

/** Shared filter state, so the toolbar and the list cannot disagree. */
export function useLeadFilters() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [source, setSource] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)

  const filters: LeadFilters = { query, status, source, limit: pageSize, offset: page * pageSize }

  return {
    filters,
    query,
    status,
    source,
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
    setPageSize: (value: number) => {
      setPageSize(value)
      setPage(0)
    },
    setPage,
  }
}
