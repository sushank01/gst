import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { toDecimal, toMinor } from './sales.ts'
import { readSettings, writeSettings } from './settings.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Asset register, custody and retirement.
 *
 * The rules that carry weight here are custody and finality. An asset is held
 * by at most one person at a time — enforced by a partial unique index, not by
 * hope — and issuing an already-issued asset is refused rather than silently
 * replacing the holder, which is what the prototype's single `assignedTo`
 * string did. Retirement happens once. Depreciation is computed only from
 * inputs someone actually supplied; no method is assumed on their behalf.
 */

export type AssetRow = {
  id: string
  tag: string
  name: string
  assetType: string | null
  make: string | null
  model: string | null
  serialNumber: string | null
  status: string
  condition: string | null
  location: string | null
  acquiredOn: string | null
  purchaseCost: string | null
  currency: string | null
  invoiceRef: string | null
  warrantyExpiresOn: string | null
  usefulLifeMonths: number | null
  salvageValue: string | null
  holder: {
    userId: string | null
    partyId: string | null
    label: string | null
    /** The holder's name when they are a platform user, so a list does not show a uuid. */
    name: string | null
    dueBackOn: string | null
  } | null
  archivedAt: string | null
  version: number
}

const date = (value: Date | string | null): string | null =>
  value === null ? null : typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)

type Raw = Record<string, unknown>

function mapAsset(row: Raw): AssetRow {
  return {
    id: row.id as string,
    tag: row.tag as string,
    name: row.name as string,
    assetType: (row.asset_type as string) ?? null,
    make: (row.make as string) ?? null,
    model: (row.model as string) ?? null,
    serialNumber: (row.serial_number as string) ?? null,
    status: row.status as string,
    condition: (row.condition as string) ?? null,
    location: (row.location as string) ?? null,
    acquiredOn: date((row.acquired_on as Date) ?? null),
    purchaseCost: (row.purchase_cost as string) ?? null,
    currency: (row.currency as string) ?? null,
    invoiceRef: (row.invoice_ref as string) ?? null,
    warrantyExpiresOn: date((row.warranty_expires_on as Date) ?? null),
    usefulLifeMonths: (row.useful_life_months as number) ?? null,
    salvageValue: (row.salvage_value as string) ?? null,
    holder: row.holder_assigned_at
      ? {
          userId: (row.holder_user_id as string) ?? null,
          partyId: (row.holder_party_id as string) ?? null,
          label: (row.holder_label as string) ?? null,
          name: (row.holder_name as string) ?? null,
          dueBackOn: date((row.due_back_on as Date) ?? null),
        }
      : null,
    archivedAt: row.archived_at ? new Date(row.archived_at as string).toISOString() : null,
    version: row.version as number,
  }
}

/**
 * The next asset tag, allocated under a row lock.
 *
 * Two people registering an asset at the same moment must not be handed the
 * same sticker number, so the sequence row is locked for the duration of the
 * transaction rather than read-then-incremented.
 */
export async function nextTag(tx: Db, ctx: TenantContext, prefix = 'AST'): Promise<string> {
  const { rows } = await tx.query<{ next_value: string; padding: number }>(
    `insert into asset_tag_sequences (tenant_id, prefix) values ($1, $2)
     on conflict do nothing
     returning next_value::text, padding`,
    [ctx.tenantId, prefix],
  )
  if (!rows[0]) {
    const { rows: locked } = await tx.query<{ next_value: string; padding: number }>(
      'select next_value::text, padding from asset_tag_sequences where tenant_id = $1 and prefix = $2 for update',
      [ctx.tenantId, prefix],
    )
    if (!locked[0]) throw conflict('Could not allocate an asset tag. Try again.')
    await tx.query('update asset_tag_sequences set next_value = next_value + 1, updated_at = $3 where tenant_id = $1 and prefix = $2', [
      ctx.tenantId,
      prefix,
      ctx.now,
    ])
    return `${prefix}-${locked[0].next_value.padStart(locked[0].padding, '0')}`
  }
  await tx.query('update asset_tag_sequences set next_value = next_value + 1, updated_at = $3 where tenant_id = $1 and prefix = $2', [
    ctx.tenantId,
    prefix,
    ctx.now,
  ])
  return `${prefix}-${rows[0].next_value.padStart(rows[0].padding, '0')}`
}

/** The application these settings documents belong to, everywhere in this file. */
const ASSET_APP_CODE = 'ITAM'

/**
 * The tag prefix configured for an asset type, if any.
 *
 * Read straight from the settings document rather than through
 * `readSettings`, because registering an asset requires `record.create` and a
 * registrar who cannot read settings must still get the right sticker.
 * Nothing configured means the default sequence, not a guessed prefix.
 */
async function tagPrefixFor(ctx: TenantContext, assetType: string | null): Promise<string | undefined> {
  if (!assetType) return undefined
  const { rows } = await ctx.db.query<{ value: { asset_types?: TaxonomyEntry[] } }>(
    `select value from app_settings
      where tenant_id = $1 and app_code = $2 and section = 'taxonomies' and company_id is not distinct from $3`,
    [ctx.tenantId, ASSET_APP_CODE, ctx.companyId],
  )
  const entry = rows[0]?.value?.asset_types?.find((item) => item.value === assetType)
  return entry?.tagPrefix ?? undefined
}

export type CreateAssetInput = {
  name: string
  tag?: string
  assetType?: string | null
  make?: string | null
  model?: string | null
  serialNumber?: string | null
  condition?: string | null
  location?: string | null
  acquiredOn?: string | null
  modeOfPurchase?: string | null
  purchaseCost?: string | null
  currency?: string | null
  supplierPartyId?: string | null
  invoiceRef?: string | null
  warrantyExpiresOn?: string | null
  usefulLifeMonths?: number | null
  salvageValue?: string | null
  notes?: string | null
}

export async function createAsset(ctx: TenantContext, input: CreateAssetInput): Promise<AssetRow> {
  ctx.require('record.create')

  /*
   * Read before the transaction opens, for two reasons: the lookup wants its
   * own connection, and the prefix decides which sequence is locked inside.
   * A workspace that has configured "LAP" for laptops expects the sticker to
   * read LAP-0007, which is the whole point of the Master Taxonomies screen.
   */
  const prefix = input.tag?.trim() ? undefined : await tagPrefixFor(ctx, input.assetType ?? null)

  return ctx.db.transaction(async (tx) => {
    const tag = input.tag?.trim() || (await nextTag(tx, ctx, prefix))

    // Checked before insert so a duplicate sticker is a field error the form
    // can show, not a raw constraint violation.
    const { rows: clash } = await tx.query('select 1 from assets where tenant_id = $1 and lower(tag) = lower($2)', [ctx.tenantId, tag])
    if (clash[0]) throw unprocessable('duplicate_tag', `Asset tag ${tag} is already in use.`)

    const { rows } = await tx.query<Raw>(
      `insert into assets
         (tenant_id, company_id, tag, name, asset_type, make, model, serial_number, condition, location,
          acquired_on, mode_of_purchase, purchase_cost, currency, supplier_party_id, invoice_ref,
          warranty_expires_on, useful_life_months, salvage_value, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       returning *`,
      [
        ctx.tenantId,
        ctx.companyId,
        tag,
        input.name,
        input.assetType ?? null,
        input.make ?? null,
        input.model ?? null,
        input.serialNumber ?? null,
        input.condition ?? null,
        input.location ?? null,
        input.acquiredOn ?? null,
        input.modeOfPurchase ?? null,
        input.purchaseCost ?? null,
        input.currency?.toUpperCase() ?? null,
        input.supplierPartyId ?? null,
        input.invoiceRef ?? null,
        input.warrantyExpiresOn ?? null,
        input.usefulLifeMonths ?? null,
        input.salvageValue ?? null,
        input.notes ?? null,
        ctx.userId,
      ],
    )
    const assetId = rows[0].id as string
    await tx.query(
      `insert into asset_events (tenant_id, asset_id, kind, to_value, actor_user_id, occurred_at)
       values ($1, $2, 'registered', $3, $4, $5)`,
      [ctx.tenantId, assetId, 'in_stock', ctx.userId, ctx.now],
    )
    await recordAudit(tx, ctx, { action: 'asset.registered', resource: 'asset', resourceId: assetId, detail: { tag } })
    return mapAsset(rows[0])
  })
}

