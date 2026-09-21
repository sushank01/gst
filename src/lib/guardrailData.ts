/** Guardrail policy vocabulary, as the live Guardrails table renders it. */

export type GuardrailType =
  | 'Keyword Block'
  | 'Content Filter'
  | 'PII Redaction'
  | 'Spend Cap'
  | 'Rate Limit'
  | 'Schema Validation'

/** What the policy does when it matches. `hitl` pauses the run for a reviewer. */
export type GuardrailAction = 'warn' | 'block' | 'redact' | 'hitl'

export type CheckPoint = 'Input' | 'Output' | 'Both'

export const guardrailTypes: GuardrailType[] = [
  'Keyword Block',
  'Content Filter',
  'PII Redaction',
  'Spend Cap',
  'Rate Limit',
  'Schema Validation',
]

export const guardrailActions: GuardrailAction[] = ['warn', 'block', 'redact', 'hitl']
export const checkPoints: CheckPoint[] = ['Input', 'Output', 'Both']

/** Amber for advisory, red for hard stops — the live table colours `warn` amber. */
export const actionTone: Record<GuardrailAction, string> = {
  warn: 'bg-warn-muted text-warn',
  block: 'bg-bad-muted text-bad',
  redact: 'bg-accent-muted text-accent',
  hitl: 'bg-surface-2 text-fg-2',
}
