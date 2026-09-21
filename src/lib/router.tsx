'use client'

/**
 * The navigation surface the screens were written against, implemented on
 * Next's router.
 *
 * Every component in `src/` predates the move to Next and reaches for a small,
 * stable set of helpers — `<Link to>`, `useLocation()`, a `useSearchParams()`
 * that returns a tuple. Re-expressing those here means routing is genuinely
 * Next's (real route segments, real prefetching) while none of the screens had
 * to be rewritten around a different API.
 */

import NextLink from 'next/link'
import { useParams as useNextParams, usePathname, useRouter, useSearchParams as useNextSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, type AnchorHTMLAttributes, type ReactNode } from 'react'

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string
  replace?: boolean
  children?: ReactNode
}

export function Link({ to, replace, children, ...rest }: LinkProps) {
  return (
    <NextLink href={to} replace={replace} {...rest}>
      {children}
    </NextLink>
  )
}

/**
 * Every call site computes its own active state and passes a plain string
 * class, so this is `Link` — kept as a separate name because that is what the
 * screens read as, and what they would use again.
 */
export const NavLink = Link

/** Route params as plain strings — a catch-all segment joins back into a path. */
export function useParams<T extends Record<string, string> = Record<string, string>>(): Partial<T> {
  const params = useNextParams()
  return useMemo(() => {
    const flat: Record<string, string> = {}
    for (const [key, value] of Object.entries(params ?? {})) {
      flat[key] = Array.isArray(value) ? value.join('/') : String(value ?? '')
    }
    return flat as Partial<T>
  }, [params])
}

/**
 * Path only, deliberately. Reading the query is what forces a route out of
 * static rendering, and almost every caller here only wants to know which nav
 * item to light up — the two that need the query ask for it directly.
 */
export function useLocation() {
  const pathname = usePathname()
  return useMemo(() => ({ pathname: pathname ?? '/', hash: '' }), [pathname])
}

export function useNavigate() {
  const router = useRouter()
  return useCallback(
    (to: string | number, options?: { replace?: boolean }) => {
      if (typeof to === 'number') {
        if (to < 0) router.back()
        else router.forward()
        return
      }
      if (options?.replace) router.replace(to)
      else router.push(to)
    },
    [router],
  )
}

type ParamInit = Record<string, string> | URLSearchParams

/**
 * `[params, setParams]`, the shape the screens use. The setter takes the whole
 * next query — which is how every call site already uses it — and writes it to
 * the current path.
 */
export function useSearchParams(): [URLSearchParams, (next: ParamInit, options?: { replace?: boolean }) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const current = useNextSearchParams()

  const params = useMemo(() => new URLSearchParams(current?.toString() ?? ''), [current])

  const setParams = useCallback(
    (next: ParamInit, options?: { replace?: boolean }) => {
      const query = new URLSearchParams(next instanceof URLSearchParams ? next : next).toString()
      const url = query ? `${pathname}?${query}` : pathname
      if (options?.replace) router.replace(url)
      else router.push(url)
    },
    [pathname, router],
  )

  return [params, setParams]
}

/**
 * Renders nothing and redirects. The guards that use it return it *instead of*
 * a screen, so there is no wrong frame to avoid — which means the navigation
 * belongs in an effect, where React allows it.
 */
export function Navigate({ to, replace = true }: { to: string; replace?: boolean; state?: unknown }) {
  const router = useRouter()

  useEffect(() => {
    if (replace) router.replace(to)
    else router.push(to)
  }, [router, to, replace])

  return null
}
