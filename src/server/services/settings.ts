import { conflict, notFound } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Versioned per-app settings with real history.
 *
 * Every app in the product has settings panes beside a "Change History" tab.
 * In the prototype the history was empty or fabricated and there was no revert.
 * Modelling it once here gives every app the same guarantees: an optimistic
 * version, a recorded before/after, and a revert that actually restores.
 */

export type SettingsDocument<T = Record<string, unknown>> = {
  appCode: string
  section: string
  value: T
  version: number
  updatedAt: string | null
}

export async function readSettings<T extends Record<string, unknown>>(
  ctx: TenantContext,
  appCode: string,
  section: string,
  fallback: T,
): Promise<SettingsDocument<T>> {
  ctx.require('settings.read')
  const { rows } = await ctx.db.query<{ value: T; version: number; updated_at: Date }>(
    `select value, version, updated_at from app_settings
      where tenant_id = $1 and app_code = $2 and section = $3
        and company_id is not distinct from $4`,
    [ctx.tenantId, appCode, section, ctx.companyId],
  )
  const row = rows[0]
  return {
    appCode,
    section,
    // Merged over the fallback so a new setting appears with its default
    // instead of being undefined for every tenant that saved before it existed.
    value: row ? { ...fallback, ...row.value } : fallback,
    version: row?.version ?? 0,
    updatedAt: row ? new Date(row.updated_at).toISOString() : null,
  }
}

export type WriteSettingsInput<T> = {
  appCode: string
  section: string
  value: T
  /** The version the editor last read. 0 means "there was nothing yet". */
  version: number
  summary: string
}

/**
 * Writes a settings document and records the change.
 *
 * The version predicate is part of the UPDATE, so two admins editing the same
 * pane cannot silently overwrite each other — the second gets a 409 with the
 * current version.
 */
