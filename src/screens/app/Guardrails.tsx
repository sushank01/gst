'use client'

import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { useSearchParams } from '../../lib/router'
import { Button } from '../../components/ui'
import { marketApps } from '../../lib/appData'
import {
  actionTone,
  checkPoints,
  guardrailActions,
  guardrailTypes,
  type CheckPoint,
  type GuardrailAction,
  type GuardrailType,
} from '../../lib/guardrailData'
import { useWorkspace, type GuardrailPolicy } from '../../lib/workspace'

const tabs = [
  { id: 'policies', label: 'Policies', icon: '⛨' },
  { id: 'violations', label: 'Violations', icon: '⚠' },
] as const

type Draft = Omit<GuardrailPolicy, 'id'>

const blank: Draft = {
  name: '',
  type: 'Keyword Block',
  action: 'warn',
  checkPoint: 'Both',
  scope: 'Global',
  active: true,
}

function PolicyForm({
  policy,
  scopes,
  onClose,
}: {
  policy: GuardrailPolicy | null
  scopes: string[]
  onClose: () => void
}) {
  const { addPolicy, updatePolicy } = useWorkspace()
  const [draft, setDraft] = useState<Draft>(policy ?? blank)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-[18px] font-semibold">{policy ? 'Edit policy' : 'Create policy'}</h2>
        <p className="mt-1.5 text-[13px] text-fg-muted">
          Policies run at the check point you choose, on every agent inside their scope.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-[13px] font-medium sm:col-span-2">
            Policy
            <input
              value={draft.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="e.g. Approval cap — ₹50,000"
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
            />
          </label>
          <label className="text-[13px] font-medium">
            Type
            <select
              value={draft.type}
              onChange={(event) => set('type', event.target.value as GuardrailType)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
            >
              {guardrailTypes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-medium">
            Action
            <select
              value={draft.action}
              onChange={(event) => set('action', event.target.value as GuardrailAction)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
            >
              {guardrailActions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-medium">
            Check point
            <select
              value={draft.checkPoint}
              onChange={(event) => set('checkPoint', event.target.value as CheckPoint)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
            >
              {checkPoints.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-medium">
            Scope
            <select
              value={draft.scope}
              onChange={(event) => set('scope', event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
            >
              {scopes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!draft.name.trim()}
            onClick={() => {
              const next = { ...draft, name: draft.name.trim() }
              if (policy) updatePolicy(policy.id, next)
              else addPolicy(next)
              onClose()
            }}
          >
            {policy ? 'Save policy' : 'Create policy'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PoliciesTab() {
  const { policies, deletePolicy, updatePolicy, installed } = useWorkspace()
  const [form, setForm] = useState<{ open: boolean; policy: GuardrailPolicy | null }>({ open: false, policy: null })

  const scopes = [
    'Global',
    ...marketApps.filter((app) => installed.includes(app.code)).map((app) => app.name),
  ]

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[14px] text-fg-2">
          {policies.length} {policies.length === 1 ? 'policy' : 'policies'}
        </p>
        <Button variant="accent" onClick={() => setForm({ open: true, policy: null })}>
          + Create Policy
        </Button>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[56rem] border-collapse text-[13px]">
          <thead className="border-b border-line text-[12px] text-fg-muted">
            <tr>
              {['Policy', 'Type', 'Action', 'Check Point', 'Scope', 'Status'].map((column) => (
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
            {policies.length ? (
              policies.map((policy) => (
                <tr key={policy.id}>
                  <td className="px-5 py-4 font-medium">{policy.name}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-2">
                      {policy.type}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${actionTone[policy.action]}`}>
                      {policy.action}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-fg-2">{policy.checkPoint}</td>
                  <td className="px-5 py-4 text-fg-muted">{policy.scope}</td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => updatePolicy(policy.id, { active: !policy.active })}
                      aria-label={`${policy.active ? 'Pause' : 'Activate'} ${policy.name}`}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
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
                      <button
                        onClick={() => deletePolicy(policy.id)}
                        aria-label={`Delete ${policy.name}`}
                        className="text-fg-muted transition hover:text-bad"
                      >
                        🗑
                      </button>
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center text-fg-muted">
                  No guardrail policies. Agents run unconstrained until you create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {form.open && (
        <PolicyForm policy={form.policy} scopes={scopes} onClose={() => setForm({ open: false, policy: null })} />
      )}
    </>
  )
}

function ViolationsTab() {
  const { runs } = useWorkspace()
  const [runId, setRunId] = useState('')
  const [looked, setLooked] = useState<string | null>(null)

  const run = looked ? runs.find((item) => item.id === looked) : undefined
  const checks = run?.trace.filter((step) => step.kind === 'guardrail') ?? []

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-3">
        <input
          value={runId}
          onChange={(event) => setRunId(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && runId.trim() && setLooked(runId.trim())}
          placeholder="Enter Run ID to view violations..."
          aria-label="Run ID"
          className="min-w-[18rem] flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-[14px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
        <Button variant="accent" disabled={!runId.trim()} onClick={() => setLooked(runId.trim())}>
          <Icon name="eye" size={15} /> View Violations
        </Button>
      </div>

      <div className="mt-5 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        {!looked ? (
          <>
            <Icon name="alert-triangle" size={32} className="mx-auto text-fg-muted" />
            <p className="mt-4 text-[16px] text-fg-2">Enter a Run ID to view guardrail violations.</p>
            <p className="mt-2 text-[13px] text-fg-muted">
              Violations are logged when agent inputs or outputs trigger guardrail policies.
            </p>
          </>
        ) : !run ? (
          <>
            <p className="text-[16px] text-fg-2">No run in this tenant has the ID {looked}.</p>
            <p className="mt-2 text-[13px] text-fg-muted">
              Run IDs come from the Runs history — open a run there to copy its ID.
            </p>
          </>
        ) : (
          <>
            <p className="text-[16px] text-fg-2">
              No violations logged for {run.agent} ({run.id}).
            </p>
            <p className="mt-2 text-[13px] text-fg-muted">
              {checks.length
                ? `${checks.length} guardrail ${checks.length === 1 ? 'check' : 'checks'} ran and passed: ${checks
                    .map((step) => step.detail)
                    .join(' · ')}`
                : 'This run passed through no guardrail check points.'}
            </p>
          </>
        )}
      </div>
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
          Define and manage guardrail policies to control agent inputs and outputs.
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
