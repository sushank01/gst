'use client'

import { useCallback, useMemo } from 'react'
import { api } from '../../../lib/api.ts'
import { useMutation, useResource } from '../../../lib/useResource.ts'

/**
 * The tenant's legal entities, from the server.
 *
 * The primary entity used to be synthesised here: its name came from the
 * organisation typed at signup, its code from the first three letters of that
 * name, and its currency and country were the literals 'USD' and 'US' — printed
 * in the same columns as entities somebody had actually entered. The row is
 * real, created with the workspace, so all of that is gone and nothing is
 * layered over it.
 */

export type ServerCompany = {
  id: string
  name: string
  code: string
  currency: string
  timezone: string
  country: string | null
  taxId: string | null
  parentId: string | null
  /** Resolved by the server, so a parent in another page of the list still names. */
  parentName: string | null
  isPrimary: boolean
  archivedAt: string | null
}

export type CompanyInput = {
  name: string
  code: string
  currency: string
  country?: string
  parentId?: string
}

/** Everything the server will accept as an edit. `code` is not among them. */
export type CompanyPatch = {
  name?: string
  currency?: string
  country?: string | null
  parentId?: string | null
}

export function useCompanies(includeArchived = false) {
  const resource = useResource<{ companies: ServerCompany[] }>(
    `companies:${includeArchived}`,
    useCallback(
      (signal) =>
        api.get<{ companies: ServerCompany[] }>('/companies', { includeArchived: includeArchived || undefined }, signal),
      [includeArchived],
    ),
  )
  const { refetch } = resource

  const [createCompany, createState] = useMutation(async (input: CompanyInput) => {
    const created = await api.post<{ company: ServerCompany }>('/companies', {
      name: input.name,
      code: input.code,
      currency: input.currency,
      country: input.country || undefined,
      parentId: input.parentId || undefined,
    })
    refetch()
    return created.company
  })

  const [updateCompany, updateState] = useMutation(async (id: string, patch: CompanyPatch) => {
    const updated = await api.patch<{ company: ServerCompany }>(`/companies/${id}`, patch)
    refetch()
    return updated.company
  })

  const [archiveCompany, archiveState] = useMutation(async (id: string) => {
    await api.delete(`/companies/${id}`)
    refetch()
  })

  const [makePrimary, primaryState] = useMutation(async (id: string) => {
    const promoted = await api.post<{ company: ServerCompany }>(`/companies/${id}/primary`)
    refetch()
    return promoted.company
  })

  return useMemo(
    () => ({
      entities: resource.data?.companies ?? [],
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      createCompany,
      updateCompany,
      archiveCompany,
      makePrimary,
      writing: createState.pending || updateState.pending || archiveState.pending || primaryState.pending,
      writeError: createState.error ?? updateState.error ?? archiveState.error ?? primaryState.error,
      fieldErrors: { ...createState.fieldErrors, ...updateState.fieldErrors },
    }),
    [resource, refetch, createCompany, updateCompany, archiveCompany, makePrimary, createState, updateState, archiveState, primaryState],
  )
}
