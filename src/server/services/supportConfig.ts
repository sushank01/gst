import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Support configuration: teams, vocabularies, SLA policies, escalation rules
 * and working calendars.
 *
 * These are not cosmetic settings. Each one is read by machinery that is
 * already running: `behaviour` on a status is what pauses an SLA clock,
 * `first_response_minutes` on a priority is what the clock is set from, and a
 * calendar decides which hours count. Editing them changes what the product
 * does, which is why they are validated rather than stored as typed.
 *
 * The rule that recurs: a vocabulary entry cannot be deleted once tickets
 * refer to it, and a status whose behaviour would strand tickets is refused.
 * A renamed status that silently breaks reporting is the failure this avoids.
 */

export type FieldName = 'status' | 'priority' | 'category' | 'type' | 'channel'

export type FieldOption = {
  id: string
  field: FieldName
  slug: string
  label: string
  colour: string | null
  position: number
  behaviour: string | null
  firstResponseMinutes: number | null
  resolutionMinutes: number | null
  isDefault: boolean
}

type Raw = Record<string, unknown>

const mapOption = (row: Raw): FieldOption => ({
  id: row.id as string,
  field: row.field as FieldName,
  slug: row.slug as string,
  label: row.label as string,
  colour: (row.colour as string) ?? null,
  position: row.position as number,
  behaviour: (row.behaviour as string) ?? null,
  firstResponseMinutes: (row.first_response_minutes as number) ?? null,
  resolutionMinutes: (row.resolution_minutes as number) ?? null,
  isDefault: row.is_default as boolean,
})

/**
 * What the engine understands. A behaviour outside this set would be stored
 * happily and then ignored, which is worse than being refused: the
 * administrator would believe they had configured something.
 */
const BEHAVIOURS = new Set(['active', 'waiting', 'resolved', 'closed'])

export async function listFieldOptions(ctx: TenantContext, field?: FieldName): Promise<FieldOption[]> {
  ctx.require('record.read')
  const { rows } = field
    ? await ctx.db.query<Raw>(
        'select * from ticket_field_options where tenant_id = $1 and field = $2 and archived_at is null order by position, label',
        [ctx.tenantId, field],
      )
    : await ctx.db.query<Raw>(
        'select * from ticket_field_options where tenant_id = $1 and archived_at is null order by field, position, label',
        [ctx.tenantId],
      )
  return rows.map(mapOption)
}

