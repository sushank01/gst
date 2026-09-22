'use client'

import { useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { agentsByAppCode } from '../../../lib/agentCatalog'
import { relativeTime } from '../../../lib/relativeTime'
import { approverRoles, assetSettingsNav, taxonomyGroups } from '../../../lib/assetData'
import type { ApiClientError } from '../../../lib/api'
import {
  useApprovalLadder,
  useAssetSettings,
  useAssetTaxonomies,
  useCreditBalance,
  useSettingsChanges,
  useWorkspaceMembers,
  type ApprovalLevel,
  type TaxonomyEntry,
} from './useAssets'

/** A pane that could not be loaded says so, and offers the retry when there is one. */
function PaneError({
  error,
  what,
  denied,
  canRetry,
  onRetry,
}: {
  error: ApiClientError
  what: string
  denied: boolean
  canRetry: boolean
  onRetry: () => void
}) {
  return (
    <div role="alert" className="mt-5 rounded-2xl border border-bad/40 bg-bad-muted/30 px-6 py-8 text-center">
      <p className="text-[15px] font-medium text-fg">
        {denied ? `Your role cannot read ${what}.` : `We could not load ${what}.`}
      </p>
      <p className="mt-1.5 text-[13px] text-fg-muted">{error.message}</p>
      {canRetry && (
        <div className="mt-4">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}

function SaveError({ error }: { error: ApiClientError | null }) {
  if (!error) return null
  return (
    <p role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad-muted/30 px-4 py-2.5 text-[13px]">
      {error.isConflict ? `Somebody else changed this. ${error.message} Reload before saving again.` : error.message}
    </p>
  )
}

/**
 * The approval ladder asset requests actually clear.
 *
 * The edit is a draft until Save, and the save carries the version it was
 * read at — two administrators editing the ladder at once conflict rather
 * than one silently winning.
 */
function ApprovalLevelsPane() {
  const ladder = useApprovalLadder()
  const directory = useWorkspaceMembers()
  const [draft, setDraft] = useState<ApprovalLevel[] | null>(null)

  const levels = draft ?? ladder.levels
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(ladder.levels)
  const edit = (next: ApprovalLevel[]) => setDraft(next.map((level, index) => ({ ...level, level: index + 1 })))
  const nameOf = (userId: string) => directory.members.find((member) => member.userId === userId)?.fullName ?? userId

  return (
    <div>
      <h3 className="text-[18px] font-semibold">Approval Levels</h3>
      <p className="mt-1.5 max-w-4xl text-[14px] text-fg-muted">
        Multi-level approval ladder for asset requests. Every level applies in order — level 1 decides first, and the
        request is only approved once the last level agrees.
      </p>

      {ladder.error ? (
        <PaneError
          error={ladder.error}
          what="the approval levels"
          denied={ladder.denied}
          canRetry={ladder.canRetry}
          onRetry={ladder.refetch}
        />
      ) : (
        <section className="mt-5 rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h4 className="text-[15px] font-semibold">Asset Requests</h4>
              <p className="mt-1 text-[13px] text-fg-muted">
                {levels.length
                  ? 'Every level applies, in order. Level 1 decides first.'
                  : 'With no levels, a request is approved the moment it is raised.'}
              </p>
            </div>
            <Button
              variant="accent"
              disabled={!dirty || ladder.saving}
              onClick={async () => {
                const saved = await ladder.saveLadder(levels, ladder.version)
                if (saved) setDraft(null)
              }}
            >
              {ladder.saving ? 'Saving…' : 'Save'}
            </Button>
          </div>

          <SaveError error={ladder.saveError} />

          {ladder.loading ? (
            <p role="status" className="mt-5 text-[13px] text-fg-muted">
              Loading…
            </p>
          ) : (
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
                  {levels.map((level, index) => (
                    <tr key={level.level}>
                      <td className="px-4 py-3">
                        <span className="grid h-8 w-10 place-items-center rounded-lg border border-line">{level.level}</span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Type for level ${level.level}`}
                          value={level.approverKind}
                          onChange={(event) =>
                            edit(
                              levels.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      approverKind: event.target.value as 'role' | 'user',
                                      approverRole: null,
                                      userIds: [],
                                    }
                                  : item,
                              ),
                            )
                          }
                          className="rounded-lg border border-line bg-bg px-3 py-1.5 text-[13px] focus:border-accent focus:outline-none"
                        >
                          <option value="role">By Role</option>
                          <option value="user">By Person</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {level.approverKind === 'role' ? (
                          <select
                            aria-label={`Approver role for level ${level.level}`}
                            value={level.approverRole ?? ''}
                            onChange={(event) =>
                              edit(levels.map((item, i) => (i === index ? { ...item, approverRole: event.target.value } : item)))
                            }
                            className="rounded-lg border border-line bg-bg px-3 py-1.5 text-[13px] focus:border-accent focus:outline-none"
                          >
                            <option value="">Choose…</option>
                            {approverRoles.map((item) => (
                              <option key={item}>{item}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="flex flex-wrap items-center gap-2">
                            {level.userIds.map((userId) => (
                              <span
                                key={userId}
                                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium tone-amber"
                              >
                                {nameOf(userId)}
                                <button
                                  onClick={() =>
                                    edit(
                                      levels.map((item, i) =>
                                        i === index
                                          ? { ...item, userIds: item.userIds.filter((row) => row !== userId) }
                                          : item,
                                      ),
                                    )
                                  }
                                  aria-label={`Remove ${nameOf(userId)}`}
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                            {directory.denied ? (
                              <span className="text-[12px] text-fg-muted">
                                Your role cannot read the member list, so nobody can be named here.
                              </span>
                            ) : (
                              <select
                                aria-label={`Add approver to level ${level.level}`}
                                value=""
                                onChange={(event) => {
                                  const value = event.target.value
                                  if (!value) return
                                  edit(
                                    levels.map((item, i) =>
                                      i === index && !item.userIds.includes(value)
                                        ? { ...item, userIds: [...item.userIds, value] }
                                        : item,
                                    ),
                                  )
                                }}
                                className="rounded-lg border border-line bg-bg px-2 py-1.5 text-[12px] text-fg-muted focus:border-accent focus:outline-none"
                              >
                                <option value="">Add…</option>
                                {directory.members.map((member) => (
                                  <option key={member.userId} value={member.userId}>
                                    {member.fullName}
                                  </option>
                                ))}
                              </select>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => edit(levels.filter((_, i) => i !== index))}
                          aria-label={`Remove level ${level.level}`}
                          className="text-fg-muted transition hover:text-bad"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!levels.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-fg-muted">
                        No approval levels. Requests are approved on submission.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <button
            onClick={() =>
              edit([...levels, { level: levels.length + 1, approverKind: 'role', approverRole: null, userIds: [] }])
            }
            className="mt-4 text-[13px] font-medium text-accent hover:underline"
          >
            + Add level
          </button>

          <p className="mt-5 rounded-xl border border-line bg-surface-2/50 px-4 py-3.5 text-[12px] leading-relaxed text-fg-muted">
            Who is named here is recorded against the level and shown on the request. The platform checks that whoever
            decides has permission to approve — it does not yet check that they are the person or role named, so treat
            this as the ladder&apos;s shape rather than as an access rule.
          </p>
        </section>
      )}
    </div>
  )
}

type CustomField = { id: string; label: string; type: string }
type CustomFieldsDocument = { fields: CustomField[] }

/**
 * Custom field definitions.
 *
 * Held as a draft and saved once: the document is version-checked, so a write
 * per keystroke would be a conflict per keystroke.
 */
function CustomFieldsPane() {
  const settings = useAssetSettings<CustomFieldsDocument>('custom_fields', { fields: [] })
  const [draft, setDraft] = useState<CustomField[] | null>(null)

  const fields = draft ?? settings.value.fields ?? []
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(settings.value.fields ?? [])

  return (
    <div>
      <h3 className="text-[18px] font-semibold">Custom Fields</h3>
      <p className="mt-1.5 text-[14px] text-fg-muted">
        Add extra data fields to capture information specific to your business.
      </p>

      {settings.error ? (
        <PaneError
          error={settings.error}
          what="these settings"
          denied={settings.denied}
          canRetry={settings.canRetry}
          onRetry={settings.refetch}
        />
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <p className="text-[13px] text-fg-2">
              Custom fields for <strong className="font-semibold">IT Assets</strong>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                /* Until the document is here, "the fields" is the empty
                   fallback — a draft built on it would save away whatever the
                   workspace already had. */
                disabled={!settings.loaded}
                onClick={() => setDraft([...fields, { id: crypto.randomUUID(), label: 'New field', type: 'text' }])}
              >
                + Add Field
              </Button>
              <Button
                variant="accent"
                disabled={!dirty || settings.saving}
                onClick={async () => {
                  const saved = await settings.save({ fields }, settings.version, `Custom fields (${fields.length})`)
                  if (saved) setDraft(null)
                }}
              >
                {settings.saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>

          <SaveError error={settings.saveError} />

          {settings.loading ? (
            <p role="status" className="mt-5 text-[13px] text-fg-muted">
              Loading…
            </p>
          ) : fields.length ? (
            <ul className="mt-5 space-y-3">
              {fields.map((field) => (
                <li key={field.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
                  <input
                    value={field.label}
                    aria-label={`Label of ${field.label}`}
                    onChange={(event) =>
                      setDraft(fields.map((item) => (item.id === field.id ? { ...item, label: event.target.value } : item)))
                    }
                    className="min-w-[10rem] flex-1 rounded-xl border border-line bg-bg px-3.5 py-2 text-[13px] focus:border-accent focus:outline-none"
                  />
                  <select
                    aria-label={`Type of ${field.label}`}
                    value={field.type}
                    onChange={(event) =>
                      setDraft(fields.map((item) => (item.id === field.id ? { ...item, type: event.target.value } : item)))
                    }
                    className="rounded-xl border border-line bg-bg px-3 py-2 text-[13px] focus:border-accent focus:outline-none"
                  >
                    {['text', 'number', 'date', 'select'].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setDraft(fields.filter((item) => item.id !== field.id))}
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

          <p className="mt-5 rounded-xl border border-line bg-surface-2/50 px-4 py-3.5 text-[12px] leading-relaxed text-fg-muted">
            Definitions saved here are kept with the workspace, but no asset form captures their values yet — adding a
            field does not add a box to the New asset dialog on this deployment.
          </p>
        </>
      )}
    </div>
  )
}

type AgentsDocument = { pauseAll: boolean; autoRunOnNew: boolean; autoPauseAt: string; disabled: string[] }

const AGENT_DEFAULTS: AgentsDocument = { pauseAll: false, autoRunOnNew: false, autoPauseAt: '', disabled: [] }

/**
 * Agent preferences, saved but not yet acted on.
 *
 * The switches and the credit ceiling are stored with the workspace, and the
 * credit figure is the real ledger balance. What is deliberately absent is
 * any claim that agents are running: nothing executes them on this
 * deployment, so no "N of M running" line, no trigger derived from a name,
 * and no filter over one.
 */
function AgentsPane() {
  const settings = useAssetSettings<AgentsDocument>('agents', AGENT_DEFAULTS)
  const credits = useCreditBalance()
  const agents = agentsByAppCode.get('ITAM') ?? []
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<AgentsDocument | null>(null)

  const controls = draft ?? settings.value
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(settings.value)
  const visible = agents.filter((agent) => !query || agent.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <div>
      <h3 className="text-[18px] font-semibold">AI Agents</h3>
      <p className="mt-1.5 text-[14px] text-fg-muted">The AI working on your records — review and adjust what it does.</p>

      <div className="mt-5 rounded-2xl border border-warn/40 bg-warn-muted/30 px-5 py-4 text-[13px] leading-relaxed text-fg-2">
        <strong className="font-semibold text-fg">Agents do not run on this deployment.</strong> There is no execution
        platform behind them yet, so nothing here has ever run and nothing spends against the ceiling below. The
        preferences are saved with the workspace so they apply once agents can run.
      </div>

      {settings.error ? (
        <PaneError
          error={settings.error}
          what="these settings"
          denied={settings.denied}
          canRetry={settings.canRetry}
          onRetry={settings.refetch}
        />
      ) : (
        <>
          <section className="mt-5 rounded-2xl border border-line bg-surface-2/50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-[14px] font-medium">AI Credit spend</p>
              <p className="text-[13px] text-fg-muted">
                {credits.error ? (
                  'Credit balance not available'
                ) : credits.loading ? (
                  'Loading credits…'
                ) : (
                  <>
                    {credits.data?.credits.used.toLocaleString()} of{' '}
                    {credits.data?.credits.granted.toLocaleString()} AI Credits used · {agents.length} agent
                    {agents.length === 1 ? '' : 's'} in this app
                  </>
                )}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={controls.pauseAll}
                  onChange={(event) => setDraft({ ...controls, pauseAll: event.target.checked })}
                  className="h-4 w-4 accent-accent"
                />
                Pause AI agents <span className="text-fg-muted">(this app)</span>
              </label>
              <label className="flex items-center gap-2.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={controls.autoRunOnNew}
                  onChange={(event) => setDraft({ ...controls, autoRunOnNew: event.target.checked })}
                  className="h-4 w-4 accent-accent"
                />
                Auto-run on new records <span className="text-fg-muted">(else run manually)</span>
              </label>
              <label className="flex items-center gap-2.5 text-[13px]">
                Auto-pause at
                <input
                  value={controls.autoPauseAt}
                  onChange={(event) => setDraft({ ...controls, autoPauseAt: event.target.value })}
                  placeholder="off"
                  className="w-24 rounded-xl border border-line bg-bg px-3 py-1.5 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
                />
                AI Credits
              </label>
              <Button
                variant="accent"
                disabled={!dirty || settings.saving}
                onClick={async () => {
                  const saved = await settings.save(controls, settings.version, 'Agent preferences')
                  if (saved) setDraft(null)
                }}
              >
                {settings.saving ? 'Saving…' : 'Save'}
              </Button>
            </div>

            <SaveError error={settings.saveError} />
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
                    <span className="mt-0.5 block text-[12px] text-fg-muted">Not yet available to run</span>
                  </span>
                  <button
                    role="switch"
                    aria-checked={!off}
                    aria-label={`${off ? 'Enable' : 'Disable'} ${agent.name}`}
                    onClick={() =>
                      setDraft({
                        ...controls,
                        disabled: off
                          ? controls.disabled.filter((item) => item !== agent.name)
                          : [...controls.disabled, agent.name],
                      })
                    }
                    className={`h-6 w-11 rounded-full p-0.5 transition ${off ? 'bg-surface-2' : 'bg-accent'}`}
                  >
                    <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${off ? '' : 'translate-x-5'}`} />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
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

/**
 * Settings changes, with the undo the heading promises.
 *
 * This is the settings trail, not the record trail: what somebody changed on
 * these screens, each with the summary written when it was saved. Reverting
 * one writes a new version of its own, so the history stays append-only.
 *
 * Two absences are stated on the screen rather than left to be discovered.
 * Approval Levels are stored in their own tables and never reach the settings
 * trail, so they are neither listed nor undoable here. And an undo restores
 * the document as it was without re-running the checks the editor applies —
 * undoing a taxonomy edit can drop a value records have since started using,
 * which `PUT /assets/taxonomies/{code}` would refuse.
 */
function ChangeHistoryPane() {
  const history = useSettingsChanges()
  const [showReverted, setShowReverted] = useState(false)

  const entries = history.changes.filter((change) => showReverted || !change.reverted)
  const hidden = history.changes.length - entries.length

  return (
    <div>
      <h3 className="text-[18px] font-semibold">Change History</h3>
      <p className="mt-1.5 text-[14px] text-fg-muted">
        Changes to this app&apos;s settings documents — Custom Fields, AI Agents and Master Taxonomies — with who made
        them and when. Approval Levels are stored separately and do not appear here, and neither do record events such
        as an asset being registered.
      </p>

      {history.error ? (
        <PaneError
          error={history.error}
          what="the change history"
          denied={history.denied}
          canRetry={history.canRetry}
          onRetry={history.refetch}
        />
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            {/* The endpoint answers a page and carries no total, so a full
                page is reported as a page — not as everything ever changed. */}
            <p className="text-[13px] text-fg-2">
              {history.loading
                ? 'Loading…'
                : `${history.capped ? 'The most recent ' : ''}${history.changes.length} change${
                    history.changes.length === 1 ? '' : 's'
                  }${history.capped ? ' — there may be older ones' : ' recorded'}${
                    hidden ? `, ${hidden} reverted and hidden` : ''
                  }`}
            </p>
            <label className="flex items-center gap-2 text-[13px] text-fg-2">
              <input
                type="checkbox"
                checked={showReverted}
                onChange={(event) => setShowReverted(event.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Show reverted
            </label>
          </div>

          <SaveError error={history.revertError} />

          {Boolean(entries.length) && (
            <p className="mt-3 text-[12px] text-fg-muted">
              Undo restores the document exactly as it was and records the restore as a change of its own. It does not
              re-run the checks the editor applies — undoing a taxonomy edit can drop a value records have started
              using since.
            </p>
          )}

          {entries.length ? (
            <ul className="mt-5 divide-y divide-line rounded-2xl border border-line bg-surface">
              {entries.map((change) => (
                <li key={change.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                  <span className="min-w-[12rem] flex-1 text-[13px]">{change.summary}</span>
                  <span className="text-[12px] text-fg-muted">{change.changedByName ?? 'Someone'}</span>
                  <span className="text-[12px] text-fg-muted">{relativeTime(change.changedAt)}</span>
                  {change.reverted ? (
                    <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-slate">Reverted</span>
                  ) : (
                    <Button
                      variant="secondary"
                      className="!py-1.5 !text-[12px]"
                      disabled={history.reverting}
                      onClick={() => history.revert(change.id)}
                    >
                      Undo
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            !history.loading && (
              <div className="mt-5 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
                <Icon name="refresh" size={28} className="mx-auto text-fg-muted" />
                <p className="mt-3 text-[16px] font-medium">No customizations yet</p>
                <p className="mt-1.5 text-[13px] text-fg-muted">
                  {showReverted ? 'Nothing has been changed here.' : 'Nothing has been changed here that is still applied.'}
                </p>
              </div>
            )
          )}
        </>
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

/**
 * Where each list is actually read, on this deployment.
 *
 * The screen offers nine lists; two of them reach a dropdown, three more are
 * columns no form fills in, and the rest are read by nothing at all. Editing
 * a list that nothing consumes is a real save with no effect, and somebody
 * configuring notifications here deserves to be told that before they spend
 * an afternoon on it rather than after.
 */
const TAXONOMY_USE: Record<string, string> = {
  asset_types:
    'Read by the Type filter, the New asset and New request forms, and — through Tag prefix — by tag allocation.',
  retirement_reasons: 'Read by the Retire dialog.',
  makes: 'Stored on an asset, but no form on this deployment captures a make yet.',
  models: 'Stored on an asset, but no form on this deployment captures a model yet.',
  mode_of_purchase: 'Stored on an asset, but no form on this deployment captures it yet.',
}

const TAXONOMY_UNUSED = 'Nothing on this deployment reads this list yet — entries are saved, and nothing consumes them.'

export function MasterTaxonomiesPane({ onBack }: { onBack: () => void }) {
  const catalogue = useAssetTaxonomies()
  const [active, setActive] = useState('asset_types')
  const [draft, setDraft] = useState<Record<string, TaxonomyEntry[]> | null>(null)

  const saved = catalogue.taxonomies
  const entries = draft?.[active] ?? saved[active] ?? []
  // Only the taxonomy on screen counts as dirty: edits to another one are
  // still in the draft and are saved from their own page, not by this button.
  const dirty = draft?.[active] !== undefined && JSON.stringify(entries) !== JSON.stringify(saved[active] ?? [])
  const label = taxonomyGroups.flatMap((group) => group.items).find((item) => item.id === active)?.label ?? ''

  const setEntries = (next: TaxonomyEntry[]) => setDraft({ ...(draft ?? {}), [active]: next })
  // A tag prefix is only read when allocating an asset tag, which only asset
  // types do. Offering the box elsewhere is a field that goes nowhere.
  const prefixed = active === 'asset_types'
  const columns = prefixed ? 4 : 3
  const countFor = (code: string) => (draft?.[code] ?? saved[code] ?? []).length
  // A value only becomes immutable once it has been saved: records store it.
  const savedValues = new Set((saved[active] ?? []).map((entry) => entry.value))

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-fg-2 transition hover:text-accent">
        <span aria-hidden>‹</span> Back to Settings
      </button>

      <h2 className="mt-4 text-[20px] font-bold tracking-tight">Master Taxonomies</h2>
      <p className="mt-1.5 text-[14px] text-fg-muted">
        The lists this app reads from, configured here rather than in code. Each one says where it is read — some are
        stored for a screen that does not exist yet.
      </p>

      {catalogue.error ? (
        <PaneError
          error={catalogue.error}
          what="the taxonomies"
          denied={catalogue.denied}
          canRetry={catalogue.canRetry}
          onRetry={catalogue.refetch}
        />
      ) : (
        <section className="mt-5 rounded-2xl border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <h3 className="text-[16px] font-semibold">{label}</h3>
              <p className="mt-0.5 text-[12px] text-fg-muted">{TAXONOMY_USE[active] ?? TAXONOMY_UNUSED}</p>
            </div>
            <Button
              variant="accent"
              disabled={!dirty || catalogue.saving}
              onClick={async () => {
                const result = await catalogue.saveTaxonomy(active, entries, catalogue.version)
                // Only this taxonomy leaves the draft; edits to another one
                // are not somebody else's to discard.
                if (result) {
                  setDraft((prev) => {
                    const rest = { ...prev }
                    delete rest[active]
                    return Object.keys(rest).length ? rest : null
                  })
                }
              }}
            >
              <Icon name="file-text" size={15} /> {catalogue.saving ? 'Saving…' : 'Save'}
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
                            active === item.id ? 'bg-accent-muted font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2'
                          }`}
                        >
                          {item.label}
                          <span className="text-[12px] text-fg-muted">{catalogue.loading ? '·' : countFor(item.id)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>

            <div>
              <SaveError error={catalogue.saveError} />

              <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[40rem] border-collapse text-[13px]">
                  <thead className="border-b border-line text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left">
                        Value
                      </th>
                      <th scope="col" className="px-4 py-3 text-left">
                        Label
                      </th>
                      {prefixed && (
                        <th scope="col" className="px-4 py-3 text-left">
                          Tag prefix
                        </th>
                      )}
                      <th scope="col" className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {catalogue.loading ? (
                      <tr>
                        <td colSpan={columns} className="px-4 py-10 text-center text-fg-muted" role="status">
                          Loading…
                        </td>
                      </tr>
                    ) : entries.length ? (
                      entries.map((entry, index) => {
                        const locked = savedValues.has(entry.value)
                        return (
                          <tr key={`${entry.value}-${index}`}>
                            <td className="px-4 py-2.5">
                              <input
                                value={entry.value}
                                readOnly={locked}
                                aria-label={`Value of ${entry.label}`}
                                onChange={(event) =>
                                  setEntries(entries.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))
                                }
                                className={`w-full rounded-lg border border-line px-3 py-1.5 font-mono text-[12px] ${
                                  locked
                                    ? 'cursor-not-allowed bg-surface-2/60 text-fg-muted'
                                    : 'bg-bg text-fg focus:border-accent focus:outline-none'
                                }`}
                              />
                            </td>
                            <td className="px-4 py-2.5">
                              <input
                                value={entry.label}
                                aria-label={`Label of ${entry.value}`}
                                onChange={(event) =>
                                  setEntries(entries.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))
                                }
                                className="w-full rounded-lg border border-line bg-bg px-3 py-1.5 text-[13px] focus:border-accent focus:outline-none"
                              />
                            </td>
                            {prefixed && (
                              <td className="px-4 py-2.5">
                                <input
                                  value={entry.tagPrefix ?? ''}
                                  aria-label={`Tag prefix of ${entry.value}`}
                                  onChange={(event) =>
                                    setEntries(
                                      entries.map((item, i) => (i === index ? { ...item, tagPrefix: event.target.value } : item)),
                                    )
                                  }
                                  className="w-24 rounded-lg border border-line bg-bg px-3 py-1.5 font-mono text-[12px] text-fg-muted focus:border-accent focus:outline-none"
                                />
                              </td>
                            )}
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
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={columns} className="px-4 py-10 text-center text-fg-muted">
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
                always safe. A saved Value is locked — records already store it — so edit the Label, or remove the entry.
                The server refuses a removal while records still use that value, so nothing is silently orphaned.
                {prefixed && (
                  <>
                    <br />A <strong className="font-semibold text-fg-2">Tag prefix</strong> is what new tags for that
                    type are numbered from; leave it blank and they come from the default sequence.
                  </>
                )}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
