'use client'

import { Navigate, useLocation } from '../lib/router'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'

/** Gate for post-signup screens. `requireOnboarding` keeps new tenants in the wizard. */
export function Protected({
  children,
  requireOnboarding = false,
}: {
  children: ReactNode
  requireOnboarding?: boolean
}) {
  const { session, ready } = useAuth()
  const location = useLocation()

  if (!ready) return <p role="status" className="p-6 text-sm text-fg-muted">Loading workspace…</p>
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (requireOnboarding && !session.onboarding) return <Navigate to="/onboarding" replace />

  return <>{children}</>
}
