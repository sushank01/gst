import { conflict, forbidden, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { enqueue } from '../events/outbox.ts'
import { toCsv } from '../io/csv.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'
import { businessMinutesBetween, addBusinessMinutes, type Calendar } from './calendar.ts'
import { readSettings } from './settings.ts'

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

/**
 * Status behaviours that end a ticket's life.
 *
 * `behaviour` is the tenant's own word for what a status means, and the
 * validator accepts both of these as end states. Naming the set once is what
 * stops the transition engine, the dashboard and the SLA report disagreeing
 * about whether a ticket is still open — a disagreement the reader has no way
 * to detect, because each screen looks internally consistent.
 */
const TERMINAL_BEHAVIOURS = ['resolved', 'closed']

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
      /*
       * `created_at` is set explicitly from the request clock rather than left
       * to the column default. Otherwise the row is stamped by the DATABASE
       * clock while `first_response_at` comes from the APPLICATION clock, and
       * every first-response duration carries the skew between them — which
       * can make a response look like it arrived before the ticket did.
       */
      `insert into tickets
         (tenant_id, company_id, reference, subject, requester_party_id, requester_email, requester_name,
          status, priority, category, channel, team_id, tags, last_activity_at, created_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,'new',$8,$9,$10,$11,$12,$13,$14,$13,$13)
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

    const resolved = TERMINAL_BEHAVIOURS.includes(behaviour)
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
  channel?: string
  /** Any of these tags. The column is text[], so this is an overlap, not a LIKE. */
  tags?: string[]
  assigneeUserId?: string
  /**
   * "Nobody holds this" — inexpressible through `assigneeUserId`, and the
   * queue an agent picks work from. Doing it in the browser instead would
   * make the count beside the queue the count of the loaded page.
   */
  unassigned?: boolean
  requesterPartyId?: string
  /**
   * The requester's own address, matched exactly. `query` is NOT a substitute:
   * it also matches the subject, so anyone whose address appeared in somebody
   * else's subject line would see that ticket in "My requests".
   */
  requesterEmail?: string
  createdFrom?: Date
  createdTo?: Date
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
  if (options.channel) add('t.channel = $?', options.channel)
  if (options.tags?.length) add('t.tags && $?', options.tags)
  if (options.assigneeUserId) add('t.assignee_user_id = $?', options.assigneeUserId)
  if (options.unassigned) filters.push('t.assignee_user_id is null')
  if (options.requesterPartyId) add('t.requester_party_id = $?', options.requesterPartyId)
  if (options.requesterEmail) add('lower(t.requester_email) = lower($?)', options.requesterEmail)
  if (options.createdFrom) add('t.created_at >= $?', options.createdFrom)
  if (options.createdTo) add('t.created_at < $?', options.createdTo)
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
    actions: { kind?: string; type?: string; [key: string]: unknown }[]
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
        /*
         * `kind` is the stored shape: it is what the POST route validates,
         * what `createEscalationRule` checks against the list below, and what
         * the settings pane writes and reads back. This sweep used to look for
         * `type`, so every rule made through the product fell through all
         * three branches — the event row was still written and counted, so the
         * pane reported "fired N actions" for a sweep that had reassigned
         * nobody and raised no priority. `type` is still accepted for rows
         * written before that was true.
         */
        const kind = action.kind ?? action.type
        if (typeof kind !== 'string' || !kind) continue

        const { rowCount } = await ctx.db.query(
          `insert into escalation_events (tenant_id, rule_id, ticket_id, action, outcome, detail, occurred_at)
           values ($1,$2,$3,$4,'applied',$5,$6)
           on conflict (rule_id, ticket_id, action) do nothing`,
          [ctx.tenantId, rule.id, row.ticket_id, kind, JSON.stringify(action), ctx.now],
        )
        if (rowCount === 0) continue
        summary.fired += 1

        if (kind === 'raise_priority' && typeof action.priority === 'string') {
          await ctx.db.query('update tickets set priority = $2, version = version + 1 where id = $1', [
            row.ticket_id,
            action.priority,
          ])
        }
        if (kind === 'reassign' && typeof action.userId === 'string') {
          await ctx.db.query('update tickets set assignee_user_id = $2, version = version + 1 where id = $1', [
            row.ticket_id,
            action.userId,
          ])
        }
        if (kind === 'notify') {
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

/* ------------------------------ CSAT settings ----------------------------- */

/**
 * The satisfaction-survey configuration.
 *
 * It lives in the shared `app_settings` document rather than a table of its
 * own because nothing but this app reads it. The server holds the defaults so
 * the sweep and the pane that shows its pending count cannot disagree about
 * what "pending" means.
 */
export type CsatSettings = {
  sendOnResolve: boolean
  waitHours: number
  skipOlderDays: number
  lowScore: number
  slaWarnPercent: number
  portalUrl: string
}

export const CSAT_DEFAULTS: CsatSettings = {
  sendOnResolve: true,
  waitHours: 1,
  skipOlderDays: 14,
  lowScore: 3,
  slaWarnPercent: 75,
  portalUrl: '',
}

export async function csatSettings(ctx: TenantContext): Promise<CsatSettings> {
  const document = await readSettings(ctx, 'SUP', 'csat', CSAT_DEFAULTS)
  return document.value
}

/* --------------------------------- stats ---------------------------------- */

export type Breakdown = { slug: string; label: string; count: number }

export type SupportStats = {
  total: number
  open: number
  closed: number
  /** Tickets with at least one clock the sweep has marked breached. */
  slaBreached: number
  /**
   * Null when nobody has answered a survey. A mean of nothing is not zero, and
   * rendering it as one is the difference between "customers rate us 0" and
   * "we have not asked anybody yet".
   */
  csatAverage: string | null
  csatResponses: number
  byStatus: Breakdown[]
  byPriority: Breakdown[]
  byCategory: Breakdown[]
}

/**
 * Every figure the dashboard shows, computed in SQL over every ticket.
 *
 * The list endpoint cannot stand in for this: it is capped at 200 rows, and a
 * count taken from a page is a count of what happened to load.
 */
export async function supportStats(ctx: TenantContext): Promise<SupportStats> {
  ctx.require('record.read')

  const { rows: totals } = await ctx.db.query<{ total: string; closed: string }>(
    `select count(*)::text as total,
            count(*) filter (where o.behaviour = any($2))::text as closed
       from tickets t
       left join ticket_field_options o
              on o.tenant_id = t.tenant_id and o.field = 'status' and lower(o.slug) = lower(t.status)
      where t.tenant_id = $1`,
    [ctx.tenantId, TERMINAL_BEHAVIOURS],
  )
  const total = Number(totals[0].total)
  const closed = Number(totals[0].closed)

  const { rows: breaches } = await ctx.db.query<{ n: string }>(
    // Per ticket, not per clock: a ticket that missed both targets is one
    // breached ticket, not two.
    'select count(distinct ticket_id)::text as n from sla_instances where tenant_id = $1 and breached_at is not null',
    [ctx.tenantId],
  )

  const { rows: csat } = await ctx.db.query<{ average: string | null; n: string }>(
    `select round(avg(score)::numeric, 1)::text as average, count(*)::text as n
       from csat_responses where tenant_id = $1 and score is not null`,
    [ctx.tenantId],
  )

  const map = (rows: { slug: string | null; label: string | null; n: string }[], absent: string): Breakdown[] =>
    rows.map((row) => ({
      slug: row.slug ?? '',
      label: row.label ?? row.slug ?? absent,
      count: Number(row.n),
    }))

  // One statement per column. The column name is not interpolated, because a
  // query assembled at runtime has to be reasoned about every time it is read.
  const { rows: statuses } = await ctx.db.query<{ slug: string | null; label: string | null; n: string }>(
    `select t.status as slug, o.label as label, count(*)::text as n
       from tickets t
       left join ticket_field_options o
              on o.tenant_id = t.tenant_id and o.field = 'status' and lower(o.slug) = lower(t.status)
      where t.tenant_id = $1 group by t.status, o.label order by count(*) desc, t.status`,
    [ctx.tenantId],
  )
  const { rows: priorities } = await ctx.db.query<{ slug: string | null; label: string | null; n: string }>(
    `select t.priority as slug, o.label as label, count(*)::text as n
       from tickets t
       left join ticket_field_options o
              on o.tenant_id = t.tenant_id and o.field = 'priority' and lower(o.slug) = lower(t.priority)
      where t.tenant_id = $1 group by t.priority, o.label order by count(*) desc, t.priority`,
    [ctx.tenantId],
  )
  const { rows: categories } = await ctx.db.query<{ slug: string | null; label: string | null; n: string }>(
    `select t.category as slug, o.label as label, count(*)::text as n
       from tickets t
       left join ticket_field_options o
              on o.tenant_id = t.tenant_id and o.field = 'category' and lower(o.slug) = lower(t.category)
      where t.tenant_id = $1 group by t.category, o.label order by count(*) desc, t.category`,
    [ctx.tenantId],
  )

  return {
    total,
    open: total - closed,
    closed,
    slaBreached: Number(breaches[0].n),
    csatAverage: csat[0].average,
    csatResponses: Number(csat[0].n),
    byStatus: map(statuses, 'Unknown status'),
    byPriority: map(priorities, 'Unknown priority'),
    byCategory: map(categories, 'No category'),
  }
}

/* ------------------------------- SLA report -------------------------------- */

export type SlaComplianceRow = {
  priority: string
  label: string
  tickets: number
  firstResponseMet: number
  firstResponseBreached: number
  resolutionMet: number
  resolutionBreached: number
}

/**
 * SLA compliance by priority over a window.
 *
 * The two targets are counted from their own `sla_instances` rows, so
 * first-response and resolution are genuinely two measurements rather than one
 * number printed twice. A clock still running is counted as neither met nor
 * breached — it has not happened yet, and folding it into either column would
 * report an outcome that has not been reached.
 */
export async function slaCompliance(
  ctx: TenantContext,
  options: { from?: Date; to?: Date } = {},
): Promise<SlaComplianceRow[]> {
  ctx.require('record.read')

  const filters = ['t.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  if (options.from) {
    params.push(options.from)
    filters.push(`t.created_at >= $${params.length}`)
  }
  if (options.to) {
    params.push(options.to)
    filters.push(`t.created_at < $${params.length}`)
  }

  const { rows } = await ctx.db.query<{
    slug: string
    label: string | null
    tickets: string
    first_met: string
    first_breached: string
    res_met: string
    res_breached: string
  }>(
    `select t.priority as slug, o.label as label,
            count(*)::text as tickets,
            count(*) filter (where fr.satisfied_at is not null and fr.breached_at is null)::text as first_met,
            count(*) filter (where fr.breached_at is not null)::text as first_breached,
            count(*) filter (where rs.satisfied_at is not null and rs.breached_at is null)::text as res_met,
            count(*) filter (where rs.breached_at is not null)::text as res_breached
       from tickets t
       left join sla_instances fr on fr.ticket_id = t.id and fr.target = 'first_response'
       left join sla_instances rs on rs.ticket_id = t.id and rs.target = 'resolution'
       left join ticket_field_options o
              on o.tenant_id = t.tenant_id and o.field = 'priority' and lower(o.slug) = lower(t.priority)
      where ${filters.join(' and ')}
      group by t.priority, o.label
      order by count(*) desc, t.priority`,
    params as never[],
  )

  return rows.map((row) => ({
    priority: row.slug,
    label: row.label ?? row.slug,
    tickets: Number(row.tickets),
    firstResponseMet: Number(row.first_met),
    firstResponseBreached: Number(row.first_breached),
    resolutionMet: Number(row.res_met),
    resolutionBreached: Number(row.res_breached),
  }))
}

/* --------------------------------- CSAT ------------------------------------ */

export type CsatRow = {
  id: string
  ticketId: string
  reference: string
  subject: string
  score: number | null
  comment: string | null
  sentAt: string
  respondedAt: string | null
  reviewedAt: string | null
  reviewNote: string | null
}

export type CsatListResult = {
  rows: CsatRow[]
  total: number
  /**
   * The mean of every answered rating under this filter, or null when nobody
   * has answered. Computed here rather than averaged over `rows`, which is one
   * page: a report that means over whatever loaded is a report of the most
   * recent hundred answers wearing the name of all of them.
   */
  average: string | null
  /** Answers per score, over the whole filter — again, not over one page. */
  distribution: { score: number; count: number }[]
  /** Resolved tickets with no survey row yet, under this tenant's own settings. */
  pending: number
}

const mapCsat = (row: Record<string, unknown>): CsatRow => ({
  id: row.id as string,
  ticketId: row.ticket_id as string,
  reference: row.reference as string,
  subject: row.subject as string,
  score: (row.score as number) ?? null,
  comment: (row.comment as string) ?? null,
  sentAt: new Date(row.sent_at as string).toISOString(),
  respondedAt: row.responded_at ? new Date(row.responded_at as string).toISOString() : null,
  reviewedAt: row.reviewed_at ? new Date(row.reviewed_at as string).toISOString() : null,
  reviewNote: (row.review_note as string) ?? null,
})

/** The window a survey may still be sent in, from the tenant's own settings. */
function csatWindow(ctx: TenantContext, settings: CsatSettings): { readyBefore: Date; notOlderThan: Date } {
  return {
    readyBefore: new Date(ctx.now.getTime() - settings.waitHours * 3_600_000),
    notOlderThan: new Date(ctx.now.getTime() - settings.skipOlderDays * 86_400_000),
  }
}

export async function listCsat(
  ctx: TenantContext,
  options: { maxScore?: number; reviewed?: boolean; answeredOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<CsatListResult> {
  ctx.require('record.read')

  const filters = ['c.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.maxScore !== undefined) add('c.score <= $?', options.maxScore)
  if (options.answeredOnly) filters.push('c.score is not null')
  // `reviewed: false` is a filter, not an absence of one: the review queue is
  // exactly the rows nobody has written a follow-up on yet.
  if (options.reviewed === true) filters.push('c.reviewed_at is not null')
  if (options.reviewed === false) filters.push('c.reviewed_at is null')
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string; answered: string; average: string | null }>(
    `select count(*)::text as n,
            count(c.score)::text as answered,
            round(avg(c.score)::numeric, 1)::text as average
       from csat_responses c where ${where}`,
    params as never[],
  )

  // One row per score that has actually been given. A score nobody chose is
  // absent rather than present as a zero, and the caller fills the gaps.
  const { rows: spread } = await ctx.db.query<{ score: number; n: string }>(
    `select c.score as score, count(*)::text as n
       from csat_responses c where ${where} and c.score is not null
      group by c.score order by c.score desc`,
    params as never[],
  )

  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Record<string, unknown>>(
    `select c.*, t.reference, t.subject
       from csat_responses c join tickets t on t.id = c.ticket_id
      where ${where}
      order by c.responded_at desc nulls last, c.sent_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )

  const settings = await csatSettings(ctx)
  const { readyBefore, notOlderThan } = csatWindow(ctx, settings)
  const { rows: pending } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n
       from tickets t left join csat_responses c on c.ticket_id = t.id
      where t.tenant_id = $1 and t.resolved_at is not null and c.id is null
        and t.resolved_at <= $2 and t.resolved_at >= $3`,
    [ctx.tenantId, readyBefore, notOlderThan],
  )

  return {
    rows: rows.map(mapCsat),
    total: Number(counted[0].n),
    average: Number(counted[0].answered) ? counted[0].average : null,
    distribution: spread.map((row) => ({ score: Number(row.score), count: Number(row.n) })),
    pending: Number(pending[0].n),
  }
}

/**
 * Records that a low score was followed up.
 *
 * Without this the review queue's promise — that an entry stays until somebody
 * says what was done — cannot be kept, because nothing ever writes the columns
 * that would take it off the list.
 */
export async function reviewCsat(ctx: TenantContext, csatId: string, note?: string): Promise<CsatRow> {
  ctx.require('record.update')

  const { rows } = await ctx.db.query<Record<string, unknown>>(
    `update csat_responses set reviewed_by = $3, reviewed_at = $4, review_note = coalesce($5, review_note)
      where id = $1 and tenant_id = $2 returning id`,
    [csatId, ctx.tenantId, ctx.userId, ctx.now, note ?? null],
  )
  if (!rows[0]) throw notFound('That rating')

  await recordAudit(ctx.db, ctx, { action: 'support.csat_reviewed', resource: 'csat_response', resourceId: csatId })
  const { rows: full } = await ctx.db.query<Record<string, unknown>>(
    'select c.*, t.reference, t.subject from csat_responses c join tickets t on t.id = c.ticket_id where c.id = $1',
    [csatId],
  )
  return mapCsat(full[0])
}

/**
 * Queues a survey for every resolved ticket that has none.
 *
 * `sendCsat` is already idempotent per ticket; what did not exist was the
 * selection sweep over many. Surveys switched off is refused rather than
 * silently doing nothing — an administrator who turned them off and then
 * pressed this would otherwise be told surveys went out.
 */
export async function sendPendingCsat(ctx: TenantContext): Promise<{ eligible: number; queued: number }> {
  ctx.require('record.update')

  const settings = await csatSettings(ctx)
  if (!settings.sendOnResolve) {
    throw unprocessable('surveys_disabled', 'Surveys are switched off. Turn "Send survey on Resolve" on first.')
  }

  const { readyBefore, notOlderThan } = csatWindow(ctx, settings)
  const { rows } = await ctx.db.query<{ id: string }>(
    `select t.id from tickets t left join csat_responses c on c.ticket_id = t.id
      where t.tenant_id = $1 and t.resolved_at is not null and c.id is null
        and t.resolved_at <= $2 and t.resolved_at >= $3`,
    [ctx.tenantId, readyBefore, notOlderThan],
  )

  let queued = 0
  for (const row of rows) {
    if (await sendCsat(ctx, row.id)) queued += 1
  }
  return { eligible: rows.length, queued }
}

/* ------------------------------- auto-close -------------------------------- */

/** The status an auto-closed ticket lands in: the tenant's own closed state. */
async function closedStatusSlug(ctx: TenantContext): Promise<string | null> {
  const { rows } = await ctx.db.query<{ slug: string }>(
    `select slug from ticket_field_options
      where tenant_id = $1 and field = 'status' and behaviour = 'closed' and archived_at is null
      order by is_default desc, position, label limit 1`,
    [ctx.tenantId],
  )
  return rows[0]?.slug ?? null
}

/**
 * Settles resolved tickets that have sat past the survey window.
 *
 * Each one goes through `transitionTicket`, so the clocks, the event trail and
 * the audit record are the same as if an agent had closed it by hand. Writing
 * the status column directly would leave a ticket closed with a resolution
 * clock still running.
 */
export async function autoCloseResolved(ctx: TenantContext): Promise<{ closed: number; status: string }> {
  ctx.require('record.update')

  const status = await closedStatusSlug(ctx)
  if (!status) {
    throw unprocessable(
      'no_closed_status',
      'No status is marked as a closed state. Add one under Ticket fields before running auto-close.',
    )
  }

  const settings = await csatSettings(ctx)
  const cutoff = new Date(ctx.now.getTime() - settings.skipOlderDays * 86_400_000)
  const { rows } = await ctx.db.query<{ id: string; version: number }>(
    `select id, version from tickets
      where tenant_id = $1 and resolved_at is not null and resolved_at < $2 and status <> $3`,
    [ctx.tenantId, cutoff, status],
  )

  let closed = 0
  for (const row of rows) {
    await transitionTicket(ctx, row.id, { status, version: row.version, note: 'Closed automatically after the survey window.' })
    closed += 1
  }
  return { closed, status }
}

/* --------------------------------- export ---------------------------------- */

/**
 * Tickets as CSV.
 *
 * Built from the same filtered query the list uses, so the file and the screen
 * that offered it describe the same rows. Values a spreadsheet would execute
 * are neutralised by `toCsv`.
 */
export async function exportTicketsCsv(ctx: TenantContext, options: ListTicketOptions = {}): Promise<string> {
  ctx.require('record.export')

  // Paged to exhaustion rather than taking one page: a file that silently
  // stops at the list's limit is a report of the first 200 tickets wearing the
  // name of a report of all of them.
  const all: TicketRow[] = []
  let total = Infinity
  while (all.length < total) {
    const page = await listTickets(ctx, { ...options, limit: 200, offset: all.length })
    total = page.total
    if (!page.rows.length) break
    all.push(...page.rows)
  }

  return toCsv(all, [
    { header: 'Reference', value: (row) => row.reference },
    { header: 'Subject', value: (row) => row.subject },
    { header: 'Status', value: (row) => row.status },
    { header: 'Priority', value: (row) => row.priority },
    { header: 'Category', value: (row) => row.category },
    { header: 'Channel', value: (row) => row.channel },
    { header: 'Requester', value: (row) => row.requesterEmail },
    { header: 'Tags', value: (row) => row.tags.join(' ') },
    { header: 'Opened at', value: (row) => row.createdAt },
    { header: 'First response at', value: (row) => row.firstResponseAt },
    { header: 'Resolved at', value: (row) => row.resolvedAt },
  ])
}
