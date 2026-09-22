'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiClientError, api } from './api.ts'
import { useAuth } from './auth.tsx'
import { useResource } from './useResource.ts'
import type { AppsResponse, CatalogEntry, Entitlement } from './useWorkspaceSummary.ts'

/**
 * Installed applications, from the server.
 *
 * Shared through a context rather than fetched per card, so a marketplace of
 * forty cards makes one request and every card reflects the same answer after
 * an install. Each card keeping its own copy is how one of them ends up
 * showing "Install" for something that is already installed.
 *
 * The server owns the decisions: the quota, whether an application is real,
 * and whether this role may change any of it. Nothing here second-guesses it —
 * the UI shows what the server said, including the refusal.
 */

type Value = {
  apps: CatalogEntry[]
  entitlement: Entitlement | undefined
  loading: boolean
  error: ApiClientError | null
  /** Non-null while a specific app is being changed, for that card's spinner. */
  pending: string | null
  lastRefusal: string | null
  install: (code: string) => Promise<void>
  uninstall: (code: string) => Promise<void>
  setEnabled: (code: string, enabled: boolean) => Promise<void>
  refetch: () => void
}

const InstallationsContext = createContext<Value | null>(null)

export function InstallationsProvider({ children }: { children: ReactNode }) {
  /*
   * This provider wraps the whole tree, marketing pages included. Without the
   * guard every visitor to the landing page would fire a request that can only
   * answer 401 — noise in the logs, and a console error on a public page.
   */
  const { ready, session, activeTenantId } = useAuth()
  const resource = useResource<AppsResponse>(
    `apps:${activeTenantId ?? 'none'}`,
    (signal) => api.get<AppsResponse>('/apps', undefined, signal),
    { enabled: ready && Boolean(session) && Boolean(activeTenantId) },
  )
  const [pending, setPending] = useState<string | null>(null)
  const [lastRefusal, setLastRefusal] = useState<string | null>(null)
  const { refetch } = resource

  const act = useCallback(
    async (code: string, run: () => Promise<unknown>) => {
      setPending(code)
      setLastRefusal(null)
      try {
        await run()
        refetch()
      } catch (error) {
        // A refusal is information, not a crash: the plan is full, or the
        // application has nothing behind it. The message is the server's.
        setLastRefusal(error instanceof ApiClientError ? error.message : 'That could not be changed.')
      } finally {
        setPending(null)
      }
    },
    [refetch],
  )

  const value = useMemo<Value>(
    () => ({
      apps: resource.data?.apps ?? [],
      entitlement: resource.data?.entitlement,
      loading: resource.loading,
      error: resource.error,
      pending,
      lastRefusal,
      install: (code) => act(code, () => api.post(`/apps/${code}`)),
      uninstall: (code) => act(code, () => api.delete(`/apps/${code}`)),
      setEnabled: (code, enabled) => act(code, () => api.patch(`/apps/${code}`, { enabled })),
      refetch,
    }),
    [resource.data, resource.loading, resource.error, pending, lastRefusal, act, refetch],
  )

  return <InstallationsContext value={value}>{children}</InstallationsContext>
}

export function useInstallations() {
  const context = useContext(InstallationsContext)
  if (!context) throw new Error('useInstallations must be used inside <InstallationsProvider>')
  return context
}

/** The state of one application for this workspace. */
export function useAppState(code: string): { status: string | null; releasable: boolean } {
  const { apps } = useInstallations()
  const entry = apps.find((app) => app.code === code)
  return { status: entry?.status ?? null, releasable: entry?.releasable ?? false }
}
