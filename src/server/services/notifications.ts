import { notFound } from '../http/errors.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Notifications and the unread count.
 *
 * A notification has recipients. The unread count is per PERSON, not per
 * workspace — the prototype kept one number for the whole browser, so
 * everybody sharing it saw the same badge and reading an item cleared it for
 * all of them.
 *
 * Read state is a timestamp on the recipient row rather than a boolean, so
 * "when did they see this" survives, and marking something read twice is
 * idempotent rather than a second event.
 */

export type NotificationRow = {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  severity: string
  readAt: string | null
  createdAt: string
}

type Raw = Record<string, unknown>

const map = (row: Raw): NotificationRow => ({
  id: row.id as string,
  kind: row.kind as string,
  title: row.title as string,
  body: (row.body as string) ?? null,
  link: (row.link as string) ?? null,
  severity: row.severity as string,
  readAt: row.read_at ? new Date(row.read_at as string).toISOString() : null,
  createdAt: new Date(row.created_at as string).toISOString(),
})

/**
 * Raises a notification for named people.
 *
 * Called from inside a service transaction so the notification and the thing
 * it announces commit together — an alert about an approval that rolled back
 * is worse than no alert.
 */
export async function notify(
  db: Db,
  ctx: TenantContext,
  input: {
    kind: string
    title: string
    body?: string | null
    link?: string | null
    severity?: 'info' | 'success' | 'warning' | 'error'
    resource?: string | null
    resourceId?: string | null
    recipients: string[]
  },
): Promise<string | null> {
  const recipients = [...new Set(input.recipients)].filter(Boolean)
  // A notification nobody receives is a row that will never be read.
  if (!recipients.length) return null

  const { rows } = await db.query<{ id: string }>(
    `insert into notifications (tenant_id, kind, title, body, link, resource, resource_id, severity, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [
      ctx.tenantId,
      input.kind,
      input.title,
      input.body ?? null,
      input.link ?? null,
      input.resource ?? null,
      input.resourceId ?? null,
      input.severity ?? 'info',
      ctx.now,
    ],
  )
  for (const userId of recipients) {
    await db.query('insert into notification_recipients (notification_id, user_id) values ($1, $2)', [rows[0].id, userId])
  }
  return rows[0].id
}

export async function unreadCount(ctx: TenantContext): Promise<number> {
  const { rows } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n
       from notification_recipients r
       join notifications n on n.id = r.notification_id
      where r.user_id = $1 and n.tenant_id = $2 and r.read_at is null and r.archived_at is null`,
    [ctx.userId, ctx.tenantId],
  )
  return Number(rows[0].n)
}

export async function listNotifications(
  ctx: TenantContext,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<{ rows: NotificationRow[]; unread: number }> {
  const limit = Math.min(options.limit ?? 50, 200)
  const { rows } = options.unreadOnly
    ? await ctx.db.query<Raw>(
        `select n.*, r.read_at from notification_recipients r
           join notifications n on n.id = r.notification_id
          where r.user_id = $1 and n.tenant_id = $2 and r.archived_at is null and r.read_at is null
          order by n.created_at desc limit $3`,
        [ctx.userId, ctx.tenantId, limit],
      )
    : await ctx.db.query<Raw>(
        `select n.*, r.read_at from notification_recipients r
           join notifications n on n.id = r.notification_id
          where r.user_id = $1 and n.tenant_id = $2 and r.archived_at is null
          order by n.created_at desc limit $3`,
        [ctx.userId, ctx.tenantId, limit],
      )
  return { rows: rows.map(map), unread: await unreadCount(ctx) }
}

/** Marks one as read. Idempotent: reading twice keeps the first timestamp. */
export async function markRead(ctx: TenantContext, notificationId: string): Promise<{ unread: number }> {
  const { rowCount } = await ctx.db.query(
    `update notification_recipients set read_at = $3
       where notification_id = $1 and user_id = $2 and read_at is null`,
    [notificationId, ctx.userId, ctx.now],
  )
  if (!rowCount) {
    // Either already read, or not addressed to this person. Distinguish, so a
    // caller is not told "done" about somebody else's notification.
    const { rows } = await ctx.db.query('select 1 from notification_recipients where notification_id = $1 and user_id = $2', [
      notificationId,
      ctx.userId,
    ])
    if (!rows[0]) throw notFound('That notification')
  }
  return { unread: await unreadCount(ctx) }
}

export async function markAllRead(ctx: TenantContext): Promise<{ marked: number; unread: number }> {
  const { rowCount } = await ctx.db.query(
    `update notification_recipients r set read_at = $3
       from notifications n
      where n.id = r.notification_id and r.user_id = $1 and n.tenant_id = $2 and r.read_at is null`,
    [ctx.userId, ctx.tenantId, ctx.now],
  )
  return { marked: rowCount, unread: await unreadCount(ctx) }
}
