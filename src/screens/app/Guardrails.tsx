'use client'

import { useCallback, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useSearchParams } from '../../lib/router'
import { Button } from '../../components/ui'
import { api } from '../../lib/api'
import { useMutation, useResource } from '../../lib/useResource'

/**
 * Guardrail policies and the violations they produced, from the server.
 *
 * The prototype's vocabulary was its own — 'Both' check points, a per-app
 * scope, limits written into policy names — and none of it reached an
 * evaluator. What is rendered here is what `guardrail_policies` stores and what
 * `evaluate()` actually consults.
 *
 * What this screen must NOT claim is that saving a policy constrains anything
 * by itself. `evaluate()` has exactly one caller in this repository —
 * `POST /api/v1/guardrails/evaluate` — and nothing in the product posts to it:
 * there is no agent runtime, no execution engine and no agent_runs table, so
 * "runs on every agent in this workspace" would name a population of nought.
 * A policy here is a rule the server will enforce for whatever asks it to; the
 * copy below says that and no more.
 */

const tabs = [
  { id: 'policies', label: 'Policies', icon: '⛨' },
  { id: 'violations', label: 'Violations', icon: '⚠' },
] as const

type PolicyKind = 'keyword' | 'content' | 'pii' | 'spend' | 'rate' | 'schema'
type Checkpoint = 'input' | 'output' | 'tool_call' | 'tool_result'
type PolicyAction = 'block' | 'warn' | 'redact' | 'human_review'

type ServerPolicy = {
  id: string
  name: string
  kind: PolicyKind
  checkpoint: Checkpoint
  action: PolicyAction
  config: Record<string, unknown>
  failureMode: 'open' | 'closed'
  active: boolean
  version: number
}

type Violation = {
  policyName: string | null
  checkpoint: string
  actionTaken: string
  excerpt: string | null
  occurredAt: string
}

const kindLabels: Record<PolicyKind, string> = {
  keyword: 'Keyword block',
  content: 'Content filter',
  pii: 'PII redaction',
  spend: 'Spend cap',
  rate: 'Rate limit',
  schema: 'Schema validation',
}

const checkpointLabels: Record<Checkpoint, string> = {
  input: 'Input',
  output: 'Output',
  tool_call: 'Tool call',
  tool_result: 'Tool result',
}

const actionLabels: Record<PolicyAction, string> = {
  block: 'block',
  warn: 'warn',
  redact: 'redact',
  human_review: 'human review',
}

/** Amber for advisory, red for hard stops — the colours the live table used. */
const actionTone: Record<PolicyAction, string> = {
  warn: 'bg-warn-muted text-warn',
  block: 'bg-bad-muted text-bad',
  redact: 'bg-accent-muted text-accent',
  human_review: 'bg-surface-2 text-fg-2',
}

/** The identifiers `evaluate()` has a detector for. Anything else is refused. */
const piiTypes = ['email', 'card', 'pan', 'aadhaar', 'phone'] as const

/** Kinds with no evaluator behind them. Offered, but never silently. */
const unimplemented: PolicyKind[] = ['content', 'rate']

const splitList = (value: string) =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)

const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

function usePolicies() {
  const resource = useResource<{ policies: ServerPolicy[] }>(
    'guardrail-policies',
    useCallback((signal) => api.get<{ policies: ServerPolicy[] }>('/guardrails', undefined, signal), []),
  )
  const { refetch } = resource

  const [createPolicy, createState] = useMutation(async (body: Record<string, unknown>) => {
    const created = await api.post<{ policy: ServerPolicy }>('/guardrails', body)
    refetch()
    return created.policy
  })

  const [savePolicy, saveState] = useMutation(async (id: string, body: Record<string, unknown>) => {
    const saved = await api.put<{ policy: ServerPolicy }>(`/guardrails/${id}`, body)
    refetch()
    return saved.policy
  })

  const [setActive, activeState] = useMutation(async (id: string, active: boolean) => {
    await api.patch(`/guardrails/${id}`, { active })
    refetch()
  })

  return useMemo(
    () => ({
      policies: resource.data?.policies ?? [],
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      createPolicy,
      savePolicy,
      setActive,
      writing: createState.pending || saveState.pending || activeState.pending,
      writeError: createState.error ?? saveState.error ?? activeState.error,
      fieldErrors: { ...createState.fieldErrors, ...saveState.fieldErrors },
    }),
    [resource, refetch, createPolicy, savePolicy, setActive, createState, saveState, activeState],
  )
}

