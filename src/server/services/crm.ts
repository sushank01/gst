import type { Db } from '../db/client.ts'
import { conflict, notFound } from '../http/errors.ts'
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
      order by l.created_at desc
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
    const stages: [string, number, number, string][] = [
      ['New', 1, 5, 'open'],
      ['Qualification', 2, 15, 'open'],
      ['Discovery', 3, 25, 'open'],
      ['Demo', 4, 40, 'open'],
      ['Proposal Sent', 5, 60, 'open'],
      ['Negotiation', 6, 75, 'open'],
      ['Won', 7, 100, 'won'],
      ['Lost', 8, 0, 'lost'],
    ]
    for (const [name, position, probability, outcome] of stages) {
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
