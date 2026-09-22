import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import {
  createTicket, replyToTicket, listMessages, transitionTicket, listTickets,
  runEscalations, slaStatus, assignTicket, sendCsat,
  supportStats, slaCompliance, listCsat, reviewCsat, sendPendingCsat, autoCloseResolved, exportTicketsCsv,
} from '../src/server/services/support.ts'
import { createEscalationRule } from '../src/server/services/supportConfig.ts'
import { writeSettings } from '../src/server/services/settings.ts'
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

test('a rule created through the product — which stores `kind` — actually performs its action', async () => {
  // The settings pane writes { kind }, the route validates { kind } and
  // `createEscalationRule` stores { kind }. The sweep used to look for
  // `type`, so a rule built this way counted as fired and did nothing.
  const { db, c, ctx, make, tenantId } = await helpdesk()
  const lead = await seedUser(db, { email: 'lead2@example.com', fullName: 'Lead' })
  await db.query("insert into memberships (tenant_id, user_id, role, status) values ($1,$2,'admin','active')", [tenantId, lead])

  await createEscalationRule(ctx, {
    name: 'Hand it to the lead',
    triggerTarget: 'first_response',
    offsetMinutes: 0,
    actions: [{ kind: 'reassign', userId: lead }, { kind: 'raise_priority', priority: 'urgent' }],
  })
  const ticket = await createTicket(ctx, { subject: 'Hi', body: 'x', priority: 'medium' })

  const late = await make(c.advance(48 * 60 * 60_000))
  assert.equal((await runEscalations(late)).fired, 2)

  const { rows } = await db.query<{ priority: string; assignee_user_id: string | null }>(
    'select priority, assignee_user_id from tickets where id = $1',
    [ticket.id],
  )
  assert.equal(rows[0].priority, 'urgent', 'the priority was actually raised')
  assert.equal(rows[0].assignee_user_id, lead, 'the ticket was actually reassigned')

  const events = await db.query<{ action: string }>('select action from escalation_events order by action')
  assert.deepEqual(events.rows.map((row) => row.action), ['raise_priority', 'reassign'])
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

/* -------------------------------- filters -------------------------------- */

test('the unassigned queue is a server filter, so its count is the real one', async () => {
  const { db, ctx, userId } = await helpdesk()
  const mine = await createTicket(ctx, { subject: 'Mine', body: 'x', priority: 'medium' })
  await createTicket(ctx, { subject: 'Nobody', body: 'y', priority: 'medium' })
  await assignTicket(ctx, mine.id, userId, mine.version)

  // "assignee is null" cannot be said with an optional uuid, which is why
  // this needed its own option rather than being filtered in the browser.
  const unassigned = await listTickets(ctx, { unassigned: true })
  assert.equal(unassigned.total, 1)
  assert.equal(unassigned.rows[0].subject, 'Nobody')
  await db.close()
})

test('tags filter on the array, not on a rendered string', async () => {
  const { db, ctx } = await helpdesk()
  await createTicket(ctx, { subject: 'A', body: 'x', priority: 'medium', tags: ['vip', 'billing'] })
  await createTicket(ctx, { subject: 'B', body: 'x', priority: 'medium', tags: ['billing'] })
  await createTicket(ctx, { subject: 'C', body: 'x', priority: 'medium' })

  assert.equal((await listTickets(ctx, { tags: ['vip'] })).total, 1)
  assert.equal((await listTickets(ctx, { tags: ['billing'] })).total, 2)
  assert.equal((await listTickets(ctx, { tags: ['vip', 'billing'] })).total, 2, 'any of them, not all')
  await db.close()
})

test('CONFIDENTIALITY: "my requests" matches the requester address, never the subject', async () => {
  const { db, ctx } = await helpdesk()
  await createTicket(ctx, { subject: 'Mine', body: 'x', priority: 'medium', requesterEmail: 'sam@corp.test' })
  // A search would match this one on its subject line. Someone reading their
  // own requests must not be shown it.
  await createTicket(ctx, { subject: 'Complaint about sam@corp.test', body: 'x', priority: 'medium', requesterEmail: 'lee@corp.test' })

  const mine = await listTickets(ctx, { requesterEmail: 'SAM@corp.test' })
  assert.equal(mine.total, 1, 'matched exactly, and case-insensitively')
  assert.equal(mine.rows[0].subject, 'Mine')
  assert.equal((await listTickets(ctx, { query: 'sam@corp.test' })).total, 2, 'a search does match both — which is why it cannot stand in')
  await db.close()
})

test('a channel filter narrows the count', async () => {
  const { db, ctx } = await helpdesk()
  await createTicket(ctx, { subject: 'A', body: 'x', priority: 'medium', channel: 'email' })
  await createTicket(ctx, { subject: 'B', body: 'x', priority: 'medium', channel: 'phone' })
  assert.equal((await listTickets(ctx, { channel: 'email' })).total, 1)
  await db.close()
})

/* --------------------------------- stats --------------------------------- */

test('open versus closed comes from each status behaviour, not from a name', async () => {
  const { db, ctx, tenantId } = await helpdesk()
  // A tenant-invented status that ends a ticket. Nothing may pattern-match
  // its name; only its behaviour says what it is.
  await db.query(
    `insert into ticket_field_options (tenant_id, field, slug, label, behaviour) values ($1,'status','settled','Settled','resolved')`,
    [tenantId],
  )
  const a = await createTicket(ctx, { subject: 'A', body: 'x', priority: 'medium' })
  const b = await createTicket(ctx, { subject: 'B', body: 'x', priority: 'medium' })
  await createTicket(ctx, { subject: 'C', body: 'x', priority: 'medium' })
  await transitionTicket(ctx, a.id, { status: 'resolved', version: a.version })
  await transitionTicket(ctx, b.id, { status: 'settled', version: b.version })

  const stats = await supportStats(ctx)
  assert.equal(stats.total, 3)
  assert.equal(stats.closed, 2, 'both end-state behaviours count as closed')
  assert.equal(stats.open, 1)
  await db.close()
})

test('a status whose behaviour is an end state also stops the resolution clock', async () => {
  const { db, ctx, tenantId } = await helpdesk()
  await db.query(
    `insert into ticket_field_options (tenant_id, field, slug, label, behaviour) values ($1,'status','settled','Settled','resolved')`,
    [tenantId],
  )
  const ticket = await createTicket(ctx, { subject: 'A', body: 'x', priority: 'urgent' })
  const settled = await transitionTicket(ctx, ticket.id, { status: 'settled', version: ticket.version })

  // Otherwise the dashboard would call it closed while the clock kept running
  // towards a breach nobody could act on.
  assert.ok(settled.resolvedAt, 'the ticket is recorded as resolved')
  assert.equal((await slaStatus(ctx, ticket.id)).find((s) => s.target === 'resolution')!.satisfied, true)
  await db.close()
})

test('average CSAT is null when nobody has rated, not zero', async () => {
  const { db, ctx } = await helpdesk()
  await createTicket(ctx, { subject: 'A', body: 'x', priority: 'medium' })

  const stats = await supportStats(ctx)
  // "Customers rate us 0" and "we have not asked anybody" are different facts,
  // and a tile cannot show the first when the second is true.
  assert.equal(stats.csatAverage, null)
  assert.equal(stats.csatResponses, 0)
  await db.close()
})

test('average CSAT is the mean of the answered surveys', async () => {
  const { db, ctx, tenantId } = await helpdesk()
  const a = await createTicket(ctx, { subject: 'A', body: 'x', priority: 'medium' })
  const b = await createTicket(ctx, { subject: 'B', body: 'x', priority: 'medium' })
  await db.query(
    `insert into csat_responses (tenant_id, ticket_id, token_hash, score, responded_at) values ($1,$2,'h1',5,now()), ($1,$3,'h2',2,now())`,
    [tenantId, a.id, b.id],
  )
  const stats = await supportStats(ctx)
  assert.equal(stats.csatAverage, '3.5')
  assert.equal(stats.csatResponses, 2)
  await db.close()
})

test('a ticket that missed both targets is one breached ticket, not two', async () => {
  const { db, c, ctx, make } = await helpdesk()
  await createTicket(ctx, { subject: 'A', body: 'x', priority: 'urgent' })
  const late = await make(c.advance(72 * 60 * 60_000))
  await runEscalations(late)

  const stats = await supportStats(late)
  assert.equal(stats.slaBreached, 1, 'counted per ticket, which is what the tile says')
  await db.close()
})

test('the breakdowns carry the tenant label, falling back to the stored slug', async () => {
  const { db, ctx } = await helpdesk()
  await createTicket(ctx, { subject: 'A', body: 'x', priority: 'urgent', category: 'billing' })
  await createTicket(ctx, { subject: 'B', body: 'x', priority: 'urgent' })

  const stats = await supportStats(ctx)
  assert.deepEqual(stats.byPriority, [{ slug: 'urgent', label: 'urgent', count: 2 }])
  // A ticket with no category is a fact about it, not a gap to hide.
  const uncategorised = stats.byCategory.find((row) => row.slug === '')
  assert.equal(uncategorised?.label, 'No category')
  assert.equal(uncategorised?.count, 1)
  await db.close()
})

/* ------------------------------ SLA report -------------------------------- */

test('first-response and resolution compliance are measured separately', async () => {
  const { db, c, ctx, make } = await helpdesk()
  const ticket = await createTicket(ctx, { subject: 'A', body: 'x', priority: 'urgent' })
  // Answered inside the hour, then left until the four-hour resolution target
  // passed: exactly the case a single breached flag cannot express.
  const answered = await make(c.advance(30 * 60_000))
  await replyToTicket(answered, ticket.id, { body: 'On it', visibility: 'public' })
  const late = await make(c.advance(10 * 60 * 60_000))
  await runEscalations(late)

  const rows = await slaCompliance(late)
  const urgent = rows.find((row) => row.priority === 'urgent')!
  assert.equal(urgent.tickets, 1)
  assert.equal(urgent.firstResponseMet, 1)
  assert.equal(urgent.firstResponseBreached, 0)
  assert.equal(urgent.resolutionMet, 0)
  assert.equal(urgent.resolutionBreached, 1, 'the two targets are genuinely different numbers')
  await db.close()
})

test('a clock still running counts as neither met nor breached', async () => {
  const { db, ctx } = await helpdesk()
  await createTicket(ctx, { subject: 'A', body: 'x', priority: 'urgent' })
  const [row] = await slaCompliance(ctx)
  // Reporting an outcome for something that has not happened is how a
  // compliance figure ends up describing the future.
  assert.equal(row.tickets, 1)
  assert.equal(row.firstResponseMet + row.firstResponseBreached, 0)
  await db.close()
})

test('the SLA window excludes tickets opened outside it', async () => {
  const { db, c, ctx, make } = await helpdesk()
  await createTicket(ctx, { subject: 'Old', body: 'x', priority: 'urgent' })
  const later = await make(c.advance(40 * 86_400_000))
  await createTicket(later, { subject: 'New', body: 'x', priority: 'medium' })

  const recent = await slaCompliance(later, { from: new Date(later.now.getTime() - 7 * 86_400_000) })
  assert.deepEqual(recent.map((row) => row.priority), ['medium'])
  await db.close()
})

/* ------------------------------- CSAT queue -------------------------------- */

async function withCsatSettings(ctx: Awaited<ReturnType<typeof helpdesk>>['ctx'], value: Record<string, unknown>) {
  await writeSettings(ctx, { appCode: 'SUP', section: 'csat', value, version: 0, summary: 'test' })
}

test('pending surveys honour the wait window', async () => {
  const { db, c, ctx, make } = await helpdesk()
  await withCsatSettings(ctx, { sendOnResolve: true, waitHours: 2, skipOlderDays: 14, lowScore: 3, slaWarnPercent: 75, portalUrl: '' })
  const ticket = await createTicket(ctx, { subject: 'A', body: 'x', priority: 'medium' })
  await transitionTicket(ctx, ticket.id, { status: 'resolved', version: ticket.version })

  // Just resolved: the customer has not had time to see whether the fix held.
  assert.equal((await listCsat(ctx)).pending, 0)

  const later = await make(c.advance(3 * 3_600_000))
  assert.equal((await listCsat(later)).pending, 1)
  assert.deepEqual(await sendPendingCsat(later), { eligible: 1, queued: 1 })
  assert.equal((await listCsat(later)).pending, 0, 'a queued survey is no longer pending')
  await db.close()
})

test('pending surveys skip tickets older than the configured window', async () => {
  const { db, c, ctx, make } = await helpdesk()
  await withCsatSettings(ctx, { sendOnResolve: true, waitHours: 0, skipOlderDays: 7, lowScore: 3, slaWarnPercent: 75, portalUrl: '' })
  const ticket = await createTicket(ctx, { subject: 'A', body: 'x', priority: 'medium' })
  await transitionTicket(ctx, ticket.id, { status: 'resolved', version: ticket.version })

  const muchLater = await make(c.advance(30 * 86_400_000))
  // Waking up an inbox a month after the ticket closed is worse than silence.
  assert.equal((await listCsat(muchLater)).pending, 0)
  assert.deepEqual(await sendPendingCsat(muchLater), { eligible: 0, queued: 0 })
  await db.close()
})

test('sending pending surveys is refused while surveys are switched off', async () => {
  const { db, ctx } = await helpdesk()
  await withCsatSettings(ctx, { sendOnResolve: false, waitHours: 0, skipOlderDays: 14, lowScore: 3, slaWarnPercent: 75, portalUrl: '' })
  // Otherwise the button reports surveys queued while the setting guarantees
  // none will ever be sent.
  await assert.rejects(() => sendPendingCsat(ctx), (e: any) => e.code === 'surveys_disabled')
  await db.close()
})

test('reviewing a rating takes it off the unreviewed queue and records who did it', async () => {
  const { db, ctx, tenantId, userId } = await helpdesk()
  const ticket = await createTicket(ctx, { subject: 'A', body: 'x', priority: 'medium' })
  const { rows } = await db.query<{ id: string }>(
    `insert into csat_responses (tenant_id, ticket_id, token_hash, score, responded_at) values ($1,$2,'h',1,now()) returning id`,
    [tenantId, ticket.id],
  )

  assert.equal((await listCsat(ctx, { maxScore: 3, reviewed: false })).total, 1)
  const reviewed = await reviewCsat(ctx, rows[0].id, 'Called them back.')
  assert.equal(reviewed.reviewNote, 'Called them back.')
  assert.ok(reviewed.reviewedAt)

  assert.equal((await listCsat(ctx, { maxScore: 3, reviewed: false })).total, 0)
  assert.equal((await listCsat(ctx, { maxScore: 3, reviewed: true })).total, 1)
  const { rows: who } = await db.query<{ reviewed_by: string }>('select reviewed_by from csat_responses where id = $1', [rows[0].id])
  assert.equal(who[0].reviewed_by, userId)
  await db.close()
})

test('the CSAT average and distribution are counted over every rating, not over one page', async () => {
  // The report pane used to mean over the rows it happened to load — the
  // endpoint returns at most 100 — and print that as "the" average, with
  // "Ratings received" silently stopping at the page size.
  const { db, ctx, tenantId } = await helpdesk()
  const scores = [5, 5, 4, 1]
  for (const [index, score] of scores.entries()) {
    const ticket = await createTicket(ctx, { subject: `T${index}`, body: 'x', priority: 'medium' })
    await db.query(
      `insert into csat_responses (tenant_id, ticket_id, token_hash, score, responded_at) values ($1,$2,$3,$4,now())`,
      [tenantId, ticket.id, `h${index}`, score],
    )
  }

  const page = await listCsat(ctx, { answeredOnly: true, limit: 1 })
  assert.equal(page.rows.length, 1, 'one row was asked for')
  assert.equal(page.total, 4, 'the count is of every rating, not of the page')
  assert.equal(page.average, '3.8', 'and so is the mean: (5+5+4+1)/4')
  assert.deepEqual(page.distribution, [
    { score: 5, count: 2 },
    { score: 4, count: 1 },
    { score: 1, count: 1 },
  ])

  // `maxScore: 2` still matches the 1, so it is not the empty case. Nothing
  // scores at or below 0, which is: the mean of no ratings is null, not zero,
  // because zero is a score somebody could have given.
  const lowOnly = await listCsat(ctx, { maxScore: 2, answeredOnly: true, limit: 1 })
  assert.equal(lowOnly.average, '1.0')
  assert.equal(lowOnly.total, 1)

  const none = await listCsat(ctx, { maxScore: 0, answeredOnly: true, limit: 1 })
  assert.equal(none.total, 0)
  assert.equal(none.average, null, 'the mean of no ratings is null, not zero')
  await db.close()
})

/* ------------------------------- auto-close -------------------------------- */

test('auto-close settles resolved tickets past the window and leaves fresh ones alone', async () => {
  const { db, c, ctx, make } = await helpdesk()
  await withCsatSettings(ctx, { sendOnResolve: true, waitHours: 0, skipOlderDays: 7, lowScore: 3, slaWarnPercent: 75, portalUrl: '' })
  const old = await createTicket(ctx, { subject: 'Old', body: 'x', priority: 'medium' })
  await transitionTicket(ctx, old.id, { status: 'resolved', version: old.version })

  const later = await make(c.advance(10 * 86_400_000))
  const fresh = await createTicket(later, { subject: 'Fresh', body: 'x', priority: 'medium' })
  await transitionTicket(later, fresh.id, { status: 'resolved', version: fresh.version })

  assert.deepEqual(await autoCloseResolved(later), { closed: 1, status: 'closed' })
  assert.equal((await listTickets(later, { ticketId: old.id })).rows[0].status, 'closed')
  assert.equal((await listTickets(later, { ticketId: fresh.id })).rows[0].status, 'resolved')

  // The transition already happened; running again must not churn versions.
  assert.equal((await autoCloseResolved(later)).closed, 0)
  await db.close()
})

test('auto-close refuses rather than guessing when no status is a closed state', async () => {
  const { db, ctx, tenantId } = await helpdesk()
  await db.query(`update ticket_field_options set behaviour = 'active' where tenant_id = $1 and field = 'status'`, [tenantId])
  // Inventing a destination would move tickets into a state the tenant never
  // configured, and nothing on screen would say where they went.
  await assert.rejects(() => autoCloseResolved(ctx), (e: any) => e.code === 'no_closed_status')
  await db.close()
})

/* --------------------------------- export ---------------------------------- */

test('the ticket export neutralises anything a spreadsheet would execute', async () => {
  const { db, ctx } = await helpdesk()
  await createTicket(ctx, { subject: '=cmd|/c calc', body: 'x', priority: 'medium' })
  const csv = await exportTicketsCsv(ctx)
  assert.ok(csv.includes('"\'=cmd|/c calc"'), 'the formula is prefixed so it opens as text')
  assert.equal(csv.trim().split('\r\n').length, 2, 'a header and the one ticket')
  await db.close()
})

/* ---------------------------- the HTTP boundary --------------------------- */

/**
 * The new aggregate and CSAT endpoints, over HTTP.
 *
 * The service tests above prove the rules; these prove a browser can reach
 * them and that the query strings the screens send are parsed the way the
 * screens mean them. A service can be right and still unreachable.
 *
 * This needs the shared handle `tenantRoute` opens, which is separate from the
 * in-memory database the tests above use, so it gets its own directory.
 */
/*
 * Opened on first use, not at import. `tenantRoute` reaches for the shared
 * handle, and holding a second PGlite open for the whole file made every
 * in-memory database above it an order of magnitude slower to create — a
 * fifteen-minute run of what takes twenty seconds.
 */
let shared: Promise<{ db: Awaited<ReturnType<typeof freshDb>> }> | null = null
function httpDb() {
  shared ??= (async () => {
    const { mkdtemp } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    process.env.PGLITE_DIR = await mkdtemp(join(tmpdir(), 'apragya-support-'))
    const { getDb } = await import('../src/server/db/client.ts')
    const db = await getDb()
    await (await import('../src/server/db/migrate.ts')).migrate(db)
    return { db }
  })()
  return shared
}

const registerRoute = (await import('../src/app/api/v1/auth/register/route.ts')).POST
const tenantsRoute = (await import('../src/app/api/v1/tenants/route.ts')).POST
const ticketsRoute = await import('../src/app/api/v1/support/tickets/route.ts')
const statsRoute = await import('../src/app/api/v1/support/stats/route.ts')
const csatRoute = await import('../src/app/api/v1/support/csat/route.ts')
const slaReportRoute = await import('../src/app/api/v1/support/reports/sla/route.ts')
const exportRoute = await import('../src/app/api/v1/support/exports/tickets/route.ts')
const kbArticlesRoute = await import('../src/app/api/v1/support/kb/articles/route.ts')
const kbArticleRoute = await import('../src/app/api/v1/support/kb/articles/[id]/route.ts')

const ORIGIN = 'http://test.local'
const httpPost = (path: string, body: unknown, cookie?: string) =>
  new Request(ORIGIN + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
const httpGet = (path: string, cookie: string) => new Request(ORIGIN + path, { headers: { cookie } })
const httpDelete = (path: string, cookie: string) => new Request(ORIGIN + path, { method: 'DELETE', headers: { cookie } })
const cookieOf = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0]

let workspaceSeq = 0
async function signedInOwner(): Promise<string> {
  await httpDb()
  workspaceSeq += 1
  const email = `support-http-${workspaceSeq}@example.com`
  const signedUp = cookieOf(
    await registerRoute(
      httpPost('/api/v1/auth/register', { email, fullName: 'Owner', password: 'correct horse battery staple' }),
    ),
  )
  const created = await tenantsRoute(httpPost('/api/v1/tenants', { name: `Support ${workspaceSeq}` }, signedUp))
  assert.equal(created.status, 201, 'workspace creation failed')
  return cookieOf(created)
}

test('the dashboard endpoint answers with every tile, and no rating is null rather than zero', async () => {
  const cookie = await signedInOwner()
  await ticketsRoute.POST(httpPost('/api/v1/support/tickets', { subject: 'Printer', body: 'It jams.' }, cookie))

  const response = await statsRoute.GET(httpGet('/api/v1/support/stats', cookie))
  assert.equal(response.status, 200)
  const { stats } = await response.json()
  assert.equal(stats.total, 1)
  assert.equal(stats.open, 1)
  assert.equal(stats.csatAverage, null)
  assert.equal(stats.csatResponses, 0)
  assert.deepEqual(
    stats.byStatus.map((row: { slug: string; count: number }) => [row.slug, row.count]),
    [['new', 1]],
  )
})

test('reviewed=false reaches the server as false, not as a non-empty string', async () => {
  const cookie = await signedInOwner()
  const created = await ticketsRoute.POST(httpPost('/api/v1/support/tickets', { subject: 'Slow', body: 'Very.' }, cookie))
  const { ticket } = await created.json()
  const { db } = await httpDb()
  const { rows } = await db.query<{ tenant_id: string }>('select tenant_id from tickets where id = $1', [ticket.id])
  await db.query(
    `insert into csat_responses (tenant_id, ticket_id, token_hash, score, responded_at, reviewed_at)
     values ($1,$2,'reviewed-token',1,now(),now())`,
    [rows[0].tenant_id, ticket.id],
  )

  // `z.coerce.boolean()` would read the string "false" as true and invert the
  // review queue, which is why the route spells the two values out.
  const unreviewed = await csatRoute.GET(httpGet('/api/v1/support/csat?reviewed=false', cookie))
  assert.equal((await unreviewed.json()).total, 0)

  const reviewed = await csatRoute.GET(httpGet('/api/v1/support/csat?reviewed=true', cookie))
  assert.equal((await reviewed.json()).total, 1)
})

test('the ticket list understands the four filters the screens need', async () => {
  const cookie = await signedInOwner()
  await ticketsRoute.POST(
    httpPost('/api/v1/support/tickets', { subject: 'A', body: 'x', channel: 'email', tags: ['vip'], requesterEmail: 'sam@corp.test' }, cookie),
  )
  await ticketsRoute.POST(httpPost('/api/v1/support/tickets', { subject: 'B', body: 'x', channel: 'phone' }, cookie))

  const byChannel = await ticketsRoute.GET(httpGet('/api/v1/support/tickets?channel=email', cookie))
  assert.equal((await byChannel.json()).total, 1)

  const byTag = await ticketsRoute.GET(httpGet('/api/v1/support/tickets?tags=vip,urgent', cookie))
  assert.equal((await byTag.json()).total, 1, 'the comma-separated list is split into an any-of match')

  const byRequester = await ticketsRoute.GET(httpGet('/api/v1/support/tickets?requesterEmail=sam@corp.test', cookie))
  assert.equal((await byRequester.json()).total, 1)

  const unassigned = await ticketsRoute.GET(httpGet('/api/v1/support/tickets?unassigned=true', cookie))
  assert.equal((await unassigned.json()).total, 2, 'nobody holds either of them yet')
})

test('the SLA report answers a row per priority over the window', async () => {
  const cookie = await signedInOwner()
  await ticketsRoute.POST(httpPost('/api/v1/support/tickets', { subject: 'A', body: 'x', priority: 'medium' }, cookie))

  const response = await slaReportRoute.GET(httpGet('/api/v1/support/reports/sla?from=2020-01-01', cookie))
  assert.equal(response.status, 200)
  const { rows } = await response.json()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].priority, 'medium')
  assert.equal(rows[0].tickets, 1)
})

