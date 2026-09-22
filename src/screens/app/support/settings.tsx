'use client'

import { useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { agentsByAppCode } from '../../../lib/agentCatalog'
import {
  serviceTiers,
  statusDot,
  supportSettingsTabs,
  ticketFieldTabs,
  widgetPositions,
} from '../../../lib/supportData'
import { Dialog, Label, inputClass } from '../../../components/EnterpriseUi'
import type { ApiClientError } from '../../../lib/api'
import { NotAvailable, WriteError, fetchNotice } from './panes'
import {
  behaviourLabels,
  csatDefaults,
  formatMinutes,
  useCalendars,
  useCsat,
  useEscalationRules,
  useMembers,
  useSlaPolicies,
  useSupportSettings,
  useSupportVocabulary,
  widgetDefaults,
  type CsatSettings,
  type FieldName,
  type FieldOption,
  type WidgetSettings,
} from './useSupport'

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

/** The save button every settings pane shares, including what went wrong. */
function SaveBar({
  label,
  settings,
  summary,
}: {
  label: string
  settings: {
    dirty: boolean
    ready: boolean
    saving: boolean
    saveError: ApiClientError | null
    save: (summary: string) => Promise<unknown>
    refetch: () => void
  }
  summary: string
}) {
  return (
    <>
      <div className="mt-6 flex justify-end">
        <Button
          variant="accent"
          disabled={!settings.dirty || !settings.ready || settings.saving}
          onClick={() => void settings.save(summary)}
        >
          {settings.saving ? 'Saving…' : label}
        </Button>
      </div>
      {/* A 409 here means another administrator saved this pane while it was
          open. Overwriting them silently is what the version check exists to
          prevent, so the only honest next step is to reload and re-apply. */}
      <WriteError error={settings.saveError} onReload={settings.refetch} />
    </>
  )
}

/* ------------------------------------------------------------------ fields */

const fieldOf: Record<(typeof ticketFieldTabs)[number], FieldName> = {
  Statuses: 'status',
  Categories: 'category',
  Priorities: 'priority',
  Types: 'type',
  Channels: 'channel',
}

const fieldCopy: Record<string, { blurb: string; add: string }> = {
  Statuses: {
    blurb:
      "The workflow a ticket moves through. A status's behaviour is what the SLA engine reads: a waiting bucket pauses the clock, and an end state stops it.",
    add: 'Add status',
  },
  Categories: {
    blurb: 'How tickets are classified. Drives reporting and the knowledge-base tagging.',
    add: 'Add category',
  },
  Priorities: {
    blurb:
      'Urgency levels. Each carries its own first-response and resolution targets, which are what a ticket starts its clocks from when no SLA policy matches.',
    add: 'Add priority',
  },
  Types: { blurb: 'Question, problem, incident — however your team frames work.', add: 'Add type' },
  Channels: { blurb: 'Where tickets come from.', add: 'Add channel' },
}

type FieldDraft = {
  label: string
  slug: string
  behaviour: string
  firstResponseMinutes: string
  resolutionMinutes: string
}

const emptyDraft: FieldDraft = { label: '', slug: '', behaviour: 'active', firstResponseMinutes: '', resolutionMinutes: '' }

function TicketFieldsPane() {
  const vocabulary = useSupportVocabulary()
  const [tab, setTab] = useState<(typeof ticketFieldTabs)[number]>('Statuses')
  const [editing, setEditing] = useState<FieldOption | null>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<FieldDraft>(emptyDraft)

  const field = fieldOf[tab]
  const rows = vocabulary.of(field)
  const copy = fieldCopy[tab]
  const notice = fetchNotice(vocabulary, 'ticket fields')

  const startCreate = () => {
    vocabulary.resetWriteError()
    setEditing(null)
    setDraft({ ...emptyDraft, behaviour: 'active' })
    setOpen(true)
  }

  const startEdit = (row: FieldOption) => {
    vocabulary.resetWriteError()
    setEditing(row)
    setDraft({
      label: row.label,
      slug: row.slug,
      behaviour: row.behaviour ?? 'active',
      firstResponseMinutes: row.firstResponseMinutes === null ? '' : String(row.firstResponseMinutes),
      resolutionMinutes: row.resolutionMinutes === null ? '' : String(row.resolutionMinutes),
    })
    setOpen(true)
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
            <Button variant="accent" onClick={startCreate}>
              + {copy.add}
            </Button>
          }
        />
      </div>

      {/* An archive refused because tickets still hold the value arrives here
          as a 409. It used to be an unconditional delete against a browser
          array, so the refusal had nowhere to appear. */}
      <WriteError error={vocabulary.writeError} onReload={vocabulary.refetch} />

      <div className="mt-5">
        {notice ?? (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
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
                    <>
                      <th scope="col" className="px-5 py-3.5 text-right font-medium">
                        First response
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-right font-medium">
                        Resolution
                      </th>
                    </>
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
                        {row.colour && (
                          <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${statusDot[row.colour] ?? ''}`} />
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
                            {behaviourLabels[row.behaviour ?? 'active'] ?? row.behaviour}
                          </span>
                        )}
                      </td>
                    )}
                    {tab === 'Priorities' && (
                      <>
                        <td className="px-5 py-4 text-right">{formatMinutes(row.firstResponseMinutes)}</td>
                        <td className="px-5 py-4 text-right">{formatMinutes(row.resolutionMinutes)}</td>
                      </>
                    )}
                    <td className="px-5 py-4">
                      <span className="flex items-center justify-end gap-4">
                        <button
                          onClick={() => startEdit(row)}
                          aria-label={`Edit ${row.label}`}
                          className="text-fg-muted transition hover:text-accent"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => void vocabulary.archiveOption(row.id)}
                          disabled={vocabulary.writing}
                          aria-label={`Delete ${row.label}`}
                          className="text-fg-muted transition hover:text-bad disabled:opacity-50"
                        >
                          🗑
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-fg-muted">
                      Nothing configured for this field yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
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
              {vocabulary.fieldErrors.label && <span className="text-[12px] text-bad">{vocabulary.fieldErrors.label}</span>}
            </label>
            <label>
              <Label>Slug</Label>
              <input
                value={draft.slug}
                readOnly={Boolean(editing)}
                onChange={(event) => setDraft((prev) => ({ ...prev, slug: event.target.value }))}
                className={`${inputClass} font-mono text-[13px] ${editing ? 'opacity-60' : ''}`}
              />
              {editing ? (
                <Hint>
                  The slug is what every existing ticket stores. Changing it would leave those tickets holding a value
                  nothing can render, so rename the label instead.
                </Hint>
              ) : (
                <Hint>Stored on the ticket itself. The label above is what people read.</Hint>
              )}
              {vocabulary.fieldErrors.slug && <span className="text-[12px] text-bad">{vocabulary.fieldErrors.slug}</span>}
            </label>
            {tab === 'Statuses' && (
              <label>
                <Label>Behaviour</Label>
                <select
                  value={draft.behaviour}
                  onChange={(event) => setDraft((prev) => ({ ...prev, behaviour: event.target.value }))}
                  className={inputClass}
                >
                  {Object.entries(behaviourLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <Hint>
                  This is read by the SLA engine, not just displayed: a waiting bucket pauses the resolution clock, and
                  an end state stops it and stamps the ticket as resolved.
                </Hint>
              </label>
            )}
            {tab === 'Priorities' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <Label>First response (minutes)</Label>
                  <input
                    type="number"
                    min={1}
                    value={draft.firstResponseMinutes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, firstResponseMinutes: event.target.value }))}
                    className={inputClass}
                  />
                </label>
                <label>
                  <Label>Resolution (minutes)</Label>
                  <input
                    type="number"
                    min={1}
                    value={draft.resolutionMinutes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, resolutionMinutes: event.target.value }))}
                    className={inputClass}
                  />
                </label>
                {/* Two targets, not one "SLA hours" figure: answering quickly
                    and finishing quickly are the two things an SLA promises,
                    and collapsing them loses the whole point of the engine. */}
                {/* Clearing a target is not something the endpoint offers:
                    PATCH /support/field-options/{id} takes a minimum of 1 and
                    has no null, so an omitted field leaves the stored value
                    alone. Saying "leave it blank and no clock is started"
                    while editing would describe a save that does not happen. */}
                <p className="text-[12px] leading-relaxed text-fg-muted sm:col-span-2">
                  Measured in working time.{' '}
                  {editing
                    ? 'A field left blank keeps the target already stored — this form cannot clear one.'
                    : 'Leave one blank and no clock of that kind is started.'}
                </p>
              </div>
            )}
          </div>

          <WriteError error={vocabulary.writeError} />

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.label.trim() || !draft.slug.trim() || vocabulary.writing}
              onClick={async () => {
                const numbers = {
                  firstResponseMinutes: draft.firstResponseMinutes ? Number(draft.firstResponseMinutes) : undefined,
                  resolutionMinutes: draft.resolutionMinutes ? Number(draft.resolutionMinutes) : undefined,
                }
                const saved = editing
                  ? await vocabulary.updateOption(editing.id, {
                      label: draft.label.trim(),
                      behaviour: field === 'status' ? draft.behaviour : undefined,
                      ...(field === 'priority' ? numbers : {}),
                    })
                  : await vocabulary.createOption({
                      field,
                      slug: draft.slug.trim(),
                      label: draft.label.trim(),
                      behaviour: field === 'status' ? draft.behaviour : undefined,
                      ...(field === 'priority' ? numbers : {}),
                    })
                if (!saved) return
                setOpen(false)
              }}
            >
              {vocabulary.writing ? 'Saving…' : editing ? 'Save' : 'Create'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ widget */

function WebWidgetPane() {
  const settings = useSupportSettings<WidgetSettings>('widget', widgetDefaults)
  const draft = settings.draft
  const set = <K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) =>
    settings.setDraft((prev) => ({ ...prev, [key]: value }))

  const notice = fetchNotice(settings, 'the widget settings')
  if (notice) return notice

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
          Saved with the rest of this configuration. Nothing serves the widget on this deployment yet, so the switch
          records your intent rather than putting a launcher on a site.
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

        <SaveBar label="Save widget settings" settings={settings} summary="Updated the web widget" />
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

        {/* There is no public widget script and no /public namespace on this
            deployment, so the install snippet that used to sit here pointed at
            a URL that answers nothing. */}
        <section className="rounded-2xl border border-dashed border-line bg-surface-2/40 p-4">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Install</p>
          <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">
            There is no embeddable script to install yet — this deployment serves no public widget endpoint. The
            configuration above is stored and will apply once one exists.
          </p>
        </section>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- csat */

function CsatSurveyPane() {
  const settings = useSupportSettings<CsatSettings>('csat', csatDefaults)
  const csat = useCsat()
  const draft = settings.draft
  const set = <K extends keyof CsatSettings>(key: K, value: CsatSettings[K]) =>
    settings.setDraft((prev) => ({ ...prev, [key]: value }))
  const [result, setResult] = useState<string | null>(null)

  const notice = fetchNotice(settings, 'the CSAT settings')
  if (notice) return notice

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
      <div>
        <SectionHead
          title="Customer satisfaction"
          blurb="Ask the customer one question when their ticket is resolved. Resolving a ticket records that a survey is owed and queues it for delivery."
        />

        {/* A survey is recorded against the ticket and put on the outbox. What
            does not exist on this deployment is anything that takes it off
            again: no transport is registered for the `support.csat` topic,
            nothing runs the dispatcher, and no endpoint accepts an answer. So
            the settings below are stored and honoured by the queueing and
            auto-close windows, but no customer is asked and no rating can
            arrive yet. Describing the email and the one-click page — both of
            which the pane used to show — would be describing a path that is
            not there. */}
        <p className="mt-4 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[13px] leading-relaxed text-fg-2">
          Nothing delivers these surveys on this deployment: no mail transport is connected, nothing runs the outbox,
          and there is no page for a customer to answer on. Queued surveys sit as unanswered, so the CSAT report and
          the review queue stay empty until a delivery path exists. Everything below is stored and does decide which
          tickets are queued and when auto-close settles them.
        </p>

        <label className="mt-5 flex items-center gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={draft.sendOnResolve}
            onChange={(e) => set('sendOnResolve', e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Queue a survey on Resolve
        </label>
        <Hint>
          Off means no survey is queued at all, and the sweep below refuses to run. Ratings already collected are kept
          and still appear in the CSAT report.
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
            <Hint>Avoids waking up an inbox long after the ticket was closed. Auto-close uses the same window.</Hint>
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
            {/* Nothing reads this. Escalation rules fire on a fixed offset in
                minutes from the target, which is a different mechanism, and no
                other code path looks the value up. */}
            <Hint>
              Stored, but nothing acts on it yet: escalation rules fire at a fixed offset in minutes from the target,
              not at a percentage of it.
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
        {/* Stored in the same document as the rest, but nothing on the server
            reads `portalUrl` — there is no survey page to put a link under. */}
        <Hint>
          Optional, and not used yet: nothing reads it, because there is no survey page for it to link out of.
        </Hint>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <span className="mr-auto text-[13px] text-fg-muted">
            {/* Counted on the server under the saved windows above, so the
                number matches what the button would actually queue. */}
            {csat.loading
              ? 'Counting resolved tickets without a rating…'
              : csat.error
                ? 'The pending count could not be read.'
                : `${csat.pending} resolved ticket${csat.pending === 1 ? '' : 's'} without a rating.`}
          </span>
          <Button
            variant="secondary"
            disabled={csat.writing || csat.loading}
            onClick={async () => {
              const outcome = await csat.sendPending()
              if (!outcome) return
              setResult(
                outcome.queued
                  ? `${outcome.queued} survey${outcome.queued === 1 ? '' : 's'} queued.`
                  : 'No resolved tickets were waiting on a survey.',
              )
            }}
          >
            Queue pending surveys
          </Button>
          <Button
            variant="accent"
            disabled={!settings.dirty || !settings.ready || settings.saving}
            onClick={() => void settings.save('Updated the CSAT survey')}
          >
            {settings.saving ? 'Saving…' : 'Save CSAT settings'}
          </Button>
        </div>
        <WriteError error={settings.saveError} onReload={settings.refetch} />
        <WriteError error={csat.writeError} />
        {result && <p className="mt-3 text-right text-[13px] text-fg-muted">{result}</p>}
      </div>

      {/* This used to render the survey a customer would see — a question and
          two thumb buttons — beside a claim that it arrived by email. There is
          no such page: nothing serves a survey and nothing accepts an answer,
          so the score column is written by no code path at all. A mock of a
          screen that does not exist is the most convincing kind of fiction,
          so it is replaced by what the queue actually holds. */}
      <section className="h-fit rounded-2xl border border-dashed border-line bg-surface-2/40 p-5">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">What a queued survey is</p>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-2">
          One row against the ticket, holding a hashed single-use token and the time it was queued. A unique index
          allows exactly one per ticket, so resolve → reopen → resolve queues one survey and not three.
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">
          There is no page that redeems that token and no mail transport that would carry it, so the rating and comment
          stay empty. The token has no expiry column and nothing sets one.
        </p>
      </section>
    </div>
  )
}

/* -------------------------------------------------------- escalation rules */

const targetLabel: Record<string, string> = { first_response: 'first response', resolution: 'resolution' }

function EscalationRulesPane() {
  const rules = useEscalationRules()
  const vocabulary = useSupportVocabulary()
  const { members } = useMembers()
  const [open, setOpen] = useState(false)
  const [sweep, setSweep] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    name: '',
    triggerTarget: 'first_response',
    offsetMinutes: '0',
    actionKind: 'notify',
    userId: '',
    priority: '',
  })

  const notice = fetchNotice(rules, 'escalation rules')

  const describe = (rule: (typeof rules.rules)[number]) => {
    // Fallbacks throughout: a rule row written before this pane existed can
    // carry a target this map has no name for, and an action keyed `type`
    // rather than `kind`. Reading through either without a guard threw and
    // took the whole list of rules down with it.
    const target = targetLabel[rule.triggerTarget] ?? rule.triggerTarget
    const when =
      rule.offsetMinutes === 0
        ? `when the ${target} target is due`
        : rule.offsetMinutes < 0
          ? `${formatMinutes(-rule.offsetMinutes)} before the ${target} target`
          : `${formatMinutes(rule.offsetMinutes)} after the ${target} target`
    const does =
      rule.actions
        .map((action) => String(action.kind ?? action.type ?? 'unrecognised action').replace(/_/g, ' '))
        .join(', ') || 'nothing'
    return `${when} — ${does}`
  }

  return (
    <div>
      <SectionHead
        title="Escalation rules"
        blurb="Rules fire when an SLA clock crosses its boundary. Each one fires once per ticket per action however often the sweep runs, so running it twice cannot double-escalate."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={rules.sweeping}
              onClick={async () => {
                const outcome = await rules.runSweep()
                if (!outcome) return
                setSweep(
                  `Sweep marked ${outcome.breached} clock${outcome.breached === 1 ? '' : 's'} breached and fired ${outcome.fired} action${outcome.fired === 1 ? '' : 's'}.`,
                )
              }}
            >
              <Icon name="alert-triangle" size={15} /> Run sweep
            </Button>
            <Button
              variant="secondary"
              disabled={rules.sweeping}
              onClick={async () => {
                const outcome = await rules.runAutoClose()
                if (!outcome) return
                setSweep(
                  outcome.closed
                    ? `Auto-close moved ${outcome.closed} resolved ticket${outcome.closed === 1 ? '' : 's'} to "${outcome.status}".`
                    : 'Auto-close found no resolved tickets old enough.',
                )
              }}
            >
              <Icon name="clock" size={15} /> Run auto-close
            </Button>
            <Button variant="accent" onClick={() => setOpen(true)}>
              + Add rule
            </Button>
          </div>
        }
      />

      <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
        There is no scheduler on this deployment, so both sweeps are run by hand from here. Nothing runs them overnight.
      </p>
      {sweep && <p className="mt-2 text-[13px] text-fg-2">{sweep}</p>}
      <WriteError error={rules.sweepError} />
      <WriteError error={rules.writeError} onReload={rules.refetch} />

      <div className="mt-6">
        {notice ??
          (rules.rules.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {rules.rules.map((rule) => (
                <li key={rule.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <span className="min-w-[12rem] flex-1">
                    <span className="block text-[14px] font-medium">{rule.name}</span>
                    <span className="mt-0.5 block text-[12px] text-fg-muted">{describe(rule)}</span>
                  </span>
                  <span className="text-[12px] text-fg-muted">{rule.active ? 'Active' : 'Off'}</span>
                  {/* Deactivated, not deleted: the escalation events this rule
                      already fired still point at it, and a deletion would
                      orphan that history. */}
                  <Button
                    variant="secondary"
                    className="!py-2 !text-[13px]"
                    disabled={rules.writing}
                    onClick={() => void rules.setRuleActive(rule.id, !rule.active)}
                  >
                    {rule.active ? 'Turn off' : 'Turn on'}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-[14px] text-fg-muted">No escalation rules yet.</p>
          ))}
      </div>

      {open && (
        <Dialog title="Add rule" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Name</Label>
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Urgent first response overdue"
                className={inputClass}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <Label>Clock</Label>
                <select
                  value={draft.triggerTarget}
                  onChange={(event) => setDraft((prev) => ({ ...prev, triggerTarget: event.target.value }))}
                  className={inputClass}
                >
                  <option value="first_response">First response</option>
                  <option value="resolution">Resolution</option>
                </select>
              </label>
              <label>
                <Label>Offset (minutes)</Label>
                <input
                  type="number"
                  value={draft.offsetMinutes}
                  onChange={(event) => setDraft((prev) => ({ ...prev, offsetMinutes: event.target.value }))}
                  className={inputClass}
                />
                <Hint>Negative fires before the target is due; zero fires on it.</Hint>
              </label>
            </div>
            <label>
              <Label>Action</Label>
              <select
                value={draft.actionKind}
                onChange={(event) => setDraft((prev) => ({ ...prev, actionKind: event.target.value }))}
                className={inputClass}
              >
                <option value="notify">Notify (queued only)</option>
                <option value="reassign">Reassign</option>
                <option value="raise_priority">Raise priority</option>
              </select>
              {/* Only these three exist in the sweep; anything else is refused
                  rather than stored and never performed. Reassign and raise
                  priority write the ticket. Notify puts a message on the
                  outbox — and no transport is registered for that topic and
                  nothing runs the dispatcher, so it reaches nobody today. */}
              <Hint>
                Reassign and Raise priority change the ticket itself. Notify only puts a message on the outbox: no
                transport is connected on this deployment, so nothing delivers it yet.
              </Hint>
            </label>
            {draft.actionKind === 'reassign' && (
              <label>
                <Label>Reassign to</Label>
                <select
                  value={draft.userId}
                  onChange={(event) => setDraft((prev) => ({ ...prev, userId: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">Choose someone</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.fullName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft.actionKind === 'raise_priority' && (
              <label>
                <Label>Raise to</Label>
                <select
                  value={draft.priority}
                  onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">Choose a priority</option>
                  {vocabulary.priorities.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <WriteError error={rules.writeError} />

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={
                !draft.name.trim() ||
                rules.writing ||
                (draft.actionKind === 'reassign' && !draft.userId) ||
                (draft.actionKind === 'raise_priority' && !draft.priority)
              }
              onClick={async () => {
                const action: Record<string, unknown> & { kind: string } = { kind: draft.actionKind }
                if (draft.actionKind === 'reassign') action.userId = draft.userId
                if (draft.actionKind === 'raise_priority') action.priority = draft.priority
                const created = await rules.createRule({
                  name: draft.name.trim(),
                  triggerTarget: draft.triggerTarget,
                  offsetMinutes: Number(draft.offsetMinutes) || 0,
                  actions: [action],
                })
                if (!created) return
                setDraft({ ...draft, name: '' })
                setOpen(false)
              }}
            >
              {rules.writing ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ---------------------------------------------------------- business hours */

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const minutesToTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

function BusinessHoursPane() {
  const calendars = useCalendars()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({
    name: '',
    timezone: 'Europe/London',
    isDefault: false,
    opens: '09:00',
    closes: '17:00',
    weekdays: [1, 2, 3, 4, 5],
  })

  const notice = fetchNotice(calendars, 'working calendars')

  /*
   * One segment per distinct open/close window.
   *
   * This used to list every working day and then print the FIRST row's hours
   * beside them, so a calendar that opened at 10:00 on a Wednesday was
   * summarised as 09:00–17:00 all week — a working-time figure somebody would
   * reasonably check an SLA target against.
   */
  const summarise = (hours: { weekday: number; opensMinute: number; closesMinute: number }[]) => {
    if (!hours.length) return 'No working hours — nothing counts as working time'
    const windows = new Map<string, number[]>()
    for (const hour of [...hours].sort((a, b) => a.weekday - b.weekday)) {
      const key = `${hour.opensMinute}:${hour.closesMinute}`
      windows.set(key, [...(windows.get(key) ?? []), hour.weekday])
    }
    return [...windows.entries()]
      .map(([key, days]) => {
        const [opens, closes] = key.split(':').map(Number)
        const names = [...new Set(days)].map((day) => weekdayNames[day].slice(0, 3)).join(', ')
        return `${names} ${minutesToTime(opens)}–${minutesToTime(closes)}`
      })
      .join(' · ')
  }

  return (
    <div>
      <SectionHead
        title="Business-hour schedules"
        blurb="Working calendars that SLA policies measure against, so a four-hour target started at 17:00 on a Friday is not missed at 21:00. A policy with no calendar falls back to the default one; with no default, to round-the-clock time."
        action={
          <Button variant="accent" onClick={() => setOpen(true)}>
            + New schedule
          </Button>
        }
      />

      <WriteError error={calendars.writeError} onReload={calendars.refetch} />

      <div className="mt-6">
        {notice ??
          (calendars.calendars.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {calendars.calendars.map((calendar) => (
                <li key={calendar.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <span className="min-w-[12rem] flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                      {calendar.name}
                      {calendar.isDefault && (
                        <span className="rounded-lg bg-accent-muted px-2 py-0.5 text-[11px] font-medium text-accent">
                          Default
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-fg-muted">
                      {calendar.timezone} · {summarise(calendar.hours)}
                      {calendar.holidays.length ? ` · ${calendar.holidays.length} holiday(s)` : ''}
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    className="!py-2 !text-[13px]"
                    disabled={calendars.writing}
                    onClick={() => void calendars.deleteCalendar(calendar.id)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-[14px] text-fg-muted">
              No schedules yet. SLA targets are measured against calendar time.
            </p>
          ))}
      </div>

      {open && (
        <Dialog title="New schedule" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Name</Label>
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="UK office hours"
                className={inputClass}
              />
            </label>
            <label>
              <Label>Timezone</Label>
              <input
                value={draft.timezone}
                onChange={(event) => setDraft((prev) => ({ ...prev, timezone: event.target.value }))}
                placeholder="Europe/London"
                className={`${inputClass} font-mono text-[13px]`}
              />
              {/* Checked against the platform's own zone table. An unrecognised
                  zone would silently fall back to UTC and make every target
                  computed here wrong by hours with nothing looking broken. */}
              <Hint>An IANA name. Anything else is refused rather than quietly treated as UTC.</Hint>
              {calendars.fieldErrors.timezone && (
                <span className="text-[12px] text-bad">{calendars.fieldErrors.timezone}</span>
              )}
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <Label>Opens</Label>
                <input
                  type="time"
                  value={draft.opens}
                  onChange={(event) => setDraft((prev) => ({ ...prev, opens: event.target.value }))}
                  className={inputClass}
                />
              </label>
              <label>
                <Label>Closes</Label>
                <input
                  type="time"
                  value={draft.closes}
                  onChange={(event) => setDraft((prev) => ({ ...prev, closes: event.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>
            <fieldset>
              <Label>Working days</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {weekdayNames.map((name, day) => (
                  <label key={name} className="flex items-center gap-1.5 text-[13px] text-fg-2">
                    <input
                      type="checkbox"
                      checked={draft.weekdays.includes(day)}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          weekdays: event.target.checked
                            ? [...prev.weekdays, day]
                            : prev.weekdays.filter((item) => item !== day),
                        }))
                      }
                      className="h-4 w-4 accent-accent"
                    />
                    {name.slice(0, 3)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-3 text-[14px]">
              <input
                type="checkbox"
                checked={draft.isDefault}
                onChange={(event) => setDraft((prev) => ({ ...prev, isDefault: event.target.checked }))}
                className="h-4 w-4 accent-accent"
              />
              Make this the default calendar
            </label>
          </div>

          <WriteError error={calendars.writeError} />

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={
                !draft.name.trim() ||
                !draft.weekdays.length ||
                timeToMinutes(draft.closes) <= timeToMinutes(draft.opens) ||
                calendars.writing
              }
              onClick={async () => {
                const created = await calendars.createCalendar({
                  name: draft.name.trim(),
                  timezone: draft.timezone.trim(),
                  isDefault: draft.isDefault,
                  hours: [...draft.weekdays].sort().map((weekday) => ({
                    weekday,
                    opensMinute: timeToMinutes(draft.opens),
                    closesMinute: timeToMinutes(draft.closes),
                  })),
                })
                if (!created) return
                setDraft({ ...draft, name: '' })
                setOpen(false)
              }}
            >
              {calendars.writing ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- csat review */

function CsatReviewPane() {
  const settings = useSupportSettings<CsatSettings>('csat', csatDefaults)
  const [showReviewed, setShowReviewed] = useState(false)
  /*
   * The threshold is the tenant's, not this file's. `settings.draft` falls
   * back to the shipped defaults until the document arrives, so reading it
   * unconditionally meant a slow or failed settings request rendered the queue
   * for "3 or below" under a heading claiming that was the configured value —
   * and it may not be. Until `ready`, there is no threshold to query by.
   */
  const lowScore = settings.ready ? settings.draft.lowScore : null
  const csat = useCsat({
    maxScore: lowScore ?? undefined,
    reviewed: showReviewed ? undefined : false,
    answeredOnly: true,
    enabled: lowScore !== null,
  })
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [note, setNote] = useState('')

  // The threshold has to load before the queue means anything, so its own
  // failure is reported rather than silently substituted.
  const notice = fetchNotice(settings, 'the review threshold') ?? fetchNotice(csat, 'the review queue')

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h3 className="text-[16px] font-semibold">Low-score review queue</h3>
          {/* The net-promoter sentence that used to be here described a score
              the product has no question, column or endpoint for. */}
          <p className="mt-1.5 text-[13px] text-fg-muted">
            {lowScore === null
              ? 'Reading the threshold from the CSAT settings…'
              : `Ratings at or below ${lowScore}. Each stays here until someone records what was done about it.`}
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

      <WriteError error={csat.writeError} onReload={csat.refetch} />

      <div className="mt-6">
        {notice ??
          (csat.rows.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {csat.rows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <span className="w-20 shrink-0 font-mono text-[12px] text-fg-muted">{row.reference}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px]">{row.subject}</span>
                    {row.comment && <span className="mt-0.5 block text-[12px] text-fg-muted">“{row.comment}”</span>}
                    {row.reviewNote && (
                      <span className="mt-0.5 block text-[12px] text-ok">Reviewed: {row.reviewNote}</span>
                    )}
                  </span>
                  <span className="tone-rose rounded-lg px-2.5 py-1 text-[11px] font-medium">CSAT {row.score}</span>
                  {!row.reviewedAt && (
                    <Button
                      variant="secondary"
                      className="!py-2 !text-[13px]"
                      onClick={() => {
                        setReviewing(row.id)
                        setNote('')
                      }}
                    >
                      Record follow-up
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-[14px] text-fg-muted">
              {/* Only said once the request has actually succeeded — an empty
                  list after a failed fetch is handled by the notice above.
                  This used to read "Every low score has been followed up",
                  which claims low scores exist and were handled. With the
                  reviewed=false filter on, an empty result cannot tell that
                  apart from no low score ever having been recorded — and with
                  no survey delivery path, the second is the likelier one. So
                  it states only what the empty result actually establishes. */}
              {showReviewed
                ? 'No ratings at or below this threshold.'
                : 'Nothing is waiting for review. Tick “Show reviewed” to see ones already followed up.'}
            </p>
          ))}
      </div>

      {reviewing && (
        <Dialog title="Record follow-up" onClose={() => setReviewing(null)}>
          <label className="mt-5 block">
            <Label>What was done?</Label>
            <textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} className={inputClass} />
          </label>
          <WriteError error={csat.writeError} />
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setReviewing(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={csat.writing}
              onClick={async () => {
                await csat.review(reviewing, note)
                setReviewing(null)
              }}
            >
              {csat.writing ? 'Saving…' : 'Mark reviewed'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- report export */

function ReportExportsPane() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const query = new URLSearchParams()
  if (from) query.set('from', from)
  if (to) query.set('to', to)
  const href = `/api/v1/support/exports/tickets${query.toString() ? `?${query}` : ''}`

  return (
    <div>
      {/* The old bar offered five reports and two formats and produced the
          same ticket CSV whatever was chosen — "SLA compliance in Excel" came
          out as ticket rows in a .csv. Only this one export exists. */}
      <SectionHead
        title="Export tickets"
        blurb="Downloads every ticket opened inside the dates below, as CSV. Values a spreadsheet would treat as a formula are neutralised, so a subject line starting with = opens as text."
      />

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
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
        <a
          href={href}
          className="shine btn-accent inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
        >
          <Icon name="download" size={15} /> Download
        </a>
      </div>

      <div className="mt-8">
        <SectionHead title="Scheduled emails" />
        <div className="mt-5">
          <NotAvailable
            title="Scheduled report emails are not available"
            blurb="Nothing runs on a timer on this deployment and there is no outbound mail path, so a schedule saved here would never send anything. Use the Download button above."
          />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ tiers/search */

function TiersSearchPane() {
  const policies = useSlaPolicies()
  const notice = fetchNotice(policies, 'SLA policies')

  return (
    <div>
      <SectionHead
        title="Customer service tiers"
        blurb={
          <>
            A tier would pick which SLA policy applies, matching a policy by <strong className="font-semibold text-fg">name</strong>
            . The table below says which of those policies exist today.
          </>
        }
      />

      {/* No record anywhere carries a tier — not a party, not a customer, not
          a ticket — so nothing can resolve a ticket to a tier yet. Saying that
          plainly beats a table of four rows that always read "the default". */}
      <p className="mt-3 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[13px] leading-relaxed text-fg-2">
        Nothing assigns a tier to a customer on this deployment: there is no tier field on a contact or a company
        record, and no SLA policy is selected by tier. Policies are chosen by priority instead, under SLA → Policies.
      </p>

      <div className="mt-5">
        {notice ?? (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[38rem] border-collapse text-[13px]">
              <thead className="border-b border-line text-[12px] text-fg-muted">
                <tr>
                  {['Tier', 'Policy of that name', 'Status'].map((column) => (
                    <th key={column} scope="col" className="px-5 py-3.5 text-left font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {serviceTiers.map((tier) => {
                  const policy = policies.policies.find((item) => item.name.toLowerCase() === tier.toLowerCase())
                  return (
                    <tr key={tier}>
                      <td className="px-5 py-3.5 font-medium">{tier}</td>
                      <td className="px-5 py-3.5 text-fg-2">{policy ? policy.name : 'None'}</td>
                      <td className="px-5 py-3.5">
                        {policy ? (
                          <span className={policy.active ? 'text-ok' : 'text-fg-muted'}>
                            {policy.active ? 'Exists and is active' : 'Exists but is switched off'}
                          </span>
                        ) : (
                          <span className="text-fg-muted">No policy with this name</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8">
        <SectionHead title="Knowledge-base search" />
        <div className="mt-5">
          {/* The progress bar that used to sit here was driven by a list of ids
              the Index button filled in from the articles themselves, so it
              always reached 100% and measured nothing. */}
          <NotAvailable
            title="Meaning-based search is not available"
            blurb="Knowledge-base search matches words in the title and body, in SQL. There is no embedding column, vector index or model behind it, so a question asked in one language will not find an article written in another."
          />
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- agents */

function SupportAgentsPane() {
  const agents = agentsByAppCode.get('SUP') ?? []

  return (
    <div>
      {/* No agent runtime exists, nothing schedules one, and nothing draws on
          the credit ledger — so this is a catalogue and says so. */}
      <SectionHead
        title="AI agents"
        blurb="The agents this app is designed to ship with. None of them runs on this deployment: there is no agent runtime here and nothing draws on the credit pool."
      />
      <ul className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {agents.map((agent) => (
          <li key={agent.name} className="flex flex-wrap items-start gap-4 px-5 py-3.5">
            <Icon name="bot" size={16} className="mt-0.5 shrink-0 text-fg-muted" />
            <span className="min-w-[14rem] flex-1">
              <span className="block text-[14px] font-medium">{agent.name}</span>
              <span className="mt-0.5 block text-[12px] text-fg-muted">{agent.blurb}</span>
            </span>
            <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-muted">Not running</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------- shell */

export function SupportSettingsPane() {
  const [tab, setTab] = useState<string>('ticket_fields')

  const panes: Record<string, React.ReactElement> = {
    ticket_fields: <TicketFieldsPane />,
    web_widget: <WebWidgetPane />,
    csat_survey: <CsatSurveyPane />,
    escalation_rules: <EscalationRulesPane />,
    inbox_accounts: (
      <NotAvailable
        title="Inbound email is not configured on this deployment"
        blurb="There is no mailbox poller and no inbound mail path here, so an IMAP account added on this screen would never be read and no email would become a ticket. Tickets can be opened from the ticket list or from My requests."
      />
    ),
    inbound_channels: (
      <NotAvailable
        title="SMS, WhatsApp and chat intake are not available"
        blurb="No connector webhook exists to receive a customer message on this deployment, so a channel configured here would have nothing pointing at it."
      />
    ),
    parse_failures: (
      <NotAvailable
        title="There is no inbound mail to fail"
        blurb="This tab lists messages that could not be turned into a ticket. Nothing on this deployment receives inbound mail, so no message has ever been parsed — an empty list here would read as good news about a path that does not exist."
      />
    ),
    business_hours: <BusinessHoursPane />,
    auto_responses: (
      <NotAvailable
        title="Auto-acknowledgements are not available"
        blurb="There is no outbound mail path on this deployment, so a rule saved here could never send the acknowledgement it promises. Escalation rules, which act on the ticket itself, do work — see the Escalation rules tab."
      />
    ),
    shift_handoffs: (
      <NotAvailable
        title="Shift handoffs are not available"
        blurb="Moving a team's live tickets at a set time needs something running on a schedule, and nothing does on this deployment. Tickets can be reassigned by hand, or by an escalation rule when an SLA boundary is crossed."
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
        Ticket fields, the web widget, CSAT, SLA escalations and working-hour calendars. Email intake, chat intake,
        shift handoffs and scheduled reports are not available on this deployment and say so on their own tabs.
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

      <div key={tab} className="app-enter mt-6">{panes[tab]}</div>
    </div>
  )
}
