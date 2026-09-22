import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * The tenant's own compliance registers.
 *
 * What this module will and will not do is the whole design. It stores what a
 * tenant writes about their own processing: which fields hold personal data,
 * where data moves, which assessments exist, which decisions are automated,
 * and what they intend to keep for how long.
 *
 * It does not enforce any of it, and every function that could be mistaken for
 * enforcement says so. `listRetentionPolicies` returns `enforced: false` on
 * every row, because no purge job exists — and a register that implies
 * deletion is happening is worse than no register at all, since somebody may
 * rely on it in an audit.
 *
 * It also makes no legal assertion. `crossBorder` is free text the tenant
 * writes; there is no enum of transfer mechanisms, because choosing between
 * them is their counsel's job and not this product's.
 */

type Raw = Record<string, unknown>

export type InventoryField = {
  id: string
  entity: string
  field: string
  category: string
  sensitive: boolean
  legalBasis: string
  retention: string | null
  notes: string | null
}

const mapField = (row: Raw): InventoryField => ({
  id: row.id as string,
  entity: row.entity as string,
  field: row.field as string,
  category: row.category as string,
  sensitive: row.sensitive as boolean,
  legalBasis: row.legal_basis as string,
  retention: (row.retention as string) ?? null,
  notes: (row.notes as string) ?? null,
})

export async function listInventory(ctx: TenantContext): Promise<InventoryField[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>(
    'select * from compliance_inventory_fields where tenant_id = $1 order by lower(entity), lower(field)',
    [ctx.tenantId],
  )
  return rows.map(mapField)
}

