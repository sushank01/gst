import { balance } from './credits.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Cross-module reporting.
 *
 * Every figure here is computed from the same rows the module itself reads —
 * there is no reporting copy, no nightly denormalisation, no counter kept
 * alongside the data. That is the whole point: a dashboard that maintains its
 * own totals eventually disagrees with the screen underneath it, and then
 * nobody trusts either.
 *
 * Where a figure cannot be computed, it is null and the caller renders "not
 * set". The prototype's dashboards showed zeroes and invented percentages,
 * which is indistinguishable from a real zero.
 */

export type Trend = { period: string; value: string }

export type Overview = {
  generatedAt: string
  people: { headcount: number; onProbation: number; joinersThisMonth: number; leaversThisMonth: number; onLeaveToday: number }
  support: { open: number; breached: number; unassigned: number; medianFirstResponseMinutes: number | null }
  sales: { postedThisMonth: string; outstanding: string; currency: string | null; overdueInvoices: number }
  expenses: { awaitingApproval: number; awaitingPayment: string; currency: string | null }
  assets: { registered: number; issued: number; inService: number; warrantyExpiring: number }
  credits: { granted: number; used: number; available: number }
  /** Figures that could not be computed, and why. Never silently zero. */
  unavailable: { metric: string; reason: string }[]
}

const monthBounds = (now: Date): { start: string; end: string } => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

/**
 * The workspace overview.
 *
 * One query per domain rather than one enormous join: the domains are
 * independent, a slow one should not hold up the rest, and each query is
 * legible enough to check against the screen it summarises.
 */
export async function overview(ctx: TenantContext): Promise<Overview> {
  ctx.require('record.read')
  const { start, end } = monthBounds(ctx.now)
  const today = ctx.now.toISOString().slice(0, 10)
  const unavailable: { metric: string; reason: string }[] = []

  const [people, support, firstResponse, sales, overdue, expenses, assets, credits] = await Promise.all([
    ctx.db.query<{ headcount: string; probation: string; joiners: string; leavers: string; on_leave: string }>(
      `select
         count(*) filter (where status in ('active','probation','notice'))::text as headcount,
         count(*) filter (where status = 'probation')::text as probation,
         count(*) filter (where joined_on >= $2 and joined_on < $3)::text as joiners,
         count(*) filter (where exited_on >= $2 and exited_on < $3)::text as leavers,
         (select count(*) from hr_leave_request_days d
            join hr_leave_requests r on r.id = d.request_id
           where d.tenant_id = $1 and d.leave_on = $4 and r.status = 'approved')::text as on_leave
       from hr_employees where tenant_id = $1 and archived_at is null`,
      [ctx.tenantId, start, end, today],
    ),
    ctx.db.query<{ open: string; breached: string; unassigned: string }>(
      `select
         count(*) filter (where t.status not in ('resolved','closed'))::text as open,
         (select count(*) from sla_instances s
            join tickets t2 on t2.id = s.ticket_id
           where s.tenant_id = $1 and s.breached_at is not null and s.satisfied_at is null)::text as breached,
         count(*) filter (where t.assignee_user_id is null and t.status not in ('resolved','closed'))::text as unassigned
       from tickets t where t.tenant_id = $1`,
      [ctx.tenantId],
    ),
    /*
     * The median, not the mean. One ticket that sat over a weekend drags a
     * mean far enough to make a healthy queue look broken.
     */
    ctx.db.query<{ median: string | null }>(
      `select (percentile_cont(0.5) within group (
                order by extract(epoch from (first_response_at - created_at)) / 60
              ))::text as median
         from tickets where tenant_id = $1 and first_response_at is not null`,
      [ctx.tenantId],
    ),
    ctx.db.query<{ posted: string; outstanding: string; currency: string | null }>(
      `select
         coalesce(sum(grand_total) filter (
           where posted_at >= $2 and posted_at < $3 and kind = 'invoice'), 0)::text as posted,
         coalesce(sum(grand_total - paid_total) filter (
           where kind = 'invoice' and posted_at is not null), 0)::text as outstanding,
         min(currency) as currency
       from sales_documents where tenant_id = $1`,
      [ctx.tenantId, start, end],
    ),
    ctx.db.query<{ n: string }>(
      `select count(*)::text as n from sales_documents
        where tenant_id = $1 and kind = 'invoice' and posted_at is not null
          and due_on is not null and due_on < $2 and grand_total > paid_total`,
      [ctx.tenantId, today],
    ),
    ctx.db.query<{ awaiting: string; payable: string; currency: string | null }>(
      `select
         count(*) filter (where status = 'submitted')::text as awaiting,
         coalesce(sum(coalesce(approved_amount, total_amount)) filter (where status = 'approved'), 0)::text as payable,
         min(currency) as currency
       from te_expense_reports where tenant_id = $1`,
      [ctx.tenantId],
    ),
    ctx.db.query<{ registered: string; issued: string; in_service: string; warranty: string }>(
      `select
         count(*)::text as registered,
         count(*) filter (where status = 'assigned')::text as issued,
         count(*) filter (where status = 'in_service')::text as in_service,
         count(*) filter (where warranty_expires_on is not null
                            and warranty_expires_on >= $2
                            and warranty_expires_on < $3)::text as warranty
       from assets where tenant_id = $1 and archived_at is null`,
      [ctx.tenantId, today, new Date(ctx.now.getTime() + 90 * 86_400_000).toISOString().slice(0, 10)],
    ),
    /*
     * The ledger's own balance function, not a second query that sums the same
     * rows. A reporting copy of this arithmetic is exactly how a dashboard ends
     * up disagreeing with the billing screen — and the signs and entry kinds
     * here are subtle enough that it would.
     */
    balance(ctx.db, ctx.tenantId),
  ])

  const median = firstResponse.rows[0]?.median
  if (median === null || median === undefined) {
    unavailable.push({
      metric: 'support.medianFirstResponseMinutes',
      reason: 'No ticket has had a first response yet, so there is nothing to take a median of.',
    })
  }

  const salesCurrency = sales.rows[0].currency
  if (!salesCurrency) {
    unavailable.push({ metric: 'sales.currency', reason: 'No sales document exists yet, so no currency is established.' })
  }

  return {
    generatedAt: ctx.now.toISOString(),
    people: {
      headcount: Number(people.rows[0].headcount),
      onProbation: Number(people.rows[0].probation),
      joinersThisMonth: Number(people.rows[0].joiners),
      leaversThisMonth: Number(people.rows[0].leavers),
      onLeaveToday: Number(people.rows[0].on_leave),
    },
    support: {
      open: Number(support.rows[0].open),
      breached: Number(support.rows[0].breached),
      unassigned: Number(support.rows[0].unassigned),
      medianFirstResponseMinutes: median === null || median === undefined ? null : Math.round(Number(median)),
    },
    sales: {
      postedThisMonth: sales.rows[0].posted,
      outstanding: sales.rows[0].outstanding,
      currency: salesCurrency,
      overdueInvoices: Number(overdue.rows[0].n),
    },
    expenses: {
      awaitingApproval: Number(expenses.rows[0].awaiting),
      awaitingPayment: expenses.rows[0].payable,
      currency: expenses.rows[0].currency,
    },
    assets: {
      registered: Number(assets.rows[0].registered),
      issued: Number(assets.rows[0].issued),
      inService: Number(assets.rows[0].in_service),
      warrantyExpiring: Number(assets.rows[0].warranty),
    },
    credits: { granted: credits.granted, used: credits.used, available: credits.available },
    unavailable,
  }
}

