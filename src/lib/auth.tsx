'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { OnboardingProfile, Session, User } from './types'

/**
 * Client-side session stub. The real product authenticates against the
 * Apragya tenant service; this keeps the same shape so swapping in a
 * fetch-based implementation touches only this file.
 */

const STORAGE_KEY = 'apragya.session'

type SignUpInput = {
  fullName: string
  email: string
  organization?: string
  provider?: User['provider']
}

type AuthValue = {
  session: Session | null
  signUp: (input: SignUpInput) => Promise<Session>
  signIn: (input: { email: string; provider?: User['provider'] }) => Promise<Session>
  completeOnboarding: (profile: Omit<OnboardingProfile, 'completedAt'>) => void
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

function read(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function write(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable (private mode) — session stays in memory */
  }
}

const latency = (ms = 550) => new Promise((resolve) => setTimeout(resolve, ms))

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => read())

  const persist = useCallback((next: Session | null) => {
    setSession(next)
    write(next)
  }, [])

  const signUp = useCallback(
    async ({ fullName, email, organization, provider = 'password' }: SignUpInput) => {
      await latency()
      const next: Session = {
        user: {
          id: crypto.randomUUID(),
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          organization: organization?.trim() || null,
          provider,
        },
        onboarding: null,
      }
      persist(next)
      return next
    },
    [persist],
  )

  const signIn = useCallback(
    async ({ email, provider = 'password' }: { email: string; provider?: User['provider'] }) => {
      await latency()
      const existing = read()
      const next: Session = existing?.user.email === email.trim().toLowerCase()
        ? existing
        : {
            user: {
              id: crypto.randomUUID(),
              fullName: email.split('@')[0].replace(/[._-]+/g, ' '),
              email: email.trim().toLowerCase(),
              organization: null,
              provider,
            },
            onboarding: null,
          }
      persist(next)
      return next
    },
    [persist],
  )

  const completeOnboarding = useCallback(
    (profile: Omit<OnboardingProfile, 'completedAt'>) => {
      setSession((current) => {
        if (!current) return current
        const next: Session = {
          ...current,
          onboarding: { ...profile, completedAt: new Date().toISOString() },
        }
        write(next)
        return next
      })
    },
    [],
  )

  const signOut = useCallback(() => persist(null), [persist])

  const value = useMemo(
    () => ({ session, signUp, signIn, completeOnboarding, signOut }),
    [session, signUp, signIn, completeOnboarding, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
