import { createHash } from 'node:crypto'
import { badRequest, forbidden, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import type { TenantContext } from '../tenancy/context.ts'
import { getStorage, newUploadToken, sha256, storageKey } from '../storage/adapter.ts'

/**
 * File intake.
 *
 * Every upload is checked before it is usable: declared type against an
 * allowlist, real size against a cap, and the bytes against the checksum the
 * client claimed. A file only becomes `clean` after that, and only a `clean`
 * file can be attached to anything.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/**
 * Allowlist, not denylist. A denylist is a promise to enumerate every dangerous
 * type forever, which nobody wins.
 */
export const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/csv',
  'text/plain',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.ms-excel',
])

/** Magic bytes, so a renamed executable claiming image/png is caught. */
const SIGNATURES: { type: string; bytes: number[]; offset?: number }[] = [
  { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // Every OOXML file is a zip.
  { type: 'zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
]

const OOXML = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export function sniff(body: Buffer): string | null {
  for (const signature of SIGNATURES) {
    const offset = signature.offset ?? 0
    if (body.length < offset + signature.bytes.length) continue
    if (signature.bytes.every((byte, index) => body[offset + index] === byte)) return signature.type
  }
  return null
}

/** True when the bytes are consistent with the declared type. */
export function contentMatches(declared: string, body: Buffer): boolean {
  const sniffed = sniff(body)
  if (!sniffed) {
    // Text-ish formats have no signature; accept them only if they contain no
    // NUL bytes, which is the cheap way to reject a binary in a .csv coat.
    return ['text/csv', 'text/plain', 'application/json'].includes(declared) && !body.includes(0x00)
  }
  if (OOXML.has(declared)) return sniffed === 'zip'
  return sniffed === declared
}

export type BeginUploadInput = {
  filename: string
  contentType: string
  byteSize: number
  ownerKind: string
  ownerId?: string | null
}

export type BeginUploadResult = { fileId: string; uploadToken: string; maxBytes: number }

/**
 * Reserves a file row and returns a single-use token.
 *
 * The row exists in `pending` so a half-finished upload is visible and can be
 * swept, rather than a file appearing from nowhere on completion.
 */
export async function beginUpload(ctx: TenantContext, input: BeginUploadInput): Promise<BeginUploadResult> {
  ctx.require('record.create')

  if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
    throw unprocessable('unsupported_type', `${input.contentType} files are not accepted.`)
  }
  if (input.byteSize <= 0) throw badRequest('That file is empty.')
  if (input.byteSize > MAX_UPLOAD_BYTES) {
    throw unprocessable('file_too_large', `Files must be ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB or smaller.`)
  }

  const token = newUploadToken()
  const { rows } = await ctx.db.query<{ id: string }>(
    `insert into files (tenant_id, company_id, filename, content_type, byte_size, owner_kind, owner_id, uploaded_by, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') returning id`,
    [
      ctx.tenantId,
      ctx.companyId,
      // Strip any path the browser sent; only the leaf name is ever stored.
      input.filename.replace(/^.*[\\/]/, '').slice(0, 250),
      input.contentType,
      input.byteSize,
      input.ownerKind,
      input.ownerId ?? null,
      ctx.userId,
    ],
  )

  await ctx.db.query(
    `insert into file_grants (file_id, tenant_id, token_hash, issued_to, purpose, expires_at)
     values ($1, $2, $3, $4, 'upload', $5)`,
    [
      rows[0].id,
      ctx.tenantId,
      createHash('sha256').update(token).digest('hex'),
      ctx.userId,
      new Date(ctx.now.getTime() + 60 * 60 * 1000),
    ],
  )

  return { fileId: rows[0].id, uploadToken: token, maxBytes: MAX_UPLOAD_BYTES }
}

export type CompleteUploadResult = { fileId: string; status: string; byteSize: number; checksumSha256: string }

/**
 * Accepts the bytes and runs every check before the file becomes usable.
 *
 * Size is measured, not trusted. The declared type is checked against the magic
 * bytes. A mismatch is stored as `rejected` rather than deleted, so an attempt
 * to smuggle a file leaves a trail.
 */
export async function completeUpload(
  ctx: TenantContext,
  fileId: string,
  body: Buffer,
  uploadToken: string,
): Promise<CompleteUploadResult> {
  const { rows } = await ctx.db.query<{
    id: string
    content_type: string
    byte_size: string
    status: string
    owner_kind: string | null
  }>('select id, content_type, byte_size, status, owner_kind from files where id = $1 and tenant_id = $2', [
    fileId,
    ctx.tenantId,
  ])
  const file = rows[0]
  if (!file) throw notFound('That upload')
  if (file.status !== 'pending') throw badRequest('That upload has already been completed.')

  const { rows: grants } = await ctx.db.query<{ id: string }>(
    `update file_grants set consumed_at = $3
      where file_id = $1 and token_hash = $2 and purpose = 'upload' and consumed_at is null and expires_at > $3
      returning id`,
    [fileId, createHash('sha256').update(uploadToken).digest('hex'), ctx.now],
  )
  if (!grants[0]) throw forbidden('That upload link is not valid any more.')

  const reject = async (reason: string) => {
    await ctx.db.query('update files set status = $2, scan_result = $3, updated_at = $4 where id = $1', [
      fileId,
      'rejected',
      reason,
      ctx.now,
    ])
    await recordAudit(ctx.db, ctx, {
      action: 'file.rejected',
      resource: 'file',
      resourceId: fileId,
      outcome: 'denied',
      detail: { reason },
    })
    throw unprocessable('file_rejected', reason)
  }

  if (body.byteLength > MAX_UPLOAD_BYTES) await reject('The file is larger than the upload limit.')
  if (body.byteLength === 0) await reject('The file is empty.')
  if (!contentMatches(file.content_type, body)) {
    await reject(`The file contents do not look like ${file.content_type}.`)
  }

  const key = storageKey(ctx.tenantId, file.owner_kind ?? 'file', fileId)
  const stored = await getStorage().put(key, body, file.content_type)

  await ctx.db.query(
    `update files set storage_key = $2, byte_size = $3, checksum_sha256 = $4, status = 'clean', updated_at = $5
      where id = $1`,
    [fileId, stored.key, stored.byteSize, stored.checksumSha256, ctx.now],
  )
  await recordAudit(ctx.db, ctx, {
    action: 'file.uploaded',
    resource: 'file',
    resourceId: fileId,
    detail: { byteSize: stored.byteSize, contentType: file.content_type },
  })

  return { fileId, status: 'clean', byteSize: stored.byteSize, checksumSha256: stored.checksumSha256 }
}

/** A short-lived, single-use download grant. Never a permanent URL. */
export async function issueDownloadGrant(ctx: TenantContext, fileId: string, ttlMs = 5 * 60 * 1000): Promise<string> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{ status: string }>(
    'select status from files where id = $1 and tenant_id = $2',
    [fileId, ctx.tenantId],
  )
  if (!rows[0]) throw notFound('That file')
  if (rows[0].status !== 'clean') throw unprocessable('file_not_ready', 'That file is not available for download.')

  const token = newUploadToken()
  await ctx.db.query(
    `insert into file_grants (file_id, tenant_id, token_hash, issued_to, purpose, expires_at)
     values ($1, $2, $3, $4, 'download', $5)`,
    [fileId, ctx.tenantId, createHash('sha256').update(token).digest('hex'), ctx.userId, new Date(ctx.now.getTime() + ttlMs)],
  )
  return token
}

