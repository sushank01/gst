import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { hashPassword, verifyPassword, needsRehash, passwordProblem } from '../src/server/auth/password.ts'
import {
  registerUser, signIn, verifyEmail, requestPasswordReset, resetPassword, changePassword, consumeToken,
} from '../src/server/auth/service.ts'
import {
  resolveSession, revokeSession, revokeAllUserSessions, rotateSessionTenant, createSession,
  SESSION_IDLE_MS, SESSION_TTL_MS,
} from '../src/server/auth/session.ts'

const PASSWORD = 'correct horse battery staple'

test('password hashing: correct verifies, wrong does not, hashes are salted', async () => {
  const a = await hashPassword(PASSWORD)
  const b = await hashPassword(PASSWORD)
  assert.notEqual(a, b, 'same password hashes differently — the salt is per hash')
  assert.equal(await verifyPassword(PASSWORD, a), true)
  assert.equal(await verifyPassword('wrong password here', a), false)
  assert.equal(await verifyPassword(PASSWORD, null), false, 'a provider-only account cannot log in with a blank hash')
  assert.equal(await verifyPassword(PASSWORD, 'not-an-encoded-hash'), false)
  assert.ok(!a.includes(PASSWORD), 'the plaintext is not present in the encoded hash')
})

test('password policy rejects short and low-entropy passwords', () => {
  assert.ok(passwordProblem('short'), 'too short')
  assert.ok(passwordProblem('aaaaaaaaaaaaaaaa'), 'too repetitive')
  assert.equal(passwordProblem(PASSWORD), null)
})

test('weaker stored parameters are detected for rehash', async () => {
  const weak = await hashPassword(PASSWORD, { N: 1024, r: 8, p: 1, keyLength: 32 })
  assert.equal(await verifyPassword(PASSWORD, weak), true, 'an old hash still verifies')
  assert.equal(needsRehash(weak), true, 'and is flagged for upgrade')
  assert.equal(needsRehash(await hashPassword(PASSWORD)), false)
})

test('register creates an unverified user and a single-use verification token', async () => {
  const db = await freshDb()
  const c = clock()
  const { userId, verificationToken } = await registerUser(db, { email: 'Ada@Example.com', fullName: 'Ada', password: PASSWORD }, c.now())

  const { rows } = await db.query<{ email_verified_at: Date | null }>('select email_verified_at from users where id = $1', [userId])
  assert.equal(rows[0].email_verified_at, null, 'not verified on sign-up')

  assert.equal(await verifyEmail(db, verificationToken, c.now()), userId)
  const after = await db.query<{ email_verified_at: Date | null }>('select email_verified_at from users where id = $1', [userId])
  assert.ok(after.rows[0].email_verified_at, 'verified after consuming the token')

  assert.equal(await verifyEmail(db, verificationToken, c.now()), null, 'the token cannot be replayed')
  await db.close()
})

test('duplicate registration is refused case-insensitively', async () => {
  const db = await freshDb()
  const c = clock()
  await registerUser(db, { email: 'ada@example.com', fullName: 'Ada', password: PASSWORD }, c.now())
  await assert.rejects(
    () => registerUser(db, { email: 'ADA@EXAMPLE.COM', fullName: 'Ada2', password: PASSWORD }, c.now()),
    /already exists/,
  )
  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from users')
  assert.equal(rows[0].n, '1')
  await db.close()
})

test('register validates email and password and reports per field', async () => {
  const db = await freshDb()
  await assert.rejects(
    () => registerUser(db, { email: 'nope', fullName: '', password: 'x' }, clock().now()),
    (error: any) => {
      assert.equal(error.status, 422)
      assert.ok(error.fields.email && error.fields.password && error.fields.fullName)
      return true
    },
  )
  await db.close()
})

test('sign-in: wrong password fails, correct password succeeds and starts a resolvable session', async () => {
  const db = await freshDb()
  const c = clock()
  const { userId, verificationToken } = await registerUser(db, { email: 'ada@example.com', fullName: 'Ada', password: PASSWORD }, c.now())
  await verifyEmail(db, verificationToken, c.now())

  await assert.rejects(() => signIn(db, { email: 'ada@example.com', password: 'definitely wrong' }, c.now()), /do not match/)

  const { token, session } = await signIn(db, { email: 'ada@example.com', password: PASSWORD }, c.now())
  const resolved = await resolveSession(db, token, c.now())
  assert.equal(resolved?.userId, userId)
  assert.equal(resolved?.user.email, 'ada@example.com')
  assert.equal(resolved?.id, session.id)
  await db.close()
})