export type ListAssetOptions = {
  q?: string
  status?: string
  assetType?: string
  location?: string
  holderUserId?: string
  includeArchived?: boolean
  limit?: number
  offset?: number
}

/*
 * The open-custody row is joined in, so a list never has to guess at a holder
 * from a denormalised column that can go stale.
 */
const CUSTODY_JOIN = `left join asset_assignments c
    on c.asset_id = a.id and c.returned_at is null
  left join users hu on hu.id = c.holder_user_id`

const SELECT_COLUMNS = `a.*, c.holder_user_id, c.holder_party_id, c.holder_label, hu.full_name as holder_name,
         c.due_back_on, c.assigned_at as holder_assigned_at`

export async function listAssets(ctx: TenantContext, options: ListAssetOptions = {}): Promise<{ rows: AssetRow[]; total: number }> {
  ctx.require('record.read')
  const filters = ['a.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (!options.includeArchived) filters.push('a.archived_at is null')
  if (options.status) add('a.status = $?', options.status)
  if (options.assetType) add('a.asset_type = $?', options.assetType)
  if (options.location) add('a.location = $?', options.location)
  if (options.holderUserId) add('c.holder_user_id = $?', options.holderUserId)
  if (options.q?.trim()) {
    params.push(`%${options.q.trim().toLowerCase()}%`)
    const index = params.length
    filters.push(`(lower(a.name) like $${index} or lower(a.tag) like $${index} or lower(coalesce(a.serial_number,'')) like $${index})`)
  }
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from assets a ${CUSTODY_JOIN} where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Raw>(
    `select ${SELECT_COLUMNS} from assets a ${CUSTODY_JOIN} where ${where}
      order by a.created_at desc limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return { total: Number(counted[0].n), rows: rows.map(mapAsset) }
}

export async function readAsset(ctx: TenantContext, assetId: string): Promise<AssetRow> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>(
    `select ${SELECT_COLUMNS} from assets a ${CUSTODY_JOIN} where a.id = $1 and a.tenant_id = $2`,
    [assetId, ctx.tenantId],
  )
  if (!rows[0]) throw notFound('That asset')
  return mapAsset(rows[0])
}

export type UpdateAssetInput = Partial<CreateAssetInput> & { version: number }

/*
 * Input field -> the literal SQL assignment it produces. The whole assignment
 * is a constant, including the column name and the `=`, so the only part of
 * the statement that is ever computed is the placeholder index. Interpolating
 * a column name — even one looked up from an allowlist — means the SQL text
 * depends on a lookup, and a lookup can be wrong; this cannot be.
 */
const UPDATABLE = {
  name: 'name = ',
  assetType: 'asset_type = ',
  make: 'make = ',
  model: 'model = ',
  serialNumber: 'serial_number = ',
  condition: 'condition = ',
  location: 'location = ',
  acquiredOn: 'acquired_on = ',
  modeOfPurchase: 'mode_of_purchase = ',
  purchaseCost: 'purchase_cost = ',
  currency: 'currency = ',
  supplierPartyId: 'supplier_party_id = ',
  invoiceRef: 'invoice_ref = ',
  warrantyExpiresOn: 'warranty_expires_on = ',
  usefulLifeMonths: 'useful_life_months = ',
  salvageValue: 'salvage_value = ',
  notes: 'notes = ',
} as const

export async function updateAsset(ctx: TenantContext, assetId: string, input: UpdateAssetInput): Promise<AssetRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows: current } = await tx.query<{ version: number }>(
      'select version from assets where id = $1 and tenant_id = $2 for update',
      [assetId, ctx.tenantId],
    )
    if (!current[0]) throw notFound('That asset')
    if (current[0].version !== input.version) throw conflict('Someone else changed this asset.', current[0].version)

    const sets: string[] = []
    const params: unknown[] = [assetId, ctx.tenantId, ctx.now]
    for (const [key, assignment] of Object.entries(UPDATABLE)) {
      const value = (input as Record<string, unknown>)[key]
      if (value === undefined) continue
      params.push(value)
      sets.push(assignment + `$${params.length}`)
    }
    if (!sets.length) return readAsset(ctx, assetId)

    await tx.query(
      `update assets set ${sets.join(', ')}, version = version + 1, updated_at = $3 where id = $1 and tenant_id = $2`,
      params as never[],
    )
    await recordAudit(tx, ctx, {
      action: 'asset.updated',
      resource: 'asset',
      resourceId: assetId,
      detail: { fields: Object.keys(input).filter((key) => key !== 'version') },
    })
    return readAsset(ctx, assetId)
  })
}

export type AssignInput = {
  holderUserId?: string | null
  holderPartyId?: string | null
  holderLabel?: string | null
  dueBackOn?: string | null
}

/**
 * Issues an asset to a holder.
 *
 * Refused if the asset is already out, retired or archived. The partial unique
 * index is the real guard — two concurrent issues cannot both land — and this
 * check turns the resulting constraint error into an explanation.
 */
export async function assignAsset(ctx: TenantContext, assetId: string, input: AssignInput): Promise<AssetRow> {
  ctx.require('record.update')
  if (!input.holderUserId && !input.holderPartyId && !input.holderLabel?.trim()) {
    throw unprocessable('holder_required', 'Say who is taking the asset.')
  }

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ status: string; archived_at: Date | null }>(
      'select status, archived_at from assets where id = $1 and tenant_id = $2 for update',
      [assetId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That asset')
    if (rows[0].archived_at) throw unprocessable('asset_archived', 'That asset is archived.')
    if (['retired', 'disposed', 'lost'].includes(rows[0].status)) {
      throw unprocessable('asset_unavailable', `A ${rows[0].status} asset cannot be issued.`)
    }

    const { rows: open } = await tx.query<{ holder_label: string | null }>(
      'select holder_label from asset_assignments where asset_id = $1 and returned_at is null',
      [assetId],
    )
    if (open[0]) throw conflict('That asset is already issued. Record its return first.')

    if (input.holderUserId) {
      const { rows: member } = await tx.query('select 1 from memberships where tenant_id = $1 and user_id = $2 and status = $3', [
        ctx.tenantId,
        input.holderUserId,
        'active',
      ])
      if (!member[0]) throw notFound('That person')
    }

    await tx.query(
      `insert into asset_assignments (tenant_id, asset_id, holder_user_id, holder_party_id, holder_label, assigned_by, assigned_at, due_back_on)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        ctx.tenantId,
        assetId,
        input.holderUserId ?? null,
        input.holderPartyId ?? null,
        input.holderLabel ?? null,
        ctx.userId,
        ctx.now,
        input.dueBackOn ?? null,
      ],
    )
    await tx.query(
      `update assets set status = 'assigned', version = version + 1, updated_at = $2 where id = $1`,
      [assetId, ctx.now],
    )
    await tx.query(
      `insert into asset_events (tenant_id, asset_id, kind, from_value, to_value, actor_user_id, occurred_at)
       values ($1,$2,'assigned',$3,'assigned',$4,$5)`,
      [ctx.tenantId, assetId, rows[0].status, ctx.userId, ctx.now],
    )
    await recordAudit(tx, ctx, { action: 'asset.assigned', resource: 'asset', resourceId: assetId })
    return readAsset(ctx, assetId)
  })
}

