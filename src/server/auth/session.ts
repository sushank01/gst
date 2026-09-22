import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Db } from '../db/client.ts'

/**
 * Opaque cookie sessions held in the database.
 *
 * The cookie carries 256 bits of randomness and nothing else — no user id, no
 * role, no tenant, nothing signed that a client could tamper with or that would
 * keep working after a revoke. Every request resolves it against the database,
 * so "log out everywhere" and "suspend this member" take effect immediately
 * rather than at the next token expiry.
 *
 * Only the SHA-256 of the token is stored, so a database dump does not yield
 * usable cookies.
 */

export const SESSION_COOKIE = 'apragya_session'
/** Absolute lifetime. A session cannot outlive this regardless of activity. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Idle timeout. Silence for longer than this ends the session. */
export const SESSION_IDLE_MS = 14 * 24 * 60 * 60 * 1000
/** `last_seen_at` is only written when it is this stale, to avoid a write per request. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000

export type SessionRecord = {
  id: string
  userId: string
  tenantId: string | null
  issuedAt: Date
  lastSeenAt: Date
  expiresAt: Date
}

export type ResolvedSession = SessionRecord & {
  user: { id: string; email: string; fullName: string; status: string; emailVerifiedAt: Date | null }
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** 256 bits, URL-safe. Long enough that guessing is not a threat model. */
export const newToken = () => randomBytes(32).toString('base64url')

/** Constant-time compare for any caller checking a secret it already holds. */
export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export type CreateSessionInput = {
  userId: string
  tenantId?: string | null
  ip?: string | null
  userAgent?: string | null
  ttlMs?: number
}

/** Returns the plaintext token exactly once — it is never recoverable afterwards. */
export async function createSession(
  db: Db,
  input: CreateSessionInput,
  now: Date,
): Promise<{ token: string; session: SessionRecord }> {
  const token = newToken()
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? SESSION_TTL_MS))
  const { rows } = await db.query<{
    id: string
    user_id: string
    tenant_id: string | null
    issued_at: Date
    last_seen_at: Date
    expires_at: Date
  }>(
    `insert into sessions (user_id, tenant_id, token_hash, issued_at, last_seen_at, expires_at, ip, user_agent)
     values ($1, $2, $3, $4, $4, $5, $6, $7)
     returning id, user_id, tenant_id, issued_at, last_seen_at, expires_at`,
    [
      input.userId,
      input.tenantId ?? null,
      hashToken(token),
      now,
      expiresAt,
      input.ip ?? null,
      (input.userAgent ?? '').slice(0, 400) || null,
    ],
  )
  const row = rows[0]
  return {
    token,
    session: {
      id: row.id,
      userId: row.user_id,
      tenantId: row.tenant_id,
      issuedAt: new Date(row.issued_at),
      lastSeenAt: new Date(row.last_seen_at),
      expiresAt: new Date(row.expires_at),
    },
  }
}

/**
 * Resolves a cookie to a live session, or null.
 *
 * Null covers every failure identically — unknown token, revoked, expired,
 * idle-timed-out, suspended or deleted user — because the caller must treat
 * them the same and distinguishing them leaks information.
 */
export async function resolveSession(db: Db, token: string | undefined | null, now: Date): Promise<ResolvedSession | null> {
  if (!token) return null
  const { rows } = await db.query<{
    id: string
    user_id: string
    tenant_id: string | null
    issued_at: Date
    last_seen_at: Date
    expires_at: Date
    revoked_at: Date | null
    email: string
    full_name: string
    user_status: string
    email_verified_at: Date | null
  }>(
    `select s.id, s.user_id, s.tenant_id, s.issued_at, s.last_seen_at, s.expires_at, s.revoked_at,
            u.email, u.full_name, u.status as user_status, u.email_verified_at
       from sessions s
       join users u on u.id = s.user_id
      where s.token_hash = $1`,
    [hashToken(token)],
  )
  const row = rows[0]
  if (!row) return null
  if (row.revoked_at) return null
  if (new Date(row.expires_at).getTime() <= now.getTime()) return null
  if (now.getTime() - new Date(row.last_seen_at).getTime() > SESSION_IDLE_MS) return null
  if (row.user_status !== 'active') return null

  if (now.getTime() - new Date(row.last_seen_at).getTime() > TOUCH_INTERVAL_MS) {
    await db.query('update sessions set last_seen_at = $2 where id = $1', [row.id, now])
  }

  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    issuedAt: new Date(row.issued_at),
    lastSeenAt: new Date(row.last_seen_at),
    expiresAt: new Date(row.expires_at),
    user: {
      id: row.user_id,
      email: row.email,
      fullName: row.full_name,
      status: row.user_status,
      emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at) : null,
    },
  }
}

export async function revokeSession(db: Db, sessionId: string, now: Date): Promise<void> {
  await db.query('update sessions set revoked_at = $2 where id = $1 and revoked_at is null', [sessionId, now])
}

/** Used on password change and on explicit "sign out everywhere". */
export async function revokeAllUserSessions(db: Db, userId: string, now: Date, exceptSessionId?: string): Promise<number> {
  const { rowCount } = await db.query(
    `update sessions set revoked_at = $2
      where user_id = $1 and revoked_at is null and ($3::uuid is null or id <> $3)`,
    [userId, now, exceptSessionId ?? null],
  )
  return rowCount
}

/**
 * Switching tenants issues a *new* token and revokes the old one, so a stolen
 * cookie cannot be replayed to follow a user into another tenant.
 */
export async function rotateSessionTenant(
  db: Db,
  sessionId: string,
  tenantId: string | null,
  now: Date,
): Promise<{ token: string; session: SessionRecord } | null> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ user_id: string; ip: string | null; user_agent: string | null }>(
      'select user_id, ip, user_agent from sessions where id = $1 and revoked_at is null for update',
      [sessionId],
    )
    if (!rows[0]) return null
    await tx.query('update sessions set revoked_at = $2 where id = $1', [sessionId, now])
    return createSession(tx, { userId: rows[0].user_id, tenantId, ip: rows[0].ip, userAgent: rows[0].user_agent }, now)
  })
}

/** Housekeeping for the scheduled reaper; keeps the table from growing without bound. */
export async function purgeExpiredSessions(db: Db, now: Date): Promise<number> {
  const { rowCount } = await db.query('delete from sessions where expires_at < $1', [
    new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
  ])
  return rowCount
}

export function sessionCookieOptions(expiresAt: Date, secure: boolean) {
  return {
    httpOnly: true,
    secure,
    // `lax` still sends the cookie on top-level GET navigation (so OAuth
    // callbacks and email links land signed in) while blocking cross-site POST.
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  }
}
