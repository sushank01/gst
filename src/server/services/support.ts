import { conflict, forbidden, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { enqueue } from '../events/outbox.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'
import { businessMinutesBetween, addBusinessMinutes, type Calendar } from './calendar.ts'

/**
 * Support ticketing.
 *
 * The prototype had a ticket row and a list. Missing were the three things that
 * make it a helpdesk: a thread with a public/internal boundary, a status model
 * that drives an SLA clock, and escalation that actually fires. All three are
 * here, and the SLA measures *business* minutes — a four-hour target started at
 * 17:00 on Friday is not breached at 21:00.
 */

export type TicketRow = {
  id: string
  reference: string
  subject: string
  status: string
  priority: string
  category: string | null
  channel: string
  assigneeUserId: string | null
  requesterEmail: string | null
  requesterName: string | null
  tags: string[]
  lastActivityAt: string
  firstResponseAt: string | null
  resolvedAt: string | null
  version: number
  createdAt: string
}

const mapTicket = (row: Record<string, unknown>): TicketRow => ({
  id: row.id as string,
  reference: row.reference as string,
  subject: row.subject as string,
  status: row.status as string,
  priority: row.priority as string,
  category: (row.category as string) ?? null,
  channel: row.channel as string,
  assigneeUserId: (row.assignee_user_id as string) ?? null,
  requesterEmail: (row.requester_email as string) ?? null,
  requesterName: (row.requester_name as string) ?? null,
  tags: (row.tags as string[]) ?? [],
  lastActivityAt: new Date(row.last_activity_at as string).toISOString(),
  firstResponseAt: row.first_response_at ? new Date(row.first_response_at as string).toISOString() : null,
  resolvedAt: row.resolved_at ? new Date(row.resolved_at as string).toISOString() : null,
  version: row.version as number,
  createdAt: new Date(row.created_at as string).toISOString(),
})

async function nextReference(tx: Db, ctx: TenantContext): Promise<string> {
  const { rows } = await tx.query<{ next_value: string; padding: number }>(
    `insert into document_sequences (tenant_id, company_id, kind, prefix, next_value)
     values ($1, null, 'ticket', 'TCK', 2)
     on conflict (tenant_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), kind)
     do update set next_value = document_sequences.next_value + 1, updated_at = now()
     returning (case when document_sequences.next_value = 2 then 1 else document_sequences.next_value - 1 end)::text as next_value, padding`,
    [ctx.tenantId],
  )
  return `TCK-${(rows[0]?.next_value ?? '1').padStart(rows[0]?.padding ?? 4, '0')}`
}

/** Statuses whose behaviour pauses an SLA clock, read from the tenant's own vocabulary. */
async function statusBehaviour(db: Db, tenantId: string, status: string): Promise<string> {
  const { rows } = await db.query<{ behaviour: string | null }>(
    `select behaviour from ticket_field_options
      where tenant_id = $1 and field = 'status' and lower(slug) = lower($2)`,
    [tenantId, status],
  )
  return rows[0]?.behaviour ?? 'active'
}

async function loadCalendar(db: Db, tenantId: string, calendarId?: string | null): Promise<Calendar | null> {
  // Two different queries rather than one with a padded parameter list: an
  // unreferenced placeholder has no type for the planner to infer.
  const { rows } = calendarId
    ? await db.query<{ id: string; timezone: string }>(
        'select id, timezone from business_calendars where id = $1 and tenant_id = $2',
        [calendarId, tenantId],
      )
    : await db.query<{ id: string; timezone: string }>(
        'select id, timezone from business_calendars where tenant_id = $1 and is_default limit 1',
        [tenantId],
      )
  if (!rows[0]) return null
  const { rows: hours } = await db.query<{ weekday: number; opens_minute: number; closes_minute: number }>(
    'select weekday, opens_minute, closes_minute from business_hours where calendar_id = $1',
    [rows[0].id],
  )
  const { rows: holidays } = await db.query<{ observed_on: string }>(
    'select observed_on::text as observed_on from business_holidays where calendar_id = $1',
    [rows[0].id],
  )
  return {
    timezone: rows[0].timezone,
    hours: hours.map((h) => ({ weekday: h.weekday, opensMinute: h.opens_minute, closesMinute: h.closes_minute })),
    holidays: new Set(holidays.map((h) => h.observed_on)),
  }
}

export type CreateTicketInput = {
  subject: string
  body: string
  requesterEmail?: string | null
  requesterName?: string | null
  requesterPartyId?: string | null
  priority?: string
  category?: string | null
  channel?: string
  teamId?: string | null
  tags?: string[]
  /** Set for email intake, so a redelivery threads instead of duplicating. */
  externalMessageId?: string | null
}

/**
 * Creates a ticket, its opening message and its SLA clocks in one transaction.
 *
 * An inbound message that has been seen before returns the existing ticket
 * rather than creating a second one — mail servers retry, and a duplicate
 * ticket per retry is the classic helpdesk failure.
 */
export async function createTicket(ctx: TenantContext, input: CreateTicketInput): Promise<TicketRow> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    if (input.externalMessageId) {
      const { rows } = await tx.query<{ ticket_id: string }>(
        'select ticket_id from ticket_messages where tenant_id = $1 and external_message_id = $2',
        [ctx.tenantId, input.externalMessageId],
      )
      if (rows[0]) {
        const existing = await tx.query('select * from tickets where id = $1', [rows[0].ticket_id])
        return mapTicket(existing.rows[0])
      }
    }

    const reference = await nextReference(tx, ctx)
    const priority = input.priority ?? 'medium'
    const { rows } = await tx.query(
      `insert into tickets
         (tenant_id, company_id, reference, subject, requester_party_id, requester_email, requester_name,
          status, priority, category, channel, team_id, tags, last_activity_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,'new',$8,$9,$10,$11,$12,$13,$14)
       returning *`,
      [
        ctx.tenantId,
        ctx.companyId,
        reference,
        input.subject.trim(),
        input.requesterPartyId ?? null,
        input.requesterEmail?.trim().toLowerCase() ?? null,
        input.requesterName ?? null,
        priority,
        input.category ?? null,
        input.channel ?? 'web',
        input.teamId ?? null,
        input.tags ?? [],
        ctx.now,
        ctx.userId,
      ],
    )
    const ticket = mapTicket(rows[0])

    await tx.query(
      `insert into ticket_messages (tenant_id, ticket_id, visibility, author_kind, author_user_id, author_email, body, external_message_id, created_at)
       values ($1,$2,'public',$3,$4,$5,$6,$7,$8)`,
      [
        ctx.tenantId,
        ticket.id,
        input.channel === 'email' ? 'requester' : 'agent',
        ctx.userId,
        input.requesterEmail ?? null,
        input.body,
        input.externalMessageId ?? null,
        ctx.now,
      ],
    )

    await startSlaClocks(tx, ctx, ticket.id, priority)
    await recordAudit(tx, ctx, {
      action: 'support.ticket_created',
      resource: 'ticket',
      resourceId: ticket.id,
      detail: { reference, priority, channel: input.channel ?? 'web' },
    })
    return ticket
  })
}

