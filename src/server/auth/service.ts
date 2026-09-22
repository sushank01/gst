import { createHash, randomBytes } from 'node:crypto'
import type { Db } from '../db/client.ts'
import { conflict, invalidInput, tooManyRequests, unauthorized } from '../http/errors.ts'
import { CURRENT_PARAMS, equivalentWork, hashPassword, needsRehash, passwordProblem, verifyPassword } from './password.ts'
import { createSession, hashToken, newToken, revokeAllUserSessions, type SessionRecord } from './session.ts'

/**
 * Registration, sign-in, verification and password reset.
 *
 * Every function takes an explicit `now` rather than reading the clock, so
 * expiry, lockout and token windows are testable without sleeping.
 */

/** Consecutive failures before the account is temporarily locked. */
export const MAX_FAILED_LOGINS = 8
export const LOCKOUT_MS = 15 * 60 * 1000
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000
export const RESET_TTL_MS = 60 * 60 * 1000
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000

const normaliseEmail = (email: string) => email.trim()

/** Intentionally permissive: the deliverability check is the verification mail. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function emailProblem(email: string): string | null {
  const value = normaliseEmail(email)
  if (!value) return 'Enter your email address.'
  if (value.length > 320) return 'That email address is too long.'
  if (!EMAIL_RE.test(value)) return 'Enter a valid email address.'
  return null
}

export type UserRow = {
  id: string
  email: string
  full_name: string
  password_hash: string | null
  email_verified_at: Date | null
  status: string
  failed_logins: number
  locked_until: Date | null
}

async function findByEmail(db: Db, email: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `select id, email, full_name, password_hash, email_verified_at, status, failed_logins, locked_until
       from users where lower(email) = lower($1)`,
    [normaliseEmail(email)],
  )
  return rows[0] ?? null
}

export type RegisterInput = { email: string; fullName: string; password: string }

/**
 * Creates an unverified account plus its verification token.
 *
 * The token is returned in plaintext exactly once, for the caller to put in an
 * email — only its hash is stored, so the database cannot be used to verify
 * somebody else's address.
 */
export async function registerUser(
  db: Db,
  input: RegisterInput,
  now: Date,
): Promise<{ userId: string; verificationToken: string }> {
  const fields: Record<string, string> = {}
  const emailIssue = emailProblem(input.email)
  if (emailIssue) fields.email = emailIssue
  const passwordIssue = passwordProblem(input.password)
  if (passwordIssue) fields.password = passwordIssue
  if (!input.fullName?.trim()) fields.fullName = 'Enter your name.'
  if (Object.keys(fields).length) throw invalidInput(fields)

  const passwordHash = await hashPassword(input.password)

  return db.transaction(async (tx) => {
    const existing = await findByEmail(tx, input.email)
    if (existing) {
      // A distinct message here is a deliberate, narrow trade-off: sign-up must
      // tell someone their address is already registered or the form is unusable.
      // Sign-in stays uniform, which is where enumeration actually matters.
      throw conflict('An account already exists for that email address.')
    }
    const { rows } = await tx.query<{ id: string }>(
      `insert into users (email, full_name, password_hash) values ($1, $2, $3) returning id`,
      [normaliseEmail(input.email), input.fullName.trim(), passwordHash],
    )
    const userId = rows[0].id
    const verificationToken = await issueToken(tx, {
      purpose: 'email_verify',
      userId,
      email: normaliseEmail(input.email),
      ttlMs: VERIFY_TTL_MS,
      now,
    })
    return { userId, verificationToken }
  })
}

export type IssueTokenInput = {
  purpose: 'email_verify' | 'password_reset' | 'invitation' | 'mfa_enroll'
  userId?: string | null
  tenantId?: string | null
  email?: string | null
  payload?: Record<string, unknown>
  ttlMs: number
  now: Date
}

