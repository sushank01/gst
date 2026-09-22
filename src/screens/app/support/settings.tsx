'use client'

import { useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { agentsByAppCode } from '../../../lib/agentCatalog'
import {
  behaviourLabel,
  defaultPriorities,
  exportFormats,
  exportReports,
  serviceTiers,
  statusDot,
  supportSettingsTabs,
  ticketFieldTabs,
  widgetPositions,
  type FieldRow,
} from '../../../lib/supportData'
import { useWorkspace, type SupportRule, type SupportSettings } from '../../../lib/workspace'
import { Dialog, Label, inputClass } from '../../../components/EnterpriseUi'

/** Every settings pane edits `supportSettings`, so they share one save shape. */
function useSettings<K extends keyof SupportSettings>(key: K) {
  const { supportSettings, updateSupportSettings } = useWorkspace()
  const [draft, setDraft] = useState<SupportSettings[K]>(supportSettings[key])
  const dirty = JSON.stringify(draft) !== JSON.stringify(supportSettings[key])
  return { draft, setDraft, dirty, save: () => updateSupportSettings({ [key]: draft }) }
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">{children}</p>
}

function SectionHead({ title, blurb, action }: { title: string; blurb?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <h3 className="text-[16px] font-semibold">{title}</h3>
        {blurb && <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{blurb}</p>}
      </div>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------ fields */

const fieldKeys = {
  Statuses: 'statuses',
  Categories: 'categories',
  Priorities: 'priorities',
  Types: 'types',
  Channels: 'channels',
} as const

const fieldCopy: Record<string, { blurb: string; add: string }> = {
  Statuses: {
    blurb:
      "The workflow a ticket moves through. Mark a status as a waiting bucket to pause its SLA clock and drop it off an agent's active load.",
    add: 'Add statuse',
  },
  Categories: {
    blurb: 'How tickets are classified. Drives routing rules, KB tagging and reports.',
    add: 'Add categorie',
  },
  Priorities: { blurb: 'Urgency levels, each with the SLA target hours it implies.', add: 'Add prioritie' },
  Types: { blurb: 'Question, problem, incident — however your team frames work.', add: 'Add type' },
  Channels: {
    blurb: 'Where tickets come from. Platform intake paths (email, widget, portal) are always available.',
    add: 'Add channel',
  },
}

function TicketFieldsPane() {
  const { supportSettings, updateSupportSettings } = useWorkspace()
  const [tab, setTab] = useState<(typeof ticketFieldTabs)[number]>('Statuses')
  const [editing, setEditing] = useState<FieldRow | null>(null)
  const [open, setOpen] = useState(false)

  const key = fieldKeys[tab]
  const rows = supportSettings[key]
  const copy = fieldCopy[tab]

  const [draft, setDraft] = useState<FieldRow>({ id: '', label: '', slug: '' })

  function persist(next: FieldRow[]) {
    updateSupportSettings({ [key]: next })
  }

  return (
    <div>
      <nav className="flex flex-wrap gap-6 border-b border-line">
        {ticketFieldTabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            aria-current={tab === item ? 'page' : undefined}
            className={`-mb-px border-b-2 px-1 pb-3 text-[14px] transition ${
              tab === item ? 'border-accent font-medium text-accent' : 'border-transparent text-fg-2 hover:text-fg'
            }`}
          >
            {item}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        <SectionHead
          title=""
          blurb={copy.blurb}
          action={
            <Button
              variant="accent"
              onClick={() => {
                setEditing(null)
                setDraft({ id: crypto.randomUUID(), label: '', slug: '', behaviour: 'active', slaHours: 24 })
                setOpen(true)
              }}
            >
              + {copy.add}
            </Button>
          }
        />
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[42rem] border-collapse text-[13px]">
          <thead className="border-b border-line text-[12px] text-fg-muted">
            <tr>
              <th scope="col" className="px-5 py-3.5 text-left font-medium">
                Label
              </th>
              <th scope="col" className="px-5 py-3.5 text-left font-medium">
                Slug
              </th>
              {tab === 'Statuses' && (
                <th scope="col" className="px-5 py-3.5 text-left font-medium">
                  Behaviour
                </th>
              )}
              {tab === 'Priorities' && (
                <th scope="col" className="px-5 py-3.5 text-right font-medium">
                  SLA hours
                </th>
              )}
              <th scope="col" className="px-5 py-3.5 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-5 py-4">
                  <span className="flex items-center gap-3">
                    <span aria-hidden className="cursor-grab text-fg-muted">
                      ⠿
                    </span>
                    {row.color && (
                      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${statusDot[row.color] ?? ''}`} />
                    )}
                    <span className="font-medium">{row.label}</span>
                  </span>
                </td>
                <td className="px-5 py-4 font-mono text-[12px] text-fg-muted">{row.slug}</td>
                {tab === 'Statuses' && (
                  <td className="px-5 py-4">
                    {row.behaviour === 'active' ? (
                      <span className="text-fg-2">Active</span>
                    ) : (
                      <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-2">
                        {behaviourLabel[row.behaviour ?? 'active']}
                      </span>
                    )}
                  </td>
                )}
                {tab === 'Priorities' && <td className="px-5 py-4 text-right">{row.slaHours}</td>}
                <td className="px-5 py-4">
                  <span className="flex items-center justify-end gap-4">
                    <button
                      onClick={() => {
                        setEditing(row)
                        setDraft(row)
                        setOpen(true)
                      }}
                      aria-label={`Edit ${row.label}`}
                      className="text-fg-muted transition hover:text-accent"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => persist(rows.filter((item) => item.id !== row.id))}
                      aria-label={`Delete ${row.label}`}
                      className="text-fg-muted transition hover:text-bad"
                    >
                      🗑
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Dialog title={editing ? `Edit ${tab.slice(0, -1).toLowerCase()}` : copy.add} onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Label</Label>
              <input
                value={draft.label}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    label: event.target.value,
                    // The slug follows the label until someone edits it by hand.
                    slug: editing ? prev.slug : event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                  }))
                }
                className={inputClass}
              />
            </label>
            <label>
              <Label>Slug</Label>
              <input
                value={draft.slug}
                onChange={(event) => setDraft((prev) => ({ ...prev, slug: event.target.value }))}
                className={`${inputClass} font-mono text-[13px]`}
              />
            </label>
            {tab === 'Statuses' && (
              <label>
                <Label>Behaviour</Label>
                <select
                  value={draft.behaviour ?? 'active'}
                  onChange={(event) => setDraft((prev) => ({ ...prev, behaviour: event.target.value }))}
                  className={inputClass}
                >
                  {Object.entries(behaviourLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {tab === 'Priorities' && (
              <label>
                <Label>SLA hours</Label>
                <input
                  type="number"
                  min={1}
                  value={draft.slaHours ?? 24}
                  onChange={(event) => setDraft((prev) => ({ ...prev, slaHours: Number(event.target.value) }))}
                  className={inputClass}
                />
              </label>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.label.trim()}
              onClick={() => {
                persist(editing ? rows.map((item) => (item.id === draft.id ? draft : item)) : [...rows, draft])
                setOpen(false)
              }}
            >
              {editing ? 'Save' : 'Create'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ widget */

function WebWidgetPane() {
  const { draft, setDraft, dirty, save } = useSettings('widget')
  const [copied, setCopied] = useState(false)
  const snippet = `<script src="https://apragya.ai/api/v1/public/support-widget.js" data-tenant="acme" defer></script>`

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <div>
        <SectionHead
          title="Web widget"
          blurb="Embed a support box on your website. Visitors can search your knowledge base and open a ticket without an account."
        />

        <label className="mt-5 flex items-center gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => set('enabled', event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Widget enabled
        </label>
        <Hint>
          When off, the script returns nothing and the launcher disappears from your site — existing tickets are
          untouched.
        </Hint>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label>
            <Label>Panel title</Label>
            <input value={draft.panelTitle} onChange={(e) => set('panelTitle', e.target.value)} className={inputClass} />
          </label>
          <label>
            <Label>Launcher button text</Label>
            <input
              value={draft.launcherText}
              onChange={(e) => set('launcherText', e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <label className="mt-5 block">
          <Label>Subtitle</Label>
          <input value={draft.subtitle} onChange={(e) => set('subtitle', e.target.value)} className={inputClass} />
        </label>
        <Hint>Set expectations — e.g. your usual reply time.</Hint>

        <label className="mt-5 block">
          <Label>Confirmation message</Label>
          <input
            value={draft.confirmation}
            onChange={(e) => set('confirmation', e.target.value)}
            className={inputClass}
          />
        </label>
        <Hint>Shown after a visitor submits.</Hint>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label>
            <Label>Accent colour</Label>
            <span className="mt-1.5 flex items-center gap-2">
              <input
                type="color"
                aria-label="Accent colour"
                value={draft.accent}
                onChange={(e) => set('accent', e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-bg"
              />
              <input
                value={draft.accent}
                onChange={(e) => set('accent', e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 py-2 font-mono text-[13px] focus:border-accent focus:outline-none"
              />
            </span>
          </label>
          <label>
            <Label>Screen position</Label>
            <select value={draft.position} onChange={(e) => set('position', e.target.value)} className={inputClass}>
              {widgetPositions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-5 flex items-center gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={draft.showHelpTab}
            onChange={(e) => set('showHelpTab', e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Show the Help tab (search published KB articles)
        </label>
        <label className="mt-2.5 flex items-center gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={draft.requireEmail}
            onChange={(e) => set('requireEmail', e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Require an email address
        </label>
        <Hint>
          Without an email there is no way to reply, so leave this on unless you only want anonymous feedback.
        </Hint>

        <div className="mt-6 flex justify-end">
          <Button variant="accent" disabled={!dirty} onClick={save}>
            Save widget settings
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Preview</p>
          <div className="mt-3 overflow-hidden rounded-xl border border-line">
            <div className="px-4 py-3 text-white" style={{ background: draft.accent }}>
              <p className="text-[14px] font-semibold">{draft.panelTitle}</p>
              <p className="mt-0.5 text-[12px] opacity-90">{draft.subtitle}</p>
            </div>
            <div className="flex border-b border-line text-[12px]">
              <span className="border-b-2 px-4 py-2 font-medium" style={{ borderColor: draft.accent, color: draft.accent }}>
                Contact us
              </span>
              {draft.showHelpTab && <span className="px-4 py-2 text-fg-muted">Help</span>}
            </div>
            <div className="space-y-2 p-4">
              <span className="block h-2 rounded bg-surface-2" />
              <span className="block h-2 w-2/3 rounded bg-surface-2" />
              <span className="mt-3 block h-8 rounded-lg" style={{ background: draft.accent }} />
            </div>
          </div>
          <p className="mt-3 text-right">
            <span
              className="inline-block rounded-full px-3.5 py-1.5 text-[12px] font-medium text-white"
              style={{ background: draft.accent }}
            >
              {draft.launcherText}
            </span>
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Install</p>
          <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">
            Paste this once, just before &lt;/body&gt; on any page that should show the widget.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-bg px-3 py-2 font-mono text-[11px] whitespace-nowrap">
            {snippet}
          </code>
          <Button
            variant="secondary"
            className="mt-3 w-full"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(snippet)
                setCopied(true)
              } catch {
                setCopied(false)
              }
            }}
          >
            <Icon name="file-text" size={15} /> {copied ? 'Copied' : 'Copy snippet'}
          </Button>
        </section>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- csat */

function CsatSurveyPane() {
  const { draft, setDraft, dirty, save } = useSettings('csat')
  const { tickets } = useWorkspace()
  const [note, setNote] = useState<string | null>(null)

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const pending = tickets.filter((item) => item.status === 'Resolved' && item.csat === null).length

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
      <div>
        <SectionHead
          title="Customer satisfaction"
          blurb="Ask the customer one question when their ticket is resolved. The survey is a single click straight from the email — no sign-in."
        />

        <label className="mt-5 flex items-center gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={draft.sendOnResolve}
            onChange={(e) => set('sendOnResolve', e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Send survey on Resolve
        </label>
        <Hint>
          Off means no survey emails go out at all. Ratings already collected are kept and still appear in the CSAT
          report.
        </Hint>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label>
              <Label>Wait before sending (hours)</Label>
              <input
                type="number"
                min={0}
                value={draft.waitHours}
                onChange={(e) => set('waitHours', Number(e.target.value))}
                className={inputClass}
              />
            </label>
            <Hint>Gives the customer time to confirm the fix actually held.</Hint>
          </div>
          <div>
            <label>
              <Label>Skip tickets older than (days)</Label>
              <input
                type="number"
                min={1}
                value={draft.skipOlderDays}
                onChange={(e) => set('skipOlderDays', Number(e.target.value))}
                className={inputClass}
              />
            </label>
            <Hint>Avoids waking up an inbox long after the ticket was closed.</Hint>
          </div>
          <div>
            <label>
              <Label>Low-score threshold</Label>
              <input
                type="number"
                min={1}
                max={5}
                value={draft.lowScore}
                onChange={(e) => set('lowScore', Number(e.target.value))}
                className={inputClass}
              />
            </label>
            <Hint>
              Ratings at or below this land in the CSAT review queue and stay there until someone records what was
              done.
            </Hint>
          </div>
          <div>
            <label>
              <Label>SLA warning at (% elapsed)</Label>
              <input
                type="number"
                min={1}
                max={100}
                value={draft.slaWarnPercent}
                onChange={(e) => set('slaWarnPercent', Number(e.target.value))}
                className={inputClass}
              />
            </label>
            <Hint>
              Alerts the assignee while there is still time to act. A percentage rather than fixed minutes, so it
              behaves the same on a 1-hour and a 72-hour target.
            </Hint>
          </div>
        </div>

        <label className="mt-5 block">
          <Label>Customer portal URL</Label>
          <input
            value={draft.portalUrl}
            onChange={(e) => set('portalUrl', e.target.value)}
            placeholder="https://support.yourcompany.com/portal"
            className={inputClass}
          />
        </label>
        <Hint>Optional. Adds a &lsquo;view the full conversation&rsquo; link under the survey.</Hint>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() =>
              setNote(
                pending
                  ? `${pending} survey${pending === 1 ? '' : 's'} queued for resolved tickets without a rating.`
                  : 'No resolved tickets are waiting on a survey.',
              )
            }
          >
            Send pending surveys now
          </Button>
          <Button variant="accent" disabled={!dirty} onClick={save}>
            Save CSAT settings
          </Button>
        </div>
        {note && <p className="mt-3 text-right text-[13px] text-fg-muted">{note}</p>}
      </div>

      <section className="h-fit rounded-2xl border border-line bg-surface p-5">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">What the customer sees</p>
        <p className="mt-3 text-[15px] font-semibold">Was your issue resolved?</p>
        <div className="mt-3 flex gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px]">
            👍 Thumbs Up
          </span>
          <span className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px]">
            👎 Thumbs Down
          </span>
        </div>
        <p className="mt-3 text-[12px] text-fg-muted">Plus an optional comment box.</p>
        <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">
          The link is signed, expires, and works once — a second submission can&apos;t overwrite the first.
        </p>
      </section>
    </div>
  )
}

/* -------------------------------------------------------------- rule lists */

function RuleListPane({
  settingsKey,
  title,
  blurb,
  empty,
  addLabel,
  extraActions,
  notice,
}: {
  settingsKey: keyof SupportSettings
  title?: string
  blurb: React.ReactNode
  empty: string
  addLabel: string
  extraActions?: React.ReactNode
  notice?: string
}) {
  const { supportSettings, updateSupportSettings } = useWorkspace()
  const rules = supportSettings[settingsKey] as SupportRule[]
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', detail: '' })

  return (
    <div>
      {notice && (
        <p className="mb-5 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[13px] text-fg-2">{notice}</p>
      )}

      <SectionHead
        title={title ?? ''}
        blurb={blurb}
        action={
          <div className="flex flex-wrap items-center gap-3">
            {extraActions}
            <Button variant="accent" onClick={() => setOpen(true)}>
              + {addLabel}
            </Button>
          </div>
        }
      />

      <div className="mt-6">
        {rules.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <span className="min-w-[12rem] flex-1">
                  <span className="block text-[14px] font-medium">{rule.name}</span>
                  {rule.detail && <span className="mt-0.5 block text-[12px] text-fg-muted">{rule.detail}</span>}
                </span>
                <Button
                  variant="secondary"
                  className="!py-2 !text-[13px]"
                  onClick={() =>
                    updateSupportSettings({
                      [settingsKey]: rules.filter((item) => item.id !== rule.id),
                    })
                  }
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-10 text-center text-[14px] text-fg-muted">{empty}</p>
        )}
      </div>

      {open && (
        <Dialog title={addLabel} onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Name</Label>
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label>
              <Label>Detail</Label>
              <input
                value={draft.detail}
                onChange={(event) => setDraft((prev) => ({ ...prev, detail: event.target.value }))}
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
                updateSupportSettings({
                  [settingsKey]: [
                    ...rules,
                    { id: crypto.randomUUID(), name: draft.name.trim(), detail: draft.detail.trim(), enabled: true },
                  ],
                })
                setDraft({ name: '', detail: '' })
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

/* --------------------------------------------------------------- the rest */

function ParseFailuresPane() {
  return (
    <div>
      <SectionHead
        title="Parse failures"
        blurb="Inbound messages that could not be turned into a ticket. Fix the cause, then retry — the original message is kept so nothing is lost."
      />
      <p className="mt-6 rounded-xl bg-surface-2/50 px-6 py-12 text-center text-[14px] text-fg-muted">
        Nothing has failed to parse. Inbound mail is landing cleanly.
      </p>
    </div>
  )
}

function CsatReviewPane() {
  const { tickets, supportSettings } = useWorkspace()
  const [showReviewed, setShowReviewed] = useState(false)
  const low = tickets.filter((item) => item.csat !== null && (item.csat ?? 5) <= supportSettings.csat.lowScore)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h3 className="text-[16px] font-semibold">Low-score review queue</h3>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Ratings at or below {supportSettings.csat.lowScore}, plus every NPS detractor (0–6). Each stays here until
            someone records what was done.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-fg-2">
          <input
            type="checkbox"
            checked={showReviewed}
            onChange={(event) => setShowReviewed(event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Show reviewed
        </label>
      </div>

      {low.length ? (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {low.map((ticket) => (
            <li key={ticket.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
              <span className="w-20 shrink-0 font-mono text-[12px] text-fg-muted">{ticket.reference}</span>
              <span className="min-w-0 flex-1 text-[13px]">{ticket.subject}</span>
              <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-rose">CSAT {ticket.csat}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 py-10 text-center text-[14px] text-fg-muted">
          Nothing needs review. Every low score has been followed up.
        </p>
      )}
    </div>
  )
}

function ReportExportsPane() {
  const { tickets, supportSettings, updateSupportSettings } = useWorkspace()
  const [report, setReport] = useState(exportReports[0])
  const [format, setFormat] = useState(exportFormats[0])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const schedules = supportSettings.reportSchedules

  function download() {
    const rows = tickets.filter((ticket) => {
      const at = ticket.createdAt.slice(0, 10)
      if (from && at < from) return false
      if (to && at > to) return false
      return true
    })
    const head = 'reference,subject,status,priority,category,source,created_at'
    const body = rows
      .map((t) => [t.reference, `"${t.subject}"`, t.status, t.priority, t.category, t.source, t.createdAt].join(','))
      .join('\n')
    const blob = new Blob([`${head}\n${body}`], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${report.toLowerCase().replace(/\s+/g, '-')}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <SectionHead title="Export a report" blurb="Download the current data as CSV or Excel." />

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
        <span className="text-[13px] text-fg-2">Report</span>
        <select
          aria-label="Report"
          value={report}
          onChange={(e) => setReport(e.target.value)}
          className="rounded-xl border border-line bg-bg px-3 py-2 text-[13px] focus:border-accent focus:outline-none"
        >
          {exportReports.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <span className="text-[13px] text-fg-2">Format</span>
        <select
          aria-label="Format"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="rounded-xl border border-line bg-bg px-3 py-2 text-[13px] focus:border-accent focus:outline-none"
        >
          {exportFormats.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <span className="text-[13px] text-fg-2">From</span>
        <input
          type="date"
          aria-label="From"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-xl border border-line bg-bg px-3 py-2 text-[13px] focus:border-accent focus:outline-none"
        />
        <span className="text-[13px] text-fg-2">To</span>
        <input
          type="date"
          aria-label="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-xl border border-line bg-bg px-3 py-2 text-[13px] focus:border-accent focus:outline-none"
        />
        <Button variant="accent" onClick={download}>
          <Icon name="download" size={15} /> Download
        </Button>
      </div>

      <div className="mt-8">
        <SectionHead
          title="Scheduled emails"
          blurb="Email a report on a cadence. Each recipient gets their own copy, so the distribution list is never exposed."
          action={
            <Button
              variant="accent"
              onClick={() =>
                updateSupportSettings({
                  reportSchedules: [
                    ...schedules,
                    {
                      id: crypto.randomUUID(),
                      name: `${report} — weekly`,
                      detail: `${format} every Monday`,
                      enabled: true,
                    },
                  ],
                })
              }
            >
              + New schedule
            </Button>
          }
        />
        {schedules.length ? (
          <ul className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {schedules.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <span className="min-w-0 flex-1 text-[14px]">{item.name}</span>
                <span className="text-[12px] text-fg-muted">{item.detail}</span>
                <Button
                  variant="secondary"
                  className="!py-2 !text-[13px]"
                  onClick={() =>
                    updateSupportSettings({ reportSchedules: schedules.filter((row) => row.id !== item.id) })
                  }
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 py-8 text-center text-[14px] text-fg-muted">No scheduled reports.</p>
        )}
      </div>
    </div>
  )
}

function TiersSearchPane() {
  const { supportSettings, kbArticles, updateSupportSettings } = useWorkspace()
  const published = kbArticles.filter((item) => item.state === 'published')
  const indexed = supportSettings.indexedArticles.filter((id) => published.some((item) => item.id === id))
  const percent = published.length ? Math.round((indexed.length / published.length) * 100) : 0

  return (
    <div>
      <SectionHead
        title="Customer service tiers"
        blurb={
          <>
            A tier picks which SLA policy applies, so a Platinum customer&apos;s urgent ticket is due sooner than a
            Bronze one. Tiers match a policy by <strong className="font-semibold text-fg">name</strong> — create a
            policy called &ldquo;Platinum&rdquo; and the platinum tier uses it. Set a customer&apos;s tier on their
            contact record.
          </>
        }
      />

      <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[38rem] border-collapse text-[13px]">
          <thead className="border-b border-line text-[12px] text-fg-muted">
            <tr>
              {['Tier', 'Resolves to', 'Status'].map((column) => (
                <th key={column} scope="col" className="px-5 py-3.5 text-left font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {serviceTiers.map((tier) => {
              const policy = supportSettings.tierPolicies[tier]
              return (
                <tr key={tier}>
                  <td className="px-5 py-3.5 font-medium">{tier}</td>
                  <td className="px-5 py-3.5 text-fg-2">{policy || 'Standard SLA'}</td>
                  <td className="px-5 py-3.5">
                    {policy ? (
                      <span className="text-ok">Own policy</span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-warn">
                        <Icon name="alert-triangle" size={13} /> Using the default
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[13px] text-fg-muted">
        A tier sharing the default is not broken — it simply gets the same service as everyone else. Create an SLA
        policy with the tier&apos;s name to give it its own targets.
      </p>

      <div className="mt-8">
        <SectionHead
          title="Knowledge-base search"
          blurb="Keyword search cannot cross a language boundary — a German customer's question shares no words with the English article that answers it. Indexing articles by meaning fixes that. Keyword search keeps running alongside, because part numbers and error codes are exactly what meaning-based search is worst at."
        />

        <div className="mt-5 flex flex-wrap items-center gap-6 rounded-2xl border border-line bg-surface px-6 py-5">
          <div className="min-w-[14rem] flex-1">
            <p className="text-[26px] leading-none font-bold">
              {percent}
              <span className="text-[15px] font-medium text-fg-muted">%</span>
            </p>
            <p className="mt-2 text-[13px] text-fg-muted">
              {indexed.length} of {published.length} published articles searchable by meaning
            </p>
            <div className="mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${percent ? 'bg-accent' : 'bg-bad'}`}
                style={{ width: `${Math.max(percent, 4)}%` }}
              />
            </div>
          </div>
          <Button
            variant="secondary"
            disabled={!published.length}
            onClick={() => updateSupportSettings({ indexedArticles: published.map((item) => item.id) })}
          >
            <Icon name="refresh" size={15} /> Index articles
          </Button>
        </div>
      </div>
    </div>
  )
}

function SupportAgentsPane() {
  const agents = agentsByAppCode.get('SUP') ?? []

  return (
    <div>
      <SectionHead
        title="AI agents"
        blurb="The agents this app ships with. They run under the tenant's guardrails and spend from the shared credit pool."
      />
      <ul className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {agents.map((agent) => (
          <li key={agent.name} className="flex flex-wrap items-start gap-4 px-5 py-3.5">
            <Icon name="bot" size={16} className="mt-0.5 shrink-0 text-accent" />
            <span className="min-w-[14rem] flex-1">
              <span className="block text-[14px] font-medium">{agent.name}</span>
              <span className="mt-0.5 block text-[12px] text-fg-muted">{agent.blurb}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------- shell */

/**
 * The two manual sweeps on the escalation pane. They are what the rules would
 * do on a timer, run once by hand: the detector marks every active ticket past
 * its priority's SLA as breached, and auto-close settles resolved tickets that
 * have sat longer than the CSAT window.
 */
function EscalationActions() {
  const { tickets, updateTicket, supportSettings } = useWorkspace()
  const [result, setResult] = useState('')

  // The sweep compares against one instant, captured when the pane mounts,
  // so every ticket in a run is measured against the same clock.
  const [runAt] = useState(() => Date.now())
  const hoursSince = (iso: string) => (runAt - new Date(iso).getTime()) / 3_600_000
  const slaFor = (priority: string) =>
    defaultPriorities.find((row) => row.label === priority)?.slaHours ?? 24

  const overdue = tickets.filter(
    (ticket) =>
      !ticket.slaBreached &&
      !['Resolved', 'Closed'].includes(ticket.status) &&
      hoursSince(ticket.createdAt) > slaFor(ticket.priority),
  )
  const settled = tickets.filter(
    (ticket) =>
      ticket.status === 'Resolved' &&
      ticket.resolvedAt &&
      hoursSince(ticket.resolvedAt) > supportSettings.csat.skipOlderDays * 24,
  )

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          overdue.forEach((ticket) => updateTicket(ticket.id, { slaBreached: true }))
          setResult(
            overdue.length
              ? `Detector flagged ${overdue.length} ticket${overdue.length === 1 ? '' : 's'} past SLA.`
              : 'Detector found nothing past SLA.',
          )
        }}
      >
        <Icon name="alert-triangle" size={15} /> Run detector
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          settled.forEach((ticket) => updateTicket(ticket.id, { status: 'Closed' }))
          setResult(
            settled.length
              ? `Auto-close closed ${settled.length} resolved ticket${settled.length === 1 ? '' : 's'}.`
              : 'Auto-close found no resolved tickets old enough.',
          )
        }}
      >
        <Icon name="clock" size={15} /> Run auto-close
      </Button>
      {result && <span className="text-[13px] text-fg-muted">{result}</span>}
    </>
  )
}

export function SupportSettingsPane() {
  const [tab, setTab] = useState<string>('ticket_fields')

  const panes: Record<string, React.ReactElement> = {
    ticket_fields: <TicketFieldsPane />,
    web_widget: <WebWidgetPane />,
    csat_survey: <CsatSurveyPane />,
    escalation_rules: (
      <RuleListPane
        settingsKey="escalationRules"
        blurb="Rules fire when a ticket crosses an SLA boundary (before / on / after breach)."
        empty="No escalation rules yet."
        addLabel="Add rule"
        extraActions={<EscalationActions />}
      />
    ),
    inbox_accounts: (
      <RuleListPane
        settingsKey="inboxAccounts"
        notice="Managed inbound email isn't configured on this instance. Add an IMAP inbox below to receive support email."
        blurb="Or bring your own: IMAP inboxes polled every 3 minutes - new emails create tickets, replies append to the matching thread."
        empty="No inbox accounts configured."
        addLabel="Add inbox"
      />
    ),
    inbound_channels: (
      <RuleListPane
        settingsKey="inboundChannels"
        blurb="SMS / WhatsApp / chat inbound. Each channel exposes a webhook that the connector POSTs to with the customer message."
        empty="No inbound channels configured."
        addLabel="Add channel"
      />
    ),
    parse_failures: <ParseFailuresPane />,
    business_hours: (
      <RuleListPane
        settingsKey="businessHours"
        title="Business-hour schedules"
        blurb="Shared working calendars that SLA policies and auto-responses point at. Add a public holiday here once instead of to every policy separately."
        empty="No schedules yet. SLA policies fall back to 24/7 calendar time."
        addLabel="New schedule"
      />
    ),
    auto_responses: (
      <RuleListPane
        settingsKey="autoResponses"
        title="Auto-responses"
        blurb="Acknowledge a ticket the moment it arrives. Rules are checked in priority order and the first match wins — one acknowledgement per ticket, never two. Replies to no-reply addresses, bounces and other autoresponders are skipped automatically so a mail loop can't start."
        empty="No auto-responses yet. Customers currently hear nothing until an agent replies."
        addLabel="New rule"
      />
    ),
    shift_handoffs: (
      <RuleListPane
        settingsKey="shiftHandoffs"
        title="Shift handoffs"
        blurb="Move a team's live tickets to the next shift at a set time. Resolved tickets stay put, and the assignee is cleared so the incoming team's own assignment strategy picks someone actually on shift."
        empty="No handoff rules. Tickets stay with whichever team they were routed to."
        addLabel="New rule"
      />
    ),
    csat_review: <CsatReviewPane />,
    report_exports: <ReportExportsPane />,
    tiers_search: <TiersSearchPane />,
    ai_agents: <SupportAgentsPane />,
  }

  return (
    <div>
      <h2 className="text-[22px] font-bold tracking-tight">Support settings</h2>
      <p className="mt-1.5 max-w-5xl text-[14px] text-fg-muted">
        Ticket fields, the web widget, SLA escalations and pre-breach warnings, email inbox sync, SMS / WhatsApp / chat
        intake, working-hour calendars, auto-responses, shift handoffs and report exports.
      </p>

      <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-1 border-b border-line">
        {supportSettingsTabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-[14px] transition ${
              tab === item.id ? 'border-accent font-medium text-accent' : 'border-transparent text-fg-2 hover:text-fg'
            }`}
          >
            <Icon name={item.icon} size={15} />
            {item.label}
          </button>
        ))}
      </nav>

      <div key={tab} className="app-enter mt-6">
        {panes[tab]}
      </div>
    </div>
  )
}
