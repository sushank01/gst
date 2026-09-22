import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  archiveFieldOption, createCalendar, createEscalationRule, createFieldOption, createSlaPolicy,
  createTeam, deleteCalendar, listCalendars, listEscalationRules, listFieldOptions, listSlaPolicies, listTeams,
  setEscalationRuleActive, setSlaPolicyActive, updateFieldOption,
} from '../src/server/services/supportConfig.ts'
import { createTicket, transitionTicket } from '../src/server/services/support.ts'

async function helpdesk() {
  const db = await freshDb()
  const c = clock()
  const owner = await seedUser(db, { email: 'owner@example.com', fullName: 'Owner' })
  const acme = await createTenantWithOwner(db, owner, { name: 'Acme' }, c.now(), 'r1')
  const { token } = await createSession(db, { userId: owner, tenantId: acme.tenantId }, c.now())
  return { db, c, owner, ctx: await withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' })) }
}

test('a status must declare a behaviour the engine understands', async () => {
  const { db, ctx } = await helpdesk()
  await assert.rejects(
    () => createFieldOption(ctx, { field: 'status', slug: 'pondering', label: 'Pondering' }),
    /must say how it behaves/i,
    'a status nothing can classify leaves its tickets in a state no clock knows how to treat',
  )
  await assert.rejects(
    () => createFieldOption(ctx, { field: 'status', slug: 'pondering', label: 'Pondering', behaviour: 'thinking' }),
    /Behaviour must be one of/i,
    'a behaviour outside the set would be stored and then ignored',
  )

  const created = await createFieldOption(ctx, {
    field: 'status',
    slug: 'pondering',
    label: 'Pondering',
    behaviour: 'waiting',
  })
  assert.equal(created.behaviour, 'waiting')
  await db.close()
})

test('a configured status actually drives the SLA clock', async () => {
  const { db, ctx } = await helpdesk()
  await createFieldOption(ctx, { field: 'priority', slug: 'normal', label: 'Normal', firstResponseMinutes: 60, resolutionMinutes: 480, isDefault: true })
  await createFieldOption(ctx, { field: 'status', slug: 'new', label: 'New', behaviour: 'active' })
  const waiting = await createFieldOption(ctx, {
    field: 'status',
    slug: 'awaiting-customer',
    label: 'Awaiting customer',
    behaviour: 'waiting',
  })

  const ticket = await createTicket(ctx, { subject: 'Card reader', body: 'red light', priority: 'normal' })
  const paused = await transitionTicket(ctx, ticket.id, { status: 'awaiting-customer', version: ticket.version })
  assert.equal(paused.status, 'awaiting-customer')

  const { rows } = await db.query<{ paused_at: Date | null }>(
    "select paused_at from sla_instances where ticket_id = $1 and target = 'resolution'",
    [ticket.id],
  )
  assert.ok(rows[0].paused_at, 'the behaviour, not the name, is what paused the clock')
  assert.ok(waiting.id)
  await db.close()
})

test('response targets belong to a priority, not to any field', async () => {
  const { db, ctx } = await helpdesk()
  await assert.rejects(
    () => createFieldOption(ctx, { field: 'category', slug: 'billing', label: 'Billing', firstResponseMinutes: 30 }),
    /belong to a priority/i,
  )
  await db.close()
})

test('one default per field, and setting a new one clears the old', async () => {
  const { db, ctx } = await helpdesk()
  const low = await createFieldOption(ctx, { field: 'priority', slug: 'low', label: 'Low', isDefault: true })
  const high = await createFieldOption(ctx, { field: 'priority', slug: 'high', label: 'High', isDefault: true })

  const options = await listFieldOptions(ctx, 'priority')
  assert.equal(options.filter((option) => option.isDefault).length, 1, 'a ticket created without one must be unambiguous')
  assert.equal(options.find((option) => option.isDefault)?.id, high.id)
  assert.ok(low.id)
  await db.close()
})

test('a duplicate slug within a field is refused, across fields is fine', async () => {
  const { db, ctx } = await helpdesk()
  await createFieldOption(ctx, { field: 'category', slug: 'billing', label: 'Billing' })
  await assert.rejects(() => createFieldOption(ctx, { field: 'category', slug: 'billing', label: 'Billing 2' }), /already exists/i)

  // The same slug under a different field is a different thing entirely.
  const channel = await createFieldOption(ctx, { field: 'channel', slug: 'billing', label: 'Billing inbox' })
  assert.equal(channel.field, 'channel')
  await db.close()
})

test('an option still in use cannot be archived out from under its tickets', async () => {
  const { db, ctx } = await helpdesk()
  await createFieldOption(ctx, { field: 'priority', slug: 'normal', label: 'Normal', isDefault: true })
  const category = await createFieldOption(ctx, { field: 'category', slug: 'billing', label: 'Billing' })
  await createTicket(ctx, { subject: 'Invoice query', body: 'x', category: 'billing' })

  await assert.rejects(
    () => archiveFieldOption(ctx, category.id),
    /still use "Billing"/,
    'those tickets would be left holding a value nothing can render or filter on',
  )

  // Renaming is almost always what was wanted, and is allowed.
  const renamed = await updateFieldOption(ctx, category.id, { label: 'Billing & invoices' })
  assert.equal(renamed.label, 'Billing & invoices')

  const unused = await createFieldOption(ctx, { field: 'category', slug: 'spam', label: 'Spam' })
  await archiveFieldOption(ctx, unused.id)
  assert.equal((await listFieldOptions(ctx, 'category')).length, 1)
  await db.close()
})

test('teams are unique by name', async () => {
  const { db, ctx } = await helpdesk()
  await createTeam(ctx, { name: 'Tier 1', email: 'Tier1@Example.COM' })
  assert.equal((await listTeams(ctx))[0].email, 'tier1@example.com', 'normalised, not stored as typed')
  await assert.rejects(() => createTeam(ctx, { name: 'tier 1' }), /already exists/i)
  await db.close()
})

test('an SLA policy with no target is refused', async () => {
  const { db, ctx } = await helpdesk()
  await assert.rejects(
    () => createSlaPolicy(ctx, { name: 'Empty' }),
    /Set a first-response or a resolution target/,
    'a policy that sets no clock looks like protection while doing nothing',
  )

  const policy = await createSlaPolicy(ctx, { name: 'Standard', firstResponseMinutes: 60 })
  assert.equal(policy.active, true)
  await setSlaPolicyActive(ctx, policy.id, false)
  assert.equal((await listSlaPolicies(ctx))[0].active, false)
  await db.close()
})

test('an SLA policy cannot point at a calendar from another workspace', async () => {
  const { db, ctx } = await helpdesk()
  const mallory = await seedUser(db, { email: 'mallory@example.com', fullName: 'Mallory' })
  const evil = await createTenantWithOwner(db, mallory, { name: 'Evil' }, ctx.now, 'r2')
  const { rows } = await db.query<{ id: string }>(
    "insert into business_calendars (tenant_id, name, timezone) values ($1, 'Theirs', 'UTC') returning id",
    [evil.tenantId],
  )
  await assert.rejects(
    () => createSlaPolicy(ctx, { name: 'Borrowed', firstResponseMinutes: 60, calendarId: rows[0].id }),
    /That calendar/,
  )
  await db.close()
})

test('an escalation rule must do something the sweep can actually perform', async () => {
  const { db, ctx } = await helpdesk()
  await assert.rejects(
    () => createEscalationRule(ctx, { name: 'Nothing', triggerTarget: 'resolution', actions: [] }),
    /does nothing is not an escalation/i,
  )
  await assert.rejects(
    () => createEscalationRule(ctx, { name: 'Telepathy', triggerTarget: 'resolution', actions: [{ kind: 'summon_manager' }] }),
    /No escalation action called/i,
    'storing an action the sweep cannot perform leaves an administrator believing tickets are escalated',
  )
  await assert.rejects(
    () => createEscalationRule(ctx, { name: 'Vague', triggerTarget: 'resolution', actions: [{ kind: 'reassign' }] }),
    /Say who a reassignment should go to/i,
  )

  const rule = await createEscalationRule(ctx, {
    name: 'Raise on breach',
    triggerTarget: 'resolution',
    actions: [{ kind: 'raise_priority', priority: 'urgent' }],
  })
  assert.equal(rule.active, true)
  await setEscalationRuleActive(ctx, rule.id, false)
  assert.equal((await listEscalationRules(ctx))[0].active, false)
  await db.close()
})

test('a calendar with an unrecognised timezone is refused, not silently UTC', async () => {
  const { db, ctx } = await helpdesk()
  await assert.rejects(
    () => createCalendar(ctx, { name: 'Bad', timezone: 'Mars/Olympus', hours: [] }),
    /not a recognised IANA timezone/i,
    'falling back to UTC would make every SLA wrong by hours with nothing looking broken',
  )
  await assert.rejects(
    () => createCalendar(ctx, { name: 'Reversed', timezone: 'Asia/Kolkata', hours: [{ weekday: 1, opensMinute: 1080, closesMinute: 540 }] }),
    /close after it opens/i,
  )
  await db.close()
})

test('a calendar keeps its hours and holidays, and only one is default', async () => {
  const { db, ctx } = await helpdesk()
  const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensMinute: 540, closesMinute: 1080 }))

  const first = await createCalendar(ctx, {
    name: 'India',
    timezone: 'Asia/Kolkata',
    isDefault: true,
    hours: week,
    holidays: [{ observedOn: '2026-01-26', name: 'Republic Day' }],
  })
  assert.equal(first.hours.length, 5)
  assert.equal(first.holidays[0].name, 'Republic Day')
  assert.equal(first.timezone, 'Asia/Kolkata')

  const second = await createCalendar(ctx, { name: 'UK', timezone: 'Europe/London', isDefault: true, hours: week })
  const all = await listCalendars(ctx)
  assert.equal(all.filter((calendar) => calendar.isDefault).length, 1)
  assert.equal(all.find((calendar) => calendar.isDefault)?.id, second.id)
  await db.close()
})