/** Starts a clock per target from the matching policy, or the priority defaults. */
async function startSlaClocks(tx: Db, ctx: TenantContext, ticketId: string, priority: string): Promise<void> {
  const { rows: policies } = await tx.query<{
    id: string
    calendar_id: string | null
    first_response_minutes: number | null
    resolution_minutes: number | null
  }>(
    `select id, calendar_id, first_response_minutes, resolution_minutes
       from sla_policies where tenant_id = $1 and active
       order by (applies_to->>'priority' = $2) desc nulls last limit 1`,
    [ctx.tenantId, priority],
  )
  let policy = policies[0]

  if (!policy) {
    const { rows: defaults } = await tx.query<{ first_response_minutes: number | null; resolution_minutes: number | null }>(
      `select first_response_minutes, resolution_minutes from ticket_field_options
        where tenant_id = $1 and field = 'priority' and lower(slug) = lower($2)`,
      [ctx.tenantId, priority],
    )
    if (!defaults[0]) return
    policy = { id: '', calendar_id: null, ...defaults[0] }
  }

  const calendar = await loadCalendar(tx, ctx.tenantId, policy.calendar_id)
  const targets: [string, number | null][] = [
    ['first_response', policy.first_response_minutes],
    ['resolution', policy.resolution_minutes],
  ]
  for (const [target, minutes] of targets) {
    if (!minutes) continue
    const due = calendar ? addBusinessMinutes(ctx.now, minutes, calendar) : new Date(ctx.now.getTime() + minutes * 60_000)
    await tx.query(
      `insert into sla_instances (tenant_id, ticket_id, policy_id, target, started_at, due_at)
       values ($1,$2,$3,$4,$5,$6) on conflict (ticket_id, target) do nothing`,
      [ctx.tenantId, ticketId, policy.id || null, target, ctx.now, due],
    )
  }
}

