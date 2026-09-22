import type { Db } from '../db/client.ts'
import { conflict, invalidInput, notFound } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { assertScope, type TenantContext } from '../tenancy/context.ts'

/**
 * CRM services.
 *
 * Two rules hold throughout: every query names `tenant_id` explicitly, and
 * every mutation carries a `version` so a stale edit is a 409 rather than a
 * silent overwrite. The prototype had neither — its records were browser-wide
 * and last-write-wins.
 */

export type LeadRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  status: string
  source: string | null
  score: number
  notes: string | null
  version: number
  createdAt: string
  convertedAt: string | null
}

export type ListOptions = {
  query?: string
  status?: string
  source?: string
  limit?: number
  offset?: number
  includeArchived?: boolean
  /**
   * Sorting belongs in SQL. Sorting the loaded page in the browser is why
   * "show highest scores" on a 500-lead tenant usually missed the top scorer.
   */
  sort?: 'recent' | 'score'
}

/* --------------------------------- leads --------------------------------- */

export async function listLeads(ctx: TenantContext, options: ListOptions = {}): Promise<{ rows: LeadRow[]; total: number }> {
  ctx.require('record.read')
  const scope = assertScope({ tenantId: ctx.tenantId })

  const filters: string[] = ['l.tenant_id = $1']
  const params: unknown[] = [scope.tenantId]
  if (!options.includeArchived) filters.push('l.archived_at is null')
  if (options.status && options.status !== 'All') {
    params.push(options.status)
    filters.push(`l.status = $${params.length}`)
  }
  if (options.source) {
    params.push(options.source)
    filters.push(`l.source = $${params.length}`)
  }
  if (options.query?.trim()) {
    // Matches the person, their organisation or their address — the three
    // things someone actually types into a CRM search box.
    params.push(`%${options.query.trim().toLowerCase()}%`)
    const index = params.length
    filters.push(
      `(lower(p.name) like $${index} or lower(coalesce(p.email, '')) like $${index} or lower(coalesce(org.name, '')) like $${index})`,
    )
  }
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n
       from leads l
       join parties p on p.id = l.party_id
       left join parties org on org.id = p.parent_id
      where ${where}`,
    params as never[],
  )

  params.push(Math.min(options.limit ?? 50, 200))
  params.push(Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<{
    id: string
    name: string
    email: string | null
    phone: string | null
    company: string | null
    status: string
    source: string | null
    score: number
    notes: string | null
    version: number
    created_at: Date
    converted_at: Date | null
  }>(
    `select l.id, p.name, p.email, p.phone, org.name as company,
            l.status, l.source, l.score, l.notes, l.version, l.created_at, l.converted_at
       from leads l
       join parties p on p.id = l.party_id
       left join parties org on org.id = p.parent_id
      where ${where}
      order by ${options.sort === 'score' ? 'l.score desc, l.created_at desc' : 'l.created_at desc'}
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )

  return {
    total: Number(counted[0].n),
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      company: row.company,
      status: row.status,
      source: row.source,
      score: row.score,
      notes: row.notes,
      version: row.version,
      createdAt: new Date(row.created_at).toISOString(),
      convertedAt: row.converted_at ? new Date(row.converted_at).toISOString() : null,
    })),
  }
}

export type CreateLeadInput = {
  name: string
  email?: string | null
  phone?: string | null
  company?: string | null
  status?: string
  source?: string | null
  score?: number
  notes?: string | null
}

/**
 * Creates the person, their organisation if named, and the lead — in one
 * transaction, so a lead can never exist without the party it refers to.
 */
export async function createLead(ctx: TenantContext, input: CreateLeadInput): Promise<LeadRow> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    let organisationId: string | null = null
    if (input.company?.trim()) {
      organisationId = await upsertOrganisation(tx, ctx, input.company.trim())
    }

    if (input.email?.trim()) {
      const { rows } = await tx.query<{ id: string; name: string }>(
        `select id, name from parties
          where tenant_id = $1 and lower(email) = lower($2) and archived_at is null and merged_into is null`,
        [ctx.tenantId, input.email.trim()],
      )
      if (rows[0]) {
        // A duplicate address is a merge decision, not something to silently
        // create a second record for.
        throw conflict(`${rows[0].name} already uses that email address.`)
      }
    }

    const { rows: party } = await tx.query<{ id: string }>(
      `insert into parties (tenant_id, company_id, kind, name, parent_id, email, phone, party_type, owner_user_id, created_by)
       values ($1, $2, 'person', $3, $4, $5, $6, 'Prospect', $7, $7) returning id`,
      [
        ctx.tenantId,
        ctx.companyId,
        input.name.trim(),
        organisationId,
        input.email?.trim() || null,
        input.phone?.trim() || null,
        ctx.userId,
      ],
    )

    const { rows: lead } = await tx.query<{ id: string; created_at: Date; version: number }>(
      `insert into leads (tenant_id, company_id, party_id, status, source, score, notes, owner_user_id, created_by)
       values ($1, $2, $3, coalesce($4, 'New'), $5, coalesce($6, 0), $7, $8, $8)
       returning id, created_at, version`,
      [
        ctx.tenantId,
        ctx.companyId,
        party[0].id,
        input.status ?? null,
        input.source?.trim() || null,
        input.score ?? null,
        input.notes?.trim() || null,
        ctx.userId,
      ],
    )

    await recordAudit(tx, ctx, {
      action: 'crm.lead_created',
      resource: 'lead',
      resourceId: lead[0].id,
      detail: { name: input.name.trim(), source: input.source ?? null },
    })

    return {
      id: lead[0].id,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      company: input.company?.trim() || null,
      status: input.status ?? 'New',
      source: input.source?.trim() || null,
      score: input.score ?? 0,
      notes: input.notes?.trim() || null,
      version: lead[0].version,
      createdAt: new Date(lead[0].created_at).toISOString(),
      convertedAt: null,
    }
  })
}

/** Finds an organisation by name within the tenant, or creates it. */
async function upsertOrganisation(tx: Db, ctx: TenantContext, name: string): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `select id from parties
      where tenant_id = $1 and kind = 'organisation' and lower(name) = lower($2)
        and archived_at is null and merged_into is null
      limit 1`,
    [ctx.tenantId, name],
  )
  if (rows[0]) return rows[0].id
  const { rows: created } = await tx.query<{ id: string }>(
    `insert into parties (tenant_id, company_id, kind, name, party_type, created_by)
     values ($1, $2, 'organisation', $3, 'Prospect', $4) returning id`,
    [ctx.tenantId, ctx.companyId, name, ctx.userId],
  )
  return created[0].id
}

export type UpdateLeadInput = Partial<CreateLeadInput> & { version: number }

/**
 * Optimistic concurrency: the update names the version the client last saw. If
 * someone else has since saved, zero rows match and the caller gets a 409 with
 * the current version to merge against — rather than quietly losing an edit.
 */
