import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, clock, seedUser } from './helpers/db.ts'
import { createSession } from '../src/server/auth/session.ts'
import { authenticate, withTenant } from '../src/server/tenancy/context.ts'
import { createTenantWithOwner } from '../src/server/services/tenancy.ts'
import { createPolicy, evaluate, listViolations, setPolicyActive } from '../src/server/services/guardrails.ts'
import { grant } from '../src/server/services/credits.ts'

async function workspace() {
  const db = await freshDb()
  const c = clock()
  const owner = await seedUser(db, { email: 'owner@example.com', fullName: 'Owner' })
  const acme = await createTenantWithOwner(db, owner, { name: 'Acme' }, c.now(), 'r1')
  const { token } = await createSession(db, { userId: owner, tenantId: acme.tenantId }, c.now())
  return { db, c, ctx: await withTenant(await authenticate(db, token, { now: c.now(), requestId: 'r' })) }
}

test('a policy that could never match is refused at creation', async () => {
  const { db, ctx } = await workspace()
  await assert.rejects(
    () => createPolicy(ctx, { name: 'Empty', kind: 'keyword', checkpoint: 'input', action: 'block', config: { keywords: [] } }),
    /at least one keyword/i,
    'a policy that matches nothing sits in the list looking like protection',
  )
  await assert.rejects(
    () => createPolicy(ctx, { name: 'No types', kind: 'pii', checkpoint: 'output', action: 'redact', config: { types: [] } }),
    /at least one identifier/i,
  )
  await assert.rejects(
    () =>
      createPolicy(ctx, {
        name: 'Unknown',
        kind: 'pii',
        checkpoint: 'output',
        action: 'redact',
        config: { types: ['passport'] },
      }),
    /No detector exists/i,
    'claiming to detect something with no detector is the lie this refuses',
  )
  await db.close()
})

test('a keyword policy blocks, and the decision is recorded without the payload', async () => {
  const { db, ctx } = await workspace()
  await createPolicy(ctx, {
    name: 'No competitor names',
    kind: 'keyword',
    checkpoint: 'input',
    action: 'block',
    config: { keywords: ['acquisition target', 'Project Nimbus'] },
  })

  const clean = await evaluate(ctx, 'input', 'Draft a reply about the quarterly numbers.')
  assert.equal(clean.outcome, 'allow')
  assert.deepEqual(clean.violations, [])

  const blocked = await evaluate(ctx, 'input', 'Summarise the Project Nimbus board pack for the client.')
  assert.equal(blocked.outcome, 'block')
  assert.equal(blocked.violations[0].action, 'block')

  const violations = await listViolations(ctx)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].actionTaken, 'block')
  assert.ok(
    !violations[0].excerpt?.includes('board pack'),
    'a violation log that copies the input is a second place the secret now lives',
  )
  await db.close()
})

test('a PII policy redacts the text the caller should use onward', async () => {
  const { db, ctx } = await workspace()
  await createPolicy(ctx, {
    name: 'Mask identifiers',
    kind: 'pii',
    checkpoint: 'output',
    action: 'redact',
    config: { types: ['email', 'card', 'pan'] },
  })

  const decision = await evaluate(ctx, 'output', 'Write to ada@example.com, card 4111 1111 1111 1111, PAN ABCDE1234F.')
  assert.equal(decision.outcome, 'redact')
  assert.ok(!decision.text.includes('ada@example.com'))
  assert.ok(!decision.text.includes('4111 1111 1111 1111'))
  assert.ok(!decision.text.includes('ABCDE1234F'))
  // Enough is left to recognise which value was masked, never enough to use it.
  assert.match(decision.text, /\*+com/)
  assert.match(decision.violations[0].excerpt, /pii: /)
  await db.close()
})

test('the strictest matching action wins', async () => {
  const { db, ctx } = await workspace()
  await createPolicy(ctx, {
    name: 'Warn on drafts',
    kind: 'keyword',
    checkpoint: 'output',
    action: 'warn',
    config: { keywords: ['draft'] },
  })
  await createPolicy(ctx, {
    name: 'Mask emails',
    kind: 'pii',
    checkpoint: 'output',
    action: 'redact',
    config: { types: ['email'] },
  })
  await createPolicy(ctx, {
    name: 'Never send internal',
    kind: 'keyword',
    checkpoint: 'output',
    action: 'block',
    config: { keywords: ['internal only'] },
  })

  const warned = await evaluate(ctx, 'output', 'This is a draft.')
  assert.equal(warned.outcome, 'warn')

  const mixed = await evaluate(ctx, 'output', 'A draft for ada@example.com — internal only.')
  assert.equal(mixed.outcome, 'block', 'a block beats a warn and a redact')
  assert.equal(mixed.violations.length, 3, 'every matching policy is still recorded')
  await db.close()
})