export async function issueToken(db: Db, input: IssueTokenInput): Promise<string> {
  const token = newToken()
  await db.query(
    `insert into auth_tokens (purpose, token_hash, user_id, tenant_id, email, payload, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.purpose,
      hashToken(token),
      input.userId ?? null,
      input.tenantId ?? null,
      input.email ?? null,
      JSON.stringify(input.payload ?? {}),
      new Date(input.now.getTime() + input.ttlMs),
    ],
  )
  return token
}

export type ConsumedToken = {
  id: string
  purpose: string
  userId: string | null
  tenantId: string | null
  email: string | null
  payload: Record<string, unknown>
}

/**
 * Single-use consumption. The `consumed_at is null` predicate is part of the
 * UPDATE, so two concurrent requests with the same token cannot both succeed —
 * the second updates zero rows.
 */
export async function consumeToken(
  db: Db,
  token: string,
  purpose: ConsumedToken['purpose'],
  now: Date,
): Promise<ConsumedToken | null> {
  const { rows } = await db.query<{
    id: string
    purpose: string
    user_id: string | null
    tenant_id: string | null
    email: string | null
    payload: Record<string, unknown>
  }>(
    `update auth_tokens set consumed_at = $3
      where token_hash = $1 and purpose = $2 and consumed_at is null and expires_at > $3
      returning id, purpose, user_id, tenant_id, email, payload`,
    [hashToken(token), purpose, now],
  )
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    purpose: row.purpose,
    userId: row.user_id,
    tenantId: row.tenant_id,
    email: row.email,
    payload: row.payload ?? {},
  }
}

export async function verifyEmail(db: Db, token: string, now: Date): Promise<string | null> {
  const consumed = await consumeToken(db, token, 'email_verify', now)
  if (!consumed?.userId) return null
  await db.query('update users set email_verified_at = coalesce(email_verified_at, $2), updated_at = $2 where id = $1', [
    consumed.userId,
    now,
  ])
  return consumed.userId
}

export type SignInInput = { email: string; password: string; ip?: string | null; userAgent?: string | null }

/**
 * Verifies a password and starts a session.
 *
 * Failure is uniform: `unauthorized` with one message for an unknown address, a
 * wrong password, a provider-only account and a suspended user alike. An
 * unknown address still performs one scrypt-equivalent of work so the response
 * time does not reveal whether the account exists.
 */
export async function signIn(
  db: Db,
  input: SignInInput,
  now: Date,
): Promise<{ token: string; session: SessionRecord; userId: string; emailVerified: boolean }> {
  const user = await findByEmail(db, input.email)

  if (!user) {
    await equivalentWork(input.password || 'x'.repeat(12))
    throw unauthorized('That email address and password do not match.')
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > now.getTime()) {
    const seconds = Math.ceil((new Date(user.locked_until).getTime() - now.getTime()) / 1000)
    throw tooManyRequests('Too many failed attempts. Try again shortly.', seconds)
  }

  const ok = user.status === 'active' && (await verifyPassword(input.password, user.password_hash))

  if (!ok) {
    const failed = user.failed_logins + 1
    const lockedUntil = failed >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCKOUT_MS) : null
    await db.query('update users set failed_logins = $2, locked_until = $3, updated_at = $4 where id = $1', [
      user.id,
      lockedUntil ? 0 : failed,
      lockedUntil,
      now,
    ])
    throw unauthorized('That email address and password do not match.')
  }

  // A correct password on an old hash is the only moment the plaintext is
  // available, so upgrade the cost parameters here rather than forcing a reset.
  if (needsRehash(user.password_hash, CURRENT_PARAMS)) {
    await db.query('update users set password_hash = $2 where id = $1', [user.id, await hashPassword(input.password)])
  }

  await db.query('update users set failed_logins = 0, locked_until = null, last_login_at = $2, updated_at = $2 where id = $1', [
    user.id,
    now,
  ])

  const { token, session } = await createSession(
    db,
    { userId: user.id, ip: input.ip ?? null, userAgent: input.userAgent ?? null },
    now,
  )
  return { token, session, userId: user.id, emailVerified: Boolean(user.email_verified_at) }
}

/**
 * Starts a reset. Returns null for an unknown address — the caller sends the
 * same "check your email" response either way, so the form cannot be used to
 * discover which addresses are registered.
 */
export async function requestPasswordReset(db: Db, email: string, now: Date): Promise<{ userId: string; token: string } | null> {
  const user = await findByEmail(db, email)
  if (!user || user.status !== 'active') return null
  const token = await issueToken(db, { purpose: 'password_reset', userId: user.id, email: user.email, ttlMs: RESET_TTL_MS, now })
  return { userId: user.id, token }
}

/** Resetting a password ends every existing session; a thief's cookie must not survive it. */
export async function resetPassword(db: Db, token: string, newPassword: string, now: Date): Promise<string | null> {
  const problem = passwordProblem(newPassword)
  if (problem) throw invalidInput({ password: problem })

  const hash = await hashPassword(newPassword)
  return db.transaction(async (tx) => {
    const consumed = await consumeToken(tx, token, 'password_reset', now)
    if (!consumed?.userId) return null
    await tx.query(
      `update users set password_hash = $2, failed_logins = 0, locked_until = null,
              email_verified_at = coalesce(email_verified_at, $3), updated_at = $3
        where id = $1`,
      [consumed.userId, hash, now],
    )
    await revokeAllUserSessions(tx, consumed.userId, now)
    return consumed.userId
  })
}

export async function changePassword(
  db: Db,
  userId: string,
  currentPassword: string,
  newPassword: string,
  now: Date,
  keepSessionId?: string,
): Promise<void> {
  const { rows } = await db.query<{ password_hash: string | null }>('select password_hash from users where id = $1', [userId])
  if (!rows[0]) throw unauthorized()
  if (!(await verifyPassword(currentPassword, rows[0].password_hash))) {
    throw invalidInput({ currentPassword: 'That password is not correct.' })
  }
  const problem = passwordProblem(newPassword)
  if (problem) throw invalidInput({ newPassword: problem })
  const hash = await hashPassword(newPassword)
  await db.transaction(async (tx) => {
    await tx.query('update users set password_hash = $2, updated_at = $3 where id = $1', [userId, hash, now])
    await revokeAllUserSessions(tx, userId, now, keepSessionId)
  })
}

/** Stable pseudonymous key for rate limiting by address without storing it. */
export const rateLimitKey = (scope: string, value: string) =>
  `${scope}:${createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0, 32)}`

export const randomSlug = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'tenant'}-${randomBytes(3).toString('hex')}`
