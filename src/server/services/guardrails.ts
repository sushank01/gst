import { notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { balance } from './credits.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Guardrail evaluation.
 *
 * A policy that is stored but never consulted is decoration. These evaluators
 * run at named checkpoints and return a decision the caller must honour, and
 * every decision that is not "allow" is recorded as a violation with the
 * matched excerpt — redacted — so an operator can see what was stopped and why.
 *
 * Two properties are deliberate:
 *
 *  - `failure_mode` is answered per policy. An evaluator that throws does not
 *    silently allow the request; a policy marked `closed` blocks, which is the
 *    only safe default for a rule somebody wrote to prevent something.
 *  - The excerpt stored is the match, never the whole payload. A violation log
 *    that copies the input is a second place the sensitive data now lives.
 */

export type Checkpoint = 'input' | 'output' | 'tool_call' | 'tool_result'
export type GuardrailAction = 'block' | 'warn' | 'redact' | 'human_review'

export type PolicyRow = {
  id: string
  name: string
  kind: string
  checkpoint: Checkpoint
  action: GuardrailAction
  config: Record<string, unknown>
  failureMode: 'open' | 'closed'
  active: boolean
  version: number
}

export type Decision = {
  /** What the caller must do. `allow` only when nothing matched. */
  outcome: 'allow' | 'warn' | 'redact' | 'block' | 'human_review'
  /** The text to use onward — redacted when a redact policy matched. */
  text: string
  violations: { policyId: string; policyName: string; action: GuardrailAction; excerpt: string; reason: string }[]
}

type Raw = Record<string, unknown>

const mapPolicy = (row: Raw): PolicyRow => ({
  id: row.id as string,
  name: row.name as string,
  kind: row.kind as string,
  checkpoint: row.checkpoint as Checkpoint,
  action: row.action as GuardrailAction,
  config: (row.config as Record<string, unknown>) ?? {},
  failureMode: row.failure_mode as 'open' | 'closed',
  active: row.active as boolean,
  version: row.version as number,
})

/*
 * Patterns for the built-in PII kinds. Deliberately conservative: a pattern
 * that over-matches turns a guardrail into a nuisance an operator switches
 * off, which is worse than a narrower one they keep on.
 */
const PII_PATTERNS: Record<string, RegExp> = {
  email: /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi,
  // 13-19 digits, optionally separated, which covers the card ranges in use.
  card: /\b(?:\d[ -]?){13,19}\b/g,
  // Indian PAN and Aadhaar, the two identifiers this product's users hold.
  pan: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
  aadhaar: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,
  phone: /\b(?:\+?\d{1,3}[ -]?)?\d{10}\b/g,
}

/** Keeps enough of a match to recognise it, never enough to use it. */
function redactMatch(match: string): string {
  const visible = match.length <= 4 ? 0 : Math.min(4, Math.floor(match.length / 4))
  return visible === 0 ? '*'.repeat(match.length) : `${'*'.repeat(match.length - visible)}${match.slice(-visible)}`
}

/** An excerpt safe to store: the match already masked, with a little context. */
function safeExcerpt(kind: string, match: string): string {
  return `${kind}: ${redactMatch(match)}`
}

export async function listPolicies(ctx: TenantContext, checkpoint?: Checkpoint): Promise<PolicyRow[]> {
  ctx.require('record.read')
  const { rows } = checkpoint
    ? await ctx.db.query<Raw>(
        'select * from guardrail_policies where tenant_id = $1 and checkpoint = $2 order by created_at',
        [ctx.tenantId, checkpoint],
      )
    : await ctx.db.query<Raw>('select * from guardrail_policies where tenant_id = $1 order by created_at', [ctx.tenantId])
  return rows.map(mapPolicy)
}

export async function createPolicy(
  ctx: TenantContext,
  input: {
    name: string
    kind: 'keyword' | 'content' | 'pii' | 'spend' | 'rate' | 'schema'
    checkpoint: Checkpoint
    action: GuardrailAction
    config?: Record<string, unknown>
    failureMode?: 'open' | 'closed'
  },
): Promise<PolicyRow> {
  ctx.require('settings.manage')

  // A policy whose configuration cannot match anything would sit in the list
  // looking like protection. Refused at creation rather than discovered later.
  const config = input.config ?? {}
  if (input.kind === 'keyword' && !(Array.isArray(config.keywords) && config.keywords.length)) {
    throw unprocessable('empty_policy', 'A keyword policy needs at least one keyword.')
  }
  if (input.kind === 'pii' && !(Array.isArray(config.types) && config.types.length)) {
    throw unprocessable('empty_policy', 'A PII policy needs at least one identifier type.')
  }
  if (input.kind === 'pii') {
    const unknown = (config.types as string[]).filter((type) => !(type in PII_PATTERNS))
    if (unknown.length) {
      throw unprocessable('unknown_pii_type', `No detector exists for: ${unknown.join(', ')}.`)
    }
  }
  if (input.kind === 'spend' && typeof config.maxCredits !== 'number') {
    throw unprocessable('empty_policy', 'A spend policy needs a credit ceiling.')
  }

  const { rows } = await ctx.db.query<Raw>(
    `insert into guardrail_policies (tenant_id, name, kind, checkpoint, action, config, failure_mode, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [
      ctx.tenantId,
      input.name,
      input.kind,
      input.checkpoint,
      input.action,
      JSON.stringify(config),
      input.failureMode ?? 'closed',
      ctx.userId,
    ],
  )
  await recordAudit(ctx.db, ctx, {
    action: 'guardrail.created',
    resource: 'guardrail_policy',
    resourceId: rows[0].id as string,
    detail: { kind: input.kind, checkpoint: input.checkpoint, action: input.action },
  })
  return mapPolicy(rows[0])
}

export async function setPolicyActive(ctx: TenantContext, policyId: string, active: boolean): Promise<PolicyRow> {
  ctx.require('settings.manage')
  const { rows } = await ctx.db.query<Raw>(
    `update guardrail_policies set active = $3, version = version + 1, updated_at = $4
      where id = $1 and tenant_id = $2 returning *`,
    [policyId, ctx.tenantId, active, ctx.now],
  )
  if (!rows[0]) throw notFound('That policy')
  await recordAudit(ctx.db, ctx, {
    action: active ? 'guardrail.enabled' : 'guardrail.disabled',
    resource: 'guardrail_policy',
    resourceId: policyId,
  })
  return mapPolicy(rows[0])
}

type Match = { excerpt: string; reason: string; redacted: string }

/** Applies one policy to one piece of text. Returns null when nothing matched. */
async function evaluatePolicy(db: Db, ctx: TenantContext, policy: PolicyRow, text: string): Promise<Match | null> {
  if (policy.kind === 'keyword') {
    const keywords = (policy.config.keywords as string[]) ?? []
    const lower = text.toLowerCase()
    const hit = keywords.find((keyword) => lower.includes(keyword.toLowerCase()))
    if (!hit) return null
    return {
      excerpt: safeExcerpt('keyword', hit),
      reason: `Matched the blocked term "${hit}".`,
      redacted: text.replace(new RegExp(hit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[redacted]'),
    }
  }

  if (policy.kind === 'pii') {
    const types = (policy.config.types as string[]) ?? []
    let redacted = text
    const found: string[] = []
    for (const type of types) {
      const pattern = PII_PATTERNS[type]
      if (!pattern) continue
      const matches = text.match(new RegExp(pattern.source, pattern.flags))
      if (!matches?.length) continue
      found.push(`${type} x${matches.length}`)
      redacted = redacted.replace(new RegExp(pattern.source, pattern.flags), (match) => redactMatch(match))
    }
    if (!found.length) return null
    return {
      excerpt: `pii: ${found.join(', ')}`,
      reason: `Found ${found.join(', ')}.`,
      redacted,
    }
  }

  if (policy.kind === 'spend') {
    // The ceiling is checked against the live ledger balance, so a policy
    // written to cap spend actually caps it rather than describing a cap.
    const ceiling = policy.config.maxCredits as number
    const current = await balance(db, ctx.tenantId)
    if (current.used <= ceiling) return null
    return {
      excerpt: `spend: ${current.used}/${ceiling}`,
      reason: `Credit use of ${current.used} is over the ceiling of ${ceiling}.`,
      redacted: text,
    }
  }

  if (policy.kind === 'schema') {
    const required = (policy.config.requiredKeys as string[]) ?? []
    if (!required.length) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return { excerpt: 'schema: not json', reason: 'The payload is not valid JSON.', redacted: text }
    }
    const missing = required.filter((key) => !(parsed as Record<string, unknown>)?.[key])
    if (!missing.length) return null
    return { excerpt: `schema: missing ${missing.join(', ')}`, reason: `Missing: ${missing.join(', ')}.`, redacted: text }
  }

  /*
   * 'content' and 'rate' have no evaluator. Rather than quietly allowing
   * everything, they throw — which sends them down the failure-mode path, so a
   * policy marked `closed` blocks and the operator finds out immediately that
   * it is not implemented. Silently passing would be the worse lie.
   */
  throw new Error(`No evaluator is implemented for guardrail kind "${policy.kind}".`)
}

const SEVERITY: Record<GuardrailAction, number> = { warn: 1, redact: 2, human_review: 3, block: 4 }

/**
 * Runs every active policy for a checkpoint and returns the decision.
 *
 * The strictest matching action wins — a block beats a warn — and a redact
 * policy rewrites the text the caller should use onward. Callers MUST honour
 * the outcome; this function enforces nothing by itself, it decides.
 */
export async function evaluate(
  ctx: TenantContext,
  checkpoint: Checkpoint,
  text: string,
  context: { resource?: string; resourceId?: string; runId?: string } = {},
): Promise<Decision> {
  const policies = (await listPolicies(ctx, checkpoint)).filter((policy) => policy.active)

  const decision: Decision = { outcome: 'allow', text, violations: [] }
  let strongest = 0

  for (const policy of policies) {
    let match: Match | null
    try {
      match = await evaluatePolicy(ctx.db, ctx, policy, decision.text)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (policy.failureMode === 'open') {
        // Explicitly chosen: this policy is advisory and must not stop work.
        continue
      }
      // Fail closed: an evaluator we cannot run is treated as a block, because
      // a rule somebody wrote to prevent something must not be bypassed by
      // breaking it.
      match = { excerpt: 'evaluator failed', reason, redacted: decision.text }
      await record(ctx, policy, 'block', match, context)
      decision.violations.push({
        policyId: policy.id,
        policyName: policy.name,
        action: 'block',
        excerpt: match.excerpt,
        reason: `${reason} The policy fails closed, so the request is blocked.`,
      })
      strongest = Math.max(strongest, SEVERITY.block)
      continue
    }

    if (!match) continue

    if (policy.action === 'redact') decision.text = match.redacted
    await record(ctx, policy, policy.action, match, context)
    decision.violations.push({
      policyId: policy.id,
      policyName: policy.name,
      action: policy.action,
      excerpt: match.excerpt,
      reason: match.reason,
    })
    strongest = Math.max(strongest, SEVERITY[policy.action])
  }

  if (strongest === SEVERITY.block) decision.outcome = 'block'
  else if (strongest === SEVERITY.human_review) decision.outcome = 'human_review'
  else if (strongest === SEVERITY.redact) decision.outcome = 'redact'
  else if (strongest === SEVERITY.warn) decision.outcome = 'warn'

  return decision
}

async function record(
  ctx: TenantContext,
  policy: PolicyRow,
  action: GuardrailAction,
  match: Match,
  context: { resource?: string; resourceId?: string; runId?: string },
): Promise<void> {
  await ctx.db.query(
    `insert into guardrail_violations
       (tenant_id, policy_id, policy_version, checkpoint, action_taken, resource, resource_id, run_id, excerpt, actor_user_id, occurred_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      ctx.tenantId,
      policy.id,
      policy.version,
      policy.checkpoint,
      action,
      context.resource ?? null,
      context.resourceId ?? null,
      context.runId ?? null,
      // Already masked by the evaluator. The whole payload is never stored:
      // a violation log that copies the input is a second copy of the secret.
      match.excerpt.slice(0, 500),
      ctx.userId,
      ctx.now,
    ],
  )
}

export type ViolationRow = {
  policyName: string | null
  checkpoint: string
  actionTaken: string
  excerpt: string | null
  occurredAt: string
}

export async function listViolations(ctx: TenantContext, limit = 100): Promise<ViolationRow[]> {
  ctx.require('audit.read')
  const { rows } = await ctx.db.query<{
    name: string | null
    checkpoint: string
    action_taken: string
    excerpt: string | null
    occurred_at: Date
  }>(
    `select p.name, v.checkpoint, v.action_taken, v.excerpt, v.occurred_at
       from guardrail_violations v
       left join guardrail_policies p on p.id = v.policy_id
      where v.tenant_id = $1 order by v.occurred_at desc, v.id desc limit $2`,
    [ctx.tenantId, Math.min(limit, 500)],
  )
  return rows.map((row) => ({
    policyName: row.name,
    checkpoint: row.checkpoint,
    actionTaken: row.action_taken,
    excerpt: row.excerpt,
    occurredAt: new Date(row.occurred_at).toISOString(),
  }))
}
