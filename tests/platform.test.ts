import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import { MemoryStorageAdapter, setStorage, getStorage } from '../src/server/storage/adapter.ts'
import { beginUpload, completeUpload, issueDownloadGrant, redeemDownload, archiveFile, contentMatches, MAX_UPLOAD_BYTES } from '../src/server/services/files.ts'
import { readSettings, writeSettings, listSettingsChanges, revertSettingsChange } from '../src/server/services/settings.ts'
import { balance, reserve, settle, refund, grant, withCredits } from '../src/server/services/credits.ts'

const PDF = (extra = 'hello') => Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]), Buffer.from(extra)])
const PNG = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]), Buffer.from('bytes')])

async function ctxFor() {
  const db = await freshDb()
  const c = clock()
  const userId = await seedUser(db, { email: 'a@example.com' })
  const tenant = await createTenantWithOwner(db, userId, { name: 'Acme' }, c.now(), 'r')
  const { token } = await createSession(db, { userId, tenantId: tenant.tenantId }, c.now())
  const ctx = await withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))
  return { db, c, ctx, tenantId: tenant.tenantId, userId }
}

/* --------------------------------- files --------------------------------- */

test('an upload is only usable after the bytes arrive and pass their checks', async () => {
  setStorage(new MemoryStorageAdapter())
  const { db, ctx } = await ctxFor()

  const begun = await beginUpload(ctx, { filename: 'receipt.pdf', contentType: 'application/pdf', byteSize: 10, ownerKind: 'expense' })
  let row = await db.query<{ status: string; storage_key: string | null }>('select status, storage_key from files where id = $1', [begun.fileId])
  assert.equal(row.rows[0].status, 'pending', 'a reserved row is not an upload')
  assert.equal(row.rows[0].storage_key, null)

  const done = await completeUpload(ctx, begun.fileId, PDF(), begun.uploadToken)
  assert.equal(done.status, 'clean')
  assert.equal(done.checksumSha256.length, 64)

  row = await db.query<{ status: string; storage_key: string | null }>('select status, storage_key from files where id = $1', [begun.fileId])
  assert.equal(row.rows[0].status, 'clean')
  assert.ok(row.rows[0].storage_key, 'bytes exist in storage')
  assert.ok(await getStorage().exists(row.rows[0].storage_key))
  await db.close()
})

test('a file whose bytes do not match its declared type is rejected, not stored', async () => {
  setStorage(new MemoryStorageAdapter())
  const { db, ctx } = await ctxFor()
  const begun = await beginUpload(ctx, { filename: 'evil.pdf', contentType: 'application/pdf', byteSize: 10, ownerKind: 'expense' })

  await assert.rejects(
    () => completeUpload(ctx, begun.fileId, PNG(), begun.uploadToken),
    (error: any) => {
      assert.equal(error.code, 'file_rejected')
      return true
    },
  )
  const { rows } = await db.query<{ status: string; storage_key: string | null }>(
    'select status, storage_key from files where id = $1', [begun.fileId])
  assert.equal(rows[0].status, 'rejected', 'the attempt leaves a trail')
  assert.equal(rows[0].storage_key, null, 'nothing was stored')

  const audit = await db.query<{ outcome: string }>("select outcome from audit_events where action = 'file.rejected'")
  assert.equal(audit.rows[0].outcome, 'denied')
  await db.close()
})

test('unsupported types and oversized files are refused up front', async () => {
  const { db, ctx } = await ctxFor()
  await assert.rejects(
    () => beginUpload(ctx, { filename: 'x.exe', contentType: 'application/x-msdownload', byteSize: 10, ownerKind: 'expense' }),
    (e: any) => e.code === 'unsupported_type',
  )
  await assert.rejects(
    () => beginUpload(ctx, { filename: 'big.pdf', contentType: 'application/pdf', byteSize: MAX_UPLOAD_BYTES + 1, ownerKind: 'expense' }),
    (e: any) => e.code === 'file_too_large',
  )
  await db.close()
})

