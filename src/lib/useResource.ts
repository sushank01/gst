'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiClientError } from './api.ts'

/**
 * Server data with every state a screen has to show.
 *
 * The prototype read from a context that was always present, so screens only
 * ever had "data" and "empty". Real data has more states than that, and
 * conflating them is how an empty list ends up hiding a failed request. This
 * distinguishes: first load, refreshing, empty, denied, not-found, retryable
 * failure, and stale-while-refetching.
 */

export type ResourceState<T> = {
  data: T | undefined
  /** First load only — a spinner. A refetch shows `refreshing` instead. */
  loading: boolean
  refreshing: boolean
  error: ApiClientError | null
  /** The caller may retry a network or server failure; a 403 it may not. */
  canRetry: boolean
  denied: boolean
  refetch: () => void
}

export function useResource<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: { enabled?: boolean } = {},
): ResourceState<T> {
  const enabled = options.enabled !== false
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(enabled)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<ApiClientError | null>(null)
  const [nonce, setNonce] = useState(0)

  // Keeping the fetcher in a ref means an inline arrow does not restart the
  // request on every render — the `key` decides when to refetch.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const hasData = useRef(false)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    let cancelled = false

    if (hasData.current) setRefreshing(true)
    else setLoading(true)

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (cancelled) return
        setData(result)
        hasData.current = true
        setError(null)
      })
      .catch((caught: unknown) => {
        if (cancelled || (caught as Error)?.name === 'AbortError') return
        setError(
          caught instanceof ApiClientError
            ? caught
            : new ApiClientError(0, 'unknown', 'Something went wrong loading this.'),
        )
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [key, nonce, enabled])

  const refetch = useCallback(() => setNonce((value) => value + 1), [])

  return {
    data,
    loading,
    refreshing,
    error,
    canRetry: Boolean(error?.retryable) || error?.status === 404,
    denied: Boolean(error?.isDenied),
    refetch,
  }
}

export type MutationState = {
  pending: boolean
  error: ApiClientError | null
  fieldErrors: Record<string, string>
  reset: () => void
}

/**
 * A mutation with duplicate-submit protection.
 *
 * The in-flight guard is a ref, not state: a double click fires both handlers
 * before React re-renders, so a state flag would let the second one through.
 */
export function useMutation<Args extends unknown[], T>(
  run: (...args: Args) => Promise<T>,
): [(...args: Args) => Promise<T | undefined>, MutationState] {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ApiClientError | null>(null)
  const inFlight = useRef(false)

  const call = useCallback(
    async (...args: Args): Promise<T | undefined> => {
      if (inFlight.current) return undefined
      inFlight.current = true
      setPending(true)
      setError(null)
      try {
        return await run(...args)
      } catch (caught) {
        setError(
          caught instanceof ApiClientError ? caught : new ApiClientError(0, 'unknown', 'Something went wrong.'),
        )
        return undefined
      } finally {
        inFlight.current = false
        setPending(false)
      }
    },
    [run],
  )

  return [call, { pending, error, fieldErrors: error?.fields ?? {}, reset: () => setError(null) }]
}
