'use client'

import { useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { agentsByAppCode } from '../../../lib/agentCatalog'
import { api } from '../../../lib/api'
import { useResource } from '../../../lib/useResource'
import { useInstallations } from '../../../lib/useInstallations'
import { customFieldTypes, posSettingsTabs, standardCustomerGroups } from '../../../lib/posData'
import { Dialog, Label, inputClass } from '../../../components/EnterpriseUi'
import { Failure, Loading, NotAvailable, WriteError } from './parts'
import {
  compareAmounts,
  money,
  useAppSettings,
  useCustomerGroups,
  useLoyaltyProgrammes,
  useSettingsChanges,
  useTaxCategories,
  useVariancePolicy,
  useWorkspaceCurrency,
} from './usePos'

/** Heading + blurb pair each settings pane opens with. */
function PaneHead({ title, blurb }: { title: string; blurb: string }) {
  return (
    <>
      <h3 className="text-[18px] font-semibold">{title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">{blurb}</p>
    </>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="mt-5 rounded-2xl border border-line bg-surface p-5">{children}</section>
}

function EmptyBox({ icon, title, hint, actions }: { icon?: string; title: string; hint?: string; actions?: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <Icon name={icon} size={26} className="mx-auto text-fg-muted" />}
      <p className={`text-[14px] text-fg-2 ${icon ? 'mt-3.5' : ''}`}>{title}</p>
      {hint && <p className="mt-1.5 text-[13px] text-fg-muted">{hint}</p>}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  )
}

/** Trash control shared by the three master-data lists. */
function DeleteButton({ label, disabled, onDelete }: { label: string; disabled?: boolean; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return confirming ? (
    <span className="flex items-center gap-2 text-[12px]">
      <button onClick={onDelete} disabled={disabled} className="font-medium text-bad hover:underline">
        Confirm
      </button>
      <button onClick={() => setConfirming(false)} className="text-fg-muted hover:underline">
        Keep
      </button>
    </span>
  ) : (
    <button
      aria-label={`Delete ${label}`}
      disabled={disabled}
      onClick={() => setConfirming(true)}
      className="text-fg-muted transition hover:text-bad"
    >
      <Icon name="trash" size={15} />
    </button>
  )
}

/* ------------------------------------------------------------------ panes */

function TaxPane() {
  const categories = useTaxCategories()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', rate: '' })

  return (
    <div>
      {/* There is no item or product record in this deployment — nothing but
          an invoice line can point at a category — so the pane does not
          describe a catalogue it would be managing. */}
      <PaneHead
        title="Tax categories"
        blurb="Named tax rates an invoice line can be raised under, so a rate is defined in one place instead of being retyped on every line."
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Icon name="percent" size={16} className="text-accent" />
            Tax categories
          </p>
          <Button variant="accent" className="!py-2 !text-[13px]" onClick={() => setOpen(true)}>
            + New category
          </Button>
        </div>

        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-fg-muted">
          A posted invoice keeps the rate it was posted with, so a later change here never restates a document that has
          already gone out. Archiving a category leaves those invoices able to say which slab taxed them.
        </p>

        <NotAvailable>
          Statutory rates are not shipped with this deployment: there is no built-in GST ladder to seed, because the
          correct rates and their within-state and inter-state split are a decision about your tax position, not a
          default. Enter the rates you are registered for. Component splits are not editable on this screen.
        </NotAvailable>

        {categories.loading ? (
          <div className="mt-5">
            <Loading what="tax categories" />
          </div>
        ) : categories.error ? (
          <div className="mt-5">
            <Failure
              what="tax categories"
              error={categories.error}
              denied={categories.denied}
              canRetry={categories.canRetry}
              onRetry={categories.refetch}
            />
          </div>
        ) : categories.rows.length ? (
          <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {categories.rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-[13px]">
                <span className="w-28 shrink-0 font-medium">{row.name}</span>
                <span className="min-w-[10rem] flex-1 text-fg-muted">
                  {row.ratePercent}%
                  {row.withinRegion.length
                    ? ` · within region: ${row.withinRegion.map((part) => `${part.name} ${part.percent}%`).join(' + ')}`
                    : ''}
                  {row.crossRegion.length
                    ? ` · across: ${row.crossRegion.map((part) => `${part.name} ${part.percent}%`).join(' + ')}`
                    : ''}
                </span>
                <DeleteButton
                  label={row.name}
                  disabled={categories.writing}
                  onDelete={() => void categories.remove(row.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBox title="No tax categories yet. A line is then taxed at whatever rate it was created with." />
        )}

        <WriteError error={categories.writeError} />
      </Card>

      {open && (
        <Dialog title="New category" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Name</Label>
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Standard rate"
                className={inputClass}
              />
            </label>
            <label>
              <Label>Rate (%)</Label>
              <input
                inputMode="decimal"
                value={draft.rate}
                onChange={(event) => setDraft((prev) => ({ ...prev, rate: event.target.value }))}
                className={inputClass}
              />
            </label>
            <WriteError error={categories.writeError} />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.name.trim() || !draft.rate.trim() || categories.writing}
              onClick={async () => {
                const created = await categories.create({ name: draft.name.trim(), ratePercent: draft.rate.trim() })
                if (created) {
                  setDraft({ name: '', rate: '' })
                  setOpen(false)
                }
              }}
            >
              {categories.writing ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function GroupsPane() {
  const groups = useCustomerGroups()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const seed = async () => {
    for (const item of standardCustomerGroups) await groups.create({ name: item })
  }

  return (
    <div>
      <PaneHead
        title="Customer groups"
        blurb="Segments a customer belongs to — Regulars, Walk-in, Wholesale. Chosen from a list on the customer record so a report grouped by segment stays consistent."
      />
      <p className="mt-4 max-w-3xl text-[14px] leading-relaxed text-fg-muted">
        Chosen from a list rather than typed, so a report grouped by segment cannot split across &ldquo;Regulars&rdquo;
        and &ldquo;regulars&rdquo;. Deleting a group archives it: the customers in it keep the segment they were given.
      </p>

      {groups.loading ? (
        <div className="mt-5">
          <Loading what="customer groups" />
        </div>
      ) : groups.error ? (
        <div className="mt-5">
          <Failure
            what="customer groups"
            error={groups.error}
            denied={groups.denied}
            canRetry={groups.canRetry}
            onRetry={groups.refetch}
          />
        </div>
      ) : groups.rows.length ? (
        <>
          <div className="mt-5 flex justify-end">
            <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => setOpen(true)}>
              New group
            </Button>
          </div>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {groups.rows.map((row) => (
              <li key={row.id} className="flex items-center gap-4 px-5 py-3.5 text-[14px]">
                <span className="flex-1">{row.name}</span>
                <span className="text-[12px] text-fg-muted">
                  {row.customers} customer{row.customers === 1 ? '' : 's'}
                </span>
                <DeleteButton label={row.name} disabled={groups.writing} onDelete={() => void groups.remove(row.id)} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyBox
          icon="users"
          title="No customer groups yet — customers cannot be segmented."
          actions={
            <>
              <Button variant="accent" disabled={groups.writing} onClick={() => void seed()}>
                <Icon name="sparkles" size={14} className="mr-1.5 inline align-[-2px]" />
                Add Walk-in / Regulars / Wholesale
              </Button>
              <Button variant="secondary" onClick={() => setOpen(true)}>
                New group
              </Button>
            </>
          }
        />
      )}

      <WriteError error={groups.writeError} />

      {open && (
        <Dialog title="New group" onClose={() => setOpen(false)}>
          <label className="mt-5 block">
            <Label>Group name</Label>
            <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
          </label>
          <WriteError error={groups.writeError} />
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!name.trim() || groups.writing}
              onClick={async () => {
                const created = await groups.create({ name: name.trim() })
                if (created) {
                  setName('')
                  setOpen(false)
                }
              }}
            >
              {groups.writing ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function LoyaltyPane() {
  const programmes = useLoyaltyProgrammes()
  const workspaceCurrency = useWorkspaceCurrency()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', pointsPer: '1', pointValue: '0.01' })

  return (
    <div>
      <PaneHead
        title="Loyalty &amp; tiers"
        blurb="How points accrue and what they are worth. A point is money, so a programme carries its own currency."
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Icon name="award" size={16} className="text-accent" />
            Loyalty programme
          </p>
          <Button variant="accent" className="!py-2 !text-[13px]" onClick={() => setOpen(true)}>
            + New programme
          </Button>
        </div>

        <NotAvailable>
          A programme records the accrual rate and what a point is worth. Nothing accrues or redeems yet on this
          deployment: there is no sale-entry screen for the till to attach points to, and no tier ladder.
        </NotAvailable>

        {programmes.loading ? (
          <div className="mt-5">
            <Loading what="loyalty programmes" />
          </div>
        ) : programmes.error ? (
          <div className="mt-5">
            <Failure
              what="loyalty programmes"
              error={programmes.error}
              denied={programmes.denied}
              canRetry={programmes.canRetry}
              onRetry={programmes.refetch}
            />
          </div>
        ) : programmes.rows.length ? (
          <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {programmes.rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-[13px]">
                <span className="w-40 shrink-0 font-medium">{row.name}</span>
                <span className="flex-1 text-fg-muted">
                  {row.pointsPerUnit} point per unit spent · each point worth {money(row.pointValue, row.currency)}
                </span>
                <DeleteButton
                  label={row.name}
                  disabled={programmes.writing}
                  onDelete={() => void programmes.remove(row.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[13px] text-fg-muted">No programme yet.</p>
        )}

        <WriteError error={programmes.writeError} />
      </Card>

      {open && (
        <Dialog title="New programme" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Programme name</Label>
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label>
              <Label>Points per unit spent</Label>
              <input
                inputMode="decimal"
                value={draft.pointsPer}
                onChange={(event) => setDraft((prev) => ({ ...prev, pointsPer: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label>
              <Label>What one point is worth{workspaceCurrency ? ` (${workspaceCurrency})` : ''}</Label>
              <input
                inputMode="decimal"
                value={draft.pointValue}
                onChange={(event) => setDraft((prev) => ({ ...prev, pointValue: event.target.value }))}
                className={inputClass}
              />
            </label>
            <WriteError error={programmes.writeError} />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.name.trim() || !workspaceCurrency || programmes.writing}
              onClick={async () => {
                const created = await programmes.create({
                  name: draft.name.trim(),
                  currency: workspaceCurrency ?? '',
                  pointsPerUnit: draft.pointsPer.trim() || '1',
                  pointValue: draft.pointValue.trim() || '0',
                })
                if (created) {
                  setDraft({ name: '', pointsPer: '1', pointValue: '0.01' })
                  setOpen(false)
                }
              }}
            >
              {programmes.writing ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

const varianceFields = [
  {
    key: 'reasonRequiredAbove',
    label: 'Reason required above',
    hint: 'A cashier can close a shift silently while the drawer is off by this much or less. Anything larger blocks the close until they give a reason — and the till itself enforces this figure.',
  },
  {
    key: 'amberWorstShift',
    label: 'Amber — worst single shift',
    hint: "A cashier's worst shift at or above this is flagged amber on the manager dashboard.",
  },
  {
    key: 'redWorstShift',
    label: 'Red — worst single shift',
    hint: 'Worst shift at or above this is flagged red. Must be at least the amber figure.',
  },
  {
    key: 'amberAverage',
    label: 'Amber — recent average',
    hint: 'Average variance across recent shifts at or above this is amber. Catches the cashier who is quietly out by a little every day.',
  },
  {
    key: 'redAverage',
    label: 'Red — recent average',
    hint: 'Average at or above this is red. Must be at least the amber average.',
  },
] as const

function VariancePane() {
  const policy = useVariancePolicy()
  const currency = useWorkspaceCurrency()
  const [draft, setDraft] = useState<Record<string, string> | null>(null)

  if (policy.loading) return <Loading what="the variance policy" />
  if (policy.error || !policy.policy) {
    return policy.error ? (
      <Failure
        what="the variance policy"
        error={policy.error}
        denied={policy.denied}
        canRetry={policy.canRetry}
        onRetry={policy.refetch}
      />
    ) : null
  }

  const saved = policy.policy
  const current = Object.fromEntries(
    varianceFields.map((field) => [field.key, draft?.[field.key] ?? saved[field.key]]),
  ) as Record<(typeof varianceFields)[number]['key'], string>
  const dirty = draft !== null
  // The hints promise these orderings, and the table's own check constraint
  // enforces them, so a save that breaks one is stopped here first.
  const valid =
    compareAmounts(current.redWorstShift || '0', current.amberWorstShift || '0') >= 0 &&
    compareAmounts(current.redAverage || '0', current.amberAverage || '0') >= 0

  return (
    <div>
      <PaneHead
        title="Cash variance tolerance"
        blurb="How far the cash drawer may be off at close before the cashier has to explain it, and where the manager dashboard turns amber and red."
      />
      <p className="mt-4 max-w-3xl text-[14px] leading-relaxed text-fg-muted">
        These figures are the ones the till enforces at close, not a display setting: they live beside the drawer, so
        what a manager sees here and what a cashier is refused are the same numbers. Amounts are in the till&apos;s own
        currency{currency ? ` — ${currency} for this workspace` : ''}.
      </p>

      {saved.updatedAt === null && (
        <NotAvailable>
          No policy has been saved for this workspace. The figures below are the platform defaults currently in force;
          saving makes them explicit.
        </NotAvailable>
      )}

      <div className="mt-6 space-y-5">
        {varianceFields.map((field) => (
          <div key={field.key} className="grid items-start gap-4 sm:grid-cols-[14rem_10rem_1fr]">
            <label htmlFor={field.key} className="pt-2.5 text-[14px]">
              {field.label}
            </label>
            <input
              id={field.key}
              inputMode="decimal"
              value={current[field.key]}
              onChange={(event) =>
                setDraft((prev) => ({ ...(prev ?? current), [field.key]: event.target.value }))
              }
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] focus:border-accent focus:outline-none"
            />
            <p className="pt-1 text-[12px] leading-relaxed text-fg-muted">{field.hint}</p>
          </div>
        ))}
      </div>

      {!valid && (
        <p className="mt-4 text-[12px] text-bad">
          Red must be at least the amber figure, for both the worst shift and the recent average.
        </p>
      )}

      <WriteError error={policy.saveError} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          variant="accent"
          disabled={!dirty || !valid || policy.saving}
          onClick={async () => {
            const result = await policy.save({ ...current, updatedAt: saved.updatedAt })
            if (result) setDraft(null)
          }}
        >
          {policy.saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

type CustomField = { id: string; label: string; type: string }

function FieldsPane() {
  const settings = useAppSettings<{ fields: CustomField[] }>('customFields')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<{ label: string; type: string }>({ label: '', type: customFieldTypes[0] })

  if (settings.loading) return <Loading what="custom fields" />
  if (settings.error) {
    return (
      <Failure
        what="custom fields"
        error={settings.error}
        denied={settings.denied}
        canRetry={settings.canRetry}
        onRetry={settings.refetch}
      />
    )
  }

  const rows = settings.value?.fields ?? []

  return (
    <div>
      <PaneHead title="Custom Fields" blurb="Extra data fields to capture information specific to your business." />

      <NotAvailable>
        These are recorded as a workspace setting, with history and a revert. No form in Sales &amp; POS renders them
        yet, so adding one here does not add a box to the invoice screen.
      </NotAvailable>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-fg-2">
          Custom fields for <span className="font-semibold">Sales &amp; POS</span>
        </p>
        <Button variant="accent" className="!py-2 !text-[13px]" onClick={() => setOpen(true)}>
          + Add Field
        </Button>
      </div>

      <WriteError error={settings.saveError} />

      {rows.length ? (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-4 px-5 py-3.5 text-[14px]">
              <span className="flex-1">{row.label}</span>
              <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-slate">{row.type}</span>
              <DeleteButton
                label={row.label}
                disabled={settings.saving}
                onDelete={() =>
                  void settings.save(
                    { fields: rows.filter((item) => item.id !== row.id) },
                    `Deleted custom field ${row.label}`,
                  )
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyBox
          icon="settings"
          title="No custom fields"
          hint="Add custom fields to record additional sales & POS information."
        />
      )}

      {open && (
        <Dialog title="Add Field" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Field label</Label>
              <input
                value={draft.label}
                onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label>
              <Label>Type</Label>
              <select
                value={draft.type}
                onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))}
                className={inputClass}
              >
                {customFieldTypes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <WriteError error={settings.saveError} />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.label.trim() || settings.saving}
              onClick={async () => {
                const saved = await settings.save(
                  { fields: [...rows, { id: crypto.randomUUID(), label: draft.label.trim(), type: draft.type }] },
                  `Added custom field ${draft.label.trim()}`,
                )
                if (saved) {
                  setDraft({ label: '', type: customFieldTypes[0] })
                  setOpen(false)
                }
              }}
            >
              {settings.saving ? 'Saving…' : 'Add'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

type AgentControls = { pauseAll: boolean; autoRunOnNew: boolean; autoPauseAt: string; disabled: string[] }

const AGENT_DEFAULTS: AgentControls = { pauseAll: false, autoRunOnNew: true, autoPauseAt: '', disabled: [] }

function AgentsPane() {
  const settings = useAppSettings<AgentControls>('agents')
  const credits = useResource<{ credits: { granted: number; used: number; available: number } }>(
    'credits-balance',
    (signal) => api.get('/credits/balance', undefined, signal),
  )
  const agents = agentsByAppCode.get('POS') ?? []

  if (settings.loading) return <Loading what="agent preferences" />
  if (settings.error) {
    return (
      <Failure
        what="agent preferences"
        error={settings.error}
        denied={settings.denied}
        canRetry={settings.canRetry}
        onRetry={settings.refetch}
      />
    )
  }

  const controls: AgentControls = { ...AGENT_DEFAULTS, ...(settings.value ?? {}) }
  const setAgents = (patch: Partial<AgentControls>, summary: string) =>
    void settings.save({ ...controls, ...patch }, summary)

  return (
    <div>
      <PaneHead title="AI Agents" blurb="What the AI would do with your records, and your preferences for it." />

      <NotAvailable>
        No agent runs on this deployment — there is no AI provider connected — so nothing below is running, paused or
        spending. The switches are recorded as preferences and will govern the agents if they are turned on.
      </NotAvailable>

      <section className="mt-5 rounded-2xl border border-line bg-surface-2/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-[14px] font-medium">AI Credit spend</p>
          <p className="text-[13px] text-fg-muted">
            {credits.error ? (
              'Credit balance not available'
            ) : credits.data ? (
              <>
                <span className="font-semibold text-fg">{credits.data.credits.used.toLocaleString()}</span> AI Credits
                used · {credits.data.credits.available.toLocaleString()} available
              </>
            ) : (
              'Loading…'
            )}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2.5 text-[13px]">
            <input
              type="checkbox"
              checked={controls.pauseAll}
              disabled={settings.saving}
              onChange={(event) =>
                setAgents(
                  { pauseAll: event.target.checked },
                  event.target.checked ? 'Paused AI agents across all apps' : 'Resumed AI agents',
                )
              }
              className="h-4 w-4 accent-accent"
            />
            Pause AI agents <span className="text-fg-muted">(all apps)</span>
          </label>
          <label className="flex items-center gap-2.5 text-[13px]">
            <input
              type="checkbox"
              checked={controls.autoRunOnNew}
              disabled={settings.saving}
              onChange={(event) =>
                setAgents(
                  { autoRunOnNew: event.target.checked },
                  event.target.checked ? 'Agents auto-run on new records' : 'Agents now run manually',
                )
              }
              className="h-4 w-4 accent-accent"
            />
            Auto-run on new records <span className="text-fg-muted">(else run manually)</span>
          </label>
          <label className="flex items-center gap-2.5 text-[13px]">
            Auto-pause at
            <input
              defaultValue={controls.autoPauseAt}
              onBlur={(event) =>
                event.target.value !== controls.autoPauseAt &&
                setAgents({ autoPauseAt: event.target.value }, 'Changed the auto-pause threshold')
              }
              placeholder="off"
              aria-label="Auto-pause at (AI Credits)"
              className="w-24 rounded-xl border border-line bg-bg px-3 py-1.5 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
            AI Credits
          </label>
        </div>

        <WriteError error={settings.saveError} />
      </section>

      <ul className="mt-5 space-y-3">
        {agents.map((agent) => {
          const off = controls.disabled.includes(agent.name)
          return (
            <li
              key={agent.name}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-2">
                <Icon name="bot" size={17} />
              </span>
              <span className="min-w-[12rem] flex-1">
                <span className="block text-[14px] font-medium">{agent.name}</span>
                <span className="mt-0.5 block text-[12px] text-fg-muted">
                  {off ? 'Switched off' : 'Switched on — not running on this deployment'}
                </span>
              </span>
              <button
                role="switch"
                aria-checked={!off}
                aria-label={`${off ? 'Enable' : 'Disable'} ${agent.name}`}
                disabled={settings.saving}
                onClick={() =>
                  setAgents(
                    {
                      disabled: off
                        ? controls.disabled.filter((item) => item !== agent.name)
                        : [...controls.disabled, agent.name],
                    },
                    `${off ? 'Enabled' : 'Disabled'} ${agent.name}`,
                  )
                }
                className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${off ? 'bg-surface-2' : 'bg-accent'}`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    off ? '' : 'translate-x-5'
                  }`}
                />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SchedulesPane() {
  return (
    <div>
      <PaneHead title="Schedules" blurb="Run the AI automatically on a schedule, without anyone clicking a button." />
      <EmptyBox
        icon="clock"
        title="No workflow attached to Sales & POS"
        hint="Schedules fire a workflow on a cron interval. Install or build a workflow for this app first."
      />
    </div>
  )
}

function HistoryPane() {
  const history = useSettingsChanges()
  const [showReverted, setShowReverted] = useState(false)
  const visible = showReverted ? history.changes : history.changes.filter((change) => !change.reverted)

  return (
    <div>
      <PaneHead
        title="Change History"
        blurb="Every settings change made here, with who made it and when — and a revert that restores what was there before."
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[14px] text-fg-2">
          {history.loaded
            ? `${history.changes.length} change${history.changes.length === 1 ? '' : 's'} recorded`
            : 'Loading…'}
        </p>
        <label className="flex items-center gap-2.5 text-[13px]">
          <input
            type="checkbox"
            checked={showReverted}
            onChange={(event) => setShowReverted(event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Show reverted
        </label>
      </div>

      <NotAvailable>
        This covers the settings documents kept for this app — custom fields and agent preferences. Tax categories,
        customer groups, loyalty programmes and the cash-variance thresholds are records of their own, with their own
        audit trail, and are not reverted from here.
      </NotAvailable>

      <WriteError error={history.revertError} />

      {history.loading ? (
        <div className="mt-4">
          <Loading what="the change history" />
        </div>
      ) : history.error ? (
        <div className="mt-4">
          <Failure
            what="the change history"
            error={history.error}
            denied={history.denied}
            canRetry={history.canRetry}
            onRetry={history.refetch}
          />
        </div>
      ) : !visible.length && history.changes.length ? (
        // Every change reverted is not the same as no change ever made.
        <EmptyBox
          icon="history"
          title="Every recorded change has been reverted."
          hint="Tick Show reverted to see them."
        />
      ) : visible.length ? (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {visible.map((change) => (
            <li key={change.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5 text-[13px]">
              <span className="min-w-[14rem] flex-1">{change.summary}</span>
              <span className="text-fg-muted">{change.changedByName ?? 'Unknown'}</span>
              <span className="font-mono text-[12px] text-fg-muted">
                {change.changedAt.slice(0, 16).replace('T', ' ')}
              </span>
              {change.reverted ? (
                <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-slate">Reverted</span>
              ) : (
                <button
                  disabled={history.reverting}
                  onClick={() => void history.revert(change.id)}
                  className="text-[12px] font-medium text-accent hover:underline disabled:opacity-50"
                >
                  Revert
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyBox icon="history" title="No customisations yet" hint="Running the platform defaults." />
      )}
    </div>
  )
}

function AppearancePane() {
  const installations = useInstallations()
  const entry = installations.apps.find((item) => item.code === 'POS')
  const fields = useAppSettings<{ fields: CustomField[] }>('customFields')

  return (
    <div>
      <PaneHead title="Appearance" blurb="How the app presents itself inside the workspace." />
      <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-fg-muted">
        Only what the server actually records about this installation. The app has no theme of its own to configure:
        it renders in the workspace palette.
      </p>
      <dl className="mt-5 max-w-lg space-y-3 text-[13px]">
        {[
          ['App name', entry?.name ?? 'Not available'],
          ['Code', entry?.code ?? 'Not available'],
          ['Installation status', entry?.status ?? 'Not installed'],
          [
            'Custom fields on records',
            fields.loading ? 'Loading…' : fields.error ? 'Not available' : String(fields.value?.fields?.length ?? 0),
          ],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

const panes: Record<string, () => React.ReactElement | null> = {
  tax: TaxPane,
  groups: GroupsPane,
  loyalty: LoyaltyPane,
  variance: VariancePane,
  fields: FieldsPane,
  agents: AgentsPane,
  schedules: SchedulesPane,
  history: HistoryPane,
  appearance: AppearancePane,
}

/**
 * `?tab=settings` — a settings surface with its own sub-rail, the way the live
 * app nests it inside the app rather than giving it a route of its own.
 */
export function PosSettingsPane() {
  const [tab, setTab] = useState<string>(posSettingsTabs[0].id)
  const Pane = panes[tab]

  return (
    <div>
      <section className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-line bg-surface-2/60 px-5 py-4">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <Icon name="sparkles" size={15} className="text-accent" />
            Changing these settings
          </p>
          {/* The dock this button raises has no model behind it, so the banner
              does not invite a request it will then refuse. */}
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
            Change them on the panes here: every change is recorded in Change History with who made it, and can be
            reverted from there. The Copilot has no AI provider connected on this deployment, so it cannot make a
            change for you yet.
          </p>
        </div>
        <Button variant="accent" onClick={() => window.dispatchEvent(new Event('apragya:copilot'))}>
          <Icon name="sparkles" size={14} className="mr-1.5 inline align-[-2px]" />
          Open Copilot
        </Button>
      </section>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        <nav className="w-full shrink-0 space-y-1 lg:w-60">
          {posSettingsTabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-[14px] transition ${
                tab === item.id
                  ? 'bg-accent-muted font-medium text-accent'
                  : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
              }`}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        <div key={tab} className="app-enter min-w-0 flex-1">
          <Pane />
        </div>
      </div>
    </div>
  )
}
