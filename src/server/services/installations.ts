import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { appInCatalog, CATALOG } from '../catalog/apps.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Installing and removing applications.
 *
 * Three things the prototype got wrong, all fixed here by construction:
 *
 *  - Deselecting an app in onboarding left it installed, because "install"
 *    was an array push and nothing ever removed. `setInstalledApps` reconciles
 *    a desired set against what is there, so removing is a real operation.
 *  - The quota was a number rendered on a card. Here it comes from the
 *    subscribed plan and is checked inside the same transaction that installs,
 *    under a lock, so two concurrent installs cannot both fit in the last slot.
 *  - Gated apps installed happily and presented an empty shell. They are
 *    refused with the reason, because a catalogue entry is not an application.
 */

export type InstallationRow = {
  appCode: string
  name: string
  status: string
  installedAt: string
  disabledAt: string | null
}

export type Entitlement = {
  planCode: string | null
  appQuota: number | null
  used: number
  remaining: number | null
}

/**
 * What the tenant is entitled to.
 *
 * A null quota means "no limit recorded", which is different from zero. The
 * plan tables exist as a mechanism; whether any particular price or quota is
 * commercially authorised is decision D4 and is not asserted here.
 */
export async function entitlement(db: Db, ctx: TenantContext): Promise<Entitlement> {
  const { rows } = await db.query<{ code: string | null; app_quota: number | null }>(
    `select p.code, p.app_quota
       from subscriptions s
       left join plans p on p.id = s.plan_id
      where s.tenant_id = $1 and s.status in ('trialing', 'active')
      limit 1`,
    [ctx.tenantId],
  )
  const { rows: counted } = await db.query<{ n: string }>(
    `select count(*)::text as n from app_installations where tenant_id = $1 and status <> 'uninstalled'`,
    [ctx.tenantId],
  )
  const used = Number(counted[0].n)
  const quota = rows[0]?.app_quota ?? null
  return {
    planCode: rows[0]?.code ?? null,
    appQuota: quota,
    used,
    remaining: quota === null ? null : Math.max(0, quota - used),
  }
}

export async function listInstallations(ctx: TenantContext): Promise<InstallationRow[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{
    app_code: string
    status: string
    installed_at: Date
    disabled_at: Date | null
  }>(
    `select app_code, status, installed_at, disabled_at from app_installations
      where tenant_id = $1 and status <> 'uninstalled' order by installed_at`,
    [ctx.tenantId],
  )
  return rows.map((row) => ({
    appCode: row.app_code,
    name: appInCatalog(row.app_code)?.name ?? row.app_code,
    status: row.status,
    installedAt: new Date(row.installed_at).toISOString(),
    disabledAt: row.disabled_at ? new Date(row.disabled_at).toISOString() : null,
  }))
}

function assertReleasable(code: string): void {
  const app = appInCatalog(code)
  if (!app) throw notFound(`Application ${code}`)
  if (!app.releasable) {
    throw unprocessable(
      'app_not_released',
      `${app.name} is in the catalogue but has no implementation behind it yet, so it cannot be installed.`,
    )
  }
}

/**
 * Installs one application.
 *
 * The tenant row is locked first so the quota check and the insert cannot be
 * interleaved by a second request: without it, two installs racing for the
 * last slot both see room and both take it.
 */
export async function installApp(ctx: TenantContext, appCode: string): Promise<InstallationRow[]> {
  ctx.require('settings.manage')
  assertReleasable(appCode)

  return ctx.db.transaction(async (tx) => {
    await tx.query('select 1 from tenants where id = $1 for update', [ctx.tenantId])

    const { rows: existing } = await tx.query<{ status: string }>(
      'select status from app_installations where tenant_id = $1 and app_code = $2',
      [ctx.tenantId, appCode],
    )
    if (existing[0] && existing[0].status !== 'uninstalled') {
      // Already there. Installing again is not an error; the state asked for
      // already holds.
      return listInstallationsOn(tx, ctx)
    }

    const limits = await entitlement(tx, ctx)
    if (limits.remaining !== null && limits.remaining <= 0) {
      throw conflict(
        `Your plan covers ${limits.appQuota} application(s) and ${limits.used} are installed. Remove one, or change plan.`,
      )
    }

    await tx.query(
      `insert into app_installations (tenant_id, app_code, status, installed_by, installed_at, updated_at)
       values ($1, $2, 'installed', $3, $4, $4)
       on conflict (tenant_id, app_code) do update
         set status = 'installed', installed_by = $3, installed_at = $4, uninstalled_at = null,
             disabled_at = null, updated_at = $4`,
      [ctx.tenantId, appCode, ctx.userId, ctx.now],
    )
    await recordAudit(tx, ctx, { action: 'app.installed', resource: 'app_installation', detail: { appCode } })
    return listInstallationsOn(tx, ctx)
  })
}

async function listInstallationsOn(db: Db, ctx: TenantContext): Promise<InstallationRow[]> {
  return listInstallations({ ...ctx, db })
}

/**
 * Removes an application.
 *
 * The row survives as `uninstalled` rather than being deleted: the tenant's
 * data for that app is still there, and reinstalling must find the same
 * installation rather than looking like a first install.
 */
