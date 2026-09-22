import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { toDecimal, toMinor } from './sales.ts'
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
  warrantyExpiresOn: string | null
  usefulLifeMonths: number | null
  salvageValue: string | null
  holder: { userId: string | null; partyId: string | null; label: string | null; dueBackOn: string | null } | null
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
    warrantyExpiresOn: date((row.warranty_expires_on as Date) ?? null),
    usefulLifeMonths: (row.useful_life_months as number) ?? null,
    salvageValue: (row.salvage_value as string) ?? null,
    holder: row.holder_assigned_at
      ? {
          userId: (row.holder_user_id as string) ?? null,
          partyId: (row.holder_party_id as string) ?? null,
          label: (row.holder_label as string) ?? null,
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

  return ctx.db.transaction(async (tx) => {
    const tag = input.tag?.trim() || (await nextTag(tx, ctx))

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
    on c.asset_id = a.id and c.returned_at is null`

const SELECT_COLUMNS = `a.*, c.holder_user_id, c.holder_party_id, c.holder_label,
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
  assetType: string | null
  assetId: string | null
  quantity: number
  reason: string | null
  neededBy: string | null
  status: string
  currentLevel: number
  version: number
}

const mapRequest = (row: Raw): AssetRequestRow => ({
  id: row.id as string,
  reference: row.reference as string,
  requesterUserId: row.requester_user_id as string,
  assetType: (row.asset_type as string) ?? null,
  assetId: (row.asset_id as string) ?? null,
  quantity: row.quantity as number,
  reason: (row.reason as string) ?? null,
  neededBy: date((row.needed_by as Date) ?? null),
  status: row.status as string,
  currentLevel: row.current_level as number,
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
  const filters = ['tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.status) add('status = $?', options.status)
  if (options.assetType) add('asset_type = $?', options.assetType)
  if (options.mine) add('requester_user_id = $?', ctx.userId)
  else if (options.requesterUserId) add('requester_user_id = $?', options.requesterUserId)
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from asset_requests where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Raw>(
    `select * from asset_requests where ${where} order by created_at desc limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return { total: Number(counted[0].n), rows: rows.map(mapRequest) }
}

/* ------------------------------- reporting -------------------------------- */

export type AssetFacets = {
  byStatus: Record<string, number>
  byType: Record<string, number>
  byLocation: Record<string, number>
  pendingRequests: number
  outOfWarranty: number
  warrantyExpiring: number
}

/**
 * The counts behind the register's filter chips and dashboard tiles.
 *
 * One pass per dimension rather than one query with several `group by`s, so
 * each count is legible and can be checked against the list it labels.
 */
export async function assetFacets(ctx: TenantContext): Promise<AssetFacets> {
  ctx.require('record.read')
  const today = ctx.now.toISOString().slice(0, 10)
  const horizon = new Date(ctx.now.getTime() + 90 * 86_400_000).toISOString().slice(0, 10)

  const [status, type, location, requests, warranty] = await Promise.all([
    ctx.db.query<{ key: string; n: string }>(
      'select status as key, count(*)::text as n from assets where tenant_id = $1 and archived_at is null group by status',
      [ctx.tenantId],
    ),
    ctx.db.query<{ key: string; n: string }>(
      `select coalesce(asset_type, 'unspecified') as key, count(*)::text as n
         from assets where tenant_id = $1 and archived_at is null group by 1`,
      [ctx.tenantId],
    ),
    ctx.db.query<{ key: string; n: string }>(
      `select coalesce(location, 'unassigned') as key, count(*)::text as n
         from assets where tenant_id = $1 and archived_at is null group by 1`,
      [ctx.tenantId],
    ),
    ctx.db.query<{ n: string }>(
      `select count(*)::text as n from asset_requests where tenant_id = $1 and status = 'submitted'`,
      [ctx.tenantId],
    ),
    ctx.db.query<{ expired: string; expiring: string }>(
      `select
         count(*) filter (where warranty_expires_on < $2)::text as expired,
         count(*) filter (where warranty_expires_on >= $2 and warranty_expires_on < $3)::text as expiring
       from assets
      where tenant_id = $1 and archived_at is null and warranty_expires_on is not null`,
      [ctx.tenantId, today, horizon],
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
  }
}

export type StockLine = { key: string; count: number; value: string; currency: string | null }

/**
 * Stock by type, location or status, with the purchase value held in each.
 *
 * Assets with no recorded cost contribute to the count but not the value, and
 * the two are reported separately so a register that is half-priced is not
 * mistaken for one that is half-empty.
 */
export async function stockSummary(ctx: TenantContext, groupBy: 'type' | 'location' | 'status'): Promise<StockLine[]> {
  ctx.require('record.read')
  const query = {
    type: `select coalesce(asset_type, 'unspecified') as key, count(*)::text as n,
                  coalesce(sum(purchase_cost), 0)::text as value, min(currency) as currency
             from assets where tenant_id = $1 and archived_at is null group by 1 order by 1`,
    location: `select coalesce(location, 'unassigned') as key, count(*)::text as n,
                      coalesce(sum(purchase_cost), 0)::text as value, min(currency) as currency
                 from assets where tenant_id = $1 and archived_at is null group by 1 order by 1`,
    status: `select status as key, count(*)::text as n,
                    coalesce(sum(purchase_cost), 0)::text as value, min(currency) as currency
               from assets where tenant_id = $1 and archived_at is null group by 1 order by 1`,
  }[groupBy]

  const { rows } = await ctx.db.query<{ key: string; n: string; value: string; currency: string | null }>(query, [ctx.tenantId])
  return rows.map((row) => ({ key: row.key, count: Number(row.n), value: row.value, currency: row.currency }))
}
