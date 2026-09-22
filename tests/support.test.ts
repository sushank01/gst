import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  createTicket, replyToTicket, listMessages, transitionTicket, listTickets,
  runEscalations, slaStatus, assignTicket, sendCsat,
} from '../src/server/services/support.ts'
import { addBusinessMinutes, businessMinutesBetween, standardWeek } from '../src/server/services/calendar.ts'

async function helpdesk(now = '2026-01-05T09:00:00Z') {
  const db = await freshDb()
  const c = clock(now)
  const userId = await seedUser(db, { email: 'agent@example.com', fullName: 'Agent' })
  const tenant = await createTenantWithOwner(db, userId, { name: 'Acme' }, c.now(), 'r')
  const make = async (at: Date) => {
    const { token } = await createSession(db, { userId, tenantId: tenant.tenantId }, at)
    return withTenant(await authenticate(db, token, { now: at, requestId: 'r' }))
  }
  const ctx = await make(c.now())

  // Status vocabulary with behaviour, which is what drives the clocks.
  for (const [slug, behaviour] of [['new', 'active'], ['open', 'active'], ['waiting_on_customer', 'waiting'], ['resolved', 'closed'], ['closed', 'closed']]) {
    await db.query(
      `insert into ticket_field_options (tenant_id, field, slug, label, behaviour) values ($1,'status',$2,$2,$3)`,
      [tenant.tenantId, slug, behaviour])
  }
  for (const [slug, first, res] of [['urgent', 60, 240], ['medium', 240, 1440]]) {
    await db.query(
      `insert into ticket_field_options (tenant_id, field, slug, label, first_response_minutes, resolution_minutes)
       values ($1,'priority',$2,$2,$3,$4)`, [tenant.tenantId, slug, first, res])
  }
  return { db, c, ctx, make, tenantId: tenant.tenantId, userId }
}

/* -------------------------- business calendar ---------------------------- */

test('working minutes skip evenings and weekends', () => {
  const calendar = standardWeek('UTC')
  // Friday 16:00 → Monday 10:00 is 1h Friday + 1h Monday = 120 working minutes.
  assert.equal(businessMinutesBetween(new Date('2026-01-02T16:00:00Z'), new Date('2026-01-05T10:00:00Z'), calendar), 120)
  // A whole weekend is zero working time.
  assert.equal(businessMinutesBetween(new Date('2026-01-03T00:00:00Z'), new Date('2026-01-05T09:00:00Z'), calendar), 0)
})

test('a four-hour target started on Friday afternoon lands on Monday', () => {
  const calendar = standardWeek('UTC')
  const due = addBusinessMinutes(new Date('2026-01-02T16:00:00Z'), 240, calendar)
  assert.equal(due.toISOString(), '2026-01-05T12:00:00.000Z', '1h Friday + 3h Monday')
})

test('holidays are skipped', () => {
  const calendar = { ...standardWeek('UTC'), holidays: new Set(['2026-01-05']) }
  const due = addBusinessMinutes(new Date('2026-01-02T16:00:00Z'), 240, calendar)
  assert.equal(due.toISOString(), '2026-01-06T12:00:00.000Z', 'Monday is a holiday, so it lands Tuesday')
})

/* -------------------------------- tickets -------------------------------- */

test('a ticket is created with its opening message and SLA clocks', async () => {
  const { db, ctx } = await helpdesk()
  const ticket = await createTicket(ctx, { subject: 'Printer on fire', body: 'It is smoking.', priority: 'urgent', requesterEmail: 'user@corp.test' })
  assert.equal(ticket.reference, 'TCK-0001')
  assert.equal(ticket.status, 'new')

  const messages = await listMessages(ctx, ticket.id, { includeInternal: true })
  assert.equal(messages.length, 1)
  assert.equal(messages[0].body, 'It is smoking.')

  const sla = await slaStatus(ctx, ticket.id)
  assert.equal(sla.length, 2, 'first response and resolution clocks both started')
  await db.close()
})

test('CONFIDENTIALITY: an internal note is never returned to a requester view', async () => {
  const { db, ctx } = await helpdesk()
  const ticket = await createTicket(ctx, { subject: 'Question', body: 'How do I?', priority: 'medium' })
  await replyToTicket(ctx, ticket.id, { body: 'Checking with billing — do not tell them yet.', visibility: 'internal' })
  await replyToTicket(ctx, ticket.id, { body: 'We are looking into it.', visibility: 'public' })

  const agentView = await listMessages(ctx, ticket.id, { includeInternal: true })
  assert.equal(agentView.length, 3)

  const requesterView = await listMessages(ctx, ticket.id, { includeInternal: false })
  assert.equal(requesterView.length, 2)
  assert.ok(!requesterView.some((m) => m.body.includes('do not tell them')), 'the internal note is absent')
  await db.close()
})

