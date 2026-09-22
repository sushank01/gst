import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Legal entities inside a workspace.
 *
 * The primary company is a REAL ROW, created with the tenant. The prototype
 * derived it from the organisation name typed at signup and layered a sparse
 * patch over it, so the entity every document was issued against did not exist
 * in storage and could not be referenced by anything.
 *
 * Two rules the database holds rather than a screen: at most one primary per
 * tenant, and a code that is unique per tenant. The parent chain is checked in
 * code because a cycle is not expressible as a constraint.
 */

export type CompanyRow = {
  id: string
  name: string
  code: string
  currency: string
  timezone: string
  country: string | null
  taxId: string | null
  parentId: string | null
  parentName: string | null
  isPrimary: boolean
  archivedAt: string | null
}

type Raw = Record<string, unknown>

const map = (row: Raw): CompanyRow => ({
  id: row.id as string,
  name: row.name as string,
  code: row.code as string,
  currency: row.currency as string,
  timezone: row.timezone as string,
  country: (row.country as string) ?? null,
  taxId: (row.tax_id as string) ?? null,
  parentId: (row.parent_id as string) ?? null,
  parentName: (row.parent_name as string) ?? null,
  isPrimary: row.is_primary as boolean,
  archivedAt: row.archived_at ? new Date(row.archived_at as string).toISOString() : null,
})

const SELECT = `c.*, p.name as parent_name
    from companies c
    left join companies p on p.id = c.parent_id`

export async function listCompanies(ctx: TenantContext, includeArchived = false): Promise<CompanyRow[]> {
  ctx.require('company.read')
  const { rows } = includeArchived
    ? await ctx.db.query<Raw>(`select ${SELECT} where c.tenant_id = $1 order by c.is_primary desc, c.name`, [ctx.tenantId])
    : await ctx.db.query<Raw>(
        `select ${SELECT} where c.tenant_id = $1 and c.archived_at is null order by c.is_primary desc, c.name`,
        [ctx.tenantId],
      )
  return rows.map(map)
}

export async function readCompany(ctx: TenantContext, companyId: string): Promise<CompanyRow> {
  ctx.require('company.read')
  const { rows } = await ctx.db.query<Raw>(`select ${SELECT} where c.id = $1 and c.tenant_id = $2`, [companyId, ctx.tenantId])
  if (!rows[0]) throw notFound('That company')
  return map(rows[0])
}

/** Walks up the parent chain. A cycle would hang every hierarchy query. */
async function wouldCycle(db: Db, ctx: TenantContext, companyId: string, candidateParent: string): Promise<boolean> {
  let cursor: string | null = candidateParent
  for (let hops = 0; cursor && hops < 100; hops += 1) {
    if (cursor === companyId) return true
    const { rows }: { rows: { parent_id: string | null }[] } = await db.query<{ parent_id: string | null }>(
      'select parent_id from companies where id = $1 and tenant_id = $2',
      [cursor, ctx.tenantId],
    )
    cursor = rows[0]?.parent_id ?? null
  }
  return false
}

