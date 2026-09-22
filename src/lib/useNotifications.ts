'use client'

import { useCallback } from 'react'
import { api } from './api.ts'
import { useAuth } from './auth.tsx'
import { useResource } from './useResource.ts'

/**
 * This person's notifications.
 *
 * Per person, not per workspace: the prototype kept one unread number for the
 * whole browser, so everybody sharing it saw the same badge and one of them
 * reading an item cleared it for all of them.
 */

export type Notification = {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  severity: string
  readAt: string | null
  createdAt: string
}

type Response = { rows: Notification[]; unread: number }

export function useNotifications(options: { unreadOnly?: boolean } = {}) {
  // Marketing pages mount the same providers; without the guard every visitor
  // fires a request that can only answer 401.
  const { ready, session, activeTenantId } = useAuth()
  const enabled = ready && Boolean(session) && Boolean(activeTenantId)

  const resource = useResource<Response>(
    `notifications:${activeTenantId ?? 'none'}:${options.unreadOnly ? 'unread' : 'all'}`,
    useCallback(
      (signal) => api.get<Response>('/notifications', { unreadOnly: options.unreadOnly || undefined }, signal),
      [options.unreadOnly],
    ),
    { enabled },
  )

  const { refetch } = resource
  const markRead = useCallback(
    async (id: string) => {
      await api.post(`/notifications/${id}/read`)
      refetch()
    },
    [refetch],
  )
  const markAllRead = useCallback(async () => {
    await api.post('/notifications/read-all')
    refetch()
  }, [refetch])

  return {
    notifications: resource.data?.rows ?? [],
    /*
     * Undefined until the first answer arrives — distinct from zero. A badge
     * that renders 0 while the request is in flight claims there is nothing
     * waiting, which it does not yet know.
     */
    unread: resource.data?.unread,
    loading: resource.loading,
    error: resource.error,
    /** A network or server failure may be retried; a 403 may not. */
    canRetry: resource.canRetry,
    refetch,
    markRead,
    markAllRead,
  }
}