test('the declared size is not trusted — the real bytes are measured', async () => {
  setStorage(new MemoryStorageAdapter())
  const { db, ctx } = await ctxFor()
  const begun = await beginUpload(ctx, { filename: 'small.pdf', contentType: 'application/pdf', byteSize: 5, ownerKind: 'expense' })
  const done = await completeUpload(ctx, begun.fileId, PDF('x'.repeat(500)), begun.uploadToken)
  assert.equal(done.byteSize, 505, 'the stored size is what arrived (5-byte header + 500), not the 5 that was claimed')
  await db.close()
})

test('an upload token is single use and cannot be replayed', async () => {
  setStorage(new MemoryStorageAdapter())
  const { db, ctx } = await ctxFor()
  const begun = await beginUpload(ctx, { filename: 'a.pdf', contentType: 'application/pdf', byteSize: 5, ownerKind: 'expense' })
  await completeUpload(ctx, begun.fileId, PDF(), begun.uploadToken)
  await assert.rejects(() => completeUpload(ctx, begun.fileId, PDF(), begun.uploadToken), /already been completed/)
  await db.close()
})

test('download grants expire, are single use, and never become permanent URLs', async () => {
  setStorage(new MemoryStorageAdapter())
  const { db, c, ctx } = await ctxFor()
  const begun = await beginUpload(ctx, { filename: 'a.pdf', contentType: 'application/pdf', byteSize: 5, ownerKind: 'expense' })
  await completeUpload(ctx, begun.fileId, PDF('content'), begun.uploadToken)

  const token = await issueDownloadGrant(ctx, begun.fileId)
  const first = await redeemDownload(db, token, c.now())
  assert.equal(first?.filename, 'a.pdf')
  assert.ok(first.body.toString().includes('content'))

  assert.equal(await redeemDownload(db, token, c.now()), null, 'the same grant cannot be redeemed twice')

  const second = await issueDownloadGrant(ctx, begun.fileId, 1000)
  assert.equal(await redeemDownload(db, second, c.advance(5000)), null, 'an expired grant is refused')
  await db.close()
})

test('ISOLATION: a file in another tenant cannot be granted or downloaded', async () => {
  setStorage(new MemoryStorageAdapter())
  const owner = await ctxFor()
  const other = await ctxFor()

  const begun = await beginUpload(owner.ctx, { filename: 'a.pdf', contentType: 'application/pdf', byteSize: 5, ownerKind: 'expense' })
  await completeUpload(owner.ctx, begun.fileId, PDF(), begun.uploadToken)

  await assert.rejects(() => issueDownloadGrant(other.ctx, begun.fileId), (e: any) => e.status === 404)
  // A grant from one database cannot be redeemed against another's.
  const token = await issueDownloadGrant(owner.ctx, begun.fileId)
  assert.equal(await redeemDownload(other.db, token, other.c.now()), null)
  await owner.db.close()
  await other.db.close()
})

test('a storage key cannot escape its tenant prefix', async () => {
  const { LocalStorageAdapter } = await import('../src/server/storage/adapter.ts')
  const adapter = new LocalStorageAdapter('/tmp/apragya-storage-test')
  await assert.rejects(() => adapter.put('../../etc/passwd', Buffer.from('x'), 'text/plain'), /escapes the storage root/)
})

test('content sniffing accepts OOXML as a zip and rejects binaries posing as text', () => {
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('rest')])
  assert.equal(contentMatches('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip), true)
  assert.equal(contentMatches('text/csv', Buffer.from('a,b\n1,2')), true)
  assert.equal(contentMatches('text/csv', Buffer.from([0x00, 0x01, 0x02])), false)
})