export type ReplyInput = {
  body: string
  visibility: 'public' | 'internal'
  externalMessageId?: string | null
}

/**
 * Adds a message to the thread.
 *
 * A public reply from an agent satisfies the first-response clock; an internal
 * note does not, because the requester never saw it. Conflating the two is how
 * a helpdesk reports a response time it did not achieve.
 */
export async function replyToTicket(ctx: TenantContext, ticketId: string, input: ReplyInput): Promise<{ messageId: string }> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; first_response_at: Date | null; status: string }>(
      'select id, first_response_at, status from tickets where id = $1 and tenant_id = $2 for update',
      [ticketId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That ticket')

    if (input.externalMessageId) {
      const { rows: seen } = await tx.query<{ id: string }>(
        'select id from ticket_messages where tenant_id = $1 and external_message_id = $2',
        [ctx.tenantId, input.externalMessageId],
      )
      if (seen[0]) return { messageId: seen[0].id }
    }

    const { rows: message } = await tx.query<{ id: string }>(
      `insert into ticket_messages (tenant_id, ticket_id, visibility, author_kind, author_user_id, body, external_message_id, created_at)
       values ($1,$2,$3,'agent',$4,$5,$6,$7) returning id`,
      [ctx.tenantId, ticketId, input.visibility, ctx.userId, input.body, input.externalMessageId ?? null, ctx.now],
    )

    await tx.query('update tickets set last_activity_at = $2, version = version + 1, updated_at = $2 where id = $1', [
      ticketId,
      ctx.now,
    ])

    if (input.visibility === 'public' && !rows[0].first_response_at) {
      await tx.query('update tickets set first_response_at = $2 where id = $1', [ticketId, ctx.now])
      await tx.query(
        `update sla_instances set satisfied_at = $2
          where ticket_id = $1 and target = 'first_response' and satisfied_at is null`,
        [ticketId, ctx.now],
      )
    }

    await recordAudit(tx, ctx, {
      action: input.visibility === 'internal' ? 'support.note_added' : 'support.reply_sent',
      resource: 'ticket',
      resourceId: ticketId,
    })
    return { messageId: message[0].id }
  })
}

/**
 * Returns the thread, filtered by what the viewer may see.
 *
 * `includeInternal` is decided by the caller's role, not by a query parameter —
 * a portal request must not be able to ask for internal notes.
 */