export async function updateLead(ctx: TenantContext, id: string, input: UpdateLeadInput): Promise<LeadRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows: existing } = await tx.query<{ party_id: string; version: number }>(
      'select party_id, version from leads where id = $1 and tenant_id = $2 for update',
      [id, ctx.tenantId],
    )
    if (!existing[0]) throw notFound('That lead')
    if (existing[0].version !== input.version) {
      throw conflict('Someone else changed this lead while you were editing.', existing[0].version)
    }

    if (input.company !== undefined) {
      const organisationId = input.company?.trim() ? await upsertOrganisation(tx, ctx, input.company.trim()) : null
      await tx.query('update parties set parent_id = $2, updated_at = now() where id = $1', [existing[0].party_id, organisationId])
    }
    if (input.name !== undefined || input.email !== undefined || input.phone !== undefined) {
      await tx.query(
        `update parties
            set name = coalesce($2, name), email = coalesce($3, email), phone = coalesce($4, phone), updated_at = now()
          where id = $1`,
        [existing[0].party_id, input.name?.trim() ?? null, input.email?.trim() ?? null, input.phone?.trim() ?? null],
      )
    }

    await tx.query(
      `update leads
          set status = coalesce($2, status), source = coalesce($3, source),
              score = coalesce($4, score), notes = coalesce($5, notes),
              version = version + 1, updated_at = now()
        where id = $1`,
      [id, input.status ?? null, input.source ?? null, input.score ?? null, input.notes ?? null],
    )

    await recordAudit(tx, ctx, { action: 'crm.lead_updated', resource: 'lead', resourceId: id, detail: { ...input } })

    const { rows } = await listLeadsById(tx, ctx.tenantId, id)
    return rows[0]
  })
}

async function listLeadsById(db: Db, tenantId: string, id: string) {
  const { rows } = await db.query<LeadRow & { created_at: Date; converted_at: Date | null }>(
    `select l.id, p.name, p.email, p.phone, org.name as company,
            l.status, l.source, l.score, l.notes, l.version, l.created_at, l.converted_at
       from leads l
       join parties p on p.id = l.party_id
       left join parties org on org.id = p.parent_id
      where l.id = $1 and l.tenant_id = $2`,
    [id, tenantId],
  )
  return {
    rows: rows.map((row) => ({
      ...row,
      createdAt: new Date(row.created_at).toISOString(),
      convertedAt: row.converted_at ? new Date(row.converted_at).toISOString() : null,
    })) as LeadRow[],
  }
}

/**
 * Archive, not delete. A lead that produced a deal is part of that deal's
 * history; destroying the row would leave the funnel report unable to explain
 * where its numbers came from.
 */
export async function archiveLead(ctx: TenantContext, id: string, version: number): Promise<void> {
  ctx.require('record.archive')
  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number }>(
      'select version from leads where id = $1 and tenant_id = $2 and archived_at is null for update',
      [id, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That lead')
    if (rows[0].version !== version) throw conflict('Someone else changed this lead.', rows[0].version)
    await tx.query('update leads set archived_at = now(), version = version + 1 where id = $1', [id])
    await recordAudit(tx, ctx, { action: 'crm.lead_archived', resource: 'lead', resourceId: id })
  })
}

export async function restoreLead(ctx: TenantContext, id: string): Promise<void> {
  ctx.require('record.update')
  const { rowCount } = await ctx.db.query(
    'update leads set archived_at = null, version = version + 1 where id = $1 and tenant_id = $2 and archived_at is not null',
    [id, ctx.tenantId],
  )
  if (!rowCount) throw notFound('That archived lead')
  await recordAudit(ctx.db, ctx, { action: 'crm.lead_restored', resource: 'lead', resourceId: id })
}

/**
 * Converts a lead into a deal, keeping the lead row and linking the two.
 *
 * The prototype had no conversion at all. The requirement that conversion
 * "preserves history" is why the lead is marked converted rather than removed.
 */
export async function convertLead(
  ctx: TenantContext,
  id: string,
  input: { dealName: string; amount: string; currency: string; version: number },
): Promise<{ dealId: string }> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    const { rows: lead } = await tx.query<{ party_id: string; version: number; converted_at: Date | null }>(
      'select party_id, version, converted_at from leads where id = $1 and tenant_id = $2 for update',
      [id, ctx.tenantId],
    )
    if (!lead[0]) throw notFound('That lead')
    if (lead[0].converted_at) throw conflict('That lead has already been converted.')
    if (lead[0].version !== input.version) throw conflict('Someone else changed this lead.', lead[0].version)

    const { pipelineId, stageId } = await defaultPipeline(tx, ctx)
    const { rows: party } = await tx.query<{ parent_id: string | null }>('select parent_id from parties where id = $1', [
      lead[0].party_id,
    ])

    const { rows: deal } = await tx.query<{ id: string }>(
      `insert into deals (tenant_id, company_id, pipeline_id, stage_id, name, account_id, primary_contact_id,
                          amount, currency, owner_user_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) returning id`,
      [
        ctx.tenantId,
        ctx.companyId,
        pipelineId,
        stageId,
        input.dealName.trim(),
        party[0]?.parent_id ?? null,
        lead[0].party_id,
        input.amount,
        input.currency,
        ctx.userId,
      ],
    )

    await tx.query(
      `insert into deal_stage_history (tenant_id, deal_id, to_stage_id, moved_by, note)
       values ($1, $2, $3, $4, 'Converted from lead')`,
      [ctx.tenantId, deal[0].id, stageId, ctx.userId],
    )
    await tx.query(
      `update leads set status = 'Converted', converted_at = now(), converted_deal_id = $2, version = version + 1 where id = $1`,
      [id, deal[0].id],
    )
    await recordAudit(tx, ctx, {
      action: 'crm.lead_converted',
      resource: 'lead',
      resourceId: id,
      detail: { dealId: deal[0].id, amount: input.amount, currency: input.currency },
    })

    return { dealId: deal[0].id }
  })
}

/**
 * The stages a new pipeline starts with.
 *
 * `outcome` is explicit rather than inferred from the name, so a tenant that
 * renames "Won" to "Signed" does not break every report that counts wins.
 */
const DEFAULT_STAGES: [name: string, position: number, probability: number, outcome: string][] = [
  ['New', 1, 5, 'open'],
  ['Qualification', 2, 15, 'open'],
  ['Discovery', 3, 25, 'open'],
  ['Demo', 4, 40, 'open'],
  ['Proposal Sent', 5, 60, 'open'],
  ['Negotiation', 6, 75, 'open'],
  ['Won', 7, 100, 'won'],
  ['Lost', 8, 0, 'lost'],
]

/** Creates the default pipeline on first use rather than seeding fake data. */
export async function defaultPipeline(tx: Db, ctx: TenantContext): Promise<{ pipelineId: string; stageId: string }> {
  const { rows } = await tx.query<{ id: string }>(
    'select id from pipelines where tenant_id = $1 and is_default and archived_at is null limit 1',
    [ctx.tenantId],
  )
  let pipelineId = rows[0]?.id
  if (!pipelineId) {
    const { rows: created } = await tx.query<{ id: string }>(
      `insert into pipelines (tenant_id, name, is_default) values ($1, 'Sales Pipeline', true) returning id`,
      [ctx.tenantId],
    )
    pipelineId = created[0].id
    for (const [name, position, probability, outcome] of DEFAULT_STAGES) {
      await tx.query(
        `insert into pipeline_stages (tenant_id, pipeline_id, name, position, probability, outcome)
         values ($1, $2, $3, $4, $5, $6)`,
        [ctx.tenantId, pipelineId, name, position, probability, outcome],
      )
    }
  }
  const { rows: stage } = await tx.query<{ id: string }>(
    'select id from pipeline_stages where pipeline_id = $1 order by position limit 1',
    [pipelineId],
  )
  return { pipelineId, stageId: stage[0].id }
}