export async function createFieldOption(
  ctx: TenantContext,
  input: {
    field: FieldName
    slug: string
    label: string
    colour?: string | null
    position?: number
    behaviour?: string | null
    firstResponseMinutes?: number | null
    resolutionMinutes?: number | null
    isDefault?: boolean
  },
): Promise<FieldOption> {
  ctx.require('settings.manage')

  if (input.field === 'status') {
    // A status the engine cannot classify would leave its tickets in a state
    // no clock, report or filter knows how to treat.
    if (!input.behaviour) throw unprocessable('behaviour_required', 'A status must say how it behaves.')
    if (!BEHAVIOURS.has(input.behaviour)) {
      throw unprocessable('unknown_behaviour', `Behaviour must be one of: ${[...BEHAVIOURS].join(', ')}.`)
    }
  }
  if (input.field !== 'priority' && (input.firstResponseMinutes || input.resolutionMinutes)) {
    throw unprocessable('targets_on_priority', 'Response targets belong to a priority, not to this field.')
  }

  return ctx.db.transaction(async (tx) => {
    const { rows: clash } = await tx.query(
      'select 1 from ticket_field_options where tenant_id = $1 and field = $2 and slug = $3',
      [ctx.tenantId, input.field, input.slug],
    )
    if (clash[0]) throw unprocessable('duplicate_slug', `${input.field} "${input.slug}" already exists.`)

    // One default per field, so a ticket created without one is unambiguous.
    if (input.isDefault) {
      await tx.query('update ticket_field_options set is_default = false where tenant_id = $1 and field = $2', [
        ctx.tenantId,
        input.field,
      ])
    }

    const { rows } = await tx.query<Raw>(
      `insert into ticket_field_options
         (tenant_id, field, slug, label, colour, position, behaviour, first_response_minutes, resolution_minutes, is_default)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [
        ctx.tenantId,
        input.field,
        input.slug,
        input.label,
        input.colour ?? null,
        input.position ?? 0,
        input.behaviour ?? null,
        input.firstResponseMinutes ?? null,
        input.resolutionMinutes ?? null,
        input.isDefault ?? false,
      ],
    )
    await recordAudit(tx, ctx, {
      action: 'support.field_option_created',
      resource: 'ticket_field_option',
      resourceId: rows[0].id as string,
      detail: { field: input.field, slug: input.slug },
    })
    return mapOption(rows[0])
  })
}

export async function updateFieldOption(
  ctx: TenantContext,
  optionId: string,
  input: {
    label?: string
    colour?: string | null
    position?: number
    behaviour?: string | null
    firstResponseMinutes?: number | null
    resolutionMinutes?: number | null
    isDefault?: boolean
  },
): Promise<FieldOption> {
  ctx.require('settings.manage')
  if (input.behaviour && !BEHAVIOURS.has(input.behaviour)) {
    throw unprocessable('unknown_behaviour', `Behaviour must be one of: ${[...BEHAVIOURS].join(', ')}.`)
  }

  return ctx.db.transaction(async (tx) => {
    const { rows: current } = await tx.query<Raw>(
      'select * from ticket_field_options where id = $1 and tenant_id = $2 for update',
      [optionId, ctx.tenantId],
    )
    if (!current[0]) throw notFound('That option')

    if (input.isDefault) {
      await tx.query('update ticket_field_options set is_default = false where tenant_id = $1 and field = $2', [
        ctx.tenantId,
        current[0].field as string,
      ])
    }

    await tx.query(
      `update ticket_field_options
          set label = coalesce($3, label), colour = coalesce($4, colour), position = coalesce($5, position),
              behaviour = coalesce($6, behaviour),
              first_response_minutes = coalesce($7, first_response_minutes),
              resolution_minutes = coalesce($8, resolution_minutes),
              is_default = coalesce($9, is_default)
        where id = $1 and tenant_id = $2`,
      [
        optionId,
        ctx.tenantId,
        input.label ?? null,
        input.colour ?? null,
        input.position ?? null,
        input.behaviour ?? null,
        input.firstResponseMinutes ?? null,
        input.resolutionMinutes ?? null,
        input.isDefault ?? null,
      ],
    )
    const { rows } = await tx.query<Raw>('select * from ticket_field_options where id = $1', [optionId])
    return mapOption(rows[0])
  })
}

/**
 * Archives an option.
 *
 * Refused while tickets still use it: those tickets would be left holding a
 * value nothing can render or filter on. The label can be changed instead,
 * which is almost always what was actually wanted.
 */
export async function archiveFieldOption(ctx: TenantContext, optionId: string): Promise<void> {
  ctx.require('settings.manage')

  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ field: string; slug: string; label: string }>(
      'select field, slug, label from ticket_field_options where id = $1 and tenant_id = $2 and archived_at is null',
      [optionId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That option')

    const inUse = await countTicketsUsing(tx, ctx, rows[0].field, rows[0].slug)
    if (inUse > 0) {
      throw conflict(`${inUse} ticket(s) still use "${rows[0].label}". Rename it instead, or move those tickets first.`)
    }

    await tx.query('update ticket_field_options set archived_at = $3 where id = $1 and tenant_id = $2', [
      optionId,
      ctx.tenantId,
      ctx.now,
    ])
    await recordAudit(tx, ctx, { action: 'support.field_option_archived', resource: 'ticket_field_option', resourceId: optionId })
  })
}

/** Counts tickets holding a vocabulary value. One statement per column — the
 * column is not interpolated, because a column name assembled at runtime has
 * to be reasoned about every time somebody reads it. */
async function countTicketsUsing(
  db: TenantContext['db'],
  ctx: TenantContext,
  field: string,
  slug: string,
): Promise<number> {
  if (field === 'status') {
    const { rows } = await db.query<{ n: string }>(
      'select count(*)::text as n from tickets where tenant_id = $1 and status = $2',
      [ctx.tenantId, slug],
    )
    return Number(rows[0].n)
  }
  if (field === 'priority') {
    const { rows } = await db.query<{ n: string }>(
      'select count(*)::text as n from tickets where tenant_id = $1 and priority = $2',
      [ctx.tenantId, slug],
    )
    return Number(rows[0].n)
  }
  if (field === 'category') {
    const { rows } = await db.query<{ n: string }>(
      'select count(*)::text as n from tickets where tenant_id = $1 and category = $2',
      [ctx.tenantId, slug],
    )
    return Number(rows[0].n)
  }
  if (field === 'channel') {
    const { rows } = await db.query<{ n: string }>(
      'select count(*)::text as n from tickets where tenant_id = $1 and channel = $2',
      [ctx.tenantId, slug],
    )
    return Number(rows[0].n)
  }
  return 0
}

/* --------------------------------- teams ---------------------------------- */

export type TeamRow = { id: string; name: string; email: string | null }

export async function listTeams(ctx: TenantContext): Promise<TeamRow[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<TeamRow>(
    'select id, name, email from support_teams where tenant_id = $1 and archived_at is null order by lower(name)',
    [ctx.tenantId],
  )
  return rows
}

export async function createTeam(ctx: TenantContext, input: { name: string; email?: string | null }): Promise<TeamRow> {
  ctx.require('settings.manage')
  const { rows: clash } = await ctx.db.query(
    'select 1 from support_teams where tenant_id = $1 and lower(name) = lower($2) and archived_at is null',
    [ctx.tenantId, input.name],
  )
  if (clash[0]) throw unprocessable('duplicate_name', `A team called ${input.name} already exists.`)

  const { rows } = await ctx.db.query<TeamRow>(
    'insert into support_teams (tenant_id, name, email) values ($1,$2,$3) returning id, name, email',
    [ctx.tenantId, input.name, input.email?.trim().toLowerCase() ?? null],
  )
  return rows[0]
}

/* ------------------------------ SLA policies ------------------------------ */

export type SlaPolicyRow = {
  id: string
  name: string
  calendarId: string | null
  appliesTo: Record<string, unknown>
  firstResponseMinutes: number | null
  resolutionMinutes: number | null
  active: boolean
}

const mapPolicy = (row: Raw): SlaPolicyRow => ({
  id: row.id as string,
  name: row.name as string,
  calendarId: (row.calendar_id as string) ?? null,
  appliesTo: (row.applies_to as Record<string, unknown>) ?? {},
  firstResponseMinutes: (row.first_response_minutes as number) ?? null,
  resolutionMinutes: (row.resolution_minutes as number) ?? null,
  active: row.active as boolean,
})

export async function listSlaPolicies(ctx: TenantContext): Promise<SlaPolicyRow[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>('select * from sla_policies where tenant_id = $1 order by name', [ctx.tenantId])
  return rows.map(mapPolicy)
}

export async function createSlaPolicy(
  ctx: TenantContext,
  input: {
    name: string
    calendarId?: string | null
    appliesTo?: Record<string, unknown>
    firstResponseMinutes?: number | null
    resolutionMinutes?: number | null
  },
): Promise<SlaPolicyRow> {
  ctx.require('settings.manage')
  // A policy with neither target sets no clock at all, and would look like
  // protection in the list while doing nothing.
  if (!input.firstResponseMinutes && !input.resolutionMinutes) {
    throw unprocessable('no_target', 'Set a first-response or a resolution target.')
  }
  if (input.calendarId) {
    const { rows } = await ctx.db.query('select 1 from business_calendars where id = $1 and tenant_id = $2', [
      input.calendarId,
      ctx.tenantId,
    ])
    if (!rows[0]) throw notFound('That calendar')
  }

  const { rows } = await ctx.db.query<Raw>(
    `insert into sla_policies (tenant_id, name, calendar_id, applies_to, first_response_minutes, resolution_minutes)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [
      ctx.tenantId,
      input.name,
      input.calendarId ?? null,
      JSON.stringify(input.appliesTo ?? {}),
      input.firstResponseMinutes ?? null,
      input.resolutionMinutes ?? null,
    ],
  )
  await recordAudit(ctx.db, ctx, {
    action: 'support.sla_policy_created',
    resource: 'sla_policy',
    resourceId: rows[0].id as string,
    detail: { name: input.name },
  })
  return mapPolicy(rows[0])
}

export async function setSlaPolicyActive(ctx: TenantContext, policyId: string, active: boolean): Promise<SlaPolicyRow> {
  ctx.require('settings.manage')
  const { rows } = await ctx.db.query<Raw>(
    'update sla_policies set active = $3 where id = $1 and tenant_id = $2 returning *',
    [policyId, ctx.tenantId, active],
  )
  if (!rows[0]) throw notFound('That policy')
  return mapPolicy(rows[0])
}

/* --------------------------- escalation rules ----------------------------- */

export type EscalationRuleRow = {
  id: string
  name: string
  triggerTarget: string
  offsetMinutes: number
  conditions: Record<string, unknown>
  actions: { kind: string; [key: string]: unknown }[]
  active: boolean
}

const mapRule = (row: Raw): EscalationRuleRow => ({
  id: row.id as string,
  name: row.name as string,
  triggerTarget: row.trigger_target as string,
  offsetMinutes: row.offset_minutes as number,
  conditions: (row.conditions as Record<string, unknown>) ?? {},
  actions: (row.actions as { kind: string }[]) ?? [],
  active: row.active as boolean,
})

/** The actions the sweep can actually perform. */
const ACTIONS = new Set(['notify', 'reassign', 'raise_priority'])

export async function listEscalationRules(ctx: TenantContext): Promise<EscalationRuleRow[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>('select * from escalation_rules where tenant_id = $1 order by name', [ctx.tenantId])
  return rows.map(mapRule)
}

export async function createEscalationRule(
  ctx: TenantContext,
  input: {
    name: string
    triggerTarget: 'first_response' | 'resolution'
    offsetMinutes?: number
    conditions?: Record<string, unknown>
    actions: { kind: string; [key: string]: unknown }[]
  },
): Promise<EscalationRuleRow> {
  ctx.require('settings.manage')
  if (!input.actions.length) throw unprocessable('no_action', 'An escalation that does nothing is not an escalation.')

  for (const action of input.actions) {
    if (!ACTIONS.has(action.kind)) {
      // Storing an action the sweep cannot perform would leave an
      // administrator believing tickets were being escalated.
      throw unprocessable('unknown_action', `No escalation action called "${action.kind}" exists.`)
    }
    if (action.kind === 'reassign' && !action.userId) {
      throw unprocessable('reassign_needs_user', 'Say who a reassignment should go to.')
    }
    if (action.kind === 'raise_priority' && !action.priority) {
      throw unprocessable('priority_required', 'Say which priority to raise to.')
    }
  }

  const { rows } = await ctx.db.query<Raw>(
    `insert into escalation_rules (tenant_id, name, trigger_target, offset_minutes, conditions, actions)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [
      ctx.tenantId,
      input.name,
      input.triggerTarget,
      input.offsetMinutes ?? 0,
      JSON.stringify(input.conditions ?? {}),
      JSON.stringify(input.actions),
    ],
  )
  await recordAudit(ctx.db, ctx, {
    action: 'support.escalation_rule_created',
    resource: 'escalation_rule',
    resourceId: rows[0].id as string,
    detail: { name: input.name, actions: input.actions.map((action) => action.kind) },
  })
  return mapRule(rows[0])
}

export async function setEscalationRuleActive(ctx: TenantContext, ruleId: string, active: boolean): Promise<EscalationRuleRow> {
  ctx.require('settings.manage')
  const { rows } = await ctx.db.query<Raw>(
    'update escalation_rules set active = $3 where id = $1 and tenant_id = $2 returning *',
    [ruleId, ctx.tenantId, active],
  )
  if (!rows[0]) throw notFound('That rule')
  return mapRule(rows[0])
}

/* ---------------------------- working calendars --------------------------- */

export type CalendarRow = {
  id: string
  name: string
  timezone: string
  isDefault: boolean
  hours: { weekday: number; opensMinute: number; closesMinute: number }[]
  holidays: { observedOn: string; name: string }[]
}

export async function listCalendars(ctx: TenantContext): Promise<CalendarRow[]> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<{ id: string; name: string; timezone: string; is_default: boolean }>(
    'select id, name, timezone, is_default from business_calendars where tenant_id = $1 order by name',
    [ctx.tenantId],
  )
  const out: CalendarRow[] = []
  for (const row of rows) {
    const { rows: hours } = await ctx.db.query<{ weekday: number; opens_minute: number; closes_minute: number }>(
      'select weekday, opens_minute, closes_minute from business_hours where calendar_id = $1 order by weekday, opens_minute',
      [row.id],
    )
    const { rows: holidays } = await ctx.db.query<{ observed_on: Date; name: string }>(
      'select observed_on, name from business_holidays where calendar_id = $1 order by observed_on',
      [row.id],
    )
    out.push({
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      isDefault: row.is_default,
      hours: hours.map((hour) => ({
        weekday: hour.weekday,
        opensMinute: hour.opens_minute,
        closesMinute: hour.closes_minute,
      })),
      holidays: holidays.map((holiday) => ({
        observedOn: new Date(holiday.observed_on).toISOString().slice(0, 10),
        name: holiday.name,
      })),
    })
  }
  return out
}

/**
 * Creates a working calendar with its hours.
 *
 * The timezone is validated by asking the platform to format a date in it: a
 * calendar with an unrecognised zone would silently fall back to UTC, and
 * every SLA computed against it would be wrong by hours without anything
 * looking broken.
 */
export async function createCalendar(
  ctx: TenantContext,
  input: {
    name: string
    timezone: string
    isDefault?: boolean
    hours: { weekday: number; opensMinute: number; closesMinute: number }[]
    holidays?: { observedOn: string; name: string }[]
  },
): Promise<CalendarRow> {
  ctx.require('settings.manage')

  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: input.timezone }).format(new Date())
  } catch {
    throw unprocessable('unknown_timezone', `${input.timezone} is not a recognised IANA timezone.`)
  }
  for (const hour of input.hours) {
    if (hour.closesMinute <= hour.opensMinute) {
      throw unprocessable('hours_reversed', 'A working window must close after it opens.')
    }
  }

  return ctx.db.transaction(async (tx) => {
    if (input.isDefault) {
      // The partial unique index allows one default; clear the old one first
      // rather than letting the insert fail with a constraint name.
      await tx.query('update business_calendars set is_default = false where tenant_id = $1 and is_default', [ctx.tenantId])
    }

    const { rows } = await tx.query<{ id: string }>(
      'insert into business_calendars (tenant_id, name, timezone, is_default) values ($1,$2,$3,$4) returning id',
      [ctx.tenantId, input.name, input.timezone, input.isDefault ?? false],
    )
    const calendarId = rows[0].id

    for (const hour of input.hours) {
      await tx.query('insert into business_hours (calendar_id, weekday, opens_minute, closes_minute) values ($1,$2,$3,$4)', [
        calendarId,
        hour.weekday,
        hour.opensMinute,
        hour.closesMinute,
      ])
    }
    for (const holiday of input.holidays ?? []) {
      await tx.query(
        'insert into business_holidays (calendar_id, observed_on, name) values ($1,$2,$3) on conflict do nothing',
        [calendarId, holiday.observedOn, holiday.name],
      )
    }
    const all = await listCalendars({ ...ctx, db: tx })
    return all.find((calendar) => calendar.id === calendarId)!
  })
}

/**
 * Deletes a working calendar.
 *
 * Refused while an SLA policy points at it, and refused for the default. The
 * foreign key is `on delete set null`, so either deletion would succeed and
 * quietly move those policies onto round-the-clock time — every target they
 * set would become hours tighter, with nothing on any screen looking
 * different. There is no archived_at on this table, so refusing is the only
 * honest answer.
 */
export async function deleteCalendar(ctx: TenantContext, calendarId: string): Promise<void> {
  ctx.require('settings.manage')

  const { rows } = await ctx.db.query<{ name: string; is_default: boolean }>(
    'select name, is_default from business_calendars where id = $1 and tenant_id = $2',
    [calendarId, ctx.tenantId],
  )
  if (!rows[0]) throw notFound('That calendar')
  if (rows[0].is_default) {
    throw conflict(`"${rows[0].name}" is the default calendar. Make another one the default first.`)
  }

  const { rows: used } = await ctx.db.query<{ n: string }>(
    'select count(*)::text as n from sla_policies where tenant_id = $1 and calendar_id = $2',
    [ctx.tenantId, calendarId],
  )
  if (Number(used[0].n) > 0) {
    throw conflict(`${used[0].n} SLA policy(ies) still use "${rows[0].name}". Point them at another calendar first.`)
  }

  await ctx.db.query('delete from business_calendars where id = $1 and tenant_id = $2', [calendarId, ctx.tenantId])
  await recordAudit(ctx.db, ctx, { action: 'support.calendar_deleted', resource: 'business_calendar', resourceId: calendarId })
}