export async function createCompany(
  ctx: TenantContext,
  input: {
    name: string
    code: string
    currency: string
    timezone?: string
    country?: string | null
    taxId?: string | null
    parentId?: string | null
  },
): Promise<CompanyRow> {
  ctx.require('company.manage')

  return ctx.db.transaction(async (tx) => {
    const { rows: clash } = await tx.query('select 1 from companies where tenant_id = $1 and lower(code) = lower($2)', [
      ctx.tenantId,
      input.code,
    ])
    if (clash[0]) throw unprocessable('duplicate_code', `Company code ${input.code} is already in use.`)

    if (input.parentId) {
      const { rows } = await tx.query('select 1 from companies where id = $1 and tenant_id = $2', [input.parentId, ctx.tenantId])
      if (!rows[0]) throw notFound('That parent company')
    }

    const { rows } = await tx.query<{ id: string }>(
      `insert into companies (tenant_id, parent_id, name, code, currency, timezone, country, tax_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [
        ctx.tenantId,
        input.parentId ?? null,
        input.name,
        input.code.toUpperCase(),
        input.currency.toUpperCase(),
        input.timezone ?? 'UTC',
        input.country ?? null,
        input.taxId ?? null,
      ],
    )
    await recordAudit(tx, ctx, {
      action: 'company.created',
      resource: 'company',
      resourceId: rows[0].id,
      detail: { code: input.code },
    })
    const { rows: created } = await tx.query<Raw>(`select ${SELECT} where c.id = $1`, [rows[0].id])
    return map(created[0])
  })
}

const UPDATABLE = {
  name: 'name = ',
  currency: 'currency = ',
  timezone: 'timezone = ',
  country: 'country = ',
  taxId: 'tax_id = ',
} as const

export async function updateCompany(
  ctx: TenantContext,
  companyId: string,
  input: { name?: string; currency?: string; timezone?: string; country?: string | null; taxId?: string | null; parentId?: string | null },
): Promise<CompanyRow> {
  ctx.require('company.manage')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ is_primary: boolean }>(
      'select is_primary from companies where id = $1 and tenant_id = $2 for update',
      [companyId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That company')

    if (input.parentId !== undefined) {
      if (input.parentId === companyId) throw unprocessable('self_parent', 'A company cannot be its own parent.')
      if (input.parentId) {
        const { rows: parent } = await tx.query('select 1 from companies where id = $1 and tenant_id = $2', [
          input.parentId,
          ctx.tenantId,
        ])
        if (!parent[0]) throw notFound('That parent company')
        if (await wouldCycle(tx, ctx, companyId, input.parentId)) {
          throw unprocessable('parent_cycle', 'That would make the hierarchy loop back on itself.')
        }
      }
      await tx.query('update companies set parent_id = $3 where id = $1 and tenant_id = $2', [
        companyId,
        ctx.tenantId,
        input.parentId,
      ])
    }

    const sets: string[] = []
    const params: unknown[] = [companyId, ctx.tenantId, ctx.now]
    for (const [key, assignment] of Object.entries(UPDATABLE)) {
      const value = (input as Record<string, unknown>)[key]
      if (value === undefined) continue
      // Only the currency is normalised, and only when it is the string the
      // DTO guarantees. Anything else is passed through as the driver's value.
      params.push(key === 'currency' && typeof value === 'string' ? value.toUpperCase() : value)
      sets.push(assignment + `$${params.length}`)
    }
    if (sets.length) {
      await tx.query(`update companies set ${sets.join(', ')}, updated_at = $3 where id = $1 and tenant_id = $2`, params as never[])
    }
    await recordAudit(tx, ctx, { action: 'company.updated', resource: 'company', resourceId: companyId })
    const { rows: after } = await tx.query<Raw>(`select ${SELECT} where c.id = $1`, [companyId])
    return map(after[0])
  })
}

/**
 * Archives a company.
 *
 * Refused for the primary one, and refused while it still has children: an
 * orphaned subsidiary would point at a parent nothing lists.
 */
export async function archiveCompany(ctx: TenantContext, companyId: string): Promise<void> {
  ctx.require('company.manage')

  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ is_primary: boolean }>(
      'select is_primary from companies where id = $1 and tenant_id = $2 and archived_at is null for update',
      [companyId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That company')
    if (rows[0].is_primary) throw conflict('The primary entity cannot be archived. Make another one primary first.')

    const { rows: children } = await tx.query<{ n: string }>(
      'select count(*)::text as n from companies where parent_id = $1 and archived_at is null',
      [companyId],
    )
    if (Number(children[0].n) > 0) {
      throw conflict(`${children[0].n} subsidiary company(ies) still report to it. Reassign them first.`)
    }

    await tx.query('update companies set archived_at = $3, updated_at = $3 where id = $1 and tenant_id = $2', [
      companyId,
      ctx.tenantId,
      ctx.now,
    ])
    await recordAudit(tx, ctx, { action: 'company.archived', resource: 'company', resourceId: companyId })
  })
}

/**
 * Moves the primary flag.
 *
 * Both writes are in one transaction because the partial unique index allows
 * exactly one primary: clearing and setting in separate statements would leave
 * a moment with none, and doing it the other way round fails outright.
 */
export async function setPrimaryCompany(ctx: TenantContext, companyId: string): Promise<CompanyRow> {
  ctx.require('company.manage')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query('select 1 from companies where id = $1 and tenant_id = $2 and archived_at is null', [
      companyId,
      ctx.tenantId,
    ])
    if (!rows[0]) throw notFound('That company')

    await tx.query('update companies set is_primary = false where tenant_id = $1 and is_primary', [ctx.tenantId])
    await tx.query('update companies set is_primary = true, updated_at = $3 where id = $1 and tenant_id = $2', [
      companyId,
      ctx.tenantId,
      ctx.now,
    ])
    await recordAudit(tx, ctx, { action: 'company.primary_changed', resource: 'company', resourceId: companyId })
    const { rows: after } = await tx.query<Raw>(`select ${SELECT} where c.id = $1`, [companyId])
    return map(after[0])
  })
}