export async function returnAsset(
  ctx: TenantContext,
  assetId: string,
  input: { condition?: string | null; note?: string | null } = {},
): Promise<AssetRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rowCount } = await tx.query(
      `update asset_assignments set returned_at = $3, returned_condition = $4, return_note = $5
        where asset_id = $1 and tenant_id = $2 and returned_at is null`,
      [assetId, ctx.tenantId, ctx.now, input.condition ?? null, input.note ?? null],
    )
    // Nothing open: either the asset is not out, or it is not ours. Both read
    // as "there is no custody to close", which is what the caller needs to know.
    if (!rowCount) throw unprocessable('not_issued', 'That asset is not currently issued.')

    await tx.query(
      `update assets set status = 'in_stock', condition = coalesce($3, condition), version = version + 1, updated_at = $2
        where id = $1`,
      [assetId, ctx.now, input.condition ?? null],
    )
    await tx.query(
      `insert into asset_events (tenant_id, asset_id, kind, from_value, to_value, note, actor_user_id, occurred_at)
       values ($1,$2,'returned','assigned','in_stock',$3,$4,$5)`,
      [ctx.tenantId, assetId, input.note ?? null, ctx.userId, ctx.now],
    )
    await recordAudit(tx, ctx, { action: 'asset.returned', resource: 'asset', resourceId: assetId })
    return readAsset(ctx, assetId)
  })
}

export type ServiceInput = {
  kind: string
  startedOn: string
  completedOn?: string | null
  vendorPartyId?: string | null
  cost?: string | null
  currency?: string | null
  notes?: string | null
}

/** Sends an asset for service, or records a completed one. */
export async function recordService(ctx: TenantContext, assetId: string, input: ServiceInput): Promise<AssetRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ status: string }>('select status from assets where id = $1 and tenant_id = $2 for update', [
      assetId,
      ctx.tenantId,
    ])
    if (!rows[0]) throw notFound('That asset')

    await tx.query(
      `insert into asset_service_records (tenant_id, asset_id, kind, vendor_party_id, started_on, completed_on, cost, currency, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        ctx.tenantId,
        assetId,
        input.kind,
        input.vendorPartyId ?? null,
        input.startedOn,
        input.completedOn ?? null,
        input.cost ?? null,
        input.currency?.toUpperCase() ?? null,
        input.notes ?? null,
        ctx.userId,
      ],
    )

    /*
     * Open service moves the asset out of circulation; a completed record
     * returns it. An asset that is currently issued keeps its custody status —
     * servicing it does not silently take it off the holder.
     */
    const next = input.completedOn ? (rows[0].status === 'in_service' ? 'in_stock' : rows[0].status) : 'in_service'
    if (next !== rows[0].status && rows[0].status !== 'assigned') {
      await tx.query('update assets set status = $2, version = version + 1, updated_at = $3 where id = $1', [assetId, next, ctx.now])
    }
    await tx.query(
      `insert into asset_events (tenant_id, asset_id, kind, from_value, to_value, note, cost, currency, actor_user_id, occurred_at)
       values ($1,$2,'service',$3,$4,$5,$6,$7,$8,$9)`,
      [ctx.tenantId, assetId, rows[0].status, next, input.notes ?? null, input.cost ?? null, input.currency ?? null, ctx.userId, ctx.now],
    )
    await recordAudit(tx, ctx, { action: 'asset.serviced', resource: 'asset', resourceId: assetId, detail: { kind: input.kind } })
    return readAsset(ctx, assetId)
  })
}

export type RetireInput = {
  reason: string
  method?: string | null
  proceeds?: string | null
  currency?: string | null
  retiredOn: string
  note?: string | null
}

/**
 * Retires an asset. Once, and not while someone still has it.
 *
 * `asset_retirement_key` makes the once part structural: a replayed request
 * hits the unique index rather than writing a second disposal.
 */
export async function retireAsset(ctx: TenantContext, assetId: string, input: RetireInput): Promise<AssetRow> {
  ctx.require('record.delete')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ status: string }>('select status from assets where id = $1 and tenant_id = $2 for update', [
      assetId,
      ctx.tenantId,
    ])
    if (!rows[0]) throw notFound('That asset')

    const { rows: open } = await tx.query('select 1 from asset_assignments where asset_id = $1 and returned_at is null', [assetId])
    if (open[0]) throw conflict('That asset is still issued. Record its return before retiring it.')

    const { rows: existing } = await tx.query('select 1 from asset_retirements where asset_id = $1', [assetId])
    if (existing[0]) throw conflict('That asset has already been retired.')

    await tx.query(
      `insert into asset_retirements (tenant_id, asset_id, reason, method, proceeds, currency, retired_on, approved_by, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        ctx.tenantId,
        assetId,
        input.reason,
        input.method ?? null,
        input.proceeds ?? null,
        input.currency?.toUpperCase() ?? null,
        input.retiredOn,
        ctx.userId,
        input.note ?? null,
      ],
    )
    const status = input.method === 'disposed' ? 'disposed' : 'retired'
    await tx.query('update assets set status = $2, version = version + 1, updated_at = $3 where id = $1', [assetId, status, ctx.now])
    await tx.query(
      `insert into asset_events (tenant_id, asset_id, kind, from_value, to_value, note, actor_user_id, occurred_at)
       values ($1,$2,'retired',$3,$4,$5,$6,$7)`,
      [ctx.tenantId, assetId, rows[0].status, status, input.note ?? null, ctx.userId, ctx.now],
    )
    await recordAudit(tx, ctx, { action: 'asset.retired', resource: 'asset', resourceId: assetId, detail: { reason: input.reason } })
    return readAsset(ctx, assetId)
  })
}

export type Depreciation = {
  method: 'straight_line'
  monthsElapsed: number
  monthlyAmount: string
  accumulated: string
  netBookValue: string
}

/**
 * Straight-line depreciation, or nothing.
 *
 * Returns null unless cost, life and an acquisition date are all present. An
 * asset register that guesses a useful life produces numbers that look like
 * accounting and are not — so it does not guess.
 *
 * The arithmetic is in integer minor units, and the figures reconcile:
 * `monthlyAmount x monthsElapsed` is the accumulated charge, with the final
 * period absorbing the rounding remainder so the asset lands exactly on its
 * salvage value rather than a cent above or below it. Computing the monthly
 * figure for display and the accumulated figure from unrounded division gives
 * two numbers that quietly disagree.
 */