type PoliciesApi = ReturnType<typeof usePolicies>

function PolicyForm({
  policy,
  policies,
  onClose,
}: {
  policy: ServerPolicy | null
  policies: PoliciesApi
  onClose: () => void
}) {
  const [name, setName] = useState(policy?.name ?? '')
  const [kind, setKind] = useState<PolicyKind>(policy?.kind ?? 'keyword')
  const [action, setAction] = useState<PolicyAction>(policy?.action ?? 'warn')
  const [checkpoint, setCheckpoint] = useState<Checkpoint>(policy?.checkpoint ?? 'input')
  const [failureMode, setFailureMode] = useState<'open' | 'closed'>(policy?.failureMode ?? 'closed')
  const [keywords, setKeywords] = useState(asStrings(policy?.config.keywords).join(', '))
  const [types, setTypes] = useState<string[]>(asStrings(policy?.config.types))
  const [maxCredits, setMaxCredits] = useState(
    typeof policy?.config.maxCredits === 'number' ? String(policy.config.maxCredits) : '',
  )
  const [requiredKeys, setRequiredKeys] = useState(asStrings(policy?.config.requiredKeys).join(', '))

  const config = (): Record<string, unknown> => {
    if (kind === 'keyword') return { keywords: splitList(keywords) }
    if (kind === 'pii') return { types }
    if (kind === 'spend') return { maxCredits: Number(maxCredits) }
    if (kind === 'schema') return { requiredKeys: splitList(requiredKeys) }
    return {}
  }

  // The server refuses a policy that could never match; this only stops the
  // round trip for the cases the form can see.
  const incomplete =
    !name.trim() ||
    (kind === 'keyword' && splitList(keywords).length === 0) ||
    (kind === 'pii' && types.length === 0) ||
    (kind === 'spend' && !/^\d+$/.test(maxCredits.trim())) ||
    (kind === 'schema' && splitList(requiredKeys).length === 0)

  async function save() {
    const body = { name: name.trim(), kind, checkpoint, action, failureMode, config: config() }
    const saved = policy
      ? await policies.savePolicy(policy.id, { version: policy.version, ...body })
      : await policies.createPolicy(body)
    if (saved) onClose()
  }

  const fieldClass =
    'mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-[18px] font-semibold">{policy ? 'Edit policy' : 'Create policy'}</h2>
        <p className="mt-1.5 text-[13px] text-fg-muted">
          An active policy is applied to every piece of text this workspace is asked to check at the check point you
          choose.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-[13px] font-medium sm:col-span-2">
            Policy
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Never send internal drafts"
              className={fieldClass}
            />
            {policies.fieldErrors.name && (
              <span className="mt-1 block text-[12px] font-normal text-bad">{policies.fieldErrors.name}</span>
            )}
          </label>
          <label className="text-[13px] font-medium">
            Type
            <select value={kind} onChange={(event) => setKind(event.target.value as PolicyKind)} className={fieldClass}>
              {(Object.keys(kindLabels) as PolicyKind[]).map((item) => (
                <option key={item} value={item}>
                  {kindLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-medium">
            Action
            <select
              value={action}
              onChange={(event) => setAction(event.target.value as PolicyAction)}
              className={fieldClass}
            >
              {(Object.keys(actionLabels) as PolicyAction[]).map((item) => (
                <option key={item} value={item}>
                  {actionLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-medium">
            Check point
            <select
              value={checkpoint}
              onChange={(event) => setCheckpoint(event.target.value as Checkpoint)}
              className={fieldClass}
            >
              {(Object.keys(checkpointLabels) as Checkpoint[]).map((item) => (
                <option key={item} value={item}>
                  {checkpointLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-medium">
            If the check itself fails
            <select
              value={failureMode}
              onChange={(event) => setFailureMode(event.target.value as 'open' | 'closed')}
              className={fieldClass}
            >
              <option value="closed">Block (fail closed)</option>
              <option value="open">Allow (fail open)</option>
            </select>
          </label>

          {kind === 'keyword' && (
            <label className="text-[13px] font-medium sm:col-span-2">
              Blocked terms
              <input
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder="acquisition target, Project Nimbus"
                className={fieldClass}
              />
              <span className="mt-1 block text-[12px] font-normal text-fg-muted">
                Comma separated. Matched without regard to case.
              </span>
            </label>
          )}

          {kind === 'pii' && (
            <fieldset className="text-[13px] font-medium sm:col-span-2">
              <legend>Identifiers to detect</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {piiTypes.map((item) => (
                  <label key={item} className="flex items-center gap-2 font-normal">
                    <input
                      type="checkbox"
                      checked={types.includes(item)}
                      onChange={(event) =>
                        setTypes((prev) => (event.target.checked ? [...prev, item] : prev.filter((type) => type !== item)))
                      }
                      className="h-4 w-4 accent-accent"
                    />
                    {item}
                  </label>
                ))}
              </div>
              <span className="mt-2 block text-[12px] font-normal text-fg-muted">
                Only these have a detector; anything else would claim a check that does not exist.
              </span>
            </fieldset>
          )}

          {kind === 'spend' && (
            <label className="text-[13px] font-medium sm:col-span-2">
              Credit ceiling
              <input
                value={maxCredits}
                inputMode="numeric"
                onChange={(event) => setMaxCredits(event.target.value)}
                placeholder="1000"
                className={fieldClass}
              />
              <span className="mt-1 block text-[12px] font-normal text-fg-muted">
                Checked against the credits this workspace has actually used.
              </span>
            </label>
          )}

          {kind === 'schema' && (
            <label className="text-[13px] font-medium sm:col-span-2">
              Required keys
              <input
                value={requiredKeys}
                onChange={(event) => setRequiredKeys(event.target.value)}
                placeholder="customerId, amount"
                className={fieldClass}
              />
              <span className="mt-1 block text-[12px] font-normal text-fg-muted">
                Comma separated. The payload must be JSON and carry every one of them.
              </span>
            </label>
          )}
        </div>

        {unimplemented.includes(kind) && (
          <p className="mt-4 rounded-xl border border-warn/30 bg-warn-muted/40 px-3.5 py-2.5 text-[13px] text-warn">
            No evaluator is implemented for {kindLabels[kind].toLowerCase()}. Set to fail closed it will stop everything
            at this check point; set to fail open it will do nothing at all.
          </p>
        )}

        {policies.writeError && (
          <p role="alert" className="mt-4 rounded-xl border border-bad/40 bg-bad-muted/30 px-3.5 py-2.5 text-[13px] text-bad">
            {policies.writeError.isConflict
              ? `Somebody else changed this policy while you were editing it. Close this and reopen it to see their version. (${policies.writeError.message})`
              : policies.writeError.message}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" disabled={incomplete || policies.writing} loading={policies.writing} onClick={save}>
            {policy ? 'Save policy' : 'Create policy'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PoliciesTab() {
  const policies = usePolicies()
  const [form, setForm] = useState<{ open: boolean; policy: ServerPolicy | null }>({ open: false, policy: null })
  const rows = policies.policies

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[14px] text-fg-2" aria-live="polite">
          {policies.loading
            ? 'Loading policies…'
            : policies.error
              ? 'Policies unavailable'
              : `${rows.length} ${rows.length === 1 ? 'policy' : 'policies'}`}
        </p>
        <Button variant="accent" onClick={() => setForm({ open: true, policy: null })}>
          + Create Policy
        </Button>
      </div>

      {!form.open && policies.writeError && (
        <p role="alert" className="mt-4 rounded-xl border border-bad/40 bg-bad-muted/30 px-3.5 py-2.5 text-[13px] text-bad">
          {policies.writeError.message}
        </p>
      )}

      {policies.error ? (
        <div role="alert" className="mt-5 rounded-2xl border border-bad/40 bg-bad-muted/30 px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-fg">
            {policies.denied
              ? 'Your role cannot see the guardrail policies in this workspace.'
              : 'We could not load your guardrail policies.'}
          </p>
          <p className="mt-1.5 text-[13px] text-fg-muted">{policies.error.message}</p>
          {policies.canRetry && (
            <div className="mt-4">
              <Button variant="secondary" onClick={policies.refetch}>
                Try again
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[56rem] border-collapse text-[13px]">
            <thead className="border-b border-line text-[12px] text-fg-muted">
              <tr>
                {['Policy', 'Type', 'Action', 'Check Point', 'On failure', 'Status'].map((column) => (
                  <th key={column} scope="col" className="px-5 py-3.5 text-left font-medium">
                    {column}
                  </th>
                ))}
                <th scope="col" className="px-5 py-3.5 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {policies.loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-fg-muted" role="status">
                    Loading policies…
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((policy) => (
                  <tr key={policy.id}>
                    <td className="px-5 py-4 font-medium">{policy.name}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-2">
                        {kindLabels[policy.kind]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${actionTone[policy.action]}`}>
                        {actionLabels[policy.action]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-fg-2">{checkpointLabels[policy.checkpoint]}</td>
                    <td className="px-5 py-4 text-fg-muted">
                      {policy.failureMode === 'closed' ? 'Blocks' : 'Allows'}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => policies.setActive(policy.id, !policy.active)}
                        disabled={policies.writing}
                        aria-label={`${policy.active ? 'Pause' : 'Activate'} ${policy.name}`}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                          policy.active ? 'bg-ok-muted text-ok' : 'bg-surface-2 text-fg-muted'
                        }`}
                      >
                        <span aria-hidden>⏻</span>
                        {policy.active ? 'Active' : 'Paused'}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <span className="flex items-center justify-end gap-4">
                        <button
                          onClick={() => setForm({ open: true, policy })}
                          aria-label={`Edit ${policy.name}`}
                          className="text-fg-muted transition hover:text-accent"
                        >
                          ✎
                        </button>
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-fg-muted">
                    No guardrail policies. Nothing is checked until you create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/*
        Said in place, because the table cannot say it. Every row here is a real
        rule the server really enforces — but only for a caller that asks it to,
        and this deployment ships no agent runtime that does. Leaving that out
        would let a full table read as protection already in force.
      */}
      <p className="mt-5 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-[12px] leading-relaxed text-fg-muted">
        These rules are applied by <span className="font-mono">POST /api/v1/guardrails/evaluate</span>, which decides
        and returns the outcome for whatever calls it. No agent runtime ships with this deployment, so nothing calls it
        on its own yet: a policy here protects an integration that checks its text against this workspace, and creating
        one does not by itself put a check in front of anything else.
      </p>

      <p className="mt-3 text-[12px] text-fg-muted">
        A policy is retired by pausing it rather than deleting it: every violation already recorded names the policy
        that stopped it, and deleting the rule would blank that name on all of them.
      </p>

      {form.open && (
        <PolicyForm policy={form.policy} policies={policies} onClose={() => setForm({ open: false, policy: null })} />
      )}
    </>
  )
}

/** `Sep 20, 2026 08:51` — the format the audit table uses. */
function formatStamp(iso: string) {
  const date = new Date(iso)
  const day = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${day} ${time}`
}

const VIOLATION_LIMIT = 100

function ViolationsTab() {
  const resource = useResource<{ violations: Violation[] }>(
    'guardrail-violations',
    useCallback(
      (signal) => api.get<{ violations: Violation[] }>('/guardrails/violations', { limit: VIOLATION_LIMIT }, signal),
      [],
    ),
  )
  const rows = resource.data?.violations ?? []

  if (resource.loading) {
    return (
      <div role="status" className="mt-6 rounded-2xl border border-line bg-surface px-6 py-16 text-center text-[14px] text-fg-muted">
        Loading violations…
      </div>
    )
  }

  if (resource.error) {
    return (
      <div role="alert" className="mt-6 rounded-2xl border border-bad/40 bg-bad-muted/30 px-6 py-10 text-center">
        <p className="text-[15px] font-medium text-fg">
          {resource.denied
            ? 'Violations are part of the audit trail, which only an admin or owner may read.'
            : 'We could not load the violation log.'}
        </p>
        <p className="mt-1.5 text-[13px] text-fg-muted">{resource.error.message}</p>
        {resource.canRetry && (
          <div className="mt-4">
            <Button variant="secondary" onClick={resource.refetch}>
              Try again
            </Button>
          </div>
        )}
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <Icon name="alert-triangle" size={32} className="mx-auto text-fg-muted" />
        <p className="mt-4 text-[16px] text-fg-2">No guardrail violations have been recorded.</p>
        <p className="mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-fg-muted">
          A row appears here whenever an active policy matches text the server was asked to check. Nothing in this
          deployment asks on its own, so this stays empty until an integration calls the evaluation endpoint — an empty
          log is not evidence that a check ran and passed.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[14px] text-fg-2">
          {rows.length === VIOLATION_LIMIT
            ? `The ${VIOLATION_LIMIT} most recent violations.`
            : `${rows.length} ${rows.length === 1 ? 'violation' : 'violations'}.`}
        </p>
        <Button variant="secondary" onClick={resource.refetch}>
          {resource.refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[52rem] border-collapse text-[13px]">
          <thead className="border-b border-line text-[12px] text-fg-muted">
            <tr>
              {['When', 'Policy', 'Check point', 'Action taken', 'Match'].map((column) => (
                <th key={column} scope="col" className="px-5 py-3.5 text-left font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((violation, index) => (
              <tr key={`${violation.occurredAt}-${index}`}>
                <td className="px-5 py-3.5 whitespace-nowrap">{formatStamp(violation.occurredAt)}</td>
                <td className="px-5 py-3.5 font-medium">{violation.policyName ?? 'Policy no longer exists'}</td>
                <td className="px-5 py-3.5 text-fg-2">
                  {checkpointLabels[violation.checkpoint as Checkpoint] ?? violation.checkpoint}
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                      actionTone[violation.actionTaken as PolicyAction] ?? 'bg-surface-2 text-fg-2'
                    }`}
                  >
                    {actionLabels[violation.actionTaken as PolicyAction] ?? violation.actionTaken}
                  </span>
                </td>
                {/* An excerpt is nullable in storage; an empty cell would read
                    as "nothing matched", which is the opposite of the row. */}
                <td className="px-5 py-3.5 font-mono text-[12px] text-fg-muted">{violation.excerpt ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] text-fg-muted">
        The match is stored already masked — enough to recognise what was stopped, never enough to use it.
      </p>
    </>
  )
}

export default function Guardrails() {
  const [params, setParams] = useSearchParams()
  const tab = tabs.find((item) => item.id === params.get('tab'))?.id ?? 'policies'

  return (
    <div className="pt-2">
      <header>
        <h1 className="flex items-center gap-3 text-[28px] font-bold tracking-tight">
          <Icon name="shield-check" size={26} className="text-accent" />
          Guardrails
        </h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          Rules the server applies to text it is asked to check, and a log of what they stopped.
        </p>
      </header>

      <nav className="mt-6 inline-flex gap-1 rounded-2xl border border-line bg-surface p-1.5">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setParams({ tab: item.id })}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] transition ${
              tab === item.id ? 'bg-accent-muted font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            <Icon name={item.id === 'policies' ? 'shield-check' : 'alert-triangle'} size={16} />
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'policies' ? <PoliciesTab /> : <ViolationsTab />}
    </div>
  )
}
