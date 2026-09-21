'use client'

import { useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { agentsByAppCode } from '../../../lib/agentCatalog'
import { relativeTime } from '../../../lib/relativeTime'
import { approvalTypes, approverRoles, assetSettingsNav, taxonomyGroups } from '../../../lib/assetData'
import { useWorkspace, type ApprovalLevel } from '../../../lib/workspace'
import { Label, inputClass } from '../travel/shell'

/** The accent banner both app settings surfaces share. */
export function CopilotBanner() {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-accent-muted px-6 py-5">
      <div className="min-w-[18rem] flex-1">
        <p className="flex items-center gap-2.5 text-[15px] font-semibold">
          <Icon name="sparkles" size={17} className="text-accent" />
          Need a change? Just ask
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">
          Describe what you want in plain English — &ldquo;add a field for the customer&apos;s region&rdquo;, &ldquo;have
          the AI summarize new records&rdquo;, &ldquo;rename the Status column&rdquo;. No technical setup needed. Every
          change is saved in Change History and can be undone.
        </p>
      </div>
      <Button
        variant="accent"
        onClick={() => document.querySelector<HTMLButtonElement>('[aria-label="Open AI Copilot"]')?.click()}
      >
        <Icon name="sparkles" size={15} /> Open Copilot
      </Button>
    </div>
  )
}