export async function writeSettings<T extends Record<string, unknown>>(
  ctx: TenantContext,
  input: WriteSettingsInput<T>,
): Promise<SettingsDocument<T>> {
  ctx.require('settings.manage')

  return ctx.db.transaction(async (tx) => {
    const { rows: existing } = await tx.query<{ id: string; value: T; version: number }>(
      `select id, value, version from app_settings
        where tenant_id = $1 and app_code = $2 and section = $3 and company_id is not distinct from $4
        for update`,
      [ctx.tenantId, input.appCode, input.section, ctx.companyId],
    )
    const current = existing[0]

    if (current && current.version !== input.version) {
      throw conflict('Someone else changed these settings while you were editing.', current.version)
    }
    if (!current && input.version !== 0) {
      throw conflict('These settings were created by someone else while you were editing.', 0)
    }

    const nextVersion = (current?.version ?? 0) + 1
    let settingId: string
    if (current) {
      await tx.query('update app_settings set value = $2, version = $3, updated_by = $4, updated_at = $5 where id = $1', [
        current.id,
        JSON.stringify(input.value),
        nextVersion,
        ctx.userId,
        ctx.now,
      ])
      settingId = current.id
    } else {
      const { rows } = await tx.query<{ id: string }>(
        `insert into app_settings (tenant_id, company_id, app_code, section, value, version, updated_by, updated_at)
         values ($1, $2, $3, $4, $5, 1, $6, $7) returning id`,
        [ctx.tenantId, ctx.companyId, input.appCode, input.section, JSON.stringify(input.value), ctx.userId, ctx.now],
      )
      settingId = rows[0].id
    }

    await tx.query(
      `insert into app_settings_changes (tenant_id, setting_id, app_code, section, version, summary, before, after, changed_by, changed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        ctx.tenantId,
        settingId,
        input.appCode,
        input.section,
        nextVersion,
        input.summary,
        current ? JSON.stringify(current.value) : null,
        JSON.stringify(input.value),
        ctx.userId,
        ctx.now,
      ],
    )

    await recordAudit(tx, ctx, {
      action: 'settings.updated',
      resource: `${input.appCode}.${input.section}`,
      resourceId: settingId,
      detail: { summary: input.summary, version: nextVersion },
    })

    return { appCode: input.appCode, section: input.section, value: input.value, version: nextVersion, updatedAt: ctx.now.toISOString() }
  })
}

export type SettingsChange = {
  id: string
  version: number
  summary: string
  changedBy: string | null
  changedByName: string | null
  changedAt: string
  reverted: boolean
}

export async function listSettingsChanges(
  ctx: TenantContext,
  appCode: string,
  section?: string,
  limit = 50,
): Promise<SettingsChange[]> {
  ctx.require('settings.read')
  const { rows } = await ctx.db.query<{
    id: string
    version: number
    summary: string
    changed_by: string | null
    full_name: string | null
    changed_at: Date
    reverted_at: Date | null
  }>(
    `select c.id::text as id, c.version, c.summary, c.changed_by, u.full_name, c.changed_at, c.reverted_at
       from app_settings_changes c
       left join users u on u.id = c.changed_by
      where c.tenant_id = $1 and c.app_code = $2 and ($3::text is null or c.section = $3)
      order by c.changed_at desc, c.id desc
      limit $4`,
    [ctx.tenantId, appCode, section ?? null, Math.min(limit, 200)],
  )
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    summary: row.summary,
    changedBy: row.changed_by,
    changedByName: row.full_name,
    changedAt: new Date(row.changed_at).toISOString(),
    reverted: Boolean(row.reverted_at),
  }))
}

/**
 * Restores the document as it was *before* a recorded change.
 *
 * This is a forward write, not a rewrite of history: reverting produces a new
 * version with its own entry, so the audit trail still shows that a revert
 * happened and what it undid.
 */
export async function revertSettingsChange(ctx: TenantContext, changeId: string): Promise<SettingsDocument> {
  ctx.require('settings.manage')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{
      setting_id: string
      app_code: string
      section: string
      before: Record<string, unknown> | null
      summary: string
      reverted_at: Date | null
    }>(
      `select setting_id, app_code, section, before, summary, reverted_at
         from app_settings_changes where id = $1 and tenant_id = $2 for update`,
      [changeId, ctx.tenantId],
    )
    const change = rows[0]
    if (!change) throw notFound('That change')
    if (change.reverted_at) throw conflict('That change has already been reverted.')
    if (!change.before) throw conflict('That change created these settings; there is nothing earlier to restore.')

    const { rows: current } = await tx.query<{ version: number }>(
      'select version from app_settings where id = $1 for update',
      [change.setting_id],
    )
    const nextVersion = (current[0]?.version ?? 0) + 1

    await tx.query('update app_settings set value = $2, version = $3, updated_by = $4, updated_at = $5 where id = $1', [
      change.setting_id,
      JSON.stringify(change.before),
      nextVersion,
      ctx.userId,
      ctx.now,
    ])
    await tx.query('update app_settings_changes set reverted_at = $2 where id = $1', [changeId, ctx.now])
    await tx.query(
      `insert into app_settings_changes (tenant_id, setting_id, app_code, section, version, summary, before, after, changed_by, changed_at)
       values ($1, $2, $3, $4, $5, $6, null, $7, $8, $9)`,
      [
        ctx.tenantId,
        change.setting_id,
        change.app_code,
        change.section,
        nextVersion,
        `Reverted: ${change.summary}`,
        JSON.stringify(change.before),
        ctx.userId,
        ctx.now,
      ],
    )
    await recordAudit(tx, ctx, {
      action: 'settings.reverted',
      resource: `${change.app_code}.${change.section}`,
      resourceId: change.setting_id,
      detail: { changeId, summary: change.summary },
    })

    return {
      appCode: change.app_code,
      section: change.section,
      value: change.before,
      version: nextVersion,
      updatedAt: ctx.now.toISOString(),
    }
  })
}