test('sign-in for an unknown address fails the same way as a wrong password', async () => {
  const db = await freshDb()
  await assert.rejects(
    () => signIn(db, { email: 'nobody@example.com', password: PASSWORD }, clock().now()),
    (error: any) => {
      assert.equal(error.status, 401)
      assert.equal(error.message, 'That email address and password do not match.')
      return true
    },
  )
  await db.close()
})

test('a suspended user cannot sign in even with the right password', async () => {
  const db = await freshDb()
  const c = clock()
  await seedUser(db, { email: 'sus@example.com', passwordHash: await hashPassword(PASSWORD), status: 'suspended' })
  await assert.rejects(() => signIn(db, { email: 'sus@example.com', password: PASSWORD }, c.now()), /do not match/)
  await db.close()
})

test('repeated failures lock the account, and the lock expires', async () => {
  const db = await freshDb()
  const c = clock()
  await registerUser(db, { email: 'ada@example.com', fullName: 'Ada', password: PASSWORD }, c.now())

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await assert.rejects(() => signIn(db, { email: 'ada@example.com', password: 'wrong wrong wrong' }, c.now()))
  }
  await assert.rejects(
    () => signIn(db, { email: 'ada@example.com', password: PASSWORD }, c.now()),
    (error: any) => {
      assert.equal(error.status, 429, 'the correct password is refused while locked')
      return true
    },
  )
  const later = c.advance(16 * 60 * 1000)
  const ok = await signIn(db, { email: 'ada@example.com', password: PASSWORD }, later)
  assert.ok(ok.token, 'the lock lifts after the window')
  await db.close()
})

test('sessions: revoked, expired and idle sessions all stop resolving', async () => {
  const db = await freshDb()
  const c = clock()
  const userId = await seedUser(db, { email: 'a@example.com', passwordHash: await hashPassword(PASSWORD) })

  const revoked = await createSession(db, { userId }, c.now())
  await revokeSession(db, revoked.session.id, c.now())
  assert.equal(await resolveSession(db, revoked.token, c.now()), null, 'revoked')

  const live = await createSession(db, { userId }, c.now())
  assert.ok(await resolveSession(db, live.token, c.now()))
  assert.equal(await resolveSession(db, live.token, new Date(c.now().getTime() + SESSION_TTL_MS + 1)), null, 'absolute expiry')
  assert.equal(await resolveSession(db, live.token, new Date(c.now().getTime() + SESSION_IDLE_MS + 1)), null, 'idle timeout')

  assert.equal(await resolveSession(db, 'a-token-that-was-never-issued', c.now()), null)
  assert.equal(await resolveSession(db, undefined, c.now()), null)
  await db.close()
})

test('only the token hash is stored, never the token', async () => {
  const db = await freshDb()
  const userId = await seedUser(db, { email: 'a@example.com' })
  const { token } = await createSession(db, { userId }, clock().now())
  const { rows } = await db.query<{ token_hash: string }>('select token_hash from sessions')
  assert.notEqual(rows[0].token_hash, token)
  assert.equal(rows[0].token_hash.length, 64, 'sha-256 hex')
  await db.close()
})

test('suspending a user invalidates live sessions immediately', async () => {
  const db = await freshDb()
  const c = clock()
  const userId = await seedUser(db, { email: 'a@example.com' })
  const { token } = await createSession(db, { userId }, c.now())
  assert.ok(await resolveSession(db, token, c.now()))
  await db.query("update users set status = 'suspended' where id = $1", [userId])
  assert.equal(await resolveSession(db, token, c.now()), null, 'no waiting for the cookie to expire')
  await db.close()
})