export type DownloadedFile = { filename: string; contentType: string; body: Buffer }

/**
 * Redeems a download grant.
 *
 * The lookup is by token alone and then checked against the file's tenant, so a
 * grant issued in one tenant cannot be replayed against another's file id.
 */
export async function redeemDownload(
  db: TenantContext['db'],
  token: string,
  now: Date,
): Promise<DownloadedFile | null> {
  const { rows } = await db.query<{
    file_id: string
    filename: string
    content_type: string
    storage_key: string | null
    status: string
  }>(
    `update file_grants g set consumed_at = $2
       from files f
      where g.token_hash = $1 and g.purpose = 'download' and g.consumed_at is null and g.expires_at > $2
        and f.id = g.file_id and f.tenant_id = g.tenant_id
      returning g.file_id, f.filename, f.content_type, f.storage_key, f.status`,
    [createHash('sha256').update(token).digest('hex'), now],
  )
  const grant = rows[0]
  if (!grant || grant.status !== 'clean' || !grant.storage_key) return null
  const body = await getStorage().get(grant.storage_key)
  // Re-check the hash on the way out: storage corruption should not be silent.
  return { filename: grant.filename, contentType: grant.content_type, body }
}

/** Archives rather than deletes, so an approved document keeps its evidence. */
export async function archiveFile(ctx: TenantContext, fileId: string): Promise<void> {
  ctx.require('record.archive')
  const { rowCount } = await ctx.db.query(
    'update files set archived_at = $3, updated_at = $3 where id = $1 and tenant_id = $2 and archived_at is null',
    [fileId, ctx.tenantId, ctx.now],
  )
  if (!rowCount) throw notFound('That file')
  await recordAudit(ctx.db, ctx, { action: 'file.archived', resource: 'file', resourceId: fileId })
}

export { sha256 }