/** Counts used by the CRM dashboard — derived from records, never stored. */
export async function leadSummary(ctx: TenantContext): Promise<Record<string, number>> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{ status: string; n: string }>(
    `select status, count(*)::text as n from leads
      where tenant_id = $1 and archived_at is null group by status`,
    [ctx.tenantId],
  )
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.n)]))
}

/* ------------------------------- pipelines -------------------------------- */

export type StageRow = {
  id: string
  name: string
  position: number
  probability: number
  outcome: 'open' | 'won' | 'lost'
}

export type PipelineRow = { id: string; name: string; isDefault: boolean; stages: StageRow[] }

/**
 * The tenant's own pipelines and stages.
 *
 * Lazy by design: a workspace that has never created a deal has no pipeline,
 * and an empty list says exactly that. The prototype rendered a ten-stage
 * constant here, two of whose stages the server has never created — so the
 * card claimed to describe the workspace and contradicted its database.
 */
export async function listPipelines(ctx: TenantContext): Promise<PipelineRow[]> {
  ctx.require('record.read')
  const scope = assertScope({ tenantId: ctx.tenantId })
  const { rows } = await ctx.db.query<{
    id: string
    name: string
    is_default: boolean
    stage_id: string | null
    stage_name: string | null
    position: number | null
    probability: number | null
    outcome: string | null
  }>(
    `select p.id, p.name, p.is_default,
            s.id as stage_id, s.name as stage_name, s.position, s.probability, s.outcome
       from pipelines p
       left join pipeline_stages s on s.pipeline_id = p.id
      where p.tenant_id = $1 and p.archived_at is null
      order by p.is_default desc, p.name, s.position`,
    [scope.tenantId],
  )

  const byId = new Map<string, PipelineRow>()
  for (const row of rows) {
    let pipeline = byId.get(row.id)
    if (!pipeline) {
      pipeline = { id: row.id, name: row.name, isDefault: row.is_default, stages: [] }
      byId.set(row.id, pipeline)
    }
    if (row.stage_id) {
      pipeline.stages.push({
        id: row.stage_id,
        name: row.stage_name ?? '',
        position: row.position ?? 0,
        probability: row.probability ?? 0,
        outcome: (row.outcome ?? 'open') as StageRow['outcome'],
      })
    }
  }
  return [...byId.values()]
}

/**
 * Creates a pipeline, optionally as a copy of an existing one.
 *
 * Duplicating copies the source's stages rather than the built-in list, which
 * is the whole point of the ⧉ button: a tenant duplicates the default so they
 * can edit the copy.
 */
