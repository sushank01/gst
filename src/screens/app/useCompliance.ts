'use client'

import { useCallback } from 'react'
import { api } from '../../lib/api.ts'
import { useResource, useMutation } from '../../lib/useResource.ts'

/**
 * The compliance registers, from the server.
 *
 * One hook per register rather than one for all five: each pane loads only
 * what it shows, and a failure in one does not blank the others. They share
 * the convention that a write refetches its own list, so the count beside a
 * table is always the count the server holds.
 */

export type InventoryField = {
  id: string
  entity: string
  field: string
  category: string
  sensitive: boolean
  legalBasis: string
  retention: string | null
  notes: string | null
}

export type DataFlow = {
  id: string
  name: string
  direction: string
  source: string
  destination: string
  crossBorder: string | null
}

export type Dpia = {
  id: string
  title: string
  processing: string
  riskLevel: string
  status: string
  mitigations: string | null
  reviewedOn: string | null
  nextReviewOn: string | null
  version: number
}

export type AutomatedDecision = {
  id: string
  name: string
  description: string | null
  profiling: boolean
  humanReview: boolean
  logicSummary: string | null
}

export type RetentionPolicy = {
  id: string
  subject: string
  keepForDays: number
  enabled: boolean
  note: string | null
  /** Always false: nothing deletes anything on a schedule on this deployment. */
  enforced: boolean
}

export function useInventory() {
  const resource = useResource<{ fields: InventoryField[] }>(
    'compliance:inventory',
    useCallback((signal) => api.get<{ fields: InventoryField[] }>('/compliance/inventory', undefined, signal), []),
  )
  const { refetch } = resource

  const [add, addState] = useMutation(async (input: Omit<InventoryField, 'id'>) => {
    const created = await api.post<{ field: InventoryField }>('/compliance/inventory', input)
    refetch()
    return created.field
  })
  const [remove] = useMutation(async (id: string) => {
    await api.delete(`/compliance/inventory/${id}`)
    refetch()
  })

  return { ...resource, fields: resource.data?.fields ?? [], add, remove, writeError: addState.error }
}

export function useFlows() {
  const resource = useResource<{ flows: DataFlow[] }>(
    'compliance:flows',
    useCallback((signal) => api.get<{ flows: DataFlow[] }>('/compliance/flows', undefined, signal), []),
  )
  const { refetch } = resource

  const [add, addState] = useMutation(async (input: Omit<DataFlow, 'id'>) => {
    const created = await api.post<{ flow: DataFlow }>('/compliance/flows', input)
    refetch()
    return created.flow
  })
  const [remove] = useMutation(async (id: string) => {
    await api.delete(`/compliance/flows/${id}`)
    refetch()
  })

  return { ...resource, flows: resource.data?.flows ?? [], add, remove, writeError: addState.error }
}

export function useDpias() {
  const resource = useResource<{ dpias: Dpia[] }>(
    'compliance:dpias',
    useCallback((signal) => api.get<{ dpias: Dpia[] }>('/compliance/dpias', undefined, signal), []),
  )
  const { refetch } = resource

  const [add, addState] = useMutation(
    async (input: { title: string; processing: string; riskLevel?: string; mitigations?: string; nextReviewOn?: string }) => {
      const created = await api.post<{ dpia: Dpia }>('/compliance/dpias', input)
      refetch()
      return created.dpia
    },
  )
  // The version goes with every change, so a second reviewer editing the same
  // assessment is told rather than silently overwritten.
  const [update] = useMutation(async (id: string, version: number, patch: Partial<Dpia>) => {
    const updated = await api.patch<{ dpia: Dpia }>(`/compliance/dpias/${id}`, { version, ...patch })
    refetch()
    return updated.dpia
  })

  return { ...resource, dpias: resource.data?.dpias ?? [], add, update, writeError: addState.error }
}

export function useAutomatedDecisions() {
  const resource = useResource<{ decisions: AutomatedDecision[] }>(
    'compliance:decisions',
    useCallback((signal) => api.get<{ decisions: AutomatedDecision[] }>('/compliance/decisions', undefined, signal), []),
  )
  const { refetch } = resource

  const [add, addState] = useMutation(async (input: Omit<AutomatedDecision, 'id'>) => {
    const created = await api.post<{ decision: AutomatedDecision }>('/compliance/decisions', input)
    refetch()
    return created.decision
  })
  const [remove] = useMutation(async (id: string) => {
    await api.delete(`/compliance/decisions/${id}`)
    refetch()
  })

  return { ...resource, decisions: resource.data?.decisions ?? [], add, remove, writeError: addState.error }
}

export function useRetentionPolicies() {
  const resource = useResource<{ policies: RetentionPolicy[] }>(
    'compliance:retention',
    useCallback((signal) => api.get<{ policies: RetentionPolicy[] }>('/compliance/retention', undefined, signal), []),
  )
  const { refetch } = resource

  const [add, addState] = useMutation(async (input: { subject: string; keepForDays: number; note?: string }) => {
    const created = await api.post<{ policy: RetentionPolicy }>('/compliance/retention', input)
    refetch()
    return created.policy
  })
  const [remove] = useMutation(async (id: string) => {
    await api.delete(`/compliance/retention/${id}`)
    refetch()
  })

  return { ...resource, policies: resource.data?.policies ?? [], add, remove, writeError: addState.error }
}
