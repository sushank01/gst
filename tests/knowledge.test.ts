import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  archiveArticle, archiveCanned, articleHistory, createArticle, createCanned, createCategory, listArticles,
  listCanned, listCategories, publishArticle, readArticle, recordArticleView, slugify,
  unpublishArticle, updateArticle, useCanned,
} from '../src/server/services/knowledge.ts'

async function helpdesk() {
  const db = await freshDb()
  const c = clock()
  const owner = await seedUser(db, { email: 'owner@example.com', fullName: 'Owner' })
  const other = await seedUser(db, { email: 'rival@example.com', fullName: 'Rival' })
  const acme = await createTenantWithOwner(db, owner, { name: 'Acme' }, c.now(), 'r1')
  const rival = await createTenantWithOwner(db, other, { name: 'Rival' }, c.now(), 'r2')
  const ctxFor = async (userId: string, tenantId: string) => {
    const { token } = await createSession(db, { userId, tenantId }, c.now())
    return withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' }))
  }
  return { db, c, ctx: await ctxFor(owner, acme.tenantId), rivalCtx: await ctxFor(other, rival.tenantId) }
}

test('a slug is derived from the title and collisions are refused, not suffixed', async () => {
  // The em-dash is dropped and the spaces around it collapse to one hyphen,
  // rather than leaving a double one.
  assert.equal(slugify('Resetting your PIN — step by step'), 'resetting-your-pin-step-by-step')
  assert.equal(slugify('   '), '')

  const { db, ctx } = await helpdesk()
  await createArticle(ctx, { title: 'Resetting your PIN' })
  await assert.rejects(
    () => createArticle(ctx, { title: 'Resetting your PIN' }),
    /already uses the slug/i,
    'a silently suffixed slug is a URL nobody meant to publish',
  )
  await db.close()
})

test('ACCESS CONTROL: a draft never reaches a portal or public reader', async () => {
  const { db, ctx } = await helpdesk()
  const draft = await createArticle(ctx, {
    title: 'Internal escalation runbook',
    body: 'Call the on-call engineer on the private line.',
    visibility: 'portal',
  })

  // An agent sees it.
  assert.equal((await listArticles(ctx, { audience: 'internal' })).total, 1)

  // Nobody outside does, however they ask.
  assert.equal((await listArticles(ctx, { audience: 'portal' })).total, 0)
  assert.equal((await listArticles(ctx, { audience: 'public' })).total, 0)
  const searched = await listArticles(ctx, { audience: 'portal', q: 'on-call' })
  assert.equal(searched.total, 0, 'a draft is frequently wrong on purpose')

  // A status parameter must not let an outside reader ask for drafts.
  const forced = await listArticles(ctx, { audience: 'portal', status: 'draft' })
  assert.equal(forced.total, 0)
  assert.ok(draft.id)
  await db.close()
})

test('publishing opens it to the right audience and no wider', async () => {
  const { db, ctx } = await helpdesk()
  const portal = await createArticle(ctx, { title: 'Refund policy', body: 'Within 30 days.', visibility: 'portal' })
  const published = await publishArticle(ctx, portal.id, portal.version)
  assert.equal(published.status, 'published')
  assert.equal(published.publishedVersion, portal.version)

  assert.equal((await listArticles(ctx, { audience: 'portal' })).total, 1)
  assert.equal((await listArticles(ctx, { audience: 'public' })).total, 0, 'portal is not public')

  const opened = await updateArticle(ctx, portal.id, { version: published.version, visibility: 'public' })
  assert.equal((await listArticles(ctx, { audience: 'public' })).total, 1)
  assert.ok(opened.id)
  await db.close()
})

test('an empty article cannot be published', async () => {
  const { db, ctx } = await helpdesk()
  const article = await createArticle(ctx, { title: 'Placeholder' })
  await assert.rejects(
    () => publishArticle(ctx, article.id, article.version),
    /Write the article/i,
    'publishing an empty article puts a blank page in front of a customer',
  )
  await db.close()
})

test('editing a published article keeps what it said before', async () => {
  const { db, ctx } = await helpdesk()
  const article = await createArticle(ctx, { title: 'Refund policy', body: 'Within 14 days.', visibility: 'public' })
  const published = await publishArticle(ctx, article.id, article.version)

  const edited = await updateArticle(ctx, article.id, { version: published.version, body: 'Within 30 days.' })
  assert.equal(edited.body, 'Within 30 days.')

  const history = await articleHistory(ctx, article.id)
  assert.equal(history.length, 1, 'the customer read the old text; it is still on record')
  assert.equal(history[0].version, published.version)
  await db.close()
})

test('a draft edit does not create a version row', async () => {
  const { db, ctx } = await helpdesk()
  const article = await createArticle(ctx, { title: 'Draft', body: 'One' })
  const once = await updateArticle(ctx, article.id, { version: article.version, body: 'Two' })
  await updateArticle(ctx, article.id, { version: once.version, body: 'Three' })
  assert.deepEqual(await articleHistory(ctx, article.id), [], 'a draft has no readers to owe a record to')
  await db.close()
})