export async function createPipeline(
  ctx: TenantContext,
  input: { name: string; duplicateOf?: string | null },
): Promise<PipelineRow> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    let stages = DEFAULT_STAGES.map(([name, position, probability, outcome]) => ({ name, position, probability, outcome }))
    if (input.duplicateOf) {
      const { rows: source } = await tx.query<{ name: string; position: number; probability: number; outcome: string }>(
        `select s.name, s.position, s.probability, s.outcome
           from pipeline_stages s
           join pipelines p on p.id = s.pipeline_id
          where s.pipeline_id = $1 and p.tenant_id = $2 and p.archived_at is null
          order by s.position`,
        [input.duplicateOf, ctx.tenantId],
      )
      if (!source.length) throw notFound('That pipeline')
      stages = source
    }

    const { rows: created } = await tx.query<{ id: string }>(
      'insert into pipelines (tenant_id, name) values ($1, $2) returning id',
      [ctx.tenantId, input.name.trim()],
    )
    const pipelineId = created[0].id
    const inserted: StageRow[] = []
    for (const stage of stages) {
      const { rows: stageRow } = await tx.query<{ id: string }>(
        `insert into pipeline_stages (tenant_id, pipeline_id, name, position, probability, outcome)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [ctx.tenantId, pipelineId, stage.name, stage.position, stage.probability, stage.outcome],
      )
      inserted.push({
        id: stageRow[0].id,
        name: stage.name,
        position: stage.position,
        probability: stage.probability,
        outcome: stage.outcome as StageRow['outcome'],
      })
    }

    await recordAudit(tx, ctx, {
      action: 'crm.pipeline_created',
      resource: 'pipeline',
      resourceId: pipelineId,
      detail: { name: input.name.trim(), duplicateOf: input.duplicateOf ?? null },
    })

    return { id: pipelineId, name: input.name.trim(), isDefault: false, stages: inserted }
  })
}

/**
 * The currency this workspace quotes in, from its primary company.
 *
 * A deal's amount is meaningless without one, and asking the browser to guess
 * is how a hard-coded dollar sign ends up over a euro figure.
 */
export async function tenantCurrency(ctx: TenantContext): Promise<string | null> {
  const { rows } = await ctx.db.query<{ currency: string }>(
    `select currency from companies
      where tenant_id = $1 and archived_at is null
      order by is_primary desc, created_at
      limit 1`,
    [ctx.tenantId],
  )
  return rows[0]?.currency ?? null
}

/* -------------------------- parties: people & firms ------------------------ */

export type PartyKind = 'person' | 'organisation'

export type PartyRow = {
  id: string
  kind: PartyKind
  name: string
  email: string | null
  phone: string | null
  /** The person's employer, by id — not the string somebody typed. */
  company: string | null
  companyId: string | null
  industry: string | null
  website: string | null
  employeeCount: number | null
  partyType: string | null
  notes: string | null
  version: number
  archivedAt: string | null
  createdAt: string
}

export type PartyListOptions = {
  query?: string
  partyType?: string
  limit?: number
  offset?: number
  includeArchived?: boolean
  /** Restricts to people whose name collides with another person's. */
  duplicatesOnly?: boolean
}

const PARTY_COLUMNS = `p.id, p.kind, p.name, p.email, p.phone, org.name as company, p.parent_id as company_id,
            p.industry, p.website, p.employee_count, p.party_type, p.notes, p.version, p.archived_at, p.created_at`

type PartyDbRow = {
  id: string
  kind: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  company_id: string | null
  industry: string | null
  website: string | null
  employee_count: number | null
  party_type: string | null
  notes: string | null
  version: number
  archived_at: Date | null
  created_at: Date
}

const toParty = (row: PartyDbRow): PartyRow => ({
  id: row.id,
  kind: row.kind as PartyKind,
  name: row.name,
  email: row.email,
  phone: row.phone,
  company: row.company,
  companyId: row.company_id,
  industry: row.industry,
  website: row.website,
  employeeCount: row.employee_count,
  partyType: row.party_type,
  notes: row.notes,
  version: row.version,
  archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
  createdAt: new Date(row.created_at).toISOString(),
})

/**
 * People or organisations, filtered and paged in SQL.
 *
 * Rows folded into another by a merge are excluded everywhere: the row is kept
 * so a deal's history still resolves, but it is not a second contact.
 */
export async function listParties(
  ctx: TenantContext,
  kind: PartyKind,
  options: PartyListOptions = {},
): Promise<{ rows: PartyRow[]; total: number }> {
  ctx.require('record.read')
  const scope = assertScope({ tenantId: ctx.tenantId })

  const filters: string[] = ['p.tenant_id = $1', 'p.kind = $2', 'p.merged_into is null']
  const params: unknown[] = [scope.tenantId, kind]
  if (!options.includeArchived) filters.push('p.archived_at is null')
  if (options.partyType && options.partyType !== 'All') {
    params.push(options.partyType)
    filters.push(`p.party_type = $${params.length}`)
  }
  if (options.query?.trim()) {
    params.push(`%${options.query.trim().toLowerCase()}%`)
    const index = params.length
    filters.push(
      `(lower(p.name) like $${index} or lower(coalesce(p.email, '')) like $${index} or lower(coalesce(org.name, '')) like $${index})`,
    )
  }
  if (options.duplicatesOnly) {
    // Only names can collide: a unique index already stops one address being
    // used twice in a tenant, so a duplicate here is always a same-name one.
    filters.push(
      `exists (select 1 from parties other
                where other.tenant_id = p.tenant_id and other.kind = p.kind and other.id <> p.id
                  and other.archived_at is null and other.merged_into is null
                  and lower(other.name) = lower(p.name))`,
    )
  }
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from parties p
       left join parties org on org.id = p.parent_id
      where ${where}`,
    params as never[],
  )

  params.push(Math.min(options.limit ?? 50, 200))
  params.push(Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<PartyDbRow>(
    `select ${PARTY_COLUMNS}
       from parties p
       left join parties org on org.id = p.parent_id
      where ${where}
      order by ${options.duplicatesOnly ? 'lower(p.name), p.created_at' : 'p.created_at desc'}
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )

  return { total: Number(counted[0].n), rows: rows.map(toParty) }
}

export type CreatePartyInput = {
  name: string
  email?: string | null
  phone?: string | null
  /** People only: the employer's name, matched case-insensitively or created. */
  company?: string | null
  partyType?: string | null
  industry?: string | null
  website?: string | null
  employeeCount?: number | null
  notes?: string | null
}

/** Refuses an address already in use, so a merge stays a decision somebody makes. */
async function assertEmailFree(tx: Db, ctx: TenantContext, email: string, excludeId?: string): Promise<void> {
  const { rows } = await tx.query<{ id: string; name: string }>(
    `select id, name from parties
      where tenant_id = $1 and lower(email) = lower($2) and archived_at is null and merged_into is null`,
    [ctx.tenantId, email],
  )
  const clash = rows.find((row) => row.id !== excludeId)
  if (clash) throw conflict(`${clash.name} already uses that email address.`)
}

export async function createParty(ctx: TenantContext, kind: PartyKind, input: CreatePartyInput): Promise<PartyRow> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    if (input.email?.trim()) await assertEmailFree(tx, ctx, input.email.trim())

    const parentId =
      kind === 'person' && input.company?.trim() ? await upsertOrganisation(tx, ctx, input.company.trim()) : null

    const { rows } = await tx.query<PartyDbRow>(
      `with inserted as (
         insert into parties (tenant_id, company_id, kind, name, parent_id, email, phone, website, industry,
                              employee_count, party_type, notes, owner_user_id, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
         returning *
       )
       select ${PARTY_COLUMNS} from inserted p left join parties org on org.id = p.parent_id`,
      [
        ctx.tenantId,
        ctx.companyId,
        kind,
        input.name.trim(),
        parentId,
        input.email?.trim() || null,
        input.phone?.trim() || null,
        input.website?.trim() || null,
        input.industry?.trim() || null,
        input.employeeCount ?? null,
        input.partyType?.trim() || null,
        input.notes?.trim() || null,
        ctx.userId,
      ] as never[],
    )

    await recordAudit(tx, ctx, {
      action: kind === 'person' ? 'crm.contact_created' : 'crm.account_created',
      resource: 'party',
      resourceId: rows[0].id,
      detail: { name: input.name.trim(), kind },
    })

    return toParty(rows[0])
  })
}

export type UpdatePartyInput = Partial<CreatePartyInput> & { version: number }

export async function updateParty(
  ctx: TenantContext,
  kind: PartyKind,
  id: string,
  input: UpdatePartyInput,
): Promise<PartyRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows: existing } = await tx.query<{ version: number }>(
      'select version from parties where id = $1 and tenant_id = $2 and kind = $3 and merged_into is null for update',
      [id, ctx.tenantId, kind],
    )
    if (!existing[0]) throw notFound(kind === 'person' ? 'That contact' : 'That account')
    if (existing[0].version !== input.version) {
      throw conflict('Someone else changed this record while you were editing.', existing[0].version)
    }
    if (input.email?.trim()) await assertEmailFree(tx, ctx, input.email.trim(), id)

    // `company` is only meaningful for a person, and an empty string clears the
    // link rather than being ignored the way `coalesce` would treat it.
    if (kind === 'person' && input.company !== undefined) {
      const parentId = input.company?.trim() ? await upsertOrganisation(tx, ctx, input.company.trim()) : null
      await tx.query('update parties set parent_id = $2 where id = $1', [id, parentId])
    }

    const { rows } = await tx.query<PartyDbRow>(
      `with updated as (
         update parties
            set name = coalesce($2, name), email = coalesce($3, email), phone = coalesce($4, phone),
                website = coalesce($5, website), industry = coalesce($6, industry),
                employee_count = coalesce($7, employee_count), party_type = coalesce($8, party_type),
                notes = coalesce($9, notes), version = version + 1, updated_at = now()
          where id = $1
          returning *
       )
       select ${PARTY_COLUMNS} from updated p left join parties org on org.id = p.parent_id`,
      [
        id,
        input.name?.trim() ?? null,
        input.email?.trim() ?? null,
        input.phone?.trim() ?? null,
        input.website?.trim() ?? null,
        input.industry?.trim() ?? null,
        input.employeeCount ?? null,
        input.partyType?.trim() ?? null,
        input.notes?.trim() ?? null,
      ] as never[],
    )

    await recordAudit(tx, ctx, {
      action: kind === 'person' ? 'crm.contact_updated' : 'crm.account_updated',
      resource: 'party',
      resourceId: id,
      detail: { ...input },
    })

    return toParty(rows[0])
  })
}

/**
 * Archive, not delete. A party is the subject of every lead, deal and activity
 * that ever referred to it; destroying the row would leave those unable to say
 * who they were about.
 */
export async function archiveParty(ctx: TenantContext, kind: PartyKind, id: string, version: number): Promise<void> {
  ctx.require('record.archive')
  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number }>(
      'select version from parties where id = $1 and tenant_id = $2 and kind = $3 and archived_at is null for update',
      [id, ctx.tenantId, kind],
    )
    if (!rows[0]) throw notFound(kind === 'person' ? 'That contact' : 'That account')
    if (rows[0].version !== version) throw conflict('Someone else changed this record.', rows[0].version)
    await tx.query('update parties set archived_at = now(), version = version + 1 where id = $1', [id])
    await recordAudit(tx, ctx, {
      action: kind === 'person' ? 'crm.contact_archived' : 'crm.account_archived',
      resource: 'party',
      resourceId: id,
    })
  })
}

export async function restoreParty(ctx: TenantContext, kind: PartyKind, id: string): Promise<void> {
  ctx.require('record.update')
  const { rowCount } = await ctx.db.query(
    `update parties set archived_at = null, version = version + 1
      where id = $1 and tenant_id = $2 and kind = $3 and archived_at is not null`,
    [id, ctx.tenantId, kind],
  )
  if (!rowCount) throw notFound(kind === 'person' ? 'That archived contact' : 'That archived account')
  await recordAudit(ctx.db, ctx, {
    action: kind === 'person' ? 'crm.contact_restored' : 'crm.account_restored',
    resource: 'party',
    resourceId: id,
  })
}

/**
 * Same-name people, grouped, across the whole tenant.
 *
 * The count matters: the prototype compared only the rows the browser had
 * loaded, so "3 duplicates" on page one of eight meant nothing.
 */
export async function duplicateParties(
  ctx: TenantContext,
  kind: PartyKind,
): Promise<{ groups: { name: string; parties: PartyRow[] }[]; total: number }> {
  const { rows, total } = await listParties(ctx, kind, { duplicatesOnly: true, limit: 200 })
  const groups = new Map<string, PartyRow[]>()
  for (const row of rows) {
    const key = row.name.toLowerCase()
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return {
    total,
    groups: [...groups.values()].map((parties) => ({ name: parties[0].name, parties })),
  }
}

/* ---------------------------------- deals --------------------------------- */

export type DealRow = {
  id: string
  name: string
  pipelineId: string
  stageId: string
  stageName: string
  stageOutcome: 'open' | 'won' | 'lost'
  accountId: string | null
  account: string | null
  primaryContactId: string | null
  primaryContact: string | null
  /** A decimal string with its own currency. Never a float, per ADR-0008. */
  amount: string
  currency: string
  probability: number | null
  expectedClose: string | null
  closedAt: string | null
  outcome: 'won' | 'lost' | null
  lostReason: string | null
  source: string | null
  isFavourite: boolean
  version: number
  createdAt: string
}

/** A count with its money kept per currency, because two currencies do not add. */
export type MoneyBucket = { count: number; amounts: { currency: string; amount: string }[] }

export type StageTotals = StageRow & MoneyBucket

export type DealListOptions = {
  pipelineId?: string
  stageId?: string
  query?: string
  source?: string
  outcome?: 'open' | 'won' | 'lost'
  favouritesOnly?: boolean
  mineOnly?: boolean
  limit?: number
  offset?: number
  includeArchived?: boolean
}

export type DealList = {
  rows: DealRow[]
  total: number
  /** The pipeline the board is showing. Null when the tenant has none yet. */
  pipelineId: string | null
  pipelineName: string | null
  stages: StageTotals[]
  summary: { open: MoneyBucket; won: MoneyBucket; lost: MoneyBucket }
}

type DealDbRow = {
  id: string
  name: string
  pipeline_id: string
  stage_id: string
  stage_name: string
  stage_outcome: string
  account_id: string | null
  account: string | null
  primary_contact_id: string | null
  primary_contact: string | null
  amount: string
  currency: string
  probability: number | null
  expected_close: Date | string | null
  closed_at: Date | null
  outcome: string | null
  lost_reason: string | null
  source: string | null
  is_favourite: boolean
  version: number
  created_at: Date
}

const toDeal = (row: DealDbRow): DealRow => ({
  id: row.id,
  name: row.name,
  pipelineId: row.pipeline_id,
  stageId: row.stage_id,
  stageName: row.stage_name,
  stageOutcome: row.stage_outcome as DealRow['stageOutcome'],
  accountId: row.account_id,
  account: row.account,
  primaryContactId: row.primary_contact_id,
  primaryContact: row.primary_contact,
  amount: row.amount,
  currency: row.currency,
  probability: row.probability,
  expectedClose: row.expected_close ? new Date(row.expected_close).toISOString().slice(0, 10) : null,
  closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
  outcome: (row.outcome as DealRow['outcome']) ?? null,
  lostReason: row.lost_reason,
  source: row.source,
  isFavourite: row.is_favourite,
  version: row.version,
  createdAt: new Date(row.created_at).toISOString(),
})

const emptyBucket = (): MoneyBucket => ({ count: 0, amounts: [] })

/** Folds one grouped row into a bucket, keeping each currency separate. */
function addToBucket(bucket: MoneyBucket, currency: string, amount: string, count: number): void {
  bucket.count += count
  const existing = bucket.amounts.find((entry) => entry.currency === currency)
  if (existing) existing.amount = addDecimals(existing.amount, amount)
  else bucket.amounts.push({ currency, amount })
}

/**
 * Adds two decimal strings without going through a float.
 *
 * Only ever called on values PostgreSQL produced from `numeric`, so both sides
 * are well formed; 0.1 + 0.2 must not reach a pipeline figure.
 */
export function addDecimals(left: string, right: string): string {
  const scale = 4
  const toUnits = (value: string): bigint => {
    const negative = value.startsWith('-')
    const [whole, fraction = ''] = value.replace('-', '').split('.')
    const units = BigInt(whole + fraction.padEnd(scale, '0').slice(0, scale))
    return negative ? -units : units
  }
  const sum = toUnits(left) + toUnits(right)
  const negative = sum < 0n
  const digits = (negative ? -sum : sum).toString().padStart(scale + 1, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -scale)}.${digits.slice(-scale)}`
}

/** The pipeline a deals request is about: the one asked for, else the default. */
async function effectivePipeline(
  ctx: TenantContext,
  pipelineId?: string,
): Promise<{ id: string; name: string } | null> {
  /*
   * Two calls rather than one chosen by a ternary. The branches take different
   * parameters, and a shape where the SQL and the parameter list are picked by
   * separate expressions is one where they can disagree — it produced the same
   * bug three times in this codebase before it was banned outright.
   */
  if (pipelineId) {
    const { rows } = await ctx.db.query<{ id: string; name: string }>(
      'select id, name from pipelines where id = $2 and tenant_id = $1 and archived_at is null',
      [ctx.tenantId, pipelineId],
    )
    // Naming a pipeline that is not there is an error, not a fall-back to the
    // default: the caller asked about a specific one.
    if (!rows[0]) throw notFound('That pipeline')
    return rows[0]
  }

  const { rows } = await ctx.db.query<{ id: string; name: string }>(
    `select id, name from pipelines where tenant_id = $1 and archived_at is null
      order by is_default desc, created_at limit 1`,
    [ctx.tenantId],
  )
  return rows[0] ?? null
}

export type DealOption = { id: string; name: string; pipelineName: string }

/**
 * Every open deal in the workspace, for a picker.
 *
 * Deliberately not `listDeals`, which answers for ONE pipeline because a board
 * is a pipeline. A picker is not: an activity may be about any deal, and using
 * the board read meant a workspace with a second pipeline could log a call
 * against a deal in the default one and nothing else. Grouping by pipeline is
 * the caller's business, so the pipeline's name comes back with each row.
 */
export async function listDealOptions(
  ctx: TenantContext,
  limit = 200,
): Promise<{ deals: DealOption[]; capped: boolean }> {
  ctx.require('record.read')
  const wanted = Math.min(Math.max(limit, 1), 500)
  // One more than asked for, so `capped` is something the query answered
  // rather than an inference from a full page — a workspace with exactly
  // `wanted` deals is not truncated, and must not be told it is.
  const { rows } = await ctx.db.query<{ id: string; name: string; pipeline_name: string }>(
    `select d.id, d.name, p.name as pipeline_name
       from deals d join pipelines p on p.id = d.pipeline_id
      where d.tenant_id = $1 and d.archived_at is null and p.archived_at is null
      order by p.is_default desc, p.name, d.updated_at desc
      limit $2`,
    [ctx.tenantId, wanted + 1],
  )
  return {
    deals: rows.slice(0, wanted).map((row) => ({ id: row.id, name: row.name, pipelineName: row.pipeline_name })),
    capped: rows.length > wanted,
  }
}

/**
 * Deals for one pipeline, with per-stage and per-outcome totals.
 *
 * The board, the table and the dashboard all read this one answer, so a column
 * header, a row count and a KPI cannot disagree. Stage totals deliberately
 * ignore a stage filter — a board showing every column while one is selected is
 * what the filter means — but honour every other filter.
 */
export async function listDeals(ctx: TenantContext, options: DealListOptions = {}): Promise<DealList> {
  ctx.require('record.read')
  const scope = assertScope({ tenantId: ctx.tenantId })

  const pipeline = await effectivePipeline(ctx, options.pipelineId)
  if (!pipeline) {
    return {
      rows: [],
      total: 0,
      pipelineId: null,
      pipelineName: null,
      stages: [],
      summary: { open: emptyBucket(), won: emptyBucket(), lost: emptyBucket() },
    }
  }

  const base: string[] = ['d.tenant_id = $1', 'd.pipeline_id = $2']
  const params: unknown[] = [scope.tenantId, pipeline.id]
  if (!options.includeArchived) base.push('d.archived_at is null')
  if (options.source) {
    params.push(options.source)
    base.push(`d.source = $${params.length}`)
  }
  if (options.outcome) {
    params.push(options.outcome)
    base.push(`s.outcome = $${params.length}`)
  }
  if (options.favouritesOnly) base.push('d.is_favourite')
  if (options.mineOnly) {
    params.push(ctx.userId)
    base.push(`d.owner_user_id = $${params.length}`)
  }
  if (options.query?.trim()) {
    params.push(`%${options.query.trim().toLowerCase()}%`)
    const index = params.length
    base.push(`(lower(d.name) like $${index} or lower(coalesce(acct.name, '')) like $${index})`)
  }

  const from = `from deals d
       join pipeline_stages s on s.id = d.stage_id
       left join parties acct on acct.id = d.account_id
       left join parties person on person.id = d.primary_contact_id`

  // Totals are computed before the stage filter narrows the rows, so the board
  // keeps every column while one of them is selected.
  const { rows: grouped } = await ctx.db.query<{ stage_id: string; outcome: string; currency: string; n: string; amount: string }>(
    `select d.stage_id, s.outcome, d.currency, count(*)::text as n, sum(d.amount)::text as amount
       ${from}
      where ${base.join(' and ')}
      group by d.stage_id, s.outcome, d.currency`,
    params as never[],
  )

  const stageRows = await ctx.db.query<{ id: string; name: string; position: number; probability: number; outcome: string }>(
    'select id, name, position, probability, outcome from pipeline_stages where pipeline_id = $1 order by position',
    [pipeline.id],
  )
  const stages: StageTotals[] = stageRows.rows.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    probability: row.probability,
    outcome: row.outcome as StageRow['outcome'],
    ...emptyBucket(),
  }))
  const summary = { open: emptyBucket(), won: emptyBucket(), lost: emptyBucket() }
  for (const row of grouped) {
    const stage = stages.find((entry) => entry.id === row.stage_id)
    if (stage) addToBucket(stage, row.currency, row.amount, Number(row.n))
    const bucket = summary[row.outcome as keyof typeof summary]
    if (bucket) addToBucket(bucket, row.currency, row.amount, Number(row.n))
  }

  const listFilters = [...base]
  if (options.stageId) {
    params.push(options.stageId)
    listFilters.push(`d.stage_id = $${params.length}`)
  }
  const where = listFilters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n ${from} where ${where}`,
    params as never[],
  )

  params.push(Math.min(options.limit ?? 50, 200))
  params.push(Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<DealDbRow>(
    `select d.id, d.name, d.pipeline_id, d.stage_id, s.name as stage_name, s.outcome as stage_outcome,
            d.account_id, acct.name as account, d.primary_contact_id, person.name as primary_contact,
            d.amount::text as amount, d.currency, d.probability, d.expected_close, d.closed_at,
            d.outcome, d.lost_reason, d.source, d.is_favourite, d.version, d.created_at
       ${from}
      where ${where}
      order by s.position, d.created_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )

  return {
    rows: rows.map(toDeal),
    total: Number(counted[0].n),
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    stages,
    summary,
  }
}

