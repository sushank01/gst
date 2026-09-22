import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'

/** `promisify` drops the options overload, so wrap it explicitly. */
function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

/**
 * Password hashing with scrypt from node:crypto.
 *
 * scrypt is memory-hard and built into Node, so there is no native module to
 * compile on a deploy target. The cost parameters are stored *inside* the
 * encoded hash rather than read from config at verify time: raising the cost
 * later must not lock out every existing account, and `needsRehash` tells the
 * login path when to upgrade a hash transparently on a correct password.
 */

export type ScryptParams = { N: number; r: number; p: number; keyLength: number }

/** ~30ms per hash on the reference machine. Interactive-login cost, not a KDF for keys. */
export const CURRENT_PARAMS: ScryptParams = { N: 16_384, r: 8, p: 1, keyLength: 64 }

const PREFIX = 'scrypt'
const SALT_BYTES = 16
/** scrypt needs roughly 128 * N * r bytes; give it headroom or Node throws. */
const maxmem = (p: ScryptParams) => 256 * p.N * p.r

export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 200

/**
 * Length plus a crude shape check. Deliberately not a character-class rule —
 * those push people towards `Passw0rd!` — but a long password made of one
 * repeated character is still rejected.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`
  if (new Set(password).size < 5) return 'Use a less repetitive password.'
  return null
}

export async function hashPassword(password: string, params: ScryptParams = CURRENT_PARAMS): Promise<string> {
  const problem = passwordProblem(password)
  if (problem) throw new Error(problem)
  const salt = randomBytes(SALT_BYTES)
  const derived = await scrypt(password.normalize('NFKC'), salt, params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: maxmem(params),
  })
  return [PREFIX, params.N, params.r, params.p, salt.toString('base64'), derived.toString('base64')].join('$')
}

function parse(encoded: string): { params: ScryptParams; salt: Buffer; hash: Buffer } | null {
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== PREFIX) return null
  const [, n, r, p, salt, hash] = parts
  const params = { N: Number(n), r: Number(r), p: Number(p), keyLength: 0 }
  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) return null
  const saltBuf = Buffer.from(salt, 'base64')
  const hashBuf = Buffer.from(hash, 'base64')
  if (!saltBuf.length || !hashBuf.length) return null
  return { params: { ...params, keyLength: hashBuf.length }, salt: saltBuf, hash: hashBuf }
}

/**
 * Constant-time verification. Returns false for malformed or absent hashes
 * rather than throwing, so a provider-only account (null hash) simply fails to
 * log in with a password instead of producing a different error the caller
 * could use to enumerate account types.
 */
export async function verifyPassword(password: string, encoded: string | null | undefined): Promise<boolean> {
  if (!encoded) return false
  const parsed = parse(encoded)
  if (!parsed) return false
  const derived = await scrypt(password.normalize('NFKC'), parsed.salt, parsed.params.keyLength, {
    N: parsed.params.N,
    r: parsed.params.r,
    p: parsed.params.p,
    maxmem: maxmem(parsed.params),
  })
  if (derived.length !== parsed.hash.length) return false
  return timingSafeEqual(derived, parsed.hash)
}

/** True when a stored hash was produced with weaker parameters than current. */
export function needsRehash(encoded: string | null | undefined, params: ScryptParams = CURRENT_PARAMS): boolean {
  if (!encoded) return false
  const parsed = parse(encoded)
  if (!parsed) return true
  return (
    parsed.params.N < params.N ||
    parsed.params.r < params.r ||
    parsed.params.p < params.p ||
    parsed.params.keyLength < params.keyLength
  )
}

/**
 * Burns roughly one password verification of CPU. Called on a login attempt for
 * an address that does not exist, so response timing does not reveal whether an
 * account is registered.
 */
export async function equivalentWork(password: string): Promise<void> {
  await scrypt(password.normalize('NFKC'), randomBytes(SALT_BYTES), CURRENT_PARAMS.keyLength, {
    N: CURRENT_PARAMS.N,
    r: CURRENT_PARAMS.r,
    p: CURRENT_PARAMS.p,
    maxmem: maxmem(CURRENT_PARAMS),
  })
}