test('archiving a file keeps the row and its evidence', async () => {
  setStorage(new MemoryStorageAdapter())
  const { db, ctx } = await ctxFor()
  const begun = await beginUpload(ctx, { filename: 'a.pdf', contentType: 'application/pdf', byteSize: 5, ownerKind: 'expense' })
  await completeUpload(ctx, begun.fileId, PDF(), begun.uploadToken)
  await archiveFile(ctx, begun.fileId)
  const { rows } = await db.query<{ archived_at: Date | null; checksum_sha256: string }>(
    'select archived_at, checksum_sha256 from files where id = $1', [begun.fileId])
  assert.ok(rows[0].archived_at)
  assert.ok(rows[0].checksum_sha256, 'the checksum survives archival')
  await db.close()
})

/* -------------------------------- settings ------------------------------- */

test('settings read back with defaults merged for keys added later', async () => {
  const { db, ctx } = await ctxFor()
  const initial = await readSettings(ctx, 'SUP', 'csat', { sendOnResolve: true, waitHours: 1 })
  assert.equal(initial.version, 0, 'nothing saved yet')

  await writeSettings(ctx, { appCode: 'SUP', section: 'csat', value: { sendOnResolve: false }, version: 0, summary: 'Turned CSAT off' })
  const after = await readSettings(ctx, 'SUP', 'csat', { sendOnResolve: true, waitHours: 1 })
  assert.equal(after.value.sendOnResolve, false, 'the saved value wins')
  assert.equal(after.value.waitHours, 1, 'a key added after the save still has its default')
  await db.close()
})

test('CONFLICT: two admins editing the same settings pane do not overwrite each other', async () => {
  const { db, ctx } = await ctxFor()
  await writeSettings(ctx, { appCode: 'POS', section: 'variance', value: { red: 5 }, version: 0, summary: 'First' })
  await assert.rejects(
    () => writeSettings(ctx, { appCode: 'POS', section: 'variance', value: { red: 9 }, version: 0, summary: 'Second' }),
    (error: any) => {
      assert.equal(error.status, 409)
      assert.equal(error.currentVersion, 1)
      return true
    },
  )
  const current = await readSettings(ctx, 'POS', 'variance', {})
  assert.equal((current.value as any).red, 5, 'the first write survived')
  await db.close()
})

test('every settings change is recorded, and a revert restores without erasing history', async () => {
  const { db, ctx } = await ctxFor()
  await writeSettings(ctx, { appCode: 'POS', section: 'tax', value: { rate: 18 }, version: 0, summary: 'Set 18%' })
  await writeSettings(ctx, { appCode: 'POS', section: 'tax', value: { rate: 28 }, version: 1, summary: 'Raised to 28%' })

  const history = await listSettingsChanges(ctx, 'POS', 'tax')
  assert.equal(history.length, 2)
  assert.equal(history[0].summary, 'Raised to 28%')

  const reverted = await revertSettingsChange(ctx, history[0].id)
  assert.equal((reverted.value as any).rate, 18, 'the earlier value is restored')

  const after = await listSettingsChanges(ctx, 'POS', 'tax')
  assert.equal(after.length, 3, 'the revert is itself a recorded change')
  assert.equal(after.filter((c) => c.reverted).length, 1)
  await assert.rejects(() => revertSettingsChange(ctx, history[0].id), /already been reverted/)
  await db.close()
})

test('ISOLATION: settings never leak between tenants', async () => {
  const a = await ctxFor()
  const b = await ctxFor()
  await writeSettings(a.ctx, { appCode: 'SUP', section: 'csat', value: { secret: 'a' }, version: 0, summary: 'A' })
  const read = await readSettings(b.ctx, 'SUP', 'csat', { secret: 'default' })
  assert.equal((read.value as any).secret, 'default')
  assert.equal(read.version, 0)
  await a.db.close()
  await b.db.close()
})

/* --------------------------------- credits ------------------------------- */