test('only a public reply satisfies the first-response clock', async () => {
  const { db, c, ctx, make } = await helpdesk()
  const ticket = await createTicket(ctx, { subject: 'Hi', body: 'Hello', priority: 'urgent' })

  const later = await make(c.advance(10 * 60_000))
  await replyToTicket(later, ticket.id, { body: 'internal thought', visibility: 'internal' })
  let sla = await slaStatus(later, ticket.id)
  assert.equal(sla.find((s) => s.target === 'first_response')!.satisfied, false, 'an internal note is not a response')

  await replyToTicket(later, ticket.id, { body: 'Thanks for getting in touch', visibility: 'public' })
  sla = await slaStatus(later, ticket.id)
  assert.equal(sla.find((s) => s.target === 'first_response')!.satisfied, true)
  await db.close()
})

test('waiting on the customer pauses the resolution clock and resuming extends the deadline', async () => {
  const { db, c, ctx, make } = await helpdesk()
  const ticket = await createTicket(ctx, { subject: 'Hi', body: 'Hello', priority: 'urgent' })
  const before = (await slaStatus(ctx, ticket.id)).find((s) => s.target === 'resolution')!.dueAt

  let current = await make(c.advance(30 * 60_000))
  const waiting = await transitionTicket(current, ticket.id, { status: 'waiting_on_customer', version: ticket.version })
  const paused = (await slaStatus(current, ticket.id)).find((s) => s.target === 'resolution')!
  assert.equal(paused.remainingMinutes, null, 'a paused clock reports no countdown')

  current = await make(c.advance(2 * 60 * 60_000))
  await transitionTicket(current, ticket.id, { status: 'open', version: waiting.version })
  const after = (await slaStatus(current, ticket.id)).find((s) => s.target === 'resolution')!
  assert.ok(new Date(after.dueAt).getTime() > new Date(before).getTime(), 'the deadline moved out by the waiting time')
  assert.equal(
    Math.round((new Date(after.dueAt).getTime() - new Date(before).getTime()) / 60_000),
    120,
    'by exactly the two hours spent waiting',
  )
  await db.close()
})

test('resolving satisfies the clock; reopening counts and does not revive it', async () => {
  const { db, c, ctx, make } = await helpdesk()
  const ticket = await createTicket(ctx, { subject: 'Hi', body: 'Hello', priority: 'urgent' })
  const resolved = await transitionTicket(ctx, ticket.id, { status: 'resolved', version: ticket.version })
  assert.ok(resolved.resolvedAt)
  assert.equal((await slaStatus(ctx, ticket.id)).find((s) => s.target === 'resolution')!.satisfied, true)

  const later = await make(c.advance(60_000))
  const reopened = await transitionTicket(later, ticket.id, { status: 'open', version: resolved.version })
  assert.equal(reopened.resolvedAt, null)
  const { rows } = await db.query<{ reopened_count: number }>('select reopened_count from tickets where id = $1', [ticket.id])
  assert.equal(rows[0].reopened_count, 1)
  await db.close()
})

test('a stale transition is refused', async () => {
  const { db, ctx } = await helpdesk()
  const ticket = await createTicket(ctx, { subject: 'Hi', body: 'x', priority: 'medium' })
  await transitionTicket(ctx, ticket.id, { status: 'open', version: ticket.version })
  await assert.rejects(
    () => transitionTicket(ctx, ticket.id, { status: 'resolved', version: ticket.version }),
    (e: any) => e.status === 409,
  )
  await db.close()
})

test('DEDUPLICATION: a redelivered email threads instead of making a second ticket', async () => {
  const { db, ctx } = await helpdesk()
  const first = await createTicket(ctx, { subject: 'Help', body: 'first', channel: 'email', externalMessageId: '<abc@mail>' })
  const retry = await createTicket(ctx, { subject: 'Help', body: 'first', channel: 'email', externalMessageId: '<abc@mail>' })
  assert.equal(retry.id, first.id, 'the same message id returns the same ticket')

  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from tickets')
  assert.equal(rows[0].n, '1')

  await replyToTicket(ctx, first.id, { body: 'reply', visibility: 'public', externalMessageId: '<def@mail>' })
  await replyToTicket(ctx, first.id, { body: 'reply', visibility: 'public', externalMessageId: '<def@mail>' })
  const messages = await listMessages(ctx, first.id, { includeInternal: true })
  assert.equal(messages.length, 2, 'the duplicate reply was not appended twice')
  await db.close()
})

test('a ticket cannot be assigned to someone outside the workspace', async () => {
  const { db, ctx } = await helpdesk()
  const outsider = await seedUser(db, { email: 'outsider@example.com' })
  const ticket = await createTicket(ctx, { subject: 'Hi', body: 'x', priority: 'medium' })
  await assert.rejects(() => assignTicket(ctx, ticket.id, outsider, ticket.version), (e: any) => e.status === 403)
  await db.close()
})