export type SearchHit = {
  kind: string
  id: string
  title: string
  subtitle: string | null
  url: string
}

/**
 * Search across the modules a workspace has.
 *
 * Every branch is tenant-scoped in its own WHERE clause rather than filtered
 * afterwards, so a result from another workspace cannot appear even
 * momentarily. Results are capped per kind so one noisy module cannot crowd
 * out the rest.
 */
export async function search(ctx: TenantContext, term: string, perKind = 5): Promise<SearchHit[]> {
  ctx.require('record.read')
  const query = term.trim().toLowerCase()
  if (query.length < 2) return []
  const like = `%${query}%`
  const limit = Math.min(perKind, 20)

  const [leads, tickets, documents, employees, assets] = await Promise.all([
    ctx.db.query<{ id: string; name: string; company: string | null }>(
      `select l.id, p.name, org.name as company
         from leads l
         join parties p on p.id = l.party_id
         left join parties org on org.id = p.parent_id
        where l.tenant_id = $1 and l.archived_at is null
          and (lower(p.name) like $2 or lower(coalesce(org.name,'')) like $2)
        limit $3`,
      [ctx.tenantId, like, limit],
    ),
    ctx.db.query<{ id: string; subject: string; reference: string }>(
      `select id, subject, reference from tickets
        where tenant_id = $1 and (lower(subject) like $2 or lower(reference) like $2) limit $3`,
      [ctx.tenantId, like, limit],
    ),
    ctx.db.query<{ id: string; reference: string; kind: string; grand_total: string }>(
      `select id, reference, kind, grand_total::text as grand_total from sales_documents
        where tenant_id = $1 and lower(reference) like $2 limit $3`,
      [ctx.tenantId, like, limit],
    ),
    ctx.db.query<{ id: string; full_name: string; employee_no: string }>(
      `select id, full_name, employee_no from hr_employees
        where tenant_id = $1 and archived_at is null
          and (lower(full_name) like $2 or lower(employee_no) like $2) limit $3`,
      [ctx.tenantId, like, limit],
    ),
    ctx.db.query<{ id: string; name: string; tag: string }>(
      `select id, name, tag from assets
        where tenant_id = $1 and archived_at is null
          and (lower(name) like $2 or lower(tag) like $2 or lower(coalesce(serial_number,'')) like $2) limit $3`,
      [ctx.tenantId, like, limit],
    ),
  ])

  return [
    ...leads.rows.map((row) => ({
      kind: 'lead',
      id: row.id,
      title: row.name,
      subtitle: row.company,
      url: `/app/crm?tab=leads&id=${row.id}`,
    })),
    ...tickets.rows.map((row) => ({
      kind: 'ticket',
      id: row.id,
      title: row.subject,
      subtitle: row.reference,
      url: `/app/support?tab=tickets&id=${row.id}`,
    })),
    ...documents.rows.map((row) => ({
      kind: 'sales_document',
      id: row.id,
      title: row.reference,
      subtitle: `${row.kind} · ${row.grand_total}`,
      url: `/app/pos?tab=documents&id=${row.id}`,
    })),
    ...employees.rows.map((row) => ({
      kind: 'employee',
      id: row.id,
      title: row.full_name,
      subtitle: row.employee_no,
      url: `/app/hr?tab=employees&id=${row.id}`,
    })),
    ...assets.rows.map((row) => ({
      kind: 'asset',
      id: row.id,
      title: row.name,
      subtitle: row.tag,
      url: `/app/assets?tab=register&id=${row.id}`,
    })),
  ]
}