function ApprovalLevelsPane() {
  const { assetSettings, updateAssetSettings } = useWorkspace()
  const [draft, setDraft] = useState<ApprovalLevel[]>(assetSettings.approvalLevels)
  const dirty = JSON.stringify(draft) !== JSON.stringify(assetSettings.approvalLevels)

  return (
    <div>
      <h3 className="text-[18px] font-semibold">Approval Levels</h3>
      <p className="mt-1.5 max-w-4xl text-[14px] text-fg-muted">
        Multi-level approval ladder for asset requests. Every level applies in order — level 1 decides first, and the
        request is only approved once the last level agrees.
      </p>

      <section className="mt-5 rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h4 className="text-[15px] font-semibold">Asset Requests</h4>
            <p className="mt-1 text-[13px] text-fg-muted">Every level applies, in order. Level 1 decides first.</p>
          </div>
          <Button variant="accent" disabled={!dirty} onClick={() => updateAssetSettings({ approvalLevels: draft })}>
            Save
          </Button>
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[36rem] border-collapse text-[13px]">
            <thead className="border-b border-line text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 text-left">
                  Level
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Type
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Approved by
                </th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {draft.map((level) => (
                <tr key={level.id}>
                  <td className="px-4 py-3">
                    <span className="grid h-8 w-10 place-items-center rounded-lg border border-line">
                      {level.level}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Type for level ${level.level}`}
                      value={level.type}
                      onChange={(event) =>
                        setDraft((prev) =>
                          prev.map((item) => (item.id === level.id ? { ...item, type: event.target.value } : item)),
                        )
                      }
                      className="rounded-lg border border-line bg-bg px-3 py-1.5 text-[13px] focus:border-accent focus:outline-none"
                    >
                      {approvalTypes.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap items-center gap-2">
                      {level.approvers.map((approver) => (
                        <span key={approver} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium tone-amber">
                          {approver}
                          <button
                            onClick={() =>
                              setDraft((prev) =>
                                prev.map((item) =>
                                  item.id === level.id
                                    ? { ...item, approvers: item.approvers.filter((row) => row !== approver) }
                                    : item,
                                ),
                              )
                            }
                            aria-label={`Remove ${approver}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      <select
                        aria-label={`Add approver to level ${level.level}`}
                        value=""
                        onChange={(event) => {
                          const value = event.target.value
                          if (!value) return
                          setDraft((prev) =>
                            prev.map((item) =>
                              item.id === level.id && !item.approvers.includes(value)
                                ? { ...item, approvers: [...item.approvers, value] }
                                : item,
                            ),
                          )
                        }}
                        className="rounded-lg border border-line bg-bg px-2 py-1.5 text-[12px] text-fg-muted focus:border-accent focus:outline-none"
                      >
                        <option value="">Add…</option>
                        {approverRoles.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {draft.length > 1 && (
                      <button
                        onClick={() => setDraft((prev) => prev.filter((item) => item.id !== level.id))}
                        aria-label={`Remove level ${level.level}`}
                        className="text-fg-muted transition hover:text-bad"
                      >
                        🗑
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={() =>
            setDraft((prev) => [
              ...prev,
              { id: crypto.randomUUID(), level: prev.length + 1, type: 'By Role', approvers: [] },
            ])
          }
          className="mt-4 text-[13px] font-medium text-accent hover:underline"
        >
          + Add level
        </button>
      </section>
    </div>
  )
}

function CustomFieldsPane() {
  const { assetSettings, updateAssetSettings } = useWorkspace()
  const fields = assetSettings.customFields

  return (
    <div>
      <h3 className="text-[18px] font-semibold">Custom Fields</h3>
      <p className="mt-1.5 text-[14px] text-fg-muted">
        Add extra data fields to capture information specific to your business.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-fg-2">
          Custom fields for <strong className="font-semibold">IT Assets</strong>
        </p>
        <Button
          variant="accent"
          onClick={() =>
            updateAssetSettings({
              customFields: [...fields, { id: crypto.randomUUID(), label: 'New field', type: 'text' }],
            })
          }
        >
          + Add Field
        </Button>
      </div>

      {fields.length ? (
        <ul className="mt-5 space-y-3">
          {fields.map((field) => (
            <li key={field.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
              <input
                value={field.label}
                onChange={(event) =>
                  updateAssetSettings({
                    customFields: fields.map((item) =>
                      item.id === field.id ? { ...item, label: event.target.value } : item,
                    ),
                  })
                }
                className="min-w-[10rem] flex-1 rounded-xl border border-line bg-bg px-3.5 py-2 text-[13px] focus:border-accent focus:outline-none"
              />
              <select
                aria-label={`Type of ${field.label}`}
                value={field.type}
                onChange={(event) =>
                  updateAssetSettings({
                    customFields: fields.map((item) =>
                      item.id === field.id ? { ...item, type: event.target.value } : item,
                    ),
                  })
                }
                className="rounded-xl border border-line bg-bg px-3 py-2 text-[13px] focus:border-accent focus:outline-none"
              >
                {['text', 'number', 'date', 'select'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <button
                onClick={() => updateAssetSettings({ customFields: fields.filter((item) => item.id !== field.id) })}
                aria-label={`Remove ${field.label}`}
                className="text-fg-muted transition hover:text-bad"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <Icon name="settings" size={28} className="mx-auto text-fg-muted" />
          <p className="mt-3 text-[16px] font-medium">No custom fields</p>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Add custom fields to capture additional it assets information.
          </p>
        </div>
      )}
    </div>
  )
}

function AgentsPane() {
  const { assetSettings, updateAssetSettings, creditsUsed } = useWorkspace()
  const agents = agentsByAppCode.get('ITAM') ?? []
  const controls = assetSettings.agents
  const [query, setQuery] = useState('')
  const [trigger, setTrigger] = useState('All triggers')

  /** Two of the three ITAM agents are manual; Offboarding Recovery runs on update. */
  const triggerFor = (name: string) =>
    name.includes('Offboarding') ? 'Runs automatically on update' : 'Runs only when someone clicks Run'

  const visible = agents.filter((agent) => {
    if (query && !agent.name.toLowerCase().includes(query.toLowerCase())) return false
    if (trigger === 'Automatic' && !triggerFor(agent.name).includes('automatically')) return false
    if (trigger === 'Manual' && triggerFor(agent.name).includes('automatically')) return false
    return true
  })

  const running = agents.filter((agent) => !controls.disabled.includes(agent.name)).length

  return (
    <div>
      <h3 className="text-[18px] font-semibold">AI Agents</h3>
      <p className="mt-1.5 text-[14px] text-fg-muted">The AI working on your records — review and adjust what it does.</p>

      <h4 className="mt-6 text-[16px] font-semibold">AI Agents</h4>
      <p className="mt-1.5 text-[14px] text-fg-muted">
        Switch an agent off to stop it running — and stop it spending AI Credits.
      </p>

      <section className="mt-5 rounded-2xl border border-line bg-surface-2/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-[14px] font-medium">AI Credit spend</p>
          <p className="text-[13px] text-fg-muted">
            {creditsUsed.toLocaleString()} AI Credits this month · {running} of {agents.length} agents running
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2.5 text-[13px]">
            <input
              type="checkbox"
              checked={controls.pauseAll}
              onChange={(event) =>
                updateAssetSettings({ agents: { ...controls, pauseAll: event.target.checked } })
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
                updateAssetSettings({ agents: { ...controls, autoRunOnNew: event.target.checked } })
              }
              className="h-4 w-4 accent-accent"
            />
            Auto-run on new records <span className="text-fg-muted">(else run manually)</span>
          </label>
          <label className="flex items-center gap-2.5 text-[13px]">
            Auto-pause at
            <input
              value={controls.autoPauseAt}
              onChange={(event) =>
                updateAssetSettings({ agents: { ...controls, autoPauseAt: event.target.value } })
              }
              placeholder="off"
              className="w-24 rounded-xl border border-line bg-bg px-3 py-1.5 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
            AI Credits
          </label>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap gap-3">
        <span className="relative min-w-[16rem] flex-1">
          <Icon name="search" size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search agents by name..."
            aria-label="Search agents"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </span>
        <select
          aria-label="Trigger"
          value={trigger}
          onChange={(event) => setTrigger(event.target.value)}
          className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
        >
          {['All triggers', 'Automatic', 'Manual'].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      <ul className="mt-5 space-y-3">
        {visible.map((agent) => {
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
                <span className="mt-0.5 block text-[12px] text-fg-muted">{triggerFor(agent.name)}</span>
              </span>
              <button
                role="switch"
                aria-checked={!off}
                aria-label={`${off ? 'Enable' : 'Disable'} ${agent.name}`}
                onClick={() =>
                  updateAssetSettings({
                    agents: {
                      ...controls,
                      disabled: off
                        ? controls.disabled.filter((item) => item !== agent.name)
                        : [...controls.disabled, agent.name],
                    },
                  })
                }
                className={`h-6 w-11 rounded-full p-0.5 transition ${off ? 'bg-surface-2' : 'bg-accent'}`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white transition-transform ${off ? '' : 'translate-x-5'}`}
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
      <h3 className="text-[18px] font-semibold">Schedules</h3>
      <p className="mt-1.5 text-[14px] text-fg-muted">
        Run the AI automatically on a schedule, without anyone clicking a button.
      </p>
      <div className="mt-6 px-6 py-14 text-center">
        <Icon name="clock" size={30} className="mx-auto text-fg-muted" />
        <p className="mt-4 text-[16px] font-medium">No workflow attached to Asset Management</p>
        <p className="mt-1.5 text-[13px] text-fg-muted">
          Schedules fire a workflow on a cron interval. Install or build a workflow for this app first.
        </p>
      </div>
    </div>
  )
}

function ChangeHistoryPane() {
  const { audit, resetAssetSettings } = useWorkspace()
  const [showReverted, setShowReverted] = useState(false)
  const entries = audit.filter((event) => event.action.startsWith('asset.'))

  return (
    <div>
      <h3 className="text-[18px] font-semibold">Change History</h3>
      <p className="mt-1.5 text-[14px] text-fg-muted">
        Every change made here, with who made it and when — and how to undo it.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-fg-2">
          v1.0.0 — {entries.length} change{entries.length === 1 ? '' : 's'} made so far
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[13px] text-fg-2">
            <input
              type="checkbox"
              checked={showReverted}
              onChange={(event) => setShowReverted(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Show reverted
          </label>
          <Button variant="secondary" disabled={!entries.length} onClick={resetAssetSettings}>
            <Icon name="refresh" size={15} /> Reset to Default
          </Button>
        </div>
      </div>

      {entries.length ? (
        <ul className="mt-5 divide-y divide-line rounded-2xl border border-line bg-surface">
          {entries.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
              <span className="min-w-[12rem] flex-1 font-mono text-[12px]">{event.action}</span>
              <span className="text-[12px] text-fg-muted">{event.resourceId}</span>
              <span className="text-[12px] text-fg-muted">{relativeTime(event.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
          <Icon name="refresh" size={28} className="mx-auto text-fg-muted" />
          <p className="mt-3 text-[16px] font-medium">No customizations yet</p>
          <p className="mt-1.5 text-[13px] text-fg-muted">Running platform default (v1.0.0)</p>
        </div>
      )}
    </div>
  )
}

export function AssetSettingsPane({ onOpenMasters }: { onOpenMasters: () => void }) {
  const [section, setSection] = useState('approval_levels')

  const panes: Record<string, React.ReactElement> = {
    approval_levels: <ApprovalLevelsPane />,
    custom_fields: <CustomFieldsPane />,
    ai_agents: <AgentsPane />,
    schedules: <SchedulesPane />,
    change_history: <ChangeHistoryPane />,
  }

  return (
    <div className="space-y-4">
      <CopilotBanner />

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Asset settings" className="h-fit rounded-2xl border border-line bg-surface p-3">
          <ul className="space-y-0.5">
            {assetSettingsNav.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => (item.external ? onOpenMasters() : setSection(item.id))}
                  aria-current={section === item.id ? 'page' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-[13.5px] transition ${
                    section === item.id ? 'bg-accent-muted font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2'
                  }`}
                >
                  <Icon name={item.icon} size={16} />
                  <span className="flex-1">{item.label}</span>
                  {item.external && <Icon name="external-link" size={13} className="text-fg-muted" />}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div key={section} className="app-enter">
          {panes[section]}
        </div>
      </div>
    </div>
  )
}

export function MasterTaxonomiesPane({ onBack }: { onBack: () => void }) {
  const { assetSettings, updateAssetSettings } = useWorkspace()
  const [active, setActive] = useState('asset_types')
  const [draft, setDraft] = useState(assetSettings.taxonomies)
  const dirty = JSON.stringify(draft) !== JSON.stringify(assetSettings.taxonomies)

  const entries = draft[active] ?? []
  const label = taxonomyGroups.flatMap((g) => g.items).find((item) => item.id === active)?.label ?? ''

  const setEntries = (next: typeof entries) => setDraft((prev) => ({ ...prev, [active]: next }))

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-fg-2 transition hover:text-accent">
        <span aria-hidden>‹</span> Back to Settings
      </button>

      <h2 className="mt-4 text-[20px] font-bold tracking-tight">Master Taxonomies</h2>
      <p className="mt-1.5 text-[14px] text-fg-muted">
        Every dropdown in this app is configured here — no developer needed.
      </p>

      <section className="mt-5 rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
          <h3 className="text-[16px] font-semibold">{label}</h3>
          <Button variant="accent" disabled={!dirty} onClick={() => updateAssetSettings({ taxonomies: draft })}>
            <Icon name="file-text" size={15} /> Save
          </Button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[14rem_1fr]">
          <nav aria-label="Taxonomies">
            {taxonomyGroups.map((group) => (
              <div key={group.group} className="mt-4 first:mt-0">
                <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.1em] text-fg-muted uppercase">
                  {group.group}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => setActive(item.id)}
                        aria-current={active === item.id ? 'page' : undefined}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2 text-left text-[13px] transition ${
                          active === item.id
                            ? 'bg-accent-muted font-semibold text-accent'
                            : 'text-fg-2 hover:bg-surface-2'
                        }`}
                      >
                        {item.label}
                        <span className="text-[12px] text-fg-muted">{(draft[item.id] ?? []).length}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[40rem] border-collapse text-[13px]">
                <thead className="border-b border-line text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left">
                      Value
                    </th>
                    <th scope="col" className="px-4 py-3 text-left">
                      Label
                    </th>
                    <th scope="col" className="px-4 py-3 text-left">
                      Tag prefix
                    </th>
                    <th scope="col" className="px-4 py-3 text-left">
                      Has config
                    </th>
                    <th scope="col" className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {entries.length ? (
                    entries.map((entry, index) => (
                      <tr key={`${entry.value}-${index}`}>
                        <td className="px-4 py-2.5">
                          {/* A saved Value is locked — records already store it. */}
                          <input
                            value={entry.value}
                            readOnly
                            aria-label={`Value of ${entry.label}`}
                            className="w-full cursor-not-allowed rounded-lg border border-line bg-surface-2/60 px-3 py-1.5 font-mono text-[12px] text-fg-muted"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            value={entry.label}
                            aria-label={`Label of ${entry.value}`}
                            onChange={(event) =>
                              setEntries(
                                entries.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)),
                              )
                            }
                            className="w-full rounded-lg border border-line bg-bg px-3 py-1.5 text-[13px] focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            value={entry.tagPrefix ?? ''}
                            aria-label={`Tag prefix of ${entry.value}`}
                            onChange={(event) =>
                              setEntries(
                                entries.map((item, i) =>
                                  i === index ? { ...item, tagPrefix: event.target.value } : item,
                                ),
                              )
                            }
                            className="w-24 rounded-lg border border-line bg-bg px-3 py-1.5 font-mono text-[12px] text-fg-muted focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              aria-label={`${entry.label} has config`}
                              checked={Boolean(entry.hasConfig)}
                              onChange={(event) =>
                                setEntries(
                                  entries.map((item, i) =>
                                    i === index ? { ...item, hasConfig: event.target.checked } : item,
                                  ),
                                )
                              }
                              className="h-4 w-4 accent-accent"
                            />
                            {entry.hasConfig && (
                              <span className="text-[12px] text-fg-muted">⚙ {entry.configCount ?? 0}</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => setEntries(entries.filter((_, i) => i !== index))}
                            aria-label={`Remove ${entry.label}`}
                            className="text-fg-muted transition hover:text-bad"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-fg-muted">
                        No entries yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setEntries([...entries, { value: '', label: 'New entry', tagPrefix: '' }])}
              className="mt-4 flex items-center gap-2 rounded-xl border border-line px-3.5 py-2 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
            >
              <Icon name="plus" size={14} /> Add entry
            </button>

            <p className="mt-5 rounded-xl border border-line bg-surface-2/50 px-4 py-3.5 text-[12px] leading-relaxed text-fg-muted">
              Every asset type here is tracked as an individual record with its own tag, assignment and history.
              <br />
              <strong className="font-semibold text-fg-2">Value</strong> is the key stored on every record;{' '}
              <strong className="font-semibold text-fg-2">Label</strong> is only what people see. Renaming a Label is
              always safe. A saved Value is locked — records already store it — so edit the Label, or remove the entry
              (removal is refused while records still use it). Nothing is silently orphaned.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export { Label, inputClass }