test('ISOLATION: tickets never cross tenants', async () => {
  const a = await helpdesk()
  const b = await helpdesk()
  const ticket = await createTicket(a.ctx, { subject: 'Secret', body: 'x', priority: 'medium' })
  await createTicket(b.ctx, { subject: 'Other', body: 'y', priority: 'medium' })

  assert.deepEqual((await listTickets(a.ctx)).rows.map((t) => t.subject), ['Secret'])
  assert.deepEqual((await listTickets(b.ctx)).rows.map((t) => t.subject), ['Other'])
  await assert.rejects(() => listMessages(b.ctx, ticket.id, { includeInternal: true }), (e: any) => e.status === 404)
  await a.db.close()
  await b.db.close()
})

test('search and filters agree with the count', async () => {
  const { db, ctx } = await helpdesk()
  await createTicket(ctx, { subject: 'Printer broken', body: 'x', priority: 'urgent' })
  await createTicket(ctx, { subject: 'Laptop slow', body: 'y', priority: 'medium' })
  await createTicket(ctx, { subject: 'Printer jam', body: 'z', priority: 'medium' })

  assert.equal((await listTickets(ctx, { query: 'printer' })).total, 2)
  assert.equal((await listTickets(ctx, { priority: 'medium' })).total, 2)
  assert.equal((await listTickets(ctx, { query: 'printer', priority: 'medium' })).total, 1, 'filters are ANDed')
  await db.close()
})

/* ------------------------------ escalations ------------------------------ */

test('a breached clock is marked once, and escalation fires once however often it sweeps', async () => {
  const { db, c, ctx, make, tenantId, userId } = await helpdesk()
  const other = await seedUser(db, { email: 'lead@example.com' })
  await db.query("insert into memberships (tenant_id, user_id, role) values ($1,$2,'admin')", [tenantId, other])
  await db.query(
    `insert into escalation_rules (tenant_id, name, trigger_target, offset_minutes, actions)
     values ($1,'Urgent overdue','first_response',0,$2)`,
    [tenantId, JSON.stringify([{ type: 'raise_priority', priority: 'urgent' }, { type: 'notify' }])],
  )
  const ticket = await createTicket(ctx, { subject: 'Hi', body: 'x', priority: 'medium' })

  const late = await make(c.advance(48 * 60 * 60_000))
  const first = await runEscalations(late)
  assert.ok(first.breached >= 1, 'the overdue clock is marked breached')
  assert.equal(first.fired, 2, 'both actions fired')

  const second = await runEscalations(late)
  assert.equal(second.fired, 0, 'a repeated sweep fires nothing again')
  assert.equal(second.breached, 0, 'and does not re-mark the breach')

  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from outbox where topic = $1', ['support.escalation'])
  assert.equal(rows[0].n, '1', 'one notification, not one per sweep')

  const after = await db.query<{ priority: string }>('select priority from tickets where id = $1', [ticket.id])
  assert.equal(after.rows[0].priority, 'urgent')
  assert.ok(userId)
  await db.close()
})

test('a resolved ticket is not escalated', async () => {
  const { db, c, ctx, make, tenantId } = await helpdesk()
  await db.query(
    `insert into escalation_rules (tenant_id, name, trigger_target, offset_minutes, actions)
     values ($1,'Overdue','resolution',0,$2)`,
    [tenantId, JSON.stringify([{ type: 'notify' }])],
  )
  const ticket = await createTicket(ctx, { subject: 'Hi', body: 'x', priority: 'urgent' })
  await transitionTicket(ctx, ticket.id, { status: 'resolved', version: ticket.version })

  const late = await make(c.advance(72 * 60 * 60_000))
  assert.equal((await runEscalations(late)).fired, 0)
  await db.close()
})

/* --------------------------------- CSAT ---------------------------------- */

test('CSAT is sent once per ticket, and only after it is resolved', async () => {
  const { db, c, ctx, make } = await helpdesk()
  const ticket = await createTicket(ctx, { subject: 'Hi', body: 'x', priority: 'medium' })
  await assert.rejects(() => sendCsat(ctx, ticket.id), (e: any) => e.code === 'not_resolved')

  const resolved = await transitionTicket(ctx, ticket.id, { status: 'resolved', version: ticket.version })
  assert.ok(await sendCsat(ctx, ticket.id))
  assert.equal(await sendCsat(ctx, ticket.id), null, 'a second send is suppressed')

  // Reopen and resolve again — still one survey.
  const later = await make(c.advance(60_000))
  const reopened = await transitionTicket(later, ticket.id, { status: 'open', version: resolved.version })
  await transitionTicket(later, ticket.id, { status: 'resolved', version: reopened.version })
  assert.equal(await sendCsat(later, ticket.id), null)

  const { rows } = await db.query<{ n: string }>('select count(*)::text as n from csat_responses')
  assert.equal(rows[0].n, '1')
  await db.close()
})