export async function uninstallApp(ctx: TenantContext, appCode: string): Promise<InstallationRow[]> {
  ctx.require('settings.manage')

  return ctx.db.transaction(async (tx) => {
    const { rowCount } = await tx.query(
      `update app_installations set status = 'uninstalled', uninstalled_at = $3, updated_at = $3
        where tenant_id = $1 and app_code = $2 and status <> 'uninstalled'`,
      [ctx.tenantId, appCode, ctx.now],
    )
    if (!rowCount) throw notFound(`${appCode} is not installed`)
    await recordAudit(tx, ctx, { action: 'app.uninstalled', resource: 'app_installation', detail: { appCode } })
    return listInstallationsOn(tx, ctx)
  })
}

/** Disabling keeps the installation and its data but closes the app to users. */
export async function setAppEnabled(ctx: TenantContext, appCode: string, enabled: boolean): Promise<InstallationRow[]> {
  ctx.require('settings.manage')

  return ctx.db.transaction(async (tx) => {
    const { rowCount } = await tx.query(
      `update app_installations set status = $3, disabled_at = $4, updated_at = $5
        where tenant_id = $1 and app_code = $2 and status <> 'uninstalled'`,
      [ctx.tenantId, appCode, enabled ? 'installed' : 'disabled', enabled ? null : ctx.now, ctx.now],
    )
    if (!rowCount) throw notFound(`${appCode} is not installed`)
    await recordAudit(tx, ctx, {
      action: enabled ? 'app.enabled' : 'app.disabled',
      resource: 'app_installation',
      detail: { appCode },
    })
    return listInstallationsOn(tx, ctx)
  })
}

export type ReconcileResult = {
  installed: string[]
  removed: string[]
  refused: { appCode: string; reason: string }[]
  installations: InstallationRow[]
}

/**
 * Reconciles the installed set against a desired one, in ONE transaction.
 *
 * This is what onboarding calls. Deselecting an app genuinely removes it, the
 * quota is checked against the whole desired set rather than one app at a
 * time, and a set that does not fit is refused entirely rather than installing
 * the first few and stopping — a half-applied choice is worse than a refused one.
 *
 * Gated apps are reported in `refused` with their reason. Naming one is not an
 * error: the marketplace shows them, so a wizard can legitimately pass one on.
 */
export async function setInstalledApps(ctx: TenantContext, desired: string[]): Promise<ReconcileResult> {
  ctx.require('settings.manage')

  const unique = [...new Set(desired.map((code) => code.trim().toUpperCase()))].filter(Boolean)
  const refused: { appCode: string; reason: string }[] = []
  const wanted: string[] = []
  for (const code of unique) {
    const app = appInCatalog(code)
    if (!app) {
      refused.push({ appCode: code, reason: 'That application is not in the catalogue.' })
      continue
    }
    if (!app.releasable) {
      refused.push({ appCode: code, reason: `${app.name} has no implementation behind it yet.` })
      continue
    }
    wanted.push(code)
  }

  return ctx.db.transaction(async (tx) => {
    await tx.query('select 1 from tenants where id = $1 for update', [ctx.tenantId])

    const { rows: current } = await tx.query<{ app_code: string }>(
      `select app_code from app_installations where tenant_id = $1 and status <> 'uninstalled'`,
      [ctx.tenantId],
    )
    const have = new Set(current.map((row) => row.app_code))
    const toInstall = wanted.filter((code) => !have.has(code))
    const toRemove = [...have].filter((code) => !wanted.includes(code))

    const limits = await entitlement(tx, ctx)
    if (limits.appQuota !== null && wanted.length > limits.appQuota) {
      throw conflict(
        `Your plan covers ${limits.appQuota} application(s); ${wanted.length} were chosen. Choose fewer, or change plan.`,
      )
    }

    for (const code of toRemove) {
      await tx.query(
        `update app_installations set status = 'uninstalled', uninstalled_at = $3, updated_at = $3
          where tenant_id = $1 and app_code = $2`,
        [ctx.tenantId, code, ctx.now],
      )
    }
    for (const code of toInstall) {
      await tx.query(
        `insert into app_installations (tenant_id, app_code, status, installed_by, installed_at, updated_at)
         values ($1, $2, 'installed', $3, $4, $4)
         on conflict (tenant_id, app_code) do update
           set status = 'installed', installed_by = $3, installed_at = $4, uninstalled_at = null,
               disabled_at = null, updated_at = $4`,
        [ctx.tenantId, code, ctx.userId, ctx.now],
      )
    }
    if (toInstall.length || toRemove.length) {
      await recordAudit(tx, ctx, {
        action: 'app.selection_changed',
        resource: 'app_installation',
        detail: { installed: toInstall, removed: toRemove },
      })
    }
    return { installed: toInstall, removed: toRemove, refused, installations: await listInstallationsOn(tx, ctx) }
  })
}

/** The catalogue as the server knows it, with what this tenant already has. */
export async function catalogFor(ctx: TenantContext): Promise<
  { code: string; name: string; releasable: boolean; status: string | null }[]
> {
  const installed = new Map((await listInstallations(ctx)).map((row) => [row.appCode, row.status]))
  return CATALOG.map((app) => ({ ...app, status: installed.get(app.code) ?? null }))
}