test('unpublishing takes it back out of every outside view', async () => {
  const { db, ctx } = await helpdesk()
  const article = await createArticle(ctx, { title: 'Withdrawn offer', body: 'Half price.', visibility: 'public' })
  const published = await publishArticle(ctx, article.id, article.version)
  assert.equal((await listArticles(ctx, { audience: 'public' })).total, 1)

  await unpublishArticle(ctx, article.id, published.version)
  assert.equal((await listArticles(ctx, { audience: 'public' })).total, 0)
  assert.equal((await listArticles(ctx, { audience: 'internal' })).total, 1, 'still there for the team')
  await db.close()
})

test('a stale edit loses and is told what to refetch', async () => {
  const { db, ctx } = await helpdesk()
  const article = await createArticle(ctx, { title: 'Refunds', body: 'One' })
  await updateArticle(ctx, article.id, { version: article.version, body: 'Two' })
  await assert.rejects(
    () => updateArticle(ctx, article.id, { version: article.version, body: 'Three' }),
    (error: unknown) => (error as { currentVersion?: number }).currentVersion === article.version + 1,
  )
  assert.equal((await readArticle(ctx, article.id)).body, 'Two')
  await db.close()
})

test('categories filter, and the count agrees with the rows', async () => {
  const { db, ctx } = await helpdesk()
  const billing = await createCategory(ctx, { name: 'Billing' })
  const devices = await createCategory(ctx, { name: 'Devices' })
  assert.equal(billing.slug, 'billing')
  await assert.rejects(() => createCategory(ctx, { name: 'billing' }), /already uses the slug/i)

  await createArticle(ctx, { title: 'Refunds', categoryId: billing.id })
  await createArticle(ctx, { title: 'Invoices', categoryId: billing.id })
  await createArticle(ctx, { title: 'Card reader', categoryId: devices.id })

  const filtered = await listArticles(ctx, { categoryId: billing.id })
  assert.equal(filtered.total, 2)
  assert.equal(filtered.rows.length, 2)
  assert.equal((await listCategories(ctx)).length, 2)
  await db.close()
})

test('a view is counted only when somebody actually reads it', async () => {
  const { db, ctx } = await helpdesk()
  const article = await createArticle(ctx, { title: 'Refunds', body: 'Text' })
  await readArticle(ctx, article.id)
  assert.equal((await readArticle(ctx, article.id)).viewCount, 0, 'an editor previewing is not a reader')

  await recordArticleView(ctx, article.id)
  await recordArticleView(ctx, article.id)
  assert.equal((await readArticle(ctx, article.id)).viewCount, 2)
  await db.close()
})

test('canned responses are unique by shortcut and count their use', async () => {
  const { db, ctx } = await helpdesk()
  const canned = await createCanned(ctx, { shortcut: '/refund', title: 'Refund', body: 'We have issued a refund.' })
  assert.equal(canned.shortcut, 'refund', 'the leading slash is how people type it, not part of the key')

  await assert.rejects(() => createCanned(ctx, { shortcut: 'REFUND', title: 'Dup', body: 'x' }), /already in use/i)

  await useCanned(ctx, canned.id)
  await useCanned(ctx, canned.id)
  assert.equal((await listCanned(ctx))[0].usageCount, 2, 'the shortcut nobody uses is the one to retire')

  await archiveCanned(ctx, canned.id)
  assert.deepEqual(await listCanned(ctx), [])
  // Archiving frees the shortcut for reuse.
  const reused = await createCanned(ctx, { shortcut: 'refund', title: 'Refund v2', body: 'Reissued.' })
  assert.equal(reused.shortcut, 'refund')
  await db.close()
})

test('ISOLATION: articles and responses never cross workspaces', async () => {
  const { db, ctx, rivalCtx } = await helpdesk()
  const article = await createArticle(ctx, { title: 'Ours', body: 'Private.', visibility: 'public' })
  await publishArticle(ctx, article.id, article.version)
  await createCanned(ctx, { shortcut: 'ours', title: 'Ours', body: 'x' })

  await assert.rejects(() => readArticle(rivalCtx, article.id), /That article/)
  assert.equal((await listArticles(rivalCtx, { audience: 'public' })).total, 0, 'published does not mean everyone s')
  assert.deepEqual(await listCanned(rivalCtx), [])
  await db.close()
})

test('archiving an article takes it out of every view but keeps its versions', async () => {
  const { db, ctx } = await helpdesk()
  const article = await createArticle(ctx, { title: 'Refund policy', body: 'Ask billing.', visibility: 'public' })
  const published = await publishArticle(ctx, article.id, article.version)
  const edited = await updateArticle(ctx, published.id, { version: published.version, body: 'Ask billing first.' })

  const archived = await archiveArticle(ctx, edited.id, edited.version)
  assert.equal(archived.status, 'archived')
  assert.equal(archived.publishedAt, null)
  // A reader outside the team must stop seeing it immediately.
  assert.equal((await listArticles(ctx, { audience: 'public' })).total, 0)
  // But the text a customer read yesterday still has to be explicable, which
  // is why this archives rather than deletes.
  assert.equal((await articleHistory(ctx, edited.id)).length, 1)
  await db.close()
})

test('archiving with a stale version is refused rather than clobbering an edit', async () => {
  const { db, ctx } = await helpdesk()
  const article = await createArticle(ctx, { title: 'How to', body: 'Steps.' })
  await updateArticle(ctx, article.id, { version: article.version, title: 'How to, revised' })
  await assert.rejects(() => archiveArticle(ctx, article.id, article.version), (e: any) => e.status === 409)
  await db.close()
})
