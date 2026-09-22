import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * The knowledge base and canned responses.
 *
 * Draft versus published is an ACCESS CONTROL here, not a label. An
 * unpublished article must not surface in a portal search, because a draft is
 * frequently wrong on purpose — half-written, or the internal version of
 * something a customer must not read. The read path takes an explicit audience
 * and the query filters on it; nothing is filtered after the fact in the UI.
 *
 * Every published edit keeps its predecessor as a version row, so "what did
 * this article say when the customer read it" has an answer.
 */

export type ArticleRow = {
  id: string
  slug: string
  title: string
  body: string
  categoryId: string | null
  categoryName: string | null
  status: string
  visibility: string
  version: number
  publishedVersion: number | null
  publishedAt: string | null
  viewCount: number
}

export type Audience = 'internal' | 'portal' | 'public'

type Raw = Record<string, unknown>

const mapArticle = (row: Raw): ArticleRow => ({
  id: row.id as string,
  slug: row.slug as string,
  title: row.title as string,
  body: (row.body as string) ?? '',
  categoryId: (row.category_id as string) ?? null,
  categoryName: (row.category_name as string) ?? null,
  status: row.status as string,
  visibility: row.visibility as string,
  version: row.version as number,
  publishedVersion: (row.published_version as number) ?? null,
  publishedAt: row.published_at ? new Date(row.published_at as string).toISOString() : null,
  viewCount: row.view_count as number,
})

const SELECT = `a.*, c.name as category_name
    from kb_articles a
    left join kb_categories c on c.id = a.category_id`

/** A URL-safe slug. Collisions are the caller's to resolve, not silently suffixed. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 120)
}

export async function createCategory(
  ctx: TenantContext,
  input: { name: string; slug?: string; position?: number },
): Promise<{ id: string; name: string; slug: string }> {
  ctx.require('settings.manage')
  const slug = input.slug?.trim() || slugify(input.name)
  if (!slug) throw unprocessable('bad_slug', 'That name produces no usable slug.')

  const { rows: clash } = await ctx.db.query('select 1 from kb_categories where tenant_id = $1 and lower(slug) = lower($2)', [
    ctx.tenantId,
    slug,
  ])
  if (clash[0]) throw unprocessable('duplicate_slug', `A category already uses the slug ${slug}.`)

  const { rows } = await ctx.db.query<{ id: string; name: string; slug: string }>(
    'insert into kb_categories (tenant_id, name, slug, position) values ($1,$2,$3,$4) returning id, name, slug',
    [ctx.tenantId, input.name, slug, input.position ?? 0],
  )
  return rows[0]
}

export async function listCategories(ctx: TenantContext): Promise<{ id: string; name: string; slug: string }[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{ id: string; name: string; slug: string }>(
    'select id, name, slug from kb_categories where tenant_id = $1 and archived_at is null order by position, lower(name)',
    [ctx.tenantId],
  )
  return rows
}

export async function createArticle(
  ctx: TenantContext,
  input: { title: string; body?: string; slug?: string; categoryId?: string | null; visibility?: Audience },
): Promise<ArticleRow> {
  ctx.require('record.create')
  const slug = input.slug?.trim() || slugify(input.title)
  if (!slug) throw unprocessable('bad_slug', 'That title produces no usable slug.')

  return ctx.db.transaction(async (tx) => {
    const { rows: clash } = await tx.query('select 1 from kb_articles where tenant_id = $1 and lower(slug) = lower($2)', [
      ctx.tenantId,
      slug,
    ])
    if (clash[0]) throw unprocessable('duplicate_slug', `An article already uses the slug ${slug}.`)

    const { rows } = await tx.query<{ id: string }>(
      `insert into kb_articles (tenant_id, category_id, slug, title, body, visibility, author_user_id, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$8) returning id`,
      [
        ctx.tenantId,
        input.categoryId ?? null,
        slug,
        input.title,
        input.body ?? '',
        input.visibility ?? 'internal',
        ctx.userId,
        ctx.now,
      ],
    )
    return readArticleOn(tx, ctx, rows[0].id)
  })
}

async function readArticleOn(db: Db, ctx: TenantContext, articleId: string): Promise<ArticleRow> {
  const { rows } = await db.query<Raw>(`select ${SELECT} where a.id = $1 and a.tenant_id = $2`, [articleId, ctx.tenantId])
  if (!rows[0]) throw notFound('That article')
  return mapArticle(rows[0])
}

export async function readArticle(ctx: TenantContext, articleId: string): Promise<ArticleRow> {
  ctx.require('record.read')
  return readArticleOn(ctx.db, ctx, articleId)
}

export async function updateArticle(
  ctx: TenantContext,
  articleId: string,
  input: { version: number; title?: string; body?: string; categoryId?: string | null; visibility?: Audience },
): Promise<ArticleRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number; status: string; title: string; body: string }>(
      'select version, status, title, body from kb_articles where id = $1 and tenant_id = $2 for update',
      [articleId, ctx.tenantId],
    )
    const article = rows[0]
    if (!article) throw notFound('That article')
    if (article.version !== input.version) throw conflict('Someone else changed this article.', article.version)

    /*
     * A published article's previous text is kept before it is overwritten, so
     * "what did this say when the customer read it" has an answer. A draft has
     * no readers, so its edits are not worth a version row each.
     */
    if (article.status === 'published') {
      await tx.query(
        `insert into kb_article_versions (tenant_id, article_id, version, title, body, author_user_id, created_at)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict (article_id, version) do nothing`,
        [ctx.tenantId, articleId, article.version, article.title, article.body, ctx.userId, ctx.now],
      )
    }

    await tx.query(
      `update kb_articles
          set title = coalesce($3, title), body = coalesce($4, body),
              category_id = coalesce($5, category_id), visibility = coalesce($6, visibility),
              version = version + 1, updated_at = $7
        where id = $1 and tenant_id = $2`,
      [
        articleId,
        ctx.tenantId,
        input.title ?? null,
        input.body ?? null,
        input.categoryId ?? null,
        input.visibility ?? null,
        ctx.now,
      ],
    )
    return readArticleOn(tx, ctx, articleId)
  })
}

