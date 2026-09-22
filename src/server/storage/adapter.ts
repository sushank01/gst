import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Object storage behind one interface.
 *
 * Production wants S3; local development and tests want something with no
 * account. Both satisfy this, so nothing above it knows or cares — and the
 * moment an S3 bucket exists (decision D3) only this file changes.
 *
 * "Uploaded" means bytes were received and hashed. Storing a filename is not an
 * upload, which is what the prototype did.
 */

export type PutResult = { key: string; byteSize: number; checksumSha256: string }

export interface StorageAdapter {
  /** Returns the key under which the bytes now live. */
  put(key: string, body: Buffer, contentType?: string): Promise<PutResult>
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  readonly kind: string
}

export const sha256 = (body: Buffer) => createHash('sha256').update(body).digest('hex')

/**
 * Builds a storage key that cannot escape its tenant.
 *
 * The filename is not used in the path: a caller-supplied name is the classic
 * traversal vector, and two people uploading `invoice.pdf` must not collide.
 */
export function storageKey(tenantId: string, ownerKind: string, fileId: string, extension = ''): string {
  const safeExtension = extension.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12)
  const safeKind = ownerKind.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'file'
  return `t/${tenantId}/${safeKind}/${fileId}${safeExtension}`
}

/** Local filesystem adapter. Development and tests only. */
export class LocalStorageAdapter implements StorageAdapter {
  readonly kind = 'local'
  // An explicit field, not a parameter property: Node's strip-only TypeScript
  // mode cannot transform those, and the test runner uses it.
  private readonly root: string

  constructor(root: string) {
    this.root = root
  }

  private resolve(key: string): string {
    // Refuse anything that would land outside the root, however it is spelled.
    const target = path.resolve(this.root, key)
    const root = path.resolve(this.root)
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error('Refusing a storage key that escapes the storage root.')
    }
    return target
  }

  async put(key: string, body: Buffer, _contentType?: string): Promise<PutResult> {
    const target = this.resolve(key)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, body)
    return { key, byteSize: body.byteLength, checksumSha256: sha256(body) }
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key))
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true })
  }

  async exists(key: string): Promise<boolean> {
    try {
      await readFile(this.resolve(key))
      return true
    } catch {
      return false
    }
  }
}

/** Keeps bytes in memory. Tests only — nothing survives the process. */
export class MemoryStorageAdapter implements StorageAdapter {
  readonly kind = 'memory'
  private readonly blobs = new Map<string, Buffer>()

  /*
   * These satisfy an async interface synchronously — an in-memory Map has
   * nothing to await. Written as explicit Promises rather than `async`
   * methods so the absence of any awaited work is visible rather than implied.
   */
  put(key: string, body: Buffer, _contentType?: string): Promise<PutResult> {
    this.blobs.set(key, body)
    return Promise.resolve({ key, byteSize: body.byteLength, checksumSha256: sha256(body) })
  }
  get(key: string): Promise<Buffer> {
    const body = this.blobs.get(key)
    if (!body) return Promise.reject(new Error(`No object at ${key}`))
    return Promise.resolve(body)
  }
  delete(key: string): Promise<void> {
    this.blobs.delete(key)
    return Promise.resolve()
  }
  exists(key: string): Promise<boolean> {
    return Promise.resolve(this.blobs.has(key))
  }
}

let shared: StorageAdapter | null = null

export function getStorage(): StorageAdapter {
  if (shared) return shared
  // An S3 adapter slots in here once a bucket and credentials exist (D3).
  shared = new LocalStorageAdapter(process.env.STORAGE_DIR ?? '.data/files')
  return shared
}

export function setStorage(adapter: StorageAdapter | null): void {
  shared = adapter
}

export const newUploadToken = () => randomBytes(32).toString('base64url')