test('switching tenant rotates the token and kills the old one', async () => {
  const db = await freshDb()
  const c = clock()
  const userId = await seedUser(db, { email: 'a@example.com' })
  const { rows } = await db.query<{ id: string }>("insert into tenants (name, slug) values ('T','t') returning id")
  const first = await createSession(db, { userId }, c.now())

  const rotated = await rotateSessionTenant(db, first.session.id, rows[0].id, c.now())
  assert.ok(rotated)
  assert.notEqual(rotated.token, first.token)
  assert.equal(await resolveSession(db, first.token, c.now()), null, 'the old cookie is dead')
  assert.equal((await resolveSession(db, rotated.token, c.now()))?.tenantId, rows[0].id)
  await db.close()
})

test('password reset consumes its token once, works, and ends every session', async () => {
  const db = await freshDb()
  const c = clock()
  const { userId, verificationToken } = await registerUser(db, { email: 'ada@example.com', fullName: 'Ada', password: PASSWORD }, c.now())
  await verifyEmail(db, verificationToken, c.now())
  const signedIn = await signIn(db, { email: 'ada@example.com', password: PASSWORD }, c.now())
  assert.ok(await resolveSession(db, signedIn.token, c.now()))

  const requested = await requestPasswordReset(db, 'ada@example.com', c.now())
  assert.equal(requested?.userId, userId)

  const NEXT = 'a different long passphrase'
  assert.equal(await resetPassword(db, requested.token, NEXT, c.now()), userId)
  assert.equal(await resolveSession(db, signedIn.token, c.now()), null, 'existing sessions are revoked')
  assert.equal(await resetPassword(db, requested.token, NEXT, c.now()), null, 'the reset token cannot be replayed')

  await assert.rejects(() => signIn(db, { email: 'ada@example.com', password: PASSWORD }, c.now()), /do not match/)
  assert.ok((await signIn(db, { email: 'ada@example.com', password: NEXT }, c.now())).token)
  await db.close()
})

test('an expired reset token is refused', async () => {
  const db = await freshDb()
  const c = clock()
  await registerUser(db, { email: 'ada@example.com', fullName: 'Ada', password: PASSWORD }, c.now())
  const requested = await requestPasswordReset(db, 'ada@example.com', c.now())
  const tooLate = c.advance(2 * 60 * 60 * 1000)
  assert.equal(await resetPassword(db, requested!.token, 'another long passphrase', tooLate), null)
  await db.close()
})

test('reset for an unknown address returns null rather than an error that reveals it', async () => {
  const db = await freshDb()
  assert.equal(await requestPasswordReset(db, 'nobody@example.com', clock().now()), null)
  await db.close()
})

test('changing a password requires the current one and keeps only the current session', async () => {
  const db = await freshDb()
  const c = clock()
  const { userId } = await registerUser(db, { email: 'ada@example.com', fullName: 'Ada', password: PASSWORD }, c.now())
  const keep = await createSession(db, { userId }, c.now())
  const other = await createSession(db, { userId }, c.now())

  await assert.rejects(() => changePassword(db, userId, 'not the password', 'a new long passphrase', c.now()), (e: any) => {
    assert.equal(e.status, 422)
    return true
  })

  await changePassword(db, userId, PASSWORD, 'a new long passphrase', c.now(), keep.session.id)
  assert.ok(await resolveSession(db, keep.token, c.now()), 'the session that made the change survives')
  assert.equal(await resolveSession(db, other.token, c.now()), null, 'every other session is ended')
  await db.close()
})

test('a token cannot be consumed for the wrong purpose', async () => {
  const db = await freshDb()
  const c = clock()
  const { verificationToken } = await registerUser(db, { email: 'ada@example.com', fullName: 'Ada', password: PASSWORD }, c.now())
  assert.equal(await consumeToken(db, verificationToken, 'password_reset', c.now()), null)
  assert.ok(await consumeToken(db, verificationToken, 'email_verify', c.now()))
  await db.close()
})

test('sign out everywhere leaves nothing resolvable', async () => {
  const db = await freshDb()
  const c = clock()
  const userId = await seedUser(db, { email: 'a@example.com' })
  const one = await createSession(db, { userId }, c.now())
  const two = await createSession(db, { userId }, c.now())
  assert.equal(await revokeAllUserSessions(db, userId, c.now()), 2)
  assert.equal(await resolveSession(db, one.token, c.now()), null)
  assert.equal(await resolveSession(db, two.token, c.now()), null)
  await db.close()
})