export async function addInventoryField(
  ctx: TenantContext,
  input: {
    entity: string
    field: string
    category: string
    sensitive?: boolean
    legalBasis: string
    retention?: string | null
    notes?: string | null
  },
): Promise<InventoryField> {
  ctx.require('settings.manage')

  const { rows: clash } = await ctx.db.query(
    'select 1 from compliance_inventory_fields where tenant_id = $1 and lower(entity) = lower($2) and lower(field) = lower($3)',
    [ctx.tenantId, input.entity, input.field],
  )
  // A register that counts the same personal data twice is worse than one that
  // misses it: the duplicate looks like a second processing purpose.
  if (clash[0]) throw unprocessable('duplicate_field', `${input.entity}.${input.field} is already catalogued.`)

  const { rows } = await ctx.db.query<Raw>(
    `insert into compliance_inventory_fields
       (tenant_id, entity, field, category, sensitive, legal_basis, retention, notes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [
      ctx.tenantId,
      input.entity,
      input.field,
      input.category,
      input.sensitive ?? false,
      input.legalBasis,
      input.retention ?? null,
      input.notes ?? null,
      ctx.userId,
    ],
  )
  await recordAudit(ctx.db, ctx, {
    action: 'compliance.inventory_field_added',
    resource: 'compliance_inventory_field',
    resourceId: rows[0].id as string,
    detail: { entity: input.entity, field: input.field, sensitive: input.sensitive ?? false },
  })
  return mapField(rows[0])
}

export async function removeInventoryField(ctx: TenantContext, fieldId: string): Promise<void> {
  ctx.require('settings.manage')
  const { rowCount } = await ctx.db.query('delete from compliance_inventory_fields where id = $1 and tenant_id = $2', [
    fieldId,
    ctx.tenantId,
  ])
  if (!rowCount) throw notFound('That field')
  await recordAudit(ctx.db, ctx, {
    action: 'compliance.inventory_field_removed',
    resource: 'compliance_inventory_field',
    resourceId: fieldId,
  })
}

export type DataFlow = {
  id: string
  name: string
  direction: string
  source: string
  destination: string
  crossBorder: string | null
}

const mapFlow = (row: Raw): DataFlow => ({
  id: row.id as string,
  name: row.name as string,
  direction: row.direction as string,
  source: row.source as string,
  destination: row.destination as string,
  crossBorder: (row.cross_border as string) ?? null,
})

export async function listFlows(ctx: TenantContext): Promise<DataFlow[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>(
    'select * from compliance_data_flows where tenant_id = $1 order by lower(name)',
    [ctx.tenantId],
  )
  return rows.map(mapFlow)
}

export async function addFlow(
  ctx: TenantContext,
  input: { name: string; direction: 'ingress' | 'egress' | 'internal'; source: string; destination: string; crossBorder?: string | null },
): Promise<DataFlow> {
  ctx.require('settings.manage')
  const { rows: clash } = await ctx.db.query(
    'select 1 from compliance_data_flows where tenant_id = $1 and lower(name) = lower($2)',
    [ctx.tenantId, input.name],
  )
  if (clash[0]) throw unprocessable('duplicate_flow', `A flow called ${input.name} is already recorded.`)

  const { rows } = await ctx.db.query<Raw>(
    `insert into compliance_data_flows (tenant_id, name, direction, source, destination, cross_border, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [ctx.tenantId, input.name, input.direction, input.source, input.destination, input.crossBorder ?? null, ctx.userId],
  )
  await recordAudit(ctx.db, ctx, {
    action: 'compliance.flow_added',
    resource: 'compliance_data_flow',
    resourceId: rows[0].id as string,
    detail: { name: input.name, direction: input.direction },
  })
  return mapFlow(rows[0])
}

export async function removeFlow(ctx: TenantContext, flowId: string): Promise<void> {
  ctx.require('settings.manage')
  const { rowCount } = await ctx.db.query('delete from compliance_data_flows where id = $1 and tenant_id = $2', [
    flowId,
    ctx.tenantId,
  ])
  if (!rowCount) throw notFound('That flow')
}

export type Dpia = {
  id: string
  title: string
  processing: string
  riskLevel: string
  status: string
  mitigations: string | null
  reviewedOn: string | null
  nextReviewOn: string | null
  version: number
}

const day = (value: unknown): string | null =>
  value === null || value === undefined ? null : new Date(value as string).toISOString().slice(0, 10)

const mapDpia = (row: Raw): Dpia => ({
  id: row.id as string,
  title: row.title as string,
  processing: row.processing as string,
  riskLevel: row.risk_level as string,
  status: row.status as string,
  mitigations: (row.mitigations as string) ?? null,
  reviewedOn: day(row.reviewed_on),
  nextReviewOn: day(row.next_review_on),
  version: row.version as number,
})

export async function listDpias(ctx: TenantContext): Promise<Dpia[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>('select * from compliance_dpias where tenant_id = $1 order by created_at desc', [
    ctx.tenantId,
  ])
  return rows.map(mapDpia)
}

export async function addDpia(
  ctx: TenantContext,
  input: { title: string; processing: string; riskLevel?: 'low' | 'medium' | 'high'; mitigations?: string | null; nextReviewOn?: string | null },
): Promise<Dpia> {
  ctx.require('settings.manage')
  const { rows } = await ctx.db.query<Raw>(
    `insert into compliance_dpias (tenant_id, title, processing, risk_level, mitigations, next_review_on, owner_user_id)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [
      ctx.tenantId,
      input.title,
      input.processing,
      input.riskLevel ?? 'low',
      input.mitigations ?? null,
      input.nextReviewOn ?? null,
      ctx.userId,
    ],
  )
  await recordAudit(ctx.db, ctx, {
    action: 'compliance.dpia_added',
    resource: 'compliance_dpia',
    resourceId: rows[0].id as string,
    detail: { title: input.title, riskLevel: input.riskLevel ?? 'low' },
  })
  return mapDpia(rows[0])
}

export async function updateDpia(
  ctx: TenantContext,
  dpiaId: string,
  input: { version: number; status?: string; riskLevel?: string; mitigations?: string | null; reviewedOn?: string | null; nextReviewOn?: string | null },
): Promise<Dpia> {
  ctx.require('settings.manage')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number }>(
      'select version from compliance_dpias where id = $1 and tenant_id = $2 for update',
      [dpiaId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That assessment')
    if (rows[0].version !== input.version) throw conflict('Someone else changed this assessment.', rows[0].version)

    await tx.query(
      `update compliance_dpias
          set status = coalesce($3, status), risk_level = coalesce($4, risk_level),
              mitigations = coalesce($5, mitigations), reviewed_on = coalesce($6, reviewed_on),
              next_review_on = coalesce($7, next_review_on), version = version + 1, updated_at = $8
        where id = $1 and tenant_id = $2`,
      [
        dpiaId,
        ctx.tenantId,
        input.status ?? null,
        input.riskLevel ?? null,
        input.mitigations ?? null,
        input.reviewedOn ?? null,
        input.nextReviewOn ?? null,
        ctx.now,
      ],
    )
    const { rows: after } = await tx.query<Raw>('select * from compliance_dpias where id = $1', [dpiaId])
    return mapDpia(after[0])
  })
}

export type AutomatedDecision = {
  id: string
  name: string
  description: string | null
  profiling: boolean
  humanReview: boolean
  logicSummary: string | null
}

const mapDecision = (row: Raw): AutomatedDecision => ({
  id: row.id as string,
  name: row.name as string,
  description: (row.description as string) ?? null,
  profiling: row.profiling as boolean,
  humanReview: row.human_review as boolean,
  logicSummary: (row.logic_summary as string) ?? null,
})

export async function listAutomatedDecisions(ctx: TenantContext): Promise<AutomatedDecision[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>(
    'select * from compliance_automated_decisions where tenant_id = $1 order by lower(name)',
    [ctx.tenantId],
  )
  return rows.map(mapDecision)
}

export async function addAutomatedDecision(
  ctx: TenantContext,
  input: { name: string; description?: string | null; profiling?: boolean; humanReview?: boolean; logicSummary?: string | null },
): Promise<AutomatedDecision> {
  ctx.require('settings.manage')
  const { rows: clash } = await ctx.db.query(
    'select 1 from compliance_automated_decisions where tenant_id = $1 and lower(name) = lower($2)',
    [ctx.tenantId, input.name],
  )
  if (clash[0]) throw unprocessable('duplicate_decision', `${input.name} is already recorded.`)

  const { rows } = await ctx.db.query<Raw>(
    `insert into compliance_automated_decisions (tenant_id, name, description, profiling, human_review, logic_summary)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [
      ctx.tenantId,
      input.name,
      input.description ?? null,
      input.profiling ?? false,
      input.humanReview ?? false,
      input.logicSummary ?? null,
    ],
  )
  return mapDecision(rows[0])
}

export async function removeAutomatedDecision(ctx: TenantContext, decisionId: string): Promise<void> {
  ctx.require('settings.manage')
  const { rowCount } = await ctx.db.query('delete from compliance_automated_decisions where id = $1 and tenant_id = $2', [
    decisionId,
    ctx.tenantId,
  ])
  if (!rowCount) throw notFound('That decision')
}

export type RetentionPolicy = {
  id: string
  subject: string
  keepForDays: number
  enabled: boolean
  note: string | null
  /** Always false. Nothing on this deployment deletes anything on a schedule. */
  enforced: false
}

export async function listRetentionPolicies(ctx: TenantContext): Promise<RetentionPolicy[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>(
    'select * from compliance_retention_policies where tenant_id = $1 order by lower(subject)',
    [ctx.tenantId],
  )
  return rows.map((row) => ({
    id: row.id as string,
    subject: row.subject as string,
    keepForDays: row.keep_for_days as number,
    enabled: row.enabled as boolean,
    note: (row.note as string) ?? null,
    /*
     * Returned on every row, always false, deliberately. The client renders
     * it, so a policy cannot appear to be running. When a purge job exists
     * this becomes a real value and every caller already handles it.
     */
    enforced: false as const,
  }))
}

export async function addRetentionPolicy(
  ctx: TenantContext,
  input: { subject: string; keepForDays: number; note?: string | null },
): Promise<RetentionPolicy> {
  ctx.require('settings.manage')
  if (input.keepForDays <= 0) throw unprocessable('bad_period', 'A retention period must be at least one day.')

  const { rows: clash } = await ctx.db.query(
    'select 1 from compliance_retention_policies where tenant_id = $1 and lower(subject) = lower($2)',
    [ctx.tenantId, input.subject],
  )
  // Two periods for one subject is a contradiction, not a refinement.
  if (clash[0]) throw unprocessable('duplicate_subject', `A policy for ${input.subject} already exists.`)

  const { rows } = await ctx.db.query<Raw>(
    'insert into compliance_retention_policies (tenant_id, subject, keep_for_days, note) values ($1,$2,$3,$4) returning *',
    [ctx.tenantId, input.subject, input.keepForDays, input.note ?? null],
  )
  await recordAudit(ctx.db, ctx, {
    action: 'compliance.retention_recorded',
    resource: 'compliance_retention_policy',
    resourceId: rows[0].id as string,
    detail: { subject: input.subject, keepForDays: input.keepForDays, enforced: false },
  })
  return {
    id: rows[0].id as string,
    subject: rows[0].subject as string,
    keepForDays: rows[0].keep_for_days as number,
    enabled: rows[0].enabled as boolean,
    note: (rows[0].note as string) ?? null,
    enforced: false as const,
  }
}

export async function removeRetentionPolicy(ctx: TenantContext, policyId: string): Promise<void> {
  ctx.require('settings.manage')
  const { rowCount } = await ctx.db.query('delete from compliance_retention_policies where id = $1 and tenant_id = $2', [
    policyId,
    ctx.tenantId,
  ])
  if (!rowCount) throw notFound('That policy')
}
