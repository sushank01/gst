import { SESSION_COOKIE, sessionCookieOptions } from '../auth/session.ts'
import type { CookieInstruction } from './handler.ts'

/** HTTPS-only cookies outside development, where localhost has no certificate. */
export const secureCookies = () => process.env.NODE_ENV === 'production'

export const sessionCookie = (token: string, expiresAt: Date): CookieInstruction => ({
  name: SESSION_COOKIE,
  value: token,
  options: sessionCookieOptions(expiresAt, secureCookies()),
})

/** Expiring in the past is what actually removes it from the browser. */
export const clearedSessionCookie = (): CookieInstruction => ({
  name: SESSION_COOKIE,
  value: '',
  options: { ...sessionCookieOptions(new Date(0), secureCookies()), maxAge: 0 },
})
