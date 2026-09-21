'use client'

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from '../../../lib/router'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { agentsByAppCode } from '../../../lib/agentCatalog'
import { relativeTime } from '../../../lib/relativeTime'
import {
  expenseCategories,
  policyCategories,
  segmentModes,
  settingsNav,
  travelNotificationEvents,
} from '../../../lib/travelExpenseData'
import { useWorkspace, type TeSettings } from '../../../lib/workspace'
import { Label, Panel, inputClass } from './shell'

const allSettings = settingsNav.flatMap((group) => group.items)

/** A pane that edits part of `teSettings` and saves it in one go. */
function useDraft<T>(initial: T) {
  const [draft, setDraft] = useState<T>(initial)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  return { draft, setDraft, dirty }
}

function ExpensePolicyPane() {
  const { teSettings, updateTeSettings } = useWorkspace()
  const { draft, setDraft, dirty } = useDraft(teSettings)

  const set = <K extends keyof TeSettings>(key: K, value: TeSettings[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Expense policy</h2>
      <p className="mt-2 max-w-4xl text-[14px] text-fg-muted">
        Spend limits, receipt requirements and duplicate detection checked when a report is submitted. Warn to flag,
        or block to stop submission on a hard violation.
      </p>
      <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-fg-muted">
        Rules checked when a report is submitted. In <strong className="font-semibold text-fg">Warn</strong> mode
        violations are flagged for the approver; in <strong className="font-semibold text-fg">Block</strong> mode a
        hard violation stops submission. Duplicate detection is always advisory. Leave a limit blank to disable it.
      </p>

      <div className="mt-5 grid max-w-2xl gap-5 sm:grid-cols-2">
        <label>
          <Label>Enforcement</Label>
          <select
            value={draft.enforcement}
            onChange={(event) => set('enforcement', event.target.value as TeSettings['enforcement'])}
            className={inputClass}
          >
            <option value="warn">Warn (flag, don&apos;t block)</option>
            <option value="block">Block (stop submission)</option>
          </select>
        </label>
        <label>
          <Label>Receipt required at/above</Label>
          <input
            value={draft.receiptRequiredAbove}
            onChange={(event) => set('receiptRequiredAbove', event.target.value)}
            placeholder="disabled"
            inputMode="decimal"
            className={inputClass}
          />
        </label>
      </div>

      <label className="mt-5 flex items-center gap-3 text-[14px]">
        <input
          type="checkbox"
          checked={draft.flagDuplicates}
          onChange={(event) => set('flagDuplicates', event.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        Flag possible duplicates (same employee, amount, date and category)
      </label>

      <p className="mt-6 text-[14px] text-fg-2">Per-category spend limit (per line)</p>
      <div className="mt-3 grid max-w-3xl gap-x-8 gap-y-3 sm:grid-cols-2">
        {policyCategories.map((category) => (
          <label key={category} className="flex items-center gap-4">
            <span className="w-36 shrink-0 text-[13px] text-fg-2">{category}</span>
            <input
              value={draft.categoryLimits[category] ?? ''}
              onChange={(event) =>
                set('categoryLimits', { ...draft.categoryLimits, [category]: event.target.value })
              }
              placeholder="no limit"
              inputMode="decimal"
              className="w-full rounded-xl border border-line bg-bg px-3.5 py-2 text-right text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
          </label>
        ))}
      </div>

      <Button variant="accent" className="mt-6" disabled={!dirty} onClick={() => updateTeSettings(draft)}>
        Save policy
      </Button>
    </div>
  )
}

function ReceiptEmailPane() {
  const { teSettings, updateTeSettings } = useWorkspace()
  const { draft, setDraft, dirty } = useDraft(teSettings.receiptEmail)

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Receipt email-in</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Forward a receipt to this address and it becomes a draft expense against the sender&apos;s employee record.
      </p>

      <div className="mt-5 max-w-lg space-y-4">
        <label className="flex items-center gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.target.checked }))}
            className="h-4 w-4 accent-accent"
          />
          Accept receipts by email
        </label>
        <label>
          <Label>Inbound address</Label>
          <input
            value={draft.address}
            onChange={(event) => setDraft((prev) => ({ ...prev, address: event.target.value }))}
            className={`${inputClass} font-mono text-[13px]`}
          />
        </label>
      </div>

      <Button
        variant="accent"
        className="mt-6"
        disabled={!dirty}
        onClick={() => updateTeSettings({ receiptEmail: draft })}
      >
        Save
      </Button>
    </div>
  )
}

function TravelPolicyPane() {
  const { teSettings, updateTeSettings } = useWorkspace()
  const { draft, setDraft, dirty } = useDraft(teSettings.travel)

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Travel policy</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        What a trip may cost before it needs approval, and how much of it can be advanced before travel.
      </p>

      <div className="mt-5 grid max-w-2xl gap-5 sm:grid-cols-2">
        <label>
          <Label>Advance limit (% of estimate)</Label>
          <input
            type="number"
            min={0}
            max={100}
            value={draft.advancePercent}
            onChange={(event) => setDraft((prev) => ({ ...prev, advancePercent: Number(event.target.value) }))}
            className={inputClass}
          />
        </label>
        <label>
          <Label>Approval required at/above</Label>
          <input
            value={draft.approvalAbove}
            onChange={(event) => setDraft((prev) => ({ ...prev, approvalAbove: event.target.value }))}
            placeholder="always"
            inputMode="decimal"
            className={inputClass}
          />
        </label>
        <label>
          <Label>Default per-diem</Label>
          <input
            value={draft.perDiem}
            onChange={(event) => setDraft((prev) => ({ ...prev, perDiem: event.target.value }))}
            placeholder="not set"
            inputMode="decimal"
            className={inputClass}
          />
        </label>
      </div>

      <Button variant="accent" className="mt-6" disabled={!dirty} onClick={() => updateTeSettings({ travel: draft })}>
        Save
      </Button>
    </div>
  )
}

function SegmentFieldsPane() {
  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Travel segment fields</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        The mode-specific fields a traveller fills per leg. These are the platform defaults; the live editor for them
        has not been transcribed.
      </p>

      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {segmentModes.map((mode) => (
          <li key={mode.id} className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-[15px] font-semibold">{mode.label}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {mode.fields.map((field) => (
                <li key={field} className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-slate">
                  {field}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TravelNotificationsPane() {
  const { teSettings, updateTeSettings } = useWorkspace()
  const { draft, setDraft, dirty } = useDraft(teSettings.travelNotifications)

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Travel notifications</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Which travel events notify the requester and their approver.
      </p>

      <ul className="mt-5 max-w-lg space-y-2">
        {travelNotificationEvents.map((event) => (
          <li key={event.id}>
            <label className="flex items-center gap-3 rounded-xl border border-line px-4 py-2.5 text-[14px]">
              <input
                type="checkbox"
                checked={draft[event.id] ?? false}
                onChange={(input) => setDraft((prev) => ({ ...prev, [event.id]: input.target.checked }))}
                className="h-4 w-4 accent-accent"
              />
              {event.label}
            </label>
          </li>
        ))}
      </ul>

      <Button
        variant="accent"
        className="mt-6"
        disabled={!dirty}
        onClick={() => updateTeSettings({ travelNotifications: draft })}
      >
        Save
      </Button>
    </div>
  )
}

function ApprovalLevelsPane() {
  const { teSettings, updateTeSettings } = useWorkspace()
  const { draft, setDraft, dirty } = useDraft(teSettings.approvalLevels)

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Approval Levels</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Reports climb these levels in order. A level with no threshold always applies; one with a threshold only
        applies at or above that amount.
      </p>

      <ul className="mt-5 max-w-2xl space-y-3">
        {draft.map((level, index) => (
          <li key={level.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
            <span className="w-6 shrink-0 text-[13px] text-fg-muted">{index + 1}</span>
            <input
              value={level.label}
              onChange={(event) =>
                setDraft((prev) => prev.map((item) => (item.id === level.id ? { ...item, label: event.target.value } : item)))
              }
              className="min-w-[10rem] flex-1 rounded-xl border border-line bg-bg px-3.5 py-2 text-[13px] focus:border-accent focus:outline-none"
            />
            <input
              value={level.threshold}
              onChange={(event) =>
                setDraft((prev) =>
                  prev.map((item) => (item.id === level.id ? { ...item, threshold: event.target.value } : item)),
                )
              }
              placeholder="always"
              inputMode="decimal"
              className="w-28 rounded-xl border border-line bg-bg px-3.5 py-2 text-right text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={() => setDraft((prev) => prev.filter((item) => item.id !== level.id))}
              aria-label={`Remove ${level.label}`}
              className="text-fg-muted transition hover:text-bad"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-3">
        <Button
          variant="secondary"
          onClick={() => setDraft((prev) => [...prev, { id: crypto.randomUUID(), label: 'New level', threshold: '' }])}
        >
          + Add level
        </Button>
        <Button variant="accent" disabled={!dirty} onClick={() => updateTeSettings({ approvalLevels: draft })}>
          Save
        </Button>
      </div>
    </div>
  )
}

function SlaPane() {
  const { teSettings, updateTeSettings } = useWorkspace()
  const { draft, setDraft, dirty } = useDraft(teSettings.slaDays)

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Reimbursement SLA</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Days from approval to disbursement. The Dashboard&apos;s pipeline header reads this value, so changing it here
        changes what the app promises there.
      </p>

      <label className="mt-5 block max-w-xs">
        <Label>Days</Label>
        <input
          type="number"
          min={1}
          value={draft}
          onChange={(event) => setDraft(Number(event.target.value))}
          className={inputClass}
        />
      </label>

      <Button variant="accent" className="mt-6" disabled={!dirty} onClick={() => updateTeSettings({ slaDays: draft })}>
        Save
      </Button>
    </div>
  )
}

function GlAccountsPane() {
  const { teSettings, updateTeSettings } = useWorkspace()
  const { draft, setDraft, dirty } = useDraft(teSettings.glAccounts)

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Reimbursement GL accounts</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        The ledger account each expense category posts to when a run is moved to accounts.
      </p>

      <div className="mt-5 grid max-w-3xl gap-x-8 gap-y-3 sm:grid-cols-2">
        {expenseCategories.map((category) => (
          <label key={category} className="flex items-center gap-4">
            <span className="w-40 shrink-0 text-[13px] text-fg-2">{category}</span>
            <input
              value={draft[category] ?? ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, [category]: event.target.value }))}
              placeholder="unmapped"
              className="w-full rounded-xl border border-line bg-bg px-3.5 py-2 font-mono text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
          </label>
        ))}
      </div>

      <Button
        variant="accent"
        className="mt-6"
        disabled={!dirty}
        onClick={() => updateTeSettings({ glAccounts: draft })}
      >
        Save
      </Button>
    </div>
  )
}

function CustomFieldsPane() {
  const { teSettings, updateTeSettings } = useWorkspace()
  const { draft, setDraft, dirty } = useDraft(teSettings.customFields)

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Custom Fields</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Extra fields captured on every expense report in this tenant.
      </p>

      {draft.length ? (
        <ul className="mt-5 max-w-2xl space-y-3">
          {draft.map((field) => (
            <li key={field.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
              <input
                value={field.label}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev.map((item) => (item.id === field.id ? { ...item, label: event.target.value } : item)),
                  )
                }
                className="min-w-[10rem] flex-1 rounded-xl border border-line bg-bg px-3.5 py-2 text-[13px] focus:border-accent focus:outline-none"
              />
              <select
                value={field.type}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev.map((item) => (item.id === field.id ? { ...item, type: event.target.value } : item)),
                  )
                }
                className="rounded-xl border border-line bg-bg px-3 py-2 text-[13px] focus:border-accent focus:outline-none"
              >
                {['text', 'number', 'date', 'select'].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-[13px] text-fg-2">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev.map((item) => (item.id === field.id ? { ...item, required: event.target.checked } : item)),
                    )
                  }
                  className="h-4 w-4 accent-accent"
                />
                required
              </label>
              <button
                onClick={() => setDraft((prev) => prev.filter((item) => item.id !== field.id))}
                aria-label={`Remove ${field.label}`}
                className="text-fg-muted transition hover:text-bad"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 max-w-2xl rounded-xl border border-dashed border-line px-6 py-10 text-center text-[14px] text-fg-muted">
          No custom fields yet.
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <Button
          variant="secondary"
          onClick={() =>
            setDraft((prev) => [...prev, { id: crypto.randomUUID(), label: 'New field', type: 'text', required: false }])
          }
        >
          + Add field
        </Button>
        <Button variant="accent" disabled={!dirty} onClick={() => updateTeSettings({ customFields: draft })}>
          Save
        </Button>
      </div>
    </div>
  )
}

function AgentsPane() {
  const agents = agentsByAppCode.get('TE') ?? []

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">AI Agents</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        The agents this app ships with. They run under the tenant&apos;s guardrails and spend from the same credit
        pool as everything else.
      </p>

      <ul className="mt-5 max-w-3xl divide-y divide-line rounded-2xl border border-line bg-surface">
        {agents.map((agent) => (
          <li key={agent.name} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
            <Icon name="bot" size={16} className="mt-0.5 shrink-0 text-accent" />
            <span className="min-w-[14rem] flex-1">
              <span className="block text-[14px] font-medium">{agent.name}</span>
              <span className="mt-0.5 block text-[12px] text-fg-muted">{agent.blurb}</span>
            </span>
            <Link to="/app/agent-portal" className="text-[13px] font-medium text-accent hover:underline">
              Open in Agent Portal →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SchedulesPane() {
  const { schedules } = useWorkspace()
  const mine = schedules.filter((job) => job.target.includes('Travel'))

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Schedules</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Timed jobs targeting this app. They are the same records the workspace-wide Scheduled Jobs surface shows.
      </p>

      {mine.length ? (
        <ul className="mt-5 max-w-3xl divide-y divide-line rounded-2xl border border-line bg-surface">
          {mine.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
              <span className="min-w-0 flex-1 text-[14px]">{job.name}</span>
              <span className="text-[12px] text-fg-muted">{job.cadence}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 max-w-3xl rounded-xl border border-dashed border-line px-6 py-10 text-center text-[14px] text-fg-muted">
          Nothing scheduled against Travel &amp; Expense.
        </p>
      )}

      <Link
        to="/app/admin/scheduled-jobs"
        className="mt-4 inline-block text-[13px] font-medium text-accent hover:underline"
      >
        Open Scheduled Jobs →
      </Link>
    </div>
  )
}

function ChangeHistoryPane() {
  const { audit } = useWorkspace()
  const entries = useMemo(
    () =>
      audit.filter(
        (event) =>
          event.action.startsWith('travel_expense.') ||
          event.action.startsWith('expense.') ||
          event.action.startsWith('travel.') ||
          event.action.startsWith('reimbursement.') ||
          event.action.startsWith('card.'),
      ),
    [audit],
  )

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Change History</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Every change made inside this app, newest first. The same entries appear in the tenant audit trail.
      </p>

      {entries.length ? (
        <ul className="mt-5 max-w-3xl divide-y divide-line rounded-2xl border border-line bg-surface">
          {entries.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
              <span className="min-w-[12rem] flex-1 font-mono text-[12px]">{event.action}</span>
              <span className="text-[12px] text-fg-muted">{relativeTime(event.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 max-w-3xl rounded-xl border border-dashed border-line px-6 py-10 text-center text-[14px] text-fg-muted">
          No changes recorded yet.
        </p>
      )}
    </div>
  )
}

function AppearancePane() {
  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Appearance</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        This app follows the workspace theme rather than carrying its own. The light/dark control in the top bar
        switches both, and the palette comes from the tenant&apos;s design tokens.
      </p>
      <p className="mt-4 max-w-3xl text-[13px] text-fg-muted">
        The live per-app appearance options have not been transcribed, so nothing is invented here.
      </p>
    </div>
  )
}

const panes: Record<string, () => React.ReactElement> = {
  expense_policy: ExpensePolicyPane,
  receipt_email: ReceiptEmailPane,
  travel_policy: TravelPolicyPane,
  travel_segments: SegmentFieldsPane,
  travel_notifications: TravelNotificationsPane,
  approval_levels: ApprovalLevelsPane,
  sla: SlaPane,
  gl_accounts: GlAccountsPane,
  custom_fields: CustomFieldsPane,
  ai_agents: AgentsPane,
  schedules: SchedulesPane,
  change_history: ChangeHistoryPane,
  appearance: AppearancePane,
}

export function SettingsPane() {
  const [params, setParams] = useSearchParams()
  const section = allSettings.find((item) => item.id === params.get('s'))?.id ?? 'expense_policy'
  const Pane = panes[section]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-accent-muted px-6 py-5">
        <div className="min-w-[18rem] flex-1">
          <p className="flex items-center gap-2.5 text-[15px] font-semibold">
            <Icon name="sparkles" size={17} className="text-accent" />
            Need a change? Just ask
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">
            Describe what you want in plain English — &ldquo;add a field for the customer&apos;s region&rdquo;,
            &ldquo;have the AI summarize new records&rdquo;, &ldquo;rename the Status column&rdquo;. No technical
            setup needed. Every change is saved in Change History and can be undone.
          </p>
        </div>
        <Button variant="accent" onClick={() => document.querySelector<HTMLButtonElement>('[aria-label="Open AI Copilot"]')?.click()}>
          <Icon name="sparkles" size={15} /> Open Copilot
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
        <nav aria-label="Settings" className="h-fit rounded-2xl border border-line bg-surface p-3">
          {settingsNav.map((group) => (
            <div key={group.group} className="mt-4 first:mt-0">
              <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.1em] text-fg-muted uppercase">
                {group.group}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setParams({ tab: 'settings', s: item.id })}
                      aria-current={section === item.id ? 'page' : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-[13.5px] transition ${
                        section === item.id
                          ? 'bg-accent-muted font-semibold text-accent'
                          : 'text-fg-2 hover:bg-surface-2'
                      }`}
                    >
                      <Icon name={item.icon} size={16} />
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <Panel>
          <div key={section} className="app-enter">
            <Pane />
          </div>
        </Panel>
      </div>
    </div>
  )
}