test('the default calendar cannot be deleted out from under the SLA engine', async () => {
  const { db, ctx } = await helpdesk()
  const calendar = await createCalendar(ctx, {
    name: 'UK office',
    timezone: 'Europe/London',
    isDefault: true,
    hours: [{ weekday: 1, opensMinute: 540, closesMinute: 1020 }],
  })
  // Deleting it would succeed at the database level — the foreign key nulls
  // the reference — and every target computed afterwards would silently become
  // round-the-clock, which is hours tighter than what was configured.
  await assert.rejects(() => deleteCalendar(ctx, calendar.id), (e: any) => e.status === 409)
  await db.close()
})

test('a calendar an SLA policy points at cannot be deleted', async () => {
  const { db, ctx } = await helpdesk()
  const calendar = await createCalendar(ctx, {
    name: 'Weekends only',
    timezone: 'UTC',
    hours: [{ weekday: 6, opensMinute: 540, closesMinute: 1020 }],
  })
  await createSlaPolicy(ctx, { name: 'Weekend cover', calendarId: calendar.id, resolutionMinutes: 480 })

  await assert.rejects(() => deleteCalendar(ctx, calendar.id), /still use/i)
  assert.equal((await listCalendars(ctx)).length, 1, 'and nothing was removed')
  await db.close()
})

test('an unused, non-default calendar is deleted', async () => {
  const { db, ctx } = await helpdesk()
  const calendar = await createCalendar(ctx, {
    name: 'Spare',
    timezone: 'UTC',
    hours: [{ weekday: 2, opensMinute: 540, closesMinute: 1020 }],
  })
  await deleteCalendar(ctx, calendar.id)
  assert.deepEqual((await listCalendars(ctx)).map((row) => row.name), [])
  await db.close()
})