export async function listMessages(
  ctx: TenantContext,
  ticketId: string,
  options: { includeInternal: boolean },
): Promise<{ id: string; visibility: string; body: string; authorKind: string; createdAt: string }[]> {
  ctx.require('record.read')
  const { rows: ticket } = await ctx.db.query('select id from tickets where id = $1 and tenant_id = $2', [ticketId, ctx.tenantId])
  if (!ticket[0]) throw notFound('That ticket')

  const { rows } = await ctx.db.query<{
    id: string
    visibility: string
    body: string
    author_kind: string
    created_at: Date
  }>(
    `select id, visibility, body, author_kind, created_at from ticket_messages
      where ticket_id = $1 and tenant_id = $2 and ($3 or visibility = 'public')
      order by created_at`,
    [ticketId, ctx.tenantId, options.includeInternal],
  )
  return rows.map((row) => ({
    id: row.id,
    visibility: row.visibility,
    body: row.body,
    authorKind: row.author_kind,
    createdAt: new Date(row.created_at).toISOString(),
  }))
}

export type TransitionInput = { status: string; version: number; note?: string }

/**
 * Moves a ticket between statuses and keeps the SLA clocks honest.
 *
 * Waiting on the customer pauses the resolution clock; coming back resumes it
 * with the paused time excluded. Resolving satisfies it; reopening starts a new
 * one rather than reviving a breached clock.
 */
export async function transitionTicket(ctx: TenantContext, ticketId: string, input: TransitionInput): Promise<TicketRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Record<string, unknown>>(
      'select * from tickets where id = $1 and tenant_id = $2 for update',
      [ticketId, ctx.tenantId],
    )
    const ticket = rows[0]
    if (!ticket) throw notFound('That ticket')
    if ((ticket.version as number) !== input.version) {
      throw conflict('Someone else changed this ticket.', ticket.version as number)
    }
    const from = ticket.status as string
    if (from === input.status) return mapTicket(ticket)

    const behaviour = await statusBehaviour(tx, ctx.tenantId, input.status)
    const previousBehaviour = await statusBehaviour(tx, ctx.tenantId, from)

    const resolved = behaviour === 'closed'
    await tx.query(
      `update tickets
          set status = $2,
              resolved_at = case when $3 then coalesce(resolved_at, $4) else null end,
              reopened_count = case when resolved_at is not null and not $3 then reopened_count + 1 else reopened_count end,
              last_activity_at = $4, version = version + 1, updated_at = $4
        where id = $1`,
      [ticketId, input.status, resolved, ctx.now],
    )

    if (behaviour === 'waiting' && previousBehaviour !== 'waiting') {
      await tx.query(
        `update sla_instances set paused_at = $2
          where ticket_id = $1 and target = 'resolution' and satisfied_at is null and breached_at is null and paused_at is null`,
        [ticketId, ctx.now],
      )
    }
    if (previousBehaviour === 'waiting' && behaviour !== 'waiting') {
      // Push the deadline out by exactly the time spent waiting.
      await tx.query(
        `update sla_instances
            set paused_ms = paused_ms + (extract(epoch from ($2::timestamptz - paused_at)) * 1000)::bigint,
                due_at = due_at + ($2::timestamptz - paused_at),
                paused_at = null
          where ticket_id = $1 and target = 'resolution' and paused_at is not null`,
        [ticketId, ctx.now],
      )
    }
    if (resolved) {
      await tx.query(
        `update sla_instances set satisfied_at = $2
          where ticket_id = $1 and target = 'resolution' and satisfied_at is null and breached_at is null`,
        [ticketId, ctx.now],
      )
    }

    await tx.query(
      `insert into ticket_events (tenant_id, ticket_id, kind, from_value, to_value, actor_user_id, occurred_at)
       values ($1,$2,'status',$3,$4,$5,$6)`,
      [ctx.tenantId, ticketId, from, input.status, ctx.userId, ctx.now],
    )
    await recordAudit(tx, ctx, {
      action: 'support.ticket_transitioned',
      resource: 'ticket',
      resourceId: ticketId,
      detail: { from, to: input.status, note: input.note },
    })

    const { rows: after } = await tx.query('select * from tickets where id = $1', [ticketId])
    return mapTicket(after[0])
  })
}