export function depreciationOf(asset: AssetRow, asOf: Date): Depreciation | null {
  if (!asset.purchaseCost || !asset.usefulLifeMonths || !asset.acquiredOn) return null
  const life = asset.usefulLifeMonths
  if (life <= 0) return null

  const cost = toMinor(asset.purchaseCost)
  const salvage = toMinor(asset.salvageValue ?? '0')
  const depreciable = cost - salvage
  if (depreciable <= 0n) return null

  const acquired = new Date(`${asset.acquiredOn}T00:00:00Z`)
  if (Number.isNaN(acquired.getTime())) return null
  const months =
    (asOf.getUTCFullYear() - acquired.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - acquired.getUTCMonth()) -
    (asOf.getUTCDate() < acquired.getUTCDate() ? 1 : 0)
  const elapsed = Math.max(0, Math.min(months, life))

  const monthly = depreciable / BigInt(life)
  // The last month takes whatever the division left behind.
  const accumulated = elapsed === life ? depreciable : monthly * BigInt(elapsed)
  return {
    method: 'straight_line',
    monthsElapsed: elapsed,
    monthlyAmount: toDecimal(monthly),
    accumulated: toDecimal(accumulated),
    netBookValue: toDecimal(cost - accumulated),
  }
}

export async function assetHistory(
  ctx: TenantContext,
  assetId: string,
): Promise<{ kind: string; fromValue: string | null; toValue: string | null; note: string | null; occurredAt: string }[]> {
  ctx.require('record.read')
  await readAsset(ctx, assetId)
  const { rows } = await ctx.db.query<{
    kind: string
    from_value: string | null
    to_value: string | null
    note: string | null
    occurred_at: Date
  }>(
    `select kind, from_value, to_value, note, occurred_at from asset_events
      where asset_id = $1 and tenant_id = $2 order by occurred_at desc, id desc limit 200`,
    [assetId, ctx.tenantId],
  )
  return rows.map((row) => ({
    kind: row.kind,
    fromValue: row.from_value,
    toValue: row.to_value,
    note: row.note,
    occurredAt: new Date(row.occurred_at).toISOString(),
  }))
}

export async function archiveAsset(ctx: TenantContext, assetId: string, version: number): Promise<void> {
  ctx.require('record.delete')

  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number }>(
      'select version from assets where id = $1 and tenant_id = $2 and archived_at is null for update',
      [assetId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That asset')
    if (rows[0].version !== version) throw conflict('Someone else changed this asset.', rows[0].version)

    const { rows: open } = await tx.query('select 1 from asset_assignments where asset_id = $1 and returned_at is null', [assetId])
    if (open[0]) throw conflict('That asset is still issued.')

    await tx.query('update assets set archived_at = $2, version = version + 1, updated_at = $2 where id = $1', [assetId, ctx.now])
    await recordAudit(tx, ctx, { action: 'asset.archived', resource: 'asset', resourceId: assetId })
  })
}

/* ------------------------------- requests -------------------------------- */

export type AssetRequestRow = {
  id: string
  reference: string
  requesterUserId: string
  /** Null unless the row was read through a list that joined the name. */
  requesterName: string | null
  assetType: string | null
  assetId: string | null
  quantity: number
  reason: string | null
  neededBy: string | null
  status: string
  currentLevel: number
  decidedByName: string | null
  decidedAt: string | null
  version: number
}

const mapRequest = (row: Raw): AssetRequestRow => ({
  id: row.id as string,
  reference: row.reference as string,
  requesterUserId: row.requester_user_id as string,
  requesterName: (row.requester_name as string) ?? null,
  assetType: (row.asset_type as string) ?? null,
  assetId: (row.asset_id as string) ?? null,
  quantity: row.quantity as number,
  reason: (row.reason as string) ?? null,
  neededBy: date((row.needed_by as Date) ?? null),
  status: row.status as string,
  currentLevel: row.current_level as number,
  decidedByName: (row.decided_by_name as string) ?? null,
  decidedAt: row.decided_at ? new Date(row.decided_at as string).toISOString() : null,
  version: row.version as number,
})

/**
 * The approval levels an asset request must clear, in order.
 *
 * A workspace with none configured needs no approval, which is a deliberate
 * choice rather than an oversight: requiring an approval from a level that
 * does not exist would leave every request stuck with nobody able to move it.
 */
async function approvalLevels(db: Db, ctx: TenantContext): Promise<number[]> {
  const { rows } = await db.query<{ level: number }>(
    'select level from asset_approval_levels where tenant_id = $1 order by level',
    [ctx.tenantId],
  )
  return rows.map((row) => row.level)
}