test('the ticket export downloads as a CSV attachment rather than rendering', async () => {
  const cookie = await signedInOwner()
  await ticketsRoute.POST(httpPost('/api/v1/support/tickets', { subject: 'Export me', body: 'x' }, cookie))

  const response = await exportRoute.GET(httpGet('/api/v1/support/exports/tickets', cookie))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/csv/)
  // `attachment` and nosniff together are what stop a crafted cell being
  // rendered on our own origin.
  assert.match(response.headers.get('content-disposition') ?? '', /^attachment; filename="tickets-/)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.match(await response.text(), /Export me/)
})

test('archiving an article over HTTP carries the version and is refused when stale', async () => {
  const cookie = await signedInOwner()
  const created = await kbArticlesRoute.POST(
    httpPost('/api/v1/support/kb/articles', { title: 'Reset your PIN', body: 'Press reset.' }, cookie),
  )
  const { article } = await created.json()

  const stale = await kbArticleRoute.DELETE(
    httpDelete(`/api/v1/support/kb/articles/${article.id}?version=${article.version - 1}`, cookie),
  )
  assert.equal(stale.status, 409, 'a stale archive must not clobber somebody else’s edit')

  const archived = await kbArticleRoute.DELETE(
    httpDelete(`/api/v1/support/kb/articles/${article.id}?version=${article.version}`, cookie),
  )
  assert.equal(archived.status, 200)
  assert.equal((await archived.json()).article.status, 'archived')
})