export type ListTicketOptions = {
  /** A single ticket, so the detail view is the list query with one filter. */
  ticketId?: string
  query?: string
  status?: string
  priority?: string
  assigneeUserId?: string
  requesterPartyId?: string
  limit?: number
  offset?: number
}

export async function listTickets(ctx: TenantContext, options: ListTicketOptions = {}): Promise<{ rows: TicketRow[]; total: number }> {
  ctx.require('record.read')
  const filters = ['t.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.ticketId) add('t.id = $?', options.ticketId)
  if (options.status) add('t.status = $?', options.status)
  if (options.priority) add('t.priority = $?', options.priority)
  if (options.assigneeUserId) add('t.assignee_user_id = $?', options.assigneeUserId)
  if (options.requesterPartyId) add('t.requester_party_id = $?', options.requesterPartyId)
  if (options.query?.trim()) {
    params.push(`%${options.query.trim().toLowerCase()}%`)
    filters.push(`(lower(t.subject) like $${params.length} or lower(t.reference) like $${params.length}
                   or lower(coalesce(t.requester_email,'')) like $${params.length})`)
  }
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from tickets t where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Record<string, unknown>>(
    `select t.* from tickets t where ${where} order by t.last_activity_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return { total: Number(counted[0].n), rows: rows.map(mapTicket) }
}

/**
 * Fires escalation rules for clocks that have passed their boundary.
 *
 * `escalation_once_key` means a rule fires once per ticket per action however
 * often the sweep runs, so a dispatcher retry does not reassign a ticket twice
 * or send a duplicate alert.
 */
export async function runEscalations(ctx: TenantContext): Promise<{ fired: number; breached: number }> {
  const summary = { fired: 0, breached: 0 }

  const { rowCount: breached } = await ctx.db.query(
    `update sla_instances set breached_at = $2
      where tenant_id = $1 and satisfied_at is null and breached_at is null and paused_at is null and due_at <= $2`,
    [ctx.tenantId, ctx.now],
  )
  summary.breached = breached

  const { rows: rules } = await ctx.db.query<{
    id: string
    trigger_target: string
    offset_minutes: number
    actions: { type: string; [key: string]: unknown }[]
  }>('select id, trigger_target, offset_minutes, actions from escalation_rules where tenant_id = $1 and active', [
    ctx.tenantId,
  ])

  for (const rule of rules) {
    const { rows: due } = await ctx.db.query<{ ticket_id: string }>(
      `select s.ticket_id from sla_instances s
         join tickets t on t.id = s.ticket_id
        where s.tenant_id = $1 and s.target = $2 and s.satisfied_at is null
          and s.due_at + ($3 || ' minutes')::interval <= $4
          and t.resolved_at is null`,
      [ctx.tenantId, rule.trigger_target, String(rule.offset_minutes), ctx.now],
    )

    for (const row of due) {
      for (const action of rule.actions ?? []) {
        const { rowCount } = await ctx.db.query(
          `insert into escalation_events (tenant_id, rule_id, ticket_id, action, outcome, detail, occurred_at)
           values ($1,$2,$3,$4,'applied',$5,$6)
           on conflict (rule_id, ticket_id, action) do nothing`,
          [ctx.tenantId, rule.id, row.ticket_id, action.type, JSON.stringify(action), ctx.now],
        )
        if (rowCount === 0) continue
        summary.fired += 1

        if (action.type === 'raise_priority' && typeof action.priority === 'string') {
          await ctx.db.query('update tickets set priority = $2, version = version + 1 where id = $1', [
            row.ticket_id,
            action.priority,
          ])
        }
        if (action.type === 'reassign' && typeof action.userId === 'string') {
          await ctx.db.query('update tickets set assignee_user_id = $2, version = version + 1 where id = $1', [
            row.ticket_id,
            action.userId,
          ])
        }
        if (action.type === 'notify') {
          await enqueue(
            ctx.db,
            {
              tenantId: ctx.tenantId,
              topic: 'support.escalation',
              payload: { ticketId: row.ticket_id, ruleId: rule.id },
              idempotencyKey: `escalation:${rule.id}:${row.ticket_id}`,
            },
            ctx.now,
          )
        }
      }
    }
  }
  return summary
}

/** Time actually spent on a ticket, excluding paused periods. */
export async function slaStatus(
  ctx: TenantContext,
  ticketId: string,
): Promise<{ target: string; dueAt: string; breached: boolean; satisfied: boolean; remainingMinutes: number | null }[]> {
  const { rows } = await ctx.db.query<{
    target: string
    due_at: Date
    breached_at: Date | null
    satisfied_at: Date | null
    paused_at: Date | null
    policy_id: string | null
  }>(
    'select target, due_at, breached_at, satisfied_at, paused_at, policy_id from sla_instances where ticket_id = $1 and tenant_id = $2',
    [ticketId, ctx.tenantId],
  )
  const calendar = await loadCalendar(ctx.db, ctx.tenantId, null)
  return rows.map((row) => ({
    target: row.target,
    dueAt: new Date(row.due_at).toISOString(),
    breached: Boolean(row.breached_at),
    satisfied: Boolean(row.satisfied_at),
    remainingMinutes:
      row.satisfied_at || row.breached_at || row.paused_at
        ? null
        : calendar
          ? businessMinutesBetween(ctx.now, new Date(row.due_at), calendar)
          : Math.round((new Date(row.due_at).getTime() - ctx.now.getTime()) / 60_000),
  }))
}

export async function assignTicket(ctx: TenantContext, ticketId: string, userId: string | null, version: number): Promise<void> {
  ctx.require('record.update')
  if (userId) {
    const { rows } = await ctx.db.query('select 1 from memberships where tenant_id = $1 and user_id = $2 and status = $3', [
      ctx.tenantId,
      userId,
      'active',
    ])
    // Assigning outside the workspace would silently hide the ticket from
    // everyone who can see it.
    if (!rows.length) throw forbidden('That person is not a member of this workspace.')
  }
  const { rowCount } = await ctx.db.query(
    'update tickets set assignee_user_id = $2, version = version + 1, updated_at = $4 where id = $1 and tenant_id = $5 and version = $3',
    [ticketId, userId, version, ctx.now, ctx.tenantId],
  )
  if (!rowCount) throw conflict('Someone else changed this ticket.')
  await recordAudit(ctx.db, ctx, { action: 'support.ticket_assigned', resource: 'ticket', resourceId: ticketId, detail: { userId } })
}

export async function sendCsat(ctx: TenantContext, ticketId: string): Promise<{ token: string } | null> {
  const { rows } = await ctx.db.query<{ resolved_at: Date | null }>(
    'select resolved_at from tickets where id = $1 and tenant_id = $2',
    [ticketId, ctx.tenantId],
  )
  if (!rows[0]) throw notFound('That ticket')
  if (!rows[0].resolved_at) throw unprocessable('not_resolved', 'A survey is only sent once a ticket is resolved.')

  const { newToken, hashToken } = await import('../auth/session.ts')
  const token = newToken()
  // One survey per ticket: resolve → reopen → resolve must not send three.
  const { rowCount } = await ctx.db.query(
    `insert into csat_responses (tenant_id, ticket_id, token_hash, sent_at)
     values ($1,$2,$3,$4) on conflict (ticket_id) do nothing`,
    [ctx.tenantId, ticketId, hashToken(token), ctx.now],
  )
  if (!rowCount) return null
  await enqueue(
    ctx.db,
    { tenantId: ctx.tenantId, topic: 'support.csat', payload: { ticketId, token }, idempotencyKey: `csat:${ticketId}` },
    ctx.now,
  )
  return { token }
}