export async function requestAsset(
  ctx: TenantContext,
  input: { assetType?: string | null; assetId?: string | null; quantity?: number; reason?: string | null; neededBy?: string | null },
): Promise<AssetRequestRow> {
  ctx.require('record.create')
  if (!input.assetType?.trim() && !input.assetId) {
    throw unprocessable('nothing_requested', 'Say what is being asked for.')
  }

  return ctx.db.transaction(async (tx) => {
    if (input.assetId) {
      const { rows } = await tx.query('select 1 from assets where id = $1 and tenant_id = $2 and archived_at is null', [
        input.assetId,
        ctx.tenantId,
      ])
      if (!rows[0]) throw notFound('That asset')
    }

    await tx.query('select 1 from tenants where id = $1 for update', [ctx.tenantId])
    const { rows: counted } = await tx.query<{ n: string }>(
      'select count(*)::text as n from asset_requests where tenant_id = $1',
      [ctx.tenantId],
    )
    const reference = `AR-${ctx.now.getUTCFullYear()}-${String(Number(counted[0].n) + 1).padStart(4, '0')}`

    const levels = await approvalLevels(tx, ctx)
    // With no levels configured the request is approved on submission, so it
    // does not sit waiting for an approver who does not exist.
    const status = levels.length ? 'submitted' : 'approved'

    const { rows } = await tx.query<Raw>(
      `insert into asset_requests
         (tenant_id, company_id, reference, requester_user_id, asset_type, asset_id, quantity, reason, needed_by,
          status, current_level, decided_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [
        ctx.tenantId,
        ctx.companyId,
        reference,
        ctx.userId,
        input.assetType ?? null,
        input.assetId ?? null,
        input.quantity ?? 1,
        input.reason ?? null,
        input.neededBy ?? null,
        status,
        levels[0] ?? 1,
        status === 'approved' ? ctx.now : null,
      ],
    )
    await recordAudit(tx, ctx, {
      action: 'asset.requested',
      resource: 'asset_request',
      resourceId: rows[0].id as string,
      detail: { reference, quantity: input.quantity ?? 1 },
    })
    return mapRequest(rows[0])
  })
}

/**
 * Records one approval decision.
 *
 * `asset_request_approval_key` makes a level decidable exactly once, so a
 * double-click cannot advance the request two levels at a time. The request
 * reaches `approved` only when every configured level has approved it.
 */
export async function decideAssetRequest(
  ctx: TenantContext,
  requestId: string,
  input: { decision: 'approved' | 'rejected'; version: number; note?: string | null },
): Promise<AssetRequestRow> {
  ctx.require('approval.decide')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Raw>('select * from asset_requests where id = $1 and tenant_id = $2 for update', [
      requestId,
      ctx.tenantId,
    ])
    const request = rows[0]
    if (!request) throw notFound('That request')
    if (request.version !== input.version) throw conflict('Someone else decided this request.', request.version as number)
    if (request.status !== 'submitted') throw unprocessable('not_submitted', `That request is ${request.status}.`)

    const level = request.current_level as number
    const { rowCount } = await tx.query(
      `insert into asset_request_approvals (tenant_id, request_id, level, decided_by, decision, note, decided_at)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (request_id, level) do nothing`,
      [ctx.tenantId, requestId, level, ctx.userId, input.decision, input.note ?? null, ctx.now],
    )
    if (!rowCount) throw conflict(`Level ${level} has already been decided.`)

    if (input.decision === 'rejected') {
      await tx.query(
        `update asset_requests set status = 'rejected', decided_at = $2, version = version + 1, updated_at = $2 where id = $1`,
        [requestId, ctx.now],
      )
    } else {
      const levels = await approvalLevels(tx, ctx)
      const remaining = levels.filter((candidate) => candidate > level)
      // Two statements rather than one chosen by a ternary: the branches take
      // different parameters, and a list padded to fit both leaves a
      // placeholder unused, which PostgreSQL rejects only on that branch.
      if (remaining.length) {
        await tx.query('update asset_requests set current_level = $2, version = version + 1, updated_at = $3 where id = $1', [
          requestId,
          remaining[0],
          ctx.now,
        ])
      } else {
        await tx.query(
          `update asset_requests set status = 'approved', decided_at = $2, version = version + 1, updated_at = $2 where id = $1`,
          [requestId, ctx.now],
        )
      }
    }
    await recordAudit(tx, ctx, {
      action: `asset.request_${input.decision}`,
      resource: 'asset_request',
      resourceId: requestId,
      detail: { level },
    })
    const { rows: after } = await tx.query<Raw>('select * from asset_requests where id = $1', [requestId])
    return mapRequest(after[0])
  })
}

/**
 * Issues the asset a request was approved for, closing the request.
 *
 * The issue and the request's transition happen together: an asset handed over
 * against a request that still reads "approved" is one somebody will issue a
 * second time.
 */
export async function issueAgainstRequest(
  ctx: TenantContext,
  requestId: string,
  input: { assetId: string; version: number; dueBackOn?: string | null },
): Promise<{ request: AssetRequestRow; asset: AssetRow }> {
  ctx.require('record.update')

  const request = await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Raw>('select * from asset_requests where id = $1 and tenant_id = $2 for update', [
      requestId,
      ctx.tenantId,
    ])
    if (!rows[0]) throw notFound('That request')
    if (rows[0].version !== input.version) throw conflict('Someone else changed this request.', rows[0].version as number)
    if (rows[0].status !== 'approved') throw unprocessable('not_approved', `That request is ${rows[0].status}.`)

    await tx.query(
      `update asset_requests set status = 'issued', asset_id = $2, issued_at = $3, version = version + 1, updated_at = $3
        where id = $1`,
      [requestId, input.assetId, ctx.now],
    )
    const { rows: after } = await tx.query<Raw>('select * from asset_requests where id = $1', [requestId])
    return mapRequest(after[0])
  })

  // Custody is its own transaction with its own guards — the unique index on
  // open assignments still decides whether this issue is allowed at all.
  const asset = await assignAsset(ctx, input.assetId, {
    holderUserId: request.requesterUserId,
    dueBackOn: input.dueBackOn ?? null,
  })
  return { request, asset }
}

export async function listAssetRequests(
  ctx: TenantContext,
  options: { status?: string; requesterUserId?: string; assetType?: string; mine?: boolean; limit?: number; offset?: number } = {},
): Promise<{ rows: AssetRequestRow[]; total: number }> {
  ctx.require('record.read')
  const filters = ['r.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.status) add('r.status = $?', options.status)
  if (options.assetType) add('r.asset_type = $?', options.assetType)
  if (options.mine) add('r.requester_user_id = $?', ctx.userId)
  else if (options.requesterUserId) add('r.requester_user_id = $?', options.requesterUserId)
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from asset_requests r where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  /*
   * The names are joined here rather than resolved by the caller: a list that
   * renders "Raised by" from a uuid, or fetches the directory to translate
   * one, shows a different answer to whoever may not read the member list.
   * "Approved by" is the decision on the highest level reached so far.
   */
  const { rows } = await ctx.db.query<Raw>(
    `select r.*, u.full_name as requester_name,
            (select d.full_name from asset_request_approvals ra
               join users d on d.id = ra.decided_by
              where ra.request_id = r.id order by ra.level desc limit 1) as decided_by_name
       from asset_requests r
       left join users u on u.id = r.requester_user_id
      where ${where} order by r.created_at desc limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return { total: Number(counted[0].n), rows: rows.map(mapRequest) }
}

/* ------------------------------- reporting -------------------------------- */

export type AssetFacets = {
  byStatus: Record<string, number>
  byType: Record<string, number>
  byLocation: Record<string, number>
  /** Workspace-wide: a request is not an asset, so an asset filter cannot narrow it. */
  pendingRequests: number
  outOfWarranty: number
  warrantyExpiring: number
  /** The horizon `warrantyExpiring` was counted over, so a tile can say it. */
  warrantyWithinDays: number
}

/**
 * The counts behind the register's filter chips and dashboard tiles.
 *
 * One pass per dimension rather than one query with several `group by`s, so
 * each count is legible and can be checked against the list it labels.
 *
 * The warranty horizon is a parameter because the tile and the list beneath
 * it must be counted over the same window — a tile saying four and a list
 * showing six is a screen nobody can act on.
 */
export async function assetFacets(
  ctx: TenantContext,
  options: { warrantyWithinDays?: number; q?: string; assetType?: string; location?: string } = {},
): Promise<AssetFacets> {
  ctx.require('record.read')
  const withinDays = Math.max(1, Math.min(options.warrantyWithinDays ?? 90, 3650))
  const today = ctx.now.toISOString().slice(0, 10)
  const horizon = new Date(ctx.now.getTime() + withinDays * 86_400_000).toISOString().slice(0, 10)

  /*
   * The same predicate `listAssets` builds, spelled the same way.
   *
   * A chip that says "In Stock 40" beside a list of three is worse than no
   * number at all: whoever reads it clicks the chip expecting forty. So the
   * counts are taken over the caller's filter, not over the whole register,
   * and the search clause is character-for-character the one the list uses.
   */
  const params: unknown[] = [ctx.tenantId]
  const filters = ['tenant_id = $1', 'archived_at is null']
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.assetType) add('asset_type = $?', options.assetType)
  if (options.location) add('location = $?', options.location)
  if (options.q?.trim()) {
    params.push(`%${options.q.trim().toLowerCase()}%`)
    const index = params.length
    filters.push(`(lower(name) like $${index} or lower(tag) like $${index} or lower(coalesce(serial_number,'')) like $${index})`)
  }
  const where = filters.join(' and ')
  const todayIndex = params.length + 1
  const horizonIndex = params.length + 2

  const [status, type, location, requests, warranty] = await Promise.all([
    ctx.db.query<{ key: string; n: string }>(
      `select status as key, count(*)::text as n from assets where ${where} group by status`,
      params as never[],
    ),
    ctx.db.query<{ key: string; n: string }>(
      `select coalesce(asset_type, 'unspecified') as key, count(*)::text as n
         from assets where ${where} group by 1`,
      params as never[],
    ),
    ctx.db.query<{ key: string; n: string }>(
      `select coalesce(location, 'unassigned') as key, count(*)::text as n
         from assets where ${where} group by 1`,
      params as never[],
    ),
    // Requests are not assets: an asset filter cannot narrow them, so this
    // one stays workspace-wide and the type says so.
    ctx.db.query<{ n: string }>(
      `select count(*)::text as n from asset_requests where tenant_id = $1 and status = 'submitted'`,
      [ctx.tenantId],
    ),
    ctx.db.query<{ expired: string; expiring: string }>(
      `select
         count(*) filter (where warranty_expires_on < $${todayIndex})::text as expired,
         count(*) filter (where warranty_expires_on >= $${todayIndex} and warranty_expires_on < $${horizonIndex})::text as expiring
       from assets
      where ${where} and warranty_expires_on is not null`,
      [...params, today, horizon] as never[],
    ),
  ])

  const tally = (rows: { key: string; n: string }[]) =>
    Object.fromEntries(rows.map((row) => [row.key, Number(row.n)])) as Record<string, number>

  return {
    byStatus: tally(status.rows),
    byType: tally(type.rows),
    byLocation: tally(location.rows),
    pendingRequests: Number(requests.rows[0].n),
    outOfWarranty: Number(warranty.rows[0].expired),
    warrantyExpiring: Number(warranty.rows[0].expiring),
    warrantyWithinDays: withinDays,
  }
}

export type StockLine = {
  key: string
  count: number
  /** The sum of the costs recorded in `currency`, and of nothing else. */
  value: string
  currency: string | null
  /**
   * How many distinct currencies the costs in this group are recorded in.
   *
   * Zero means nothing in the group has a priced currency, so `value` is not
   * a measurement. More than one means the costs cannot be added up at all —
   * a total across currencies is a number with no meaning, and the caller is
   * told rather than shown one under whichever code sorted first.
   */
  currencies: number
}

/**
 * Stock by type, location or status, with the purchase value held in each.
 *
 * Assets with no recorded cost contribute to the count but not the value, and
 * the two are reported separately so a register that is half-priced is not
 * mistaken for one that is half-empty. Costs with no currency recorded are
 * left out of the sum for the same reason: an amount whose unit is unknown
 * cannot be added to one whose unit is known.
 */
export async function stockSummary(ctx: TenantContext, groupBy: 'type' | 'location' | 'status'): Promise<StockLine[]> {
  ctx.require('record.read')
  const columns = `count(*)::text as n,
                   coalesce(sum(purchase_cost) filter (where currency is not null), 0)::text as value,
                   min(currency) filter (where purchase_cost is not null) as currency,
                   count(distinct currency) filter (where purchase_cost is not null)::text as currencies`
  const query = {
    type: `select coalesce(asset_type, 'unspecified') as key, ${columns}
             from assets where tenant_id = $1 and archived_at is null group by 1 order by 1`,
    location: `select coalesce(location, 'unassigned') as key, ${columns}
                 from assets where tenant_id = $1 and archived_at is null group by 1 order by 1`,
    status: `select status as key, ${columns}
               from assets where tenant_id = $1 and archived_at is null group by 1 order by 1`,
  }[groupBy]

  const { rows } = await ctx.db.query<{ key: string; n: string; value: string; currency: string | null; currencies: string }>(
    query,
    [ctx.tenantId],
  )
  return rows.map((row) => ({
    key: row.key,
    count: Number(row.n),
    value: row.value,
    currency: row.currency,
    currencies: Number(row.currencies),
  }))
}

/* ------------------------------ taxonomies -------------------------------- */

export type TaxonomyEntry = { value: string; label: string; tagPrefix: string | null }

export type TaxonomyMap = Record<string, TaxonomyEntry[]>

export type TaxonomyDocument = { taxonomies: TaxonomyMap; version: number; updatedAt: string | null }

/** The lists the Master Taxonomies screen edits, and nothing else. */
export const ASSET_TAXONOMY_CODES = [
  'asset_types',
  'makes',
  'models',
  'mode_of_purchase',
  'retirement_reasons',
  'warranty',
  'numbering',
  'reasons',
  'notification',
] as const

/**
 * What a new workspace starts with: values and labels, and no tag prefix.
 *
 * A shipped prefix would be a claim the register allocates from it, and until
 * somebody opens Master Taxonomies and chooses one, it does not — the tag
 * comes from the default sequence. A blank field is the truthful default.
 */
const DEFAULT_TAXONOMIES: TaxonomyMap = {
  asset_types: [
    { value: 'laptop', label: 'Laptop', tagPrefix: null },
    { value: 'desktop', label: 'Desktop', tagPrefix: null },
    { value: 'monitor', label: 'Monitor', tagPrefix: null },
    { value: 'tv_display', label: 'TV Display', tagPrefix: null },
    { value: 'webcam', label: 'Web Camera', tagPrefix: null },
    { value: 'headphone', label: 'Headphone', tagPrefix: null },
    { value: 'mouse', label: 'Mouse', tagPrefix: null },
    { value: 'speaker', label: 'Speaker', tagPrefix: null },
    { value: 'earphone', label: 'Earphone', tagPrefix: null },
  ],
  makes: ['Dell', 'HP', 'Lenovo', 'Apple', 'Asus', 'Acer', 'Samsung', 'LG', 'Logitech', 'Microsoft'].map((label) => ({
    value: label.toLowerCase(),
    label,
    tagPrefix: null,
  })),
  models: [],
  mode_of_purchase: [
    { value: 'purchase', label: 'Purchase', tagPrefix: null },
    { value: 'lease', label: 'Lease', tagPrefix: null },
    { value: 'rental', label: 'Rental', tagPrefix: null },
  ],
  retirement_reasons: [
    { value: 'end_of_life', label: 'End of life', tagPrefix: null },
    { value: 'damaged', label: 'Damaged beyond repair', tagPrefix: null },
    { value: 'lost', label: 'Lost', tagPrefix: null },
    { value: 'stolen', label: 'Stolen', tagPrefix: null },
    { value: 'sold', label: 'Sold', tagPrefix: null },
    { value: 'donated', label: 'Donated', tagPrefix: null },
  ],
  warranty: [],
  numbering: [],
  reasons: [
    { value: 'hardware_fault', label: 'Hardware fault', tagPrefix: null },
    { value: 'software_issue', label: 'Software issue', tagPrefix: null },
    { value: 'accessory_missing', label: 'Accessory missing', tagPrefix: null },
    { value: 'upgrade', label: 'Upgrade request', tagPrefix: null },
    { value: 'other', label: 'Other', tagPrefix: null },
  ],
  notification: [],
}

/*
 * Taxonomy code -> the complete statement that counts records still holding
 * one of its values. The SQL is a constant per code, placeholders included:
 * building `where ${column} = $2` from a lookup makes the statement depend on
 * the lookup being right, and this cannot be wrong. A code that is absent has
 * nothing storing it, so its entries can be removed freely.
 */
const TAXONOMY_USE: Record<string, string> = {
  asset_types: 'select count(*)::text as n from assets where tenant_id = $1 and asset_type = $2',
  makes: 'select count(*)::text as n from assets where tenant_id = $1 and make = $2',
  models: 'select count(*)::text as n from assets where tenant_id = $1 and model = $2',
  mode_of_purchase: 'select count(*)::text as n from assets where tenant_id = $1 and mode_of_purchase = $2',
  retirement_reasons: 'select count(*)::text as n from asset_retirements where tenant_id = $1 and reason = $2',
}

/** A prefix is what someone reads off a sticker; the sequence adds the dash. */
function normalisePrefix(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  return cleaned || null
}

/**
 * Every asset taxonomy, as one versioned document.
 *
 * These live in `app_settings` rather than `asset_taxonomy_entries` because
 * the tag prefix an asset type allocates from — the reason this screen exists
 * — has no column in that table, and a prefix kept apart from the value it
 * belongs to is two things to keep in step. One document also means one
 * version, so two administrators editing the same list conflict instead of
 * quietly overwriting one another.
 */
export async function readAssetTaxonomies(ctx: TenantContext): Promise<TaxonomyDocument> {
  const document = await readSettings<TaxonomyMap>(ctx, ASSET_APP_CODE, 'taxonomies', DEFAULT_TAXONOMIES)
  return { taxonomies: document.value, version: document.version, updatedAt: document.updatedAt }
}

export async function replaceAssetTaxonomy(
  ctx: TenantContext,
  code: string,
  entries: { value: string; label: string; tagPrefix?: string | null }[],
  version: number,
): Promise<TaxonomyDocument> {
  if (!(ASSET_TAXONOMY_CODES as readonly string[]).includes(code)) throw notFound('That taxonomy')

  const current = await readAssetTaxonomies(ctx)
  const before = current.taxonomies[code] ?? []

  const seen = new Set<string>()
  const cleaned: TaxonomyEntry[] = entries.map((entry) => {
    const value = entry.value.trim().toLowerCase()
    if (!value) throw unprocessable('value_required', 'Every entry needs a value.')
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(value)) {
      throw unprocessable('bad_value', `"${entry.value}" is not a usable value — use letters, digits, - and _.`)
    }
    if (seen.has(value)) throw unprocessable('duplicate_value', `"${value}" is listed twice.`)
    seen.add(value)
    const label = entry.label.trim()
    if (!label) throw unprocessable('label_required', `"${value}" needs a label.`)
    return { value, label, tagPrefix: normalisePrefix(entry.tagPrefix) }
  })

  /*
   * The screen promises that a value is locked once records store it and that
   * removal is refused while they do. That promise is kept here or not at
   * all: a filtered array in the browser orphans every record silently.
   */
  for (const entry of before) {
    if (seen.has(entry.value)) continue
    const used = await countTaxonomyUse(ctx, code, entry.value)
    if (used) {
      throw unprocessable(
        'entry_in_use',
        `"${entry.label}" cannot be removed — ${used} record${used === 1 ? '' : 's'} still use it.`,
      )
    }
  }

  const saved = await writeSettings<TaxonomyMap>(ctx, {
    appCode: ASSET_APP_CODE,
    section: 'taxonomies',
    value: { ...current.taxonomies, [code]: cleaned },
    version,
    summary: `Updated ${code.replace(/_/g, ' ')} (${cleaned.length} ${cleaned.length === 1 ? 'entry' : 'entries'})`,
  })
  return { taxonomies: saved.value, version: saved.version, updatedAt: saved.updatedAt }
}

async function countTaxonomyUse(ctx: TenantContext, code: string, value: string): Promise<number> {
  const statement = TAXONOMY_USE[code]
  if (!statement) return 0
  const { rows } = await ctx.db.query<{ n: string }>(statement, [ctx.tenantId, value])
  return Number(rows[0].n)
}

/* --------------------------- approval levels ------------------------------ */

export type ApprovalLevelRow = {
  level: number
  approverKind: 'role' | 'user'
  approverRole: string | null
  userIds: string[]
}

export type ApprovalLadder = {
  levels: ApprovalLevelRow[]
  /**
   * How many times the ladder has been replaced. `asset_approval_levels` has
   * no version column and none can be added from here, so the count of
   * replacements in the append-only audit trail stands in: it only ever
   * increases, and it is written in the same transaction as the rows it
   * describes, so the two cannot disagree.
   */
  version: number
}

async function ladderVersion(db: Db, ctx: TenantContext): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `select count(*)::text as n from audit_events
      where tenant_id = $1 and action = 'asset.approval_levels_replaced'`,
    [ctx.tenantId],
  )
  return Number(rows[0].n)
}