test('an inactive policy stops enforcing, and re-enabling starts it again', async () => {
  const { db, ctx } = await workspace()
  const policy = await createPolicy(ctx, {
    name: 'Block secrets',
    kind: 'keyword',
    checkpoint: 'input',
    action: 'block',
    config: { keywords: ['secret'] },
  })
  assert.equal((await evaluate(ctx, 'input', 'the secret plan')).outcome, 'block')

  await setPolicyActive(ctx, policy.id, false)
  assert.equal((await evaluate(ctx, 'input', 'the secret plan')).outcome, 'allow')

  await setPolicyActive(ctx, policy.id, true)
  assert.equal((await evaluate(ctx, 'input', 'the secret plan')).outcome, 'block')
  await db.close()
})

test('a policy only runs at its own checkpoint', async () => {
  const { db, ctx } = await workspace()
  await createPolicy(ctx, {
    name: 'Output only',
    kind: 'keyword',
    checkpoint: 'output',
    action: 'block',
    config: { keywords: ['confidential'] },
  })
  assert.equal((await evaluate(ctx, 'input', 'confidential')).outcome, 'allow')
  assert.equal((await evaluate(ctx, 'output', 'confidential')).outcome, 'block')
  await db.close()
})

test('a spend ceiling is checked against the ledger, not described', async () => {
  const { db, ctx } = await workspace()
  await createPolicy(ctx, {
    name: 'Monthly ceiling',
    kind: 'spend',
    checkpoint: 'tool_call',
    action: 'block',
    config: { maxCredits: 100 },
  })
  assert.equal((await evaluate(ctx, 'tool_call', 'run the agent')).outcome, 'allow')

  // Spend past the ceiling through the real ledger.
  await grant(db, ctx.tenantId, 1000, 'trial allocation')
  const { reserve, settle } = await import('../src/server/services/credits.ts')
  const reservation = await reserve(ctx, { amount: 150, reason: 'agent run' })
  await settle(ctx, reservation.reservationId, 150)

  const blocked = await evaluate(ctx, 'tool_call', 'run the agent')
  assert.equal(blocked.outcome, 'block')
  assert.match(blocked.violations[0].reason, /over the ceiling of 100/)
  await db.close()
})

test('FAIL CLOSED: a kind with no evaluator blocks rather than silently allowing', async () => {
  const { db, ctx } = await workspace()
  await createPolicy(ctx, {
    name: 'Content classifier',
    kind: 'content',
    checkpoint: 'input',
    action: 'block',
    config: { model: 'unavailable' },
    failureMode: 'closed',
  })

  const decision = await evaluate(ctx, 'input', 'anything at all')
  assert.equal(decision.outcome, 'block', 'a rule that cannot run must not be bypassed by breaking it')
  assert.match(decision.violations[0].reason, /No evaluator is implemented/)
  assert.match(decision.violations[0].reason, /fails closed/)
  await db.close()
})

test('FAIL OPEN: an advisory policy that cannot run lets work continue', async () => {
  const { db, ctx } = await workspace()
  await createPolicy(ctx, {
    name: 'Advisory classifier',
    kind: 'content',
    checkpoint: 'input',
    action: 'warn',
    config: {},
    failureMode: 'open',
  })
  const decision = await evaluate(ctx, 'input', 'anything at all')
  assert.equal(decision.outcome, 'allow', 'failing open is a choice somebody made explicitly')
  assert.deepEqual(decision.violations, [])
  await db.close()
})

test('a schema policy checks the payload it is given', async () => {
  const { db, ctx } = await workspace()
  await createPolicy(ctx, {
    name: 'Tool arguments',
    kind: 'schema',
    checkpoint: 'tool_call',
    action: 'block',
    config: { requiredKeys: ['customerId', 'amount'] },
  })
  assert.equal((await evaluate(ctx, 'tool_call', '{"customerId":"c1","amount":10}')).outcome, 'allow')

  const missing = await evaluate(ctx, 'tool_call', '{"customerId":"c1"}')
  assert.equal(missing.outcome, 'block')
  assert.match(missing.violations[0].reason, /Missing: amount/)

  const notJson = await evaluate(ctx, 'tool_call', 'customerId=c1')
  assert.equal(notJson.outcome, 'block')
  await db.close()
})

test('policies and violations never cross workspaces', async () => {
  const { db, ctx } = await workspace()
  const mallory = await seedUser(db, { email: 'mallory@example.com', fullName: 'Mallory' })
  const evil = await createTenantWithOwner(db, mallory, { name: 'Evil' }, ctx.now, 'r2')
  const { token } = await createSession(db, { userId: mallory, tenantId: evil.tenantId }, ctx.now)
  const theirs = await withTenant(await authenticate(db, token, { now: ctx.now, requestId: 'r' }))

  await createPolicy(ctx, {
    name: 'Block secrets',
    kind: 'keyword',
    checkpoint: 'input',
    action: 'block',
    config: { keywords: ['secret'] },
  })
  await evaluate(ctx, 'input', 'the secret plan')

  assert.equal((await evaluate(theirs, 'input', 'the secret plan')).outcome, 'allow', 'our rules are not theirs')
  assert.equal((await listViolations(theirs)).length, 0)
  await db.close()
})