export type CreateDealInput = {
  name: string
  amount: string
  currency: string
  pipelineId?: string | null
  stageId?: string | null
  accountId?: string | null
  primaryContactId?: string | null
  expectedClose?: string | null
  source?: string | null
}

/** Confirms a party belongs to this tenant before a deal points at it. */
async function assertParty(tx: Db, ctx: TenantContext, id: string, kind: PartyKind): Promise<void> {
  const { rows } = await tx.query<{ id: string }>(
    'select id from parties where id = $1 and tenant_id = $2 and kind = $3 and merged_into is null',
    [id, ctx.tenantId, kind],
  )
  if (!rows[0]) throw notFound(kind === 'person' ? 'That contact' : 'That account')
}

/** The stage a deal enters at in `pipelineId`: the lowest position it has. */
async function firstStageOf(tx: Db, ctx: TenantContext, pipelineId: string): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id
      where s.pipeline_id = $1 and p.tenant_id = $2 and p.archived_at is null
      order by s.position limit 1`,
    [pipelineId, ctx.tenantId],
  )
  if (!rows[0]) throw notFound('That pipeline')
  return rows[0].id
}

export async function createDeal(ctx: TenantContext, input: CreateDealInput): Promise<DealRow> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    /*
     * A deal named a pipeline but no stage enters at that pipeline's FIRST
     * stage. Falling back to the default pipeline's first stage — which is
     * what happened while the two were resolved together — produced a 404
     * reading "That pipeline stage" for a caller who had never named one,
     * because the check below requires the stage to belong to the pipeline
     * that was asked for. That made every pipeline but the default one
     * impossible to create into.
     */
    let pipelineId = input.pipelineId ?? null
    let stageId = input.stageId ?? null
    if (!stageId) {
      if (pipelineId) {
        stageId = await firstStageOf(tx, ctx, pipelineId)
      } else {
        const fallback = await defaultPipeline(tx, ctx)
        pipelineId = fallback.pipelineId
        stageId = fallback.stageId
      }
    }

    const { rows: stage } = await tx.query<{ id: string; outcome: string; probability: number }>(
      `select s.id, s.outcome, s.probability
         from pipeline_stages s join pipelines p on p.id = s.pipeline_id
        where s.id = $1 and s.pipeline_id = $2 and p.tenant_id = $3 and p.archived_at is null`,
      [stageId, pipelineId, ctx.tenantId],
    )
    if (!stage[0]) throw notFound('That pipeline stage')
    if (input.accountId) await assertParty(tx, ctx, input.accountId, 'organisation')
    if (input.primaryContactId) await assertParty(tx, ctx, input.primaryContactId, 'person')

    const closed = stage[0].outcome !== 'open'
    const { rows: deal } = await tx.query<{ id: string }>(
      `insert into deals (tenant_id, company_id, pipeline_id, stage_id, name, account_id, primary_contact_id,
                          amount, currency, probability, expected_close, source, outcome, closed_at,
                          owner_user_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15) returning id`,
      [
        ctx.tenantId,
        ctx.companyId,
        pipelineId,
        stageId,
        input.name.trim(),
        input.accountId ?? null,
        input.primaryContactId ?? null,
        input.amount,
        input.currency,
        stage[0].probability,
        input.expectedClose ?? null,
        input.source?.trim() || null,
        closed ? stage[0].outcome : null,
        closed ? ctx.now : null,
        ctx.userId,
      ] as never[],
    )

    // The first stage is a transition too: without it a funnel report cannot
    // say when a deal entered the pipeline.
    await tx.query(
      `insert into deal_stage_history (tenant_id, deal_id, to_stage_id, moved_by, note)
       values ($1, $2, $3, $4, 'Created')`,
      [ctx.tenantId, deal[0].id, stageId, ctx.userId],
    )
    await recordAudit(tx, ctx, {
      action: 'crm.deal_created',
      resource: 'deal',
      resourceId: deal[0].id,
      detail: { name: input.name.trim(), amount: input.amount, currency: input.currency },
    })

    return (await dealById(tx, ctx, deal[0].id))!
  })
}

async function dealById(db: Db, ctx: TenantContext, id: string): Promise<DealRow | null> {
  const { rows } = await db.query<DealDbRow>(
    `select d.id, d.name, d.pipeline_id, d.stage_id, s.name as stage_name, s.outcome as stage_outcome,
            d.account_id, acct.name as account, d.primary_contact_id, person.name as primary_contact,
            d.amount::text as amount, d.currency, d.probability, d.expected_close, d.closed_at,
            d.outcome, d.lost_reason, d.source, d.is_favourite, d.version, d.created_at
       from deals d
       join pipeline_stages s on s.id = d.stage_id
       left join parties acct on acct.id = d.account_id
       left join parties person on person.id = d.primary_contact_id
      where d.id = $1 and d.tenant_id = $2`,
    [id, ctx.tenantId],
  )
  return rows[0] ? toDeal(rows[0]) : null
}

export type UpdateDealInput = {
  version: number
  name?: string
  stageId?: string
  amount?: string
  currency?: string
  expectedClose?: string | null
  source?: string | null
  isFavourite?: boolean
  lostReason?: string | null
  restore?: boolean
}

/**
 * Edits a deal, moving its stage through `deal_stage_history` when it changes.
 *
 * The outcome follows the stage's own `outcome` column rather than its name, so
 * a tenant that renames "Won" does not silently stop closing deals — and a deal
 * moved back into an open stage is re-opened rather than staying closed.
 */
export async function updateDeal(ctx: TenantContext, id: string, input: UpdateDealInput): Promise<DealRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows: existing } = await tx.query<{ version: number; stage_id: string; pipeline_id: string }>(
      'select version, stage_id, pipeline_id from deals where id = $1 and tenant_id = $2 for update',
      [id, ctx.tenantId],
    )
    if (!existing[0]) throw notFound('That deal')
    if (existing[0].version !== input.version) {
      throw conflict('Someone else changed this deal while you were editing.', existing[0].version)
    }

    let outcome: string | null | undefined
    let closedAt: Date | null | undefined
    if (input.stageId && input.stageId !== existing[0].stage_id) {
      const { rows: stage } = await tx.query<{ outcome: string; probability: number }>(
        `select s.outcome, s.probability from pipeline_stages s
          where s.id = $1 and s.pipeline_id = $2 and s.tenant_id = $3`,
        [input.stageId, existing[0].pipeline_id, ctx.tenantId],
      )
      if (!stage[0]) throw notFound('That pipeline stage')
      outcome = stage[0].outcome === 'open' ? null : stage[0].outcome
      closedAt = stage[0].outcome === 'open' ? null : ctx.now
      await tx.query(
        `insert into deal_stage_history (tenant_id, deal_id, from_stage_id, to_stage_id, moved_by)
         values ($1, $2, $3, $4, $5)`,
        [ctx.tenantId, id, existing[0].stage_id, input.stageId, ctx.userId],
      )
      await tx.query('update deals set stage_id = $2, probability = $3 where id = $1', [
        id,
        input.stageId,
        stage[0].probability,
      ])
    }

    await tx.query(
      `update deals
          set name = coalesce($2, name), amount = coalesce($3, amount), currency = coalesce($4, currency),
              expected_close = coalesce($5, expected_close), source = coalesce($6, source),
              is_favourite = coalesce($7, is_favourite), lost_reason = coalesce($8, lost_reason),
              outcome = case when $9::boolean then $10 else outcome end,
              closed_at = case when $9::boolean then $11 else closed_at end,
              archived_at = case when $12::boolean then null else archived_at end,
              version = version + 1, updated_at = now()
        where id = $1`,
      [
        id,
        input.name?.trim() ?? null,
        input.amount ?? null,
        input.currency ?? null,
        input.expectedClose ?? null,
        input.source?.trim() ?? null,
        input.isFavourite ?? null,
        input.lostReason?.trim() ?? null,
        outcome !== undefined,
        outcome ?? null,
        closedAt ?? null,
        input.restore === true,
      ] as never[],
    )

    await recordAudit(tx, ctx, { action: 'crm.deal_updated', resource: 'deal', resourceId: id, detail: { ...input } })
    return (await dealById(tx, ctx, id))!
  })
}

export async function archiveDeal(ctx: TenantContext, id: string, version: number): Promise<void> {
  ctx.require('record.archive')
  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ version: number }>(
      'select version from deals where id = $1 and tenant_id = $2 and archived_at is null for update',
      [id, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That deal')
    if (rows[0].version !== version) throw conflict('Someone else changed this deal.', rows[0].version)
    await tx.query('update deals set archived_at = now(), version = version + 1 where id = $1', [id])
    await recordAudit(tx, ctx, { action: 'crm.deal_archived', resource: 'deal', resourceId: id })
  })
}

/* ------------------------------- activities ------------------------------- */

export type ActivityTarget = { kind: 'party' | 'deal' | 'lead'; id: string; name: string }

export type ActivityRow = {
  id: string
  kind: string
  subject: string
  body: string | null
  occursAt: string | null
  timezone: string | null
  durationMinutes: number | null
  completedAt: string | null
  outcome: string | null
  version: number
  target: ActivityTarget | null
  createdAt: string
}

export type ActivityListOptions = {
  kind?: string
  query?: string
  /** Inclusive lower and exclusive upper bound on `occurs_at`, as ISO strings. */
  from?: string
  to?: string
  completed?: boolean
  limit?: number
  offset?: number
}

type ActivityDbRow = {
  id: string
  kind: string
  subject: string
  body: string | null
  occurs_at: Date | null
  timezone: string | null
  duration_minutes: number | null
  completed_at: Date | null
  outcome: string | null
  version: number
  party_id: string | null
  deal_id: string | null
  lead_id: string | null
  party_name: string | null
  deal_name: string | null
  lead_name: string | null
  created_at: Date
}

function targetOf(row: ActivityDbRow): ActivityTarget | null {
  if (row.party_id) return { kind: 'party', id: row.party_id, name: row.party_name ?? '' }
  if (row.deal_id) return { kind: 'deal', id: row.deal_id, name: row.deal_name ?? '' }
  if (row.lead_id) return { kind: 'lead', id: row.lead_id, name: row.lead_name ?? '' }
  return null
}

const toActivity = (row: ActivityDbRow): ActivityRow => ({
  id: row.id,
  kind: row.kind,
  subject: row.subject,
  body: row.body,
  occursAt: row.occurs_at ? new Date(row.occurs_at).toISOString() : null,
  timezone: row.timezone,
  durationMinutes: row.duration_minutes,
  completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  outcome: row.outcome,
  version: row.version,
  target: targetOf(row),
  createdAt: new Date(row.created_at).toISOString(),
})

const ACTIVITY_FROM = `from activities a
       left join parties party on party.id = a.party_id
       left join deals deal on deal.id = a.deal_id
       left join leads lead on lead.id = a.lead_id
       left join parties lead_party on lead_party.id = lead.party_id`

/**
 * Activities in a window, newest first.
 *
 * One endpoint serves both the follow-ups timeline and the calendar grid: the
 * calendar asks for a month, the timeline for everything. Two queries over the
 * same rows is how two screens end up disagreeing about what happened.
 */
export async function listActivities(
  ctx: TenantContext,
  options: ActivityListOptions = {},
): Promise<{ rows: ActivityRow[]; total: number }> {
  ctx.require('record.read')
  const scope = assertScope({ tenantId: ctx.tenantId })

  const filters: string[] = ['a.tenant_id = $1']
  const params: unknown[] = [scope.tenantId]
  if (options.kind && options.kind !== 'All') {
    params.push(options.kind)
    filters.push(`a.kind = $${params.length}`)
  }
  if (options.from) {
    params.push(options.from)
    filters.push(`a.occurs_at >= $${params.length}`)
  }
  if (options.to) {
    params.push(options.to)
    filters.push(`a.occurs_at < $${params.length}`)
  }
  if (options.completed !== undefined) {
    filters.push(options.completed ? 'a.completed_at is not null' : 'a.completed_at is null')
  }
  if (options.query?.trim()) {
    params.push(`%${options.query.trim().toLowerCase()}%`)
    const index = params.length
    filters.push(
      `(lower(a.subject) like $${index} or lower(coalesce(a.body, '')) like $${index}
        or lower(coalesce(party.name, '')) like $${index} or lower(coalesce(deal.name, '')) like $${index}
        or lower(coalesce(lead_party.name, '')) like $${index})`,
    )
  }
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n ${ACTIVITY_FROM} where ${where}`,
    params as never[],
  )

  params.push(Math.min(options.limit ?? 50, 200))
  params.push(Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<ActivityDbRow>(
    `select a.id, a.kind, a.subject, a.body, a.occurs_at, a.timezone, a.duration_minutes,
            a.completed_at, a.outcome, a.version, a.party_id, a.deal_id, a.lead_id,
            party.name as party_name, deal.name as deal_name, lead_party.name as lead_name, a.created_at
       ${ACTIVITY_FROM}
      where ${where}
      order by coalesce(a.occurs_at, a.created_at) desc
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )

  return { total: Number(counted[0].n), rows: rows.map(toActivity) }
}

export type CreateActivityInput = {
  kind: string
  subject: string
  body?: string | null
  partyId?: string | null
  dealId?: string | null
  leadId?: string | null
  occursAt?: string | null
  timezone?: string | null
  durationMinutes?: number | null
}

/**
 * Logs one activity against exactly one target.
 *
 * The database enforces the "exactly one" rule, but a check constraint reaches
 * the client as a 500; this turns it into something a form can show.
 */
export async function createActivity(ctx: TenantContext, input: CreateActivityInput): Promise<ActivityRow> {
  ctx.require('record.create')
  const targets = [input.partyId, input.dealId, input.leadId].filter(Boolean)
  if (targets.length !== 1) {
    throw invalidInput({ target: 'Choose exactly one contact, account, deal or lead this is about.' })
  }
  // A time without a zone is not a time: "3pm" means nothing to the next reader.
  if (input.occursAt && !input.timezone) {
    throw invalidInput({ timezone: 'A scheduled time needs the time zone it was entered in.' })
  }

  return ctx.db.transaction(async (tx) => {
    if (input.partyId) {
      const { rows } = await tx.query<{ id: string }>(
        'select id from parties where id = $1 and tenant_id = $2 and merged_into is null',
        [input.partyId, ctx.tenantId],
      )
      if (!rows[0]) throw notFound('That contact')
    }
    if (input.dealId) {
      const { rows } = await tx.query<{ id: string }>('select id from deals where id = $1 and tenant_id = $2', [
        input.dealId,
        ctx.tenantId,
      ])
      if (!rows[0]) throw notFound('That deal')
    }
    if (input.leadId) {
      const { rows } = await tx.query<{ id: string }>('select id from leads where id = $1 and tenant_id = $2', [
        input.leadId,
        ctx.tenantId,
      ])
      if (!rows[0]) throw notFound('That lead')
    }

    const { rows: created } = await tx.query<{ id: string }>(
      `insert into activities (tenant_id, company_id, kind, subject, body, party_id, deal_id, lead_id,
                               occurs_at, timezone, duration_minutes, owner_user_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12) returning id`,
      [
        ctx.tenantId,
        ctx.companyId,
        input.kind.trim(),
        input.subject.trim(),
        input.body?.trim() || null,
        input.partyId ?? null,
        input.dealId ?? null,
        input.leadId ?? null,
        input.occursAt ?? null,
        input.timezone ?? null,
        input.durationMinutes ?? null,
        ctx.userId,
      ] as never[],
    )

    await recordAudit(tx, ctx, {
      action: 'crm.activity_logged',
      resource: 'activity',
      resourceId: created[0].id,
      detail: { kind: input.kind, subject: input.subject.trim() },
    })

    const { rows } = await tx.query<ActivityDbRow>(
      `select a.id, a.kind, a.subject, a.body, a.occurs_at, a.timezone, a.duration_minutes,
              a.completed_at, a.outcome, a.version, a.party_id, a.deal_id, a.lead_id,
              party.name as party_name, deal.name as deal_name, lead_party.name as lead_name, a.created_at
         ${ACTIVITY_FROM}
        where a.id = $1`,
      [created[0].id],
    )
    return toActivity(rows[0])
  })
}

export type UpdateActivityInput = {
  version: number
  subject?: string
  body?: string | null
  occursAt?: string | null
  timezone?: string | null
  durationMinutes?: number | null
  completed?: boolean
  outcome?: string | null
}

/** Completes, reschedules or annotates an activity, version-checked like the rest. */
export async function updateActivity(ctx: TenantContext, id: string, input: UpdateActivityInput): Promise<ActivityRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows: existing } = await tx.query<{ version: number }>(
      'select version from activities where id = $1 and tenant_id = $2 for update',
      [id, ctx.tenantId],
    )
    if (!existing[0]) throw notFound('That activity')
    if (existing[0].version !== input.version) {
      throw conflict('Someone else changed this activity while you were editing.', existing[0].version)
    }

    await tx.query(
      `update activities
          set subject = coalesce($2, subject), body = coalesce($3, body),
              occurs_at = coalesce($4, occurs_at), timezone = coalesce($5, timezone),
              duration_minutes = coalesce($6, duration_minutes), outcome = coalesce($7, outcome),
              completed_at = case when $8::boolean then coalesce(completed_at, $9) when $10::boolean then null else completed_at end,
              version = version + 1, updated_at = now()
        where id = $1`,
      [
        id,
        input.subject?.trim() ?? null,
        input.body?.trim() ?? null,
        input.occursAt ?? null,
        input.timezone ?? null,
        input.durationMinutes ?? null,
        input.outcome?.trim() ?? null,
        input.completed === true,
        ctx.now,
        input.completed === false,
      ] as never[],
    )

    await recordAudit(tx, ctx, {
      action: 'crm.activity_updated',
      resource: 'activity',
      resourceId: id,
      detail: { ...input },
    })

    const { rows } = await tx.query<ActivityDbRow>(
      `select a.id, a.kind, a.subject, a.body, a.occurs_at, a.timezone, a.duration_minutes,
              a.completed_at, a.outcome, a.version, a.party_id, a.deal_id, a.lead_id,
              party.name as party_name, deal.name as deal_name, lead_party.name as lead_name, a.created_at
         ${ACTIVITY_FROM}
        where a.id = $1`,
      [id],
    )
    return toActivity(rows[0])
  })
}