async function readLadder(db: Db, ctx: TenantContext): Promise<ApprovalLevelRow[]> {
  const { rows } = await db.query<{
    level: number
    approver_kind: string
    approver_role: string | null
    user_ids: string[] | null
  }>(
    `select l.level, l.approver_kind, l.approver_role,
            coalesce(array_agg(lu.user_id) filter (where lu.user_id is not null), '{}'::uuid[]) as user_ids
       from asset_approval_levels l
       left join asset_approval_level_users lu on lu.level_id = l.id
      where l.tenant_id = $1
      group by l.id, l.level, l.approver_kind, l.approver_role
      order by l.level`,
    [ctx.tenantId],
  )
  return rows.map((row) => ({
    level: row.level,
    approverKind: row.approver_kind === 'user' ? 'user' : 'role',
    approverRole: row.approver_role,
    userIds: row.user_ids ?? [],
  }))
}

export async function readApprovalLadder(ctx: TenantContext): Promise<ApprovalLadder> {
  ctx.require('settings.read')
  return { levels: await readLadder(ctx.db, ctx), version: await ladderVersion(ctx.db, ctx) }
}

export type ApprovalLevelInput = {
  level: number
  approverKind: 'role' | 'user'
  approverRole?: string | null
  userIds?: string[]
}