/** Publishes an article, recording which version became public. */
export async function publishArticle(ctx: TenantContext, articleId: string, version: number): Promise<ArticleRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number; body: string; status: string }>(
      'select version, body, status from kb_articles where id = $1 and tenant_id = $2 for update',
      [articleId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That article')
    if (rows[0].version !== version) throw conflict('Someone else changed this article.', rows[0].version)
    // Publishing an empty article puts a blank page in front of a customer.
    if (!rows[0].body.trim()) throw unprocessable('empty_article', 'Write the article before publishing it.')

    await tx.query(
      `update kb_articles set status = 'published', published_version = version, published_at = $2,
              version = version + 1, updated_at = $2
        where id = $1`,
      [articleId, ctx.now],
    )
    await recordAudit(tx, ctx, { action: 'support.kb_published', resource: 'kb_article', resourceId: articleId })
    return readArticleOn(tx, ctx, articleId)
  })
}

export async function unpublishArticle(ctx: TenantContext, articleId: string, version: number): Promise<ArticleRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rowCount } = await tx.query(
      `update kb_articles set status = 'draft', published_at = null, version = version + 1, updated_at = $3
        where id = $1 and tenant_id = $2 and version = $4`,
      [articleId, ctx.tenantId, ctx.now, version],
    )
    if (!rowCount) {
      const current = await readArticleOn(tx, ctx, articleId)
      throw conflict('Someone else changed this article.', current.version)
    }
    await recordAudit(tx, ctx, { action: 'support.kb_unpublished', resource: 'kb_article', resourceId: articleId })
    return readArticleOn(tx, ctx, articleId)
  })
}

export type ArticleQuery = {
  q?: string
  categoryId?: string
  status?: string
  /**
   * Who is reading. `internal` sees everything; anything else sees only
   * PUBLISHED articles at or below its own visibility. This is the access
   * control, and it lives in the query rather than in a filter afterwards.
   */
  audience?: Audience
  limit?: number
  offset?: number
}

const VISIBLE_TO: Record<Audience, string[]> = {
  internal: ['internal', 'portal', 'public'],
  portal: ['portal', 'public'],
  public: ['public'],
}

