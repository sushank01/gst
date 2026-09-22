'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiClientError, api } from './api.ts'
import type { OnboardingProfile, Session, User } from './types'

/**
 * Real authentication against the server.
 *
 * Nothing here decides who you are. The session lives in an httpOnly cookie the
 * browser cannot read, `/auth/session` is the only source of identity, and the
 * server re-checks every request independently. The previous implementation
 * minted a local identity from whatever email was typed and ignored the
 * password entirely; that is gone.
 */

type SignUpInput = {
  fullName: string
  email: string
  password: string
  organization?: string
}

export type TenantSummary = { id: string; name: string; slug: string; role: string; currency: string }

type AuthValue = {
  /** False until the server has been asked who this is. Guards must wait. */
  ready: boolean
  session: Session | null
  tenants: TenantSummary[]
  activeTenantId: string | null
  signUp: (input: SignUpInput) => Promise<Session>
  signIn: (input: { email: string; password: string }) => Promise<Session>
  signOut: () => Promise<void>
  completeOnboarding: (profile: Omit<OnboardingProfile, 'completedAt'>) => Promise<void>
  switchTenant: (tenantId: string) => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

type SessionResponse = {
  user: { id: string; email: string; fullName: string; emailVerified: boolean }
  activeTenantId: string | null
  tenants: TenantSummary[]
}

/**
 * Onboarding is "complete" when the account has a workspace. That is a server
 * fact — a membership row — rather than a flag the browser could set to skip
 * the wizard.
 */
function toSession(response: SessionResponse): Session {
  const active = response.tenants.find((tenant) => tenant.id === response.activeTenantId) ?? null
  const user: User = {
    id: response.user.id,
    fullName: response.user.fullName,
    email: response.user.email,
    organization: active?.name ?? null,
    provider: 'password',
  }
  return {
    user,
    onboarding: active
      ? { workspaceName: active.name, industry: '', teamSize: '', apps: [], completedAt: '' }
      : null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [tenants, setTenants] = useState<TenantSummary[]>([])
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await api.get<SessionResponse>('/auth/session')
      setSession(toSession(response))
      setTenants(response.tenants)
      setActiveTenantId(response.activeTenantId)
    } catch (error) {
      // 401 is the normal signed-out answer, not a failure worth surfacing.
      if (!(error instanceof ApiClientError) || !error.isAuth) console.warn('session lookup failed', error)
      setSession(null)
      setTenants([])
      setActiveTenantId(null)
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const signUp = useCallback(
    async (input: SignUpInput) => {
      await api.post('/auth/register', {
        email: input.email.trim(),
        fullName: input.fullName.trim(),
        password: input.password,
      })
      const response = await api.get<SessionResponse>('/auth/session')
      const next = toSession(response)
      setSession(next)
      setTenants(response.tenants)
      setActiveTenantId(response.activeTenantId)
      return next
    },
    [],
  )

  const signIn = useCallback(async (input: { email: string; password: string }) => {
    await api.post('/auth/login', { email: input.email.trim(), password: input.password })
    const response = await api.get<SessionResponse>('/auth/session')
    const next = toSession(response)
    setSession(next)
    setTenants(response.tenants)
    setActiveTenantId(response.activeTenantId)
    return next
  }, [])

  const signOut = useCallback(async () => {
    // Revoke server-side first; clearing local state alone would leave a live
    // session that any other tab could keep using.
    await api.post('/auth/logout').catch(() => undefined)
    setSession(null)
    setTenants([])
    setActiveTenantId(null)
  }, [])

  /**
   * Creates the workspace. The wizard's other answers are collected but not yet
   * persisted anywhere server-side, so they are deliberately not claimed as
   * saved — see Loop 12 in the implementation plan.
   */
  const completeOnboarding = useCallback(
    async (profile: Omit<OnboardingProfile, 'completedAt'>) => {
      await api.post('/tenants', { name: profile.workspaceName.trim() })
      await load()
    },
    [load],
  )

  const switchTenant = useCallback(
    async (tenantId: string) => {
      await api.post('/tenants/switch', { tenantId })
      await load()
    },
    [load],
  )

  const value = useMemo(
    () => ({ ready, session, tenants, activeTenantId, signUp, signIn, signOut, completeOnboarding, switchTenant, refresh: load }),
    [ready, session, tenants, activeTenantId, signUp, signIn, signOut, completeOnboarding, switchTenant, load],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