/**
 * Replaces the ladder an asset request must clear.
 *
 * Wholesale rather than per-level, because the ladder is read as an ordered
 * whole — a half-applied edit would leave requests clearing levels nobody
 * chose. A request already in flight keeps the level it reached; if the new
 * ladder has nothing above that level, its next approval completes it.
 */
export async function replaceApprovalLadder(
  ctx: TenantContext,
  input: { levels: ApprovalLevelInput[]; version: number },
): Promise<ApprovalLadder> {
  ctx.require('settings.manage')

  const levels = [...input.levels].sort((a, b) => a.level - b.level)
  if (levels.length > 10) throw unprocessable('too_many_levels', 'Ten approval levels is the most a request can clear.')
  const seen = new Set<number>()
  for (const level of levels) {
    if (!Number.isInteger(level.level) || level.level < 1) throw unprocessable('bad_level', 'Levels are whole numbers from 1.')
    if (seen.has(level.level)) throw unprocessable('duplicate_level', `Level ${level.level} is listed twice.`)
    seen.add(level.level)
    // A level with nobody named would stop every request at a gate that can
    // never open, which is worse than having no ladder at all.
    if (level.approverKind === 'role' && !level.approverRole?.trim()) {
      throw unprocessable('approver_required', `Level ${level.level} needs an approver.`)
    }
    if (level.approverKind === 'user' && !level.userIds?.length) {
      throw unprocessable('approver_required', `Level ${level.level} needs at least one approver.`)
    }
  }

  return ctx.db.transaction(async (tx) => {
    // Serialises ladder writes for this workspace, so two saves cannot both
    // read the same version and both believe they were first.
    await tx.query('select 1 from tenants where id = $1 for update', [ctx.tenantId])
    const current = await ladderVersion(tx, ctx)
    if (current !== input.version) throw conflict('Someone else changed the approval levels.', current)

    await tx.query('delete from asset_approval_levels where tenant_id = $1', [ctx.tenantId])
    for (const level of levels) {
      const { rows } = await tx.query<{ id: string }>(
        `insert into asset_approval_levels (tenant_id, level, approver_kind, approver_role)
         values ($1, $2, $3, $4) returning id`,
        [ctx.tenantId, level.level, level.approverKind, level.approverRole?.trim() ?? null],
      )
      for (const userId of level.userIds ?? []) {
        const { rows: member } = await tx.query(
          'select 1 from memberships where tenant_id = $1 and user_id = $2 and status = $3',
          [ctx.tenantId, userId, 'active'],
        )
        if (!member[0]) throw notFound('That person')
        await tx.query('insert into asset_approval_level_users (level_id, user_id) values ($1, $2)', [rows[0].id, userId])
      }
    }
    await recordAudit(tx, ctx, {
      action: 'asset.approval_levels_replaced',
      resource: 'asset_approval_levels',
      detail: { levels: levels.length },
    })
    return { levels: await readLadder(tx, ctx), version: current + 1 }
  })
}