test('a spend is reserved, then settled for what it actually cost', async () => {
  const { db, ctx, tenantId } = await ctxFor()
  await grant(db, tenantId, 1000, 'Trial allocation')
  assert.deepEqual(await balance(db, tenantId), { granted: 1000, used: 0, reserved: 0, available: 1000 })

  const { reservationId } = await reserve(ctx, { amount: 100, reason: 'Draft a proposal' })
  const held = await balance(db, tenantId)
  assert.equal(held.available, 900, 'the reservation is held immediately')
  assert.equal(held.reserved, 100)

  await settle(ctx, reservationId, 40)
  const after = await balance(db, tenantId)
  assert.equal(after.used, 40, 'only the real cost is charged')
  assert.equal(after.available, 960, 'the over-estimate is released')
  await db.close()
})

test('failed work refunds in full — nobody pays for an error', async () => {
  const { db, ctx, tenantId } = await ctxFor()
  await grant(db, tenantId, 500, 'Trial')

  await assert.rejects(
    () => withCredits(ctx, { amount: 50, reason: 'Generate a deck' }, () => Promise.reject(new Error('provider timeout'))),
    /provider timeout/,
  )
  const after = await balance(db, tenantId)
  assert.equal(after.used, 0, 'nothing was charged')
  assert.equal(after.available, 500, 'and nothing stays held')
  await db.close()
})

test('a tenant cannot spend past its balance', async () => {
  const { db, ctx, tenantId } = await ctxFor()
  await grant(db, tenantId, 30, 'Trial')
  await assert.rejects(() => reserve(ctx, { amount: 100, reason: 'Too much' }), (e: any) => {
    assert.equal(e.code, 'insufficient_credits')
    return true
  })
  assert.equal((await balance(db, tenantId)).available, 30)
  await db.close()
})

test('CONCURRENCY: parallel spends cannot take the balance negative', async () => {
  const { db, ctx, tenantId } = await ctxFor()
  await grant(db, tenantId, 100, 'Trial')

  // Ten parallel attempts at 20 each; only five can succeed.
  const attempts = await Promise.allSettled(
    Array.from({ length: 10 }, (_, index) => reserve(ctx, { amount: 20, reason: `spend ${index}` })),
  )
  const ok = attempts.filter((a) => a.status === 'fulfilled').length
  assert.equal(ok, 5, `exactly five reservations fit in 100 credits, got ${ok}`)

  const after = await balance(db, tenantId)
  assert.equal(after.available, 0)
  assert.ok(after.available >= 0, 'the balance never goes negative')
  await db.close()
})

test('a retried request reuses its reservation instead of taking a second', async () => {
  const { db, ctx, tenantId } = await ctxFor()
  await grant(db, tenantId, 500, 'Trial')
  const first = await reserve(ctx, { amount: 50, reason: 'Chat', idempotencyKey: 'req-1' })
  const retry = await reserve(ctx, { amount: 50, reason: 'Chat', idempotencyKey: 'req-1' })
  assert.equal(retry.reservationId, first.reservationId)
  assert.equal((await balance(db, tenantId)).available, 450, 'charged once, not twice')
  await db.close()
})

test('a reservation cannot be settled and refunded, or settled twice', async () => {
  const { db, ctx, tenantId } = await ctxFor()
  await grant(db, tenantId, 500, 'Trial')
  const { reservationId } = await reserve(ctx, { amount: 50, reason: 'Chat' })
  await settle(ctx, reservationId, 50)
  await assert.rejects(() => settle(ctx, reservationId, 50), /already been settled or refunded/)
  await assert.rejects(() => refund(ctx, reservationId, 'late'), /already been settled or refunded/)
  assert.equal((await balance(db, tenantId)).used, 50)
  await db.close()
})

test('a duplicate grant with the same key does not double-credit', async () => {
  const { db, tenantId } = await ctxFor()
  await grant(db, tenantId, 1000, 'Monthly', undefined, 'period-2026-09')
  await grant(db, tenantId, 1000, 'Monthly', undefined, 'period-2026-09')
  assert.equal((await balance(db, tenantId)).granted, 1000)
  await db.close()
})
