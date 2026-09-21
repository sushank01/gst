'use client'

import { useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { agentsByAppCode } from '../../../lib/agentCatalog'
import {
  customFieldTypes,
  posSettingsTabs,
  standardCustomerGroups,
  standardGstSlabs,
} from '../../../lib/posData'
import { useWorkspace, type PosSettings } from '../../../lib/workspace'
import { Dialog, Label, inputClass } from '../travel/shell'

const id = () => crypto.randomUUID()

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

/* ------------------------------------------------------------------ panes */

function TaxPane() {
  const { posSettings, updatePosSettings } = useWorkspace()
  const rows = posSettings.taxCategories
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', rate: '' })

  const seedSlabs = () =>
    updatePosSettings(
      { taxCategories: [...rows, ...standardGstSlabs.map((slab) => ({ id: id(), ...slab }))] },
      'Added the standard GST slabs (0 / 5 / 12 / 18 / 28%)',
    )

  return (
    <div>
      <PaneHead
        title="Tax categories"
        blurb="Named tax rates and how each one splits. Items point at a category, so changing a rate is one edit here rather than an edit on every affected item."
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Icon name="percent" size={16} className="text-accent" />
            Tax categories
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" className="!py-2 !text-[13px]" onClick={seedSlabs}>
              <Icon name="sparkles" size={14} className="mr-1.5 inline align-[-2px]" />
              Add standard GST slabs
            </Button>
            <Button variant="accent" className="!py-2 !text-[13px]" onClick={() => setOpen(true)}>
              + New category
            </Button>
          </div>
        </div>

        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-fg-muted">
          A named tax slab and how it splits. Items point at a category instead of carrying a loose percentage, so
          changing a rate is one edit here rather than an edit on every affected item. The{' '}
          <span className="font-semibold text-fg-2">within-state</span> split is what a local sale charges; the{' '}
          <span className="font-semibold text-fg-2">inter-state</span> split applies when the buyer's GSTIN is
          registered in another state.
        </p>

        {rows.length ? (
          <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-[13px]">
                <span className="w-28 shrink-0 font-medium">{row.name}</span>
                <span className="min-w-[10rem] flex-1 text-fg-muted">
                  Within state: {row.withinState} · Inter-state: {row.interState}
                </span>
                <button
                  aria-label={`Delete ${row.name}`}
                  onClick={() =>
                    updatePosSettings(
                      { taxCategories: rows.filter((item) => item.id !== row.id) },
                      `Deleted tax category ${row.name}`,
                    )
                  }
                  className="text-fg-muted transition hover:text-bad"
                >
                  <Icon name="trash" size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBox
            title="No tax categories yet. Items will fall back to whatever percentage is typed on each one."
            actions={
              <Button variant="accent" onClick={seedSlabs}>
                <Icon name="sparkles" size={14} className="mr-1.5 inline align-[-2px]" />
                Add the standard GST slabs (0 / 5 / 12 / 18 / 28%)
              </Button>
            }
          />
        )}
      </Card>

      {open && (
        <Dialog title="New category" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Name</Label>
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="GST 18%"
                className={inputClass}
              />
            </label>
            <label>
              <Label>Rate (%)</Label>
              <input
                type="number"
                min={0}
                value={draft.rate}
                onChange={(event) => setDraft((prev) => ({ ...prev, rate: event.target.value }))}
                className={inputClass}
              />
            </label>
            <p className="text-[12px] text-fg-muted">
              The split is derived: half CGST and half SGST within a state, the whole rate as IGST across one.
            </p>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.name.trim()}
              onClick={() => {
                const rate = Number(draft.rate) || 0
                updatePosSettings(
                  {
                    taxCategories: [
                      ...rows,
                      {
                        id: id(),
                        name: draft.name.trim(),
                        rate,
                        withinState: rate === 0 ? 'Exempt' : `CGST ${rate / 2}% + SGST ${rate / 2}%`,
                        interState: rate === 0 ? 'Exempt' : `IGST ${rate}%`,
                      },
                    ],
                  },
                  `Created tax category ${draft.name.trim()}`,
                )
                setDraft({ name: '', rate: '' })
                setOpen(false)
              }}
            >
              Create
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function GroupsPane() {
  const { posSettings, updatePosSettings } = useWorkspace()
  const rows = posSettings.customerGroups
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  return (
    <div>
      <PaneHead
        title="Customer groups"
        blurb="Segments a customer belongs to — Regulars, Walk-in, Wholesale. Chosen from a list on the customer record so a report grouped by segment stays consistent."
      />
      <p className="mt-4 max-w-3xl text-[14px] leading-relaxed text-fg-muted">
        Segments a customer belongs to — Regulars, Walk-in, Wholesale. Chosen from a list on the customer record
        rather than typed, so a report grouped by segment can't split across "Regulars" and "regulars".
      </p>

      {rows.length ? (
        <>
          <div className="mt-5 flex justify-end">
            <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => setOpen(true)}>
              New group
            </Button>
          </div>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-4 px-5 py-3.5 text-[14px]">
                <span className="flex-1">{row.name}</span>
                <button
                  aria-label={`Delete ${row.name}`}
                  onClick={() =>
                    updatePosSettings(
                      { customerGroups: rows.filter((item) => item.id !== row.id) },
                      `Deleted customer group ${row.name}`,
                    )
                  }
                  className="text-fg-muted transition hover:text-bad"
                >
                  <Icon name="trash" size={15} />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyBox
          icon="users"
          title="No customer groups yet — customers can't be segmented."
          actions={
            <>
              <Button
                variant="accent"
                onClick={() =>
                  updatePosSettings(
                    { customerGroups: standardCustomerGroups.map((item) => ({ id: id(), name: item })) },
                    'Added the Walk-in / Regulars / Wholesale groups',
                  )
                }
              >
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

      {open && (
        <Dialog title="New group" onClose={() => setOpen(false)}>
          <label className="mt-5 block">
            <Label>Group name</Label>
            <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
          </label>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!name.trim()}
              onClick={() => {
                updatePosSettings(
                  { customerGroups: [...rows, { id: id(), name: name.trim() }] },
                  `Created customer group ${name.trim()}`,
                )
                setName('')
                setOpen(false)
              }}
            >
              Create
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function LoyaltyPane() {
  const { posSettings, updatePosSettings } = useWorkspace()
  const rows = posSettings.loyalty
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', pointsPer: '1', pointValue: '0.01' })

  return (
    <div>
      <PaneHead
        title="Loyalty & tiers"
        blurb="How points accrue and what they are worth, plus the tier ladder customers climb on lifetime spend. Points are spent at the till as a discount on the bill."
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

        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-fg-muted">
          Points accrue on the net subtotal of every sale attached to a customer, and are spent at the till as a
          discount on the bill.
        </p>

        {rows.length ? (
          <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-[13px]">
                <span className="w-40 shrink-0 font-medium">{row.name}</span>
                <span className="flex-1 text-fg-muted">
                  {row.pointsPer} point per unit spent · each point worth {row.pointValue}
                </span>
                <button
                  aria-label={`Delete ${row.name}`}
                  onClick={() =>
                    updatePosSettings(
                      { loyalty: rows.filter((item) => item.id !== row.id) },
                      `Deleted loyalty programme ${row.name}`,
                    )
                  }
                  className="text-fg-muted transition hover:text-bad"
                >
                  <Icon name="trash" size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[13px] text-fg-muted">No programme yet. Create one to start accruing points.</p>
        )}
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
                type="number"
                min={0}
                step="0.1"
                value={draft.pointsPer}
                onChange={(event) => setDraft((prev) => ({ ...prev, pointsPer: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label>
              <Label>What one point is worth</Label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.pointValue}
                onChange={(event) => setDraft((prev) => ({ ...prev, pointValue: event.target.value }))}
                className={inputClass}
              />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.name.trim()}
              onClick={() => {
                updatePosSettings(
                  {
                    loyalty: [
                      ...rows,
                      {
                        id: id(),
                        name: draft.name.trim(),
                        pointsPer: Number(draft.pointsPer) || 0,
                        pointValue: Number(draft.pointValue) || 0,
                        tiers: [],
                      },
                    ],
                  },
                  `Created loyalty programme ${draft.name.trim()}`,
                )
                setDraft({ name: '', pointsPer: '1', pointValue: '0.01' })
                setOpen(false)
              }}
            >
              Create
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

const varianceFields = [
  {
    key: 'reasonAbove',
    label: 'Reason required above',
    hint: 'A cashier can close a shift silently while the drawer is off by this much or less. Anything larger blocks the close until they pick a reason.',
  },
  {
    key: 'amberWorst',
    label: 'Amber — worst single shift',
    hint: "A cashier's worst shift at or above this is flagged amber on the manager dashboard.",
  },
  {
    key: 'redWorst',
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

const varianceDefaults = { reasonAbove: 1, amberWorst: 1, redWorst: 5, amberAverage: 0.5, redAverage: 2 }

function VariancePane() {
  const { posSettings, updatePosSettings } = useWorkspace()
  const saved = posSettings.cashVariance
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, String(value)])),
  )

  const parsed = Object.fromEntries(
    Object.entries(draft).map(([key, value]) => [key, Number(value) || 0]),
  ) as typeof varianceDefaults
  const dirty = varianceFields.some((field) => parsed[field.key] !== saved[field.key])
  // The hints promise these orderings, so a save that breaks one is refused.
  const valid = parsed.redWorst >= parsed.amberWorst && parsed.redAverage >= parsed.amberAverage

  return (
    <div>
      <PaneHead
        title="Cash variance tolerance"
        blurb="How far the cash drawer may be off at close before the cashier has to explain it, and where the manager dashboard turns amber and red."
      />
      <p className="mt-4 max-w-3xl text-[14px] leading-relaxed text-fg-muted">
        How far the cash drawer may be off at close before the cashier has to explain it, and where the manager
        dashboard turns amber and red. Amounts are in the till's own currency.
      </p>

      <div className="mt-6 space-y-5">
        {varianceFields.map((field) => (
          <div key={field.key} className="grid items-start gap-4 sm:grid-cols-[14rem_10rem_1fr]">
            <label htmlFor={field.key} className="pt-2.5 text-[14px]">
              {field.label}
            </label>
            <input
              id={field.key}
              type="number"
              min={0}
              step="0.5"
              value={draft[field.key]}
              onChange={(event) => setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))}
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          variant="accent"
          disabled={!dirty || !valid}
          onClick={() => updatePosSettings({ cashVariance: parsed }, 'Updated cash variance tolerance')}
        >
          Save
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setDraft(Object.fromEntries(Object.entries(varianceDefaults).map(([k, v]) => [k, String(v)])))
            updatePosSettings({ cashVariance: varianceDefaults }, 'Restored the default cash variance tolerance')
          }}
        >
          <Icon name="refresh" size={14} className="mr-1.5 inline align-[-2px]" />
          Restore defaults
        </Button>
      </div>
    </div>
  )
}

function FieldsPane() {
  const { posSettings, updatePosSettings } = useWorkspace()
  const rows = posSettings.customFields
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ label: '', type: customFieldTypes[0] as string })

  return (
    <div>
      <PaneHead title="Custom Fields" blurb="Add extra data fields to capture information specific to your business." />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-fg-2">
          Custom fields for <span className="font-semibold">Sales &amp; POS</span>
        </p>
        <Button variant="accent" className="!py-2 !text-[13px]" onClick={() => setOpen(true)}>
          + Add Field
        </Button>
      </div>

      {rows.length ? (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-4 px-5 py-3.5 text-[14px]">
              <span className="flex-1">{row.label}</span>
              <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-slate">{row.type}</span>
              <button
                aria-label={`Delete ${row.label}`}
                onClick={() =>
                  updatePosSettings(
                    { customFields: rows.filter((item) => item.id !== row.id) },
                    `Deleted custom field ${row.label}`,
                  )
                }
                className="text-fg-muted transition hover:text-bad"
              >
                <Icon name="trash" size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyBox
          icon="settings"
          title="No custom fields"
          hint="Add custom fields to capture additional sales & pos information."
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
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.label.trim()}
              onClick={() => {
                updatePosSettings(
                  { customFields: [...rows, { id: id(), label: draft.label.trim(), type: draft.type }] },
                  `Added custom field ${draft.label.trim()}`,
                )
                setDraft({ label: '', type: customFieldTypes[0] })
                setOpen(false)
              }}
            >
              Add
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function AgentsPane() {
  const { posSettings, updatePosSettings, creditsUsed } = useWorkspace()
  const controls = posSettings.agents
  const agents = agentsByAppCode.get('POS') ?? []
  const running = agents.filter((agent) => !controls.disabled.includes(agent.name)).length
  const setAgents = (patch: Partial<PosSettings['agents']>, summary: string) =>
    updatePosSettings({ agents: { ...controls, ...patch } }, summary)

  return (
    <div>
      <PaneHead title="AI Agents" blurb="The AI working on your records — review and adjust what it does." />

      <h4 className="mt-6 text-[16px] font-semibold">AI Agents</h4>
      <p className="mt-1.5 text-[14px] text-fg-muted">
        Switch an agent off to stop it running — and stop it spending AI Credits.
      </p>

      <section className="mt-5 rounded-2xl border border-line bg-surface-2/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-[14px] font-medium">AI Credit spend</p>
          <p className="text-[13px] text-fg-muted">
            <span className="font-semibold text-fg">{creditsUsed.toLocaleString()}</span> AI Credits this month ·{' '}
            {running} of {agents.length} agent{agents.length === 1 ? '' : 's'} running
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2.5 text-[13px]">
            <input
              type="checkbox"
              checked={controls.pauseAll}
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
              value={controls.autoPauseAt}
              onChange={(event) => setAgents({ autoPauseAt: event.target.value }, 'Changed the auto-pause threshold')}
              placeholder="off"
              aria-label="Auto-pause at (AI Credits)"
              className="w-24 rounded-xl border border-line bg-bg px-3 py-1.5 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
            AI Credits
          </label>
        </div>
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
                <span className="mt-0.5 block text-[12px] text-fg-muted">Runs automatically on create</span>
              </span>
              <button
                role="switch"
                aria-checked={!off}
                aria-label={`${off ? 'Enable' : 'Disable'} ${agent.name}`}
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
              <span aria-hidden className="text-fg-muted">
                <Icon name="trash" size={16} />
              </span>
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
  const { posSettings, updatePosSettings } = useWorkspace()
  const [showReverted, setShowReverted] = useState(false)
  const changes = posSettings.changes
  const visible = showReverted ? changes : changes.filter((change) => !change.reverted)

  return (
    <div>
      <PaneHead
        title="Change History"
        blurb="Every change made here, with who made it and when — and how to undo it."
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[14px] text-fg-2">
          v1.0.0 — {changes.length} change{changes.length === 1 ? '' : '(s)'} made so far
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2.5 text-[13px]">
            <input
              type="checkbox"
              checked={showReverted}
              onChange={(event) => setShowReverted(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Show reverted
          </label>
          <Button
            variant="secondary"
            className="!py-2 !text-[13px]"
            disabled={!changes.length}
            onClick={() =>
              updatePosSettings(
                {
                  taxCategories: [],
                  customerGroups: [],
                  loyalty: [],
                  cashVariance: varianceDefaults,
                  customFields: [],
                  agents: { pauseAll: false, autoRunOnNew: true, autoPauseAt: '', disabled: [] },
                },
                'Reset Sales & POS settings to the platform default',
              )
            }
          >
            <Icon name="refresh" size={14} className="mr-1.5 inline align-[-2px]" />
            Reset to Default
          </Button>
        </div>
      </div>

      {visible.length ? (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {visible.map((change) => (
            <li key={change.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5 text-[13px]">
              <span className="min-w-[14rem] flex-1">{change.summary}</span>
              <span className="text-fg-muted">{change.by}</span>
              <span className="font-mono text-[12px] text-fg-muted">{change.at.slice(0, 16).replace('T', ' ')}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyBox icon="history" title="No customizations yet" hint="Running platform default (v1.0.0)" />
      )}
    </div>
  )
}

function AppearancePane() {
  const { posSettings } = useWorkspace()
  return (
    <div>
      <PaneHead
        title="Appearance"
        blurb="How the app presents itself — its tile, its name, and the density of its lists."
      />
      <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-fg-muted">
        This pane was not in the screenshots the rebuild was transcribed from, so nothing here is invented. What the
        app actually renders with today:
      </p>
      <dl className="mt-5 max-w-lg space-y-3 text-[13px]">
        {[
          ['App name', 'Sales & POS'],
          ['Version', 'v1.0.0'],
          ['Tile colour', 'Emerald (from the marketplace catalogue)'],
          ['Palette', 'Workspace teal — no scoped override'],
          ['Custom fields on records', String(posSettings.customFields.length)],
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

const panes: Record<string, () => React.ReactElement> = {
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
            Need a change? Just ask
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
            Describe what you want in plain English — "add a field for the customer's region", "have the AI summarize
            new records", "rename the Status column". No technical setup needed. Every change is saved in Change
            History and can be undone.
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