/* ------------------------------ warranty ---------------------------------- */

export type WarrantyLine = {
  id: string
  tag: string
  name: string
  assetType: string | null
  status: string
  warrantyExpiresOn: string
  /** Negative once the warranty has run out. Measured against the server's day. */
  daysLeft: number
  holderLabel: string | null
}

/**
 * Warranties that have run out or are about to.
 *
 * `daysLeft` is computed against the request's own date so every row and the
 * count beside it are measured from the same day; a list numbered from the
 * browser's clock disagrees with its own total the moment a viewer's timezone
 * differs. Assets with no warranty date recorded are absent rather than
 * counted as expired — an unknown date is not a passed one.
 */
export async function warrantyReport(
  ctx: TenantContext,
  options: { withinDays?: number; includeExpired?: boolean; limit?: number } = {},
): Promise<{ rows: WarrantyLine[]; total: number; expired: number; expiring: number; withinDays: number }> {
  ctx.require('record.read')
  const withinDays = Math.max(1, Math.min(options.withinDays ?? 60, 3650))
  const includeExpired = options.includeExpired !== false
  const today = ctx.now.toISOString().slice(0, 10)
  const horizon = new Date(ctx.now.getTime() + withinDays * 86_400_000).toISOString().slice(0, 10)

  const { rows: counted } = await ctx.db.query<{ expired: string; expiring: string }>(
    `select
       count(*) filter (where warranty_expires_on < $2)::text as expired,
       count(*) filter (where warranty_expires_on >= $2 and warranty_expires_on < $3)::text as expiring
     from assets
    where tenant_id = $1 and archived_at is null and warranty_expires_on is not null`,
    [ctx.tenantId, today, horizon],
  )

  const { rows } = await ctx.db.query<Raw>(
    `select a.id, a.tag, a.name, a.asset_type, a.status, a.warranty_expires_on,
            (a.warranty_expires_on - $2::date) as days_left,
            coalesce(c.holder_label, hu.full_name) as holder_label
       from assets a
       left join asset_assignments c on c.asset_id = a.id and c.returned_at is null
       left join users hu on hu.id = c.holder_user_id
      where a.tenant_id = $1 and a.archived_at is null and a.warranty_expires_on is not null
        and a.warranty_expires_on < $3::date
        and ($4 or a.warranty_expires_on >= $2::date)
      order by a.warranty_expires_on
      limit $5`,
    [ctx.tenantId, today, horizon, includeExpired, Math.min(options.limit ?? 100, 200)],
  )

  const expired = Number(counted[0].expired)
  const expiring = Number(counted[0].expiring)
  return {
    rows: rows.map((row) => ({
      id: row.id as string,
      tag: row.tag as string,
      name: row.name as string,
      assetType: (row.asset_type as string) ?? null,
      status: row.status as string,
      warrantyExpiresOn: date((row.warranty_expires_on as Date) ?? null) as string,
      daysLeft: Number(row.days_left),
      holderLabel: (row.holder_label as string) ?? null,
    })),
    total: includeExpired ? expired + expiring : expiring,
    expired,
    expiring,
    withinDays,
  }
}

/* --------------------------- leaver holdings ------------------------------ */

export type LeaverHolding = {
  assetId: string
  tag: string
  name: string
  holderName: string
  employeeNo: string
  exitedOn: string | null
  assignedAt: string
  dueBackOn: string | null
}

/**
 * Equipment still out with people who have left.
 *
 * Only custody held by an employee record linked to a platform account can be
 * seen from here, so the counts that say how much of the workforce is visible
 * travel with the answer. Without them a zero reads as "nobody is holding
 * anything" when it may mean "no leaver is linked to an account we can match".
 */
export async function leaverHoldings(ctx: TenantContext): Promise<{
  rows: LeaverHolding[]
  /** Every outstanding holding, counted in SQL — not the length of the page below. */
  total: number
  employees: number
  exited: number
  exitedUnlinked: number
  /**
   * Open custody recorded against a typed name rather than an account.
   *
   * Those rows can never be matched to an employee, so they are invisible to
   * this report however many of them there are. A count of them is the only
   * honest way to say how wide the blind spot is.
   */
  unlinkedCustody: number
}> {
  ctx.require('record.read')

  const { rows: coverage } = await ctx.db.query<{ employees: string; exited: string; unlinked: string }>(
    `select count(*)::text as employees,
            count(*) filter (where status = 'exited')::text as exited,
            count(*) filter (where status = 'exited' and user_id is null)::text as unlinked
       from hr_employees where tenant_id = $1`,
    [ctx.tenantId],
  )

  const OUTSTANDING = `from asset_assignments c
       join assets a on a.id = c.asset_id and a.archived_at is null
       join hr_employees e on e.user_id = c.holder_user_id and e.tenant_id = c.tenant_id
      where c.tenant_id = $1 and c.returned_at is null and e.status = 'exited'`

  const [{ rows: counted }, { rows: labelled }] = await Promise.all([
    ctx.db.query<{ n: string }>(`select count(*)::text as n ${OUTSTANDING}`, [ctx.tenantId]),
    ctx.db.query<{ n: string }>(
      `select count(*)::text as n from asset_assignments c
         join assets a on a.id = c.asset_id and a.archived_at is null
        where c.tenant_id = $1 and c.returned_at is null and c.holder_user_id is null`,
      [ctx.tenantId],
    ),
  ])

  const { rows } = await ctx.db.query<Raw>(
    `select a.id as asset_id, a.tag, a.name, e.full_name, e.employee_no, e.exited_on,
            c.assigned_at, c.due_back_on
       ${OUTSTANDING}
      order by e.exited_on nulls last, a.tag
      limit 200`,
    [ctx.tenantId],
  )

  return {
    rows: rows.map((row) => ({
      assetId: row.asset_id as string,
      tag: row.tag as string,
      name: row.name as string,
      holderName: row.full_name as string,
      employeeNo: row.employee_no as string,
      exitedOn: date((row.exited_on as Date) ?? null),
      assignedAt: new Date(row.assigned_at as string).toISOString(),
      dueBackOn: date((row.due_back_on as Date) ?? null),
    })),
    total: Number(counted[0].n),
    employees: Number(coverage[0].employees),
    exited: Number(coverage[0].exited),
    exitedUnlinked: Number(coverage[0].unlinked),
    unlinkedCustody: Number(labelled[0].n),
  }
}