export async function listArticles(ctx: TenantContext, options: ArticleQuery = {}): Promise<{ rows: ArticleRow[]; total: number }> {
  const audience = options.audience ?? 'internal'
  if (audience === 'internal') ctx.require('record.read')

  const filters = ['a.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }

  if (audience === 'internal') {
    if (options.status) add('a.status = $?', options.status)
  } else {
    // Not negotiable by a parameter: an outside reader sees published only.
    filters.push(`a.status = 'published'`)
    add('a.visibility = any($?)', VISIBLE_TO[audience])
  }
  if (options.categoryId) add('a.category_id = $?', options.categoryId)
  if (options.q?.trim()) {
    params.push(`%${options.q.trim().toLowerCase()}%`)
    const index = params.length
    filters.push(`(lower(a.title) like $${index} or lower(a.body) like $${index})`)
  }
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from kb_articles a where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 25, 100), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Raw>(
    `select ${SELECT} where ${where} order by a.updated_at desc limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return { total: Number(counted[0].n), rows: rows.map(mapArticle) }
}

/** Records a read. Separate from the fetch so an editor previewing does not inflate it. */
export async function recordArticleView(ctx: TenantContext, articleId: string): Promise<void> {
  await ctx.db.query('update kb_articles set view_count = view_count + 1 where id = $1 and tenant_id = $2', [
    articleId,
    ctx.tenantId,
  ])
}

export async function articleHistory(
  ctx: TenantContext,
  articleId: string,
): Promise<{ version: number; title: string; createdAt: string }[]> {
  ctx.require('record.read')
  await readArticle(ctx, articleId)
  const { rows } = await ctx.db.query<{ version: number; title: string; created_at: Date }>(
    'select version, title, created_at from kb_article_versions where article_id = $1 and tenant_id = $2 order by version desc',
    [articleId, ctx.tenantId],
  )
  return rows.map((row) => ({ version: row.version, title: row.title, createdAt: new Date(row.created_at).toISOString() }))
}

/* ---------------------------- canned responses ---------------------------- */

export type CannedRow = { id: string; shortcut: string; title: string; body: string; teamId: string | null; usageCount: number }

const mapCanned = (row: Raw): CannedRow => ({
  id: row.id as string,
  shortcut: row.shortcut as string,
  title: row.title as string,
  body: row.body as string,
  teamId: (row.team_id as string) ?? null,
  usageCount: row.usage_count as number,
})

export async function createCanned(
  ctx: TenantContext,
  input: { shortcut: string; title: string; body: string; teamId?: string | null },
): Promise<CannedRow> {
  ctx.require('settings.manage')
  const shortcut = input.shortcut.trim().replace(/^\//, '')
  if (!shortcut) throw unprocessable('bad_shortcut', 'Give the response a shortcut.')

  const { rows: clash } = await ctx.db.query(
    'select 1 from canned_responses where tenant_id = $1 and lower(shortcut) = lower($2) and archived_at is null',
    [ctx.tenantId, shortcut],
  )
  if (clash[0]) throw unprocessable('duplicate_shortcut', `/${shortcut} is already in use.`)

  const { rows } = await ctx.db.query<Raw>(
    'insert into canned_responses (tenant_id, shortcut, title, body, team_id) values ($1,$2,$3,$4,$5) returning *',
    [ctx.tenantId, shortcut, input.title, input.body, input.teamId ?? null],
  )
  return mapCanned(rows[0])
}

export async function listCanned(ctx: TenantContext, teamId?: string): Promise<CannedRow[]> {
  ctx.require('record.read')
  const { rows } = teamId
    ? await ctx.db.query<Raw>(
        `select * from canned_responses where tenant_id = $1 and archived_at is null
           and (team_id = $2 or team_id is null) order by lower(shortcut)`,
        [ctx.tenantId, teamId],
      )
    : await ctx.db.query<Raw>(
        'select * from canned_responses where tenant_id = $1 and archived_at is null order by lower(shortcut)',
        [ctx.tenantId],
      )
  return rows.map(mapCanned)
}

/** Counts a use. The shortcut nobody uses is the one to retire. */
export async function useCanned(ctx: TenantContext, cannedId: string): Promise<CannedRow> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>(
    'update canned_responses set usage_count = usage_count + 1 where id = $1 and tenant_id = $2 and archived_at is null returning *',
    [cannedId, ctx.tenantId],
  )
  if (!rows[0]) throw notFound('That response')
  return mapCanned(rows[0])
}

export async function archiveCanned(ctx: TenantContext, cannedId: string): Promise<void> {
  ctx.require('settings.manage')
  const { rowCount } = await ctx.db.query(
    'update canned_responses set archived_at = $3 where id = $1 and tenant_id = $2 and archived_at is null',
    [cannedId, ctx.tenantId, ctx.now],
  )
  if (!rowCount) throw notFound('That response')
}
