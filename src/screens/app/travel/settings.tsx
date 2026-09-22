'use client'

import { useState } from 'react'
import { useSearchParams } from '../../../lib/router'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { relativeTime } from '../../../lib/relativeTime'
import { currencies, settingsNav } from '../../../lib/travelExpenseData'
import { Label, Panel, inputClass } from '../../../components/EnterpriseUi'
import { FetchProblem, Unavailable, WriteProblem } from './panes'
import {
  useApprovalLevels,
  useExpenseCategories,
  useSettingsChanges,
  useTeSettings,
  type ServerCategory,
} from './useTravel'

const allSettings = settingsNav.flatMap((group) => group.items)

/**
 * A pane that edits one settings section.
 *
 * Every form below is mounted with the document's version as its React key, so
 * a refetch — including the one a 409 forces — replaces the form rather than
 * leaving the operator editing a draft that no longer matches what is stored.
 * The version travels with the save, which is what turns two people editing the
 * same pane into a conflict somebody is told about.
 */
function useDraft<T>(initial: T) {
  const [draft, setDraft] = useState<T>(initial)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  return { draft, setDraft, dirty }
}

type Settings = ReturnType<typeof useTeSettings>

function StaleNotice({ settings }: { settings: Settings }) {
  if (!settings.staleEdit) return null
  return (
    <p role="alert" className="mt-3 rounded-xl border border-warn/40 bg-warn-muted/40 px-4 py-2.5 text-[13px] text-fg">
      Somebody else changed these settings while you were editing. The pane has been re-read — check it and make your
      change again.
    </p>
  )
}

function SaveButton({ settings, dirty, onSave }: { settings: Settings; dirty: boolean; onSave: () => void }) {
  return (
    <Button variant="accent" className="mt-6" disabled={!dirty || settings.saving} onClick={onSave}>
      {settings.saving ? 'Saving…' : 'Save'}
    </Button>
  )
}

/* ----------------------------- expense policy ----------------------------- */

function ExpensePolicyPane() {
  const settings = useTeSettings('expense_policy')
  if (settings.loading || settings.error) return <FetchProblem state={settings} what="the expense policy" />
  return <ExpensePolicyForm key={settings.version} settings={settings} />
}

function ExpensePolicyForm({ settings }: { settings: Settings }) {
  const { draft, setDraft, dirty } = useDraft({
    enforcement: settings.value.enforcement === 'block' ? 'block' : 'warn',
    receiptRequiredAbove: typeof settings.value.receiptRequiredAbove === 'string' ? settings.value.receiptRequiredAbove : '',
    flagDuplicates: settings.value.flagDuplicates !== false,
  })

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Expense policy</h2>
      <p className="mt-2 max-w-4xl text-[14px] text-fg-muted">
        Rules checked when a report is submitted. In <strong className="font-semibold text-fg">Warn</strong> mode
        violations are flagged for the approver; in <strong className="font-semibold text-fg">Block</strong> mode a
        report with a limit breach or a missing receipt cannot be submitted at all. Duplicate detection is advisory in
        both modes — two identical fares on one day do happen.
      </p>

      <div className="mt-5 grid max-w-2xl gap-5 sm:grid-cols-2">
        <label>
          <Label>Enforcement</Label>
          <select
            value={draft.enforcement}
            onChange={(event) => setDraft((prev) => ({ ...prev, enforcement: event.target.value }))}
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
            onChange={(event) => setDraft((prev) => ({ ...prev, receiptRequiredAbove: event.target.value }))}
            placeholder="no threshold"
            inputMode="decimal"
            className={inputClass}
          />
          <span className="mt-1 block text-[12px] text-fg-muted">
            Applies where a category does not state its own. Compared against the converted amount of the line.
          </span>
          {/* The engine can require a receipt; this deployment has no way to
              attach one. In Warn mode that is a flag an approver weighs, but
              in Block mode it is a claim nobody can ever submit — which the
              person hitting it has no way to work out from here. */}
          <span className="mt-1.5 block text-[12px] text-warn">
            Nothing in this app attaches a receipt to an expense yet, so lines above this figure are always flagged as
            missing one. In Block mode that means they cannot be submitted at all.
          </span>
        </label>
      </div>

      <label className="mt-5 flex items-center gap-3 text-[14px]">
        <input
          type="checkbox"
          checked={draft.flagDuplicates}
          onChange={(event) => setDraft((prev) => ({ ...prev, flagDuplicates: event.target.checked }))}
          className="h-4 w-4 accent-accent"
        />
        Flag possible duplicates (same employee, day, merchant and amount)
      </label>

      <WriteProblem error={settings.saveError} />
      <StaleNotice settings={settings} />
      <SaveButton
        settings={settings}
        dirty={dirty}
        onSave={() => settings.save({ ...draft }, 'Updated the expense policy')}
      />

      <CategoryLimits />
    </div>
  )
}

/**
 * The per-category limits grid.
 *
 * These are rows in `te_expense_categories`, not a list of words: the flagging
 * engine reads `limit_amount` and `limit_currency` from them. A grid of
 * hard-coded category names saved into a settings document would show a saved
 * state and change nothing at all.
 */
function CategoryLimits() {
  const categories = useExpenseCategories()
  if (categories.loading || categories.error) {
    return (
      <div className="mt-8">
        <FetchProblem state={categories} what="expense categories" />
      </div>
    )
  }
  return <CategoryLimitsForm key={categories.categories.map((row) => row.id).join(',')} categories={categories} />
}

type CategoryEditor = ReturnType<typeof useExpenseCategories>

function CategoryLimitsForm({ categories }: { categories: CategoryEditor }) {
  const initial = Object.fromEntries(
    categories.categories.map((row) => [row.id, { limitAmount: row.limitAmount ?? '', limitCurrency: row.limitCurrency ?? '' }]),
  )
  const { draft, setDraft, dirty } = useDraft(initial)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  async function saveChanged() {
    // Only the rows that changed: the table carries no version column, so a
    // whole-grid write would let one blank box erase somebody else's limit.
    for (const category of categories.categories) {
      const row = draft[category.id]
      const before = initial[category.id]
      if (row.limitAmount === before.limitAmount && row.limitCurrency === before.limitCurrency) continue
      const saved = await categories.saveCategory(category.id, {
        limitAmount: row.limitAmount.trim() || null,
        limitCurrency: row.limitCurrency || null,
      })
      // A refused row stops the run. Each call clears the previous call's
      // error, so carrying on would erase the message and leave that row
      // unsaved with nothing on screen saying so.
      if (!saved) return
    }
  }

  return (
    <section className="mt-8">
      <p className="text-[14px] text-fg-2">Per-category spend limit (per line)</p>
      <p className="mt-1 max-w-2xl text-[13px] text-fg-muted">
        Leave a limit blank for no cap. A limit needs the currency it is stated in, because it is compared against the
        converted amount of each line. Each changed row is saved on its own and applies immediately; these are
        category rows rather than part of the versioned policy above, so they are not in Change History.
      </p>

      {categories.categories.length ? (
        <>
          <div className="mt-3 grid max-w-3xl gap-x-8 gap-y-3 sm:grid-cols-2">
            {categories.categories.map((category) => (
              <div key={category.id} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-[13px] text-fg-2">{category.name}</span>
                <input
                  aria-label={`${category.name} limit`}
                  value={draft[category.id].limitAmount}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      [category.id]: { ...prev[category.id], limitAmount: event.target.value },
                    }))
                  }
                  placeholder="no limit"
                  inputMode="decimal"
                  className="w-full rounded-xl border border-line bg-bg px-3.5 py-2 text-right text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
                />
                <select
                  aria-label={`${category.name} limit currency`}
                  value={draft[category.id].limitCurrency}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      [category.id]: { ...prev[category.id], limitCurrency: event.target.value },
                    }))
                  }
                  className="rounded-xl border border-line bg-bg px-2 py-2 text-[13px] focus:border-accent focus:outline-none"
                >
                  <option value="">—</option>
                  {currencies.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <Button variant="accent" className="mt-5" disabled={!dirty || categories.writing} onClick={saveChanged}>
            {categories.writing ? 'Saving…' : 'Save limits'}
          </Button>
        </>
      ) : (
        <p className="mt-3 max-w-2xl rounded-xl border border-dashed border-line px-6 py-8 text-center text-[14px] text-fg-muted">
          No expense categories exist in this workspace yet. Add one below — categories are what carry limits, receipt
          thresholds and ledger accounts.
        </p>
      )}

      <WriteProblem error={categories.writeError} />

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label>
          <Label>New category</Label>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Meals" className={inputClass} />
        </label>
        <label>
          <Label>Code</Label>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="MEAL"
            className={`${inputClass} font-mono`}
          />
        </label>
        <Button
          variant="secondary"
          disabled={!name.trim() || !code.trim() || categories.writing}
          onClick={async () => {
            const created = await categories.addCategory({ name: name.trim(), code: code.trim() })
            if (created) {
              setName('')
              setCode('')
            }
          }}
        >
          Add category
        </Button>
      </div>
    </section>
  )
}

/* ------------------------------ receipt email ----------------------------- */

function ReceiptEmailPane() {
  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Receipt email-in</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Forwarding a receipt to an inbound address so it becomes a draft expense against the sender&apos;s employee
        record.
      </p>
      <div className="mt-5">
        <Unavailable title="Receipt email-in is not available on this deployment">
          There is no inbound mail service here, so no forwarded receipt could ever arrive or be turned into an
          expense. The address and the on/off switch are not shown, because storing them would look like turning the
          feature on.
        </Unavailable>
      </div>
    </div>
  )
}

/* ------------------------------ travel policy ----------------------------- */

function TravelPolicyPane() {
  const settings = useTeSettings('travel_policy')
  if (settings.loading || settings.error) return <FetchProblem state={settings} what="the travel policy" />
  return <TravelPolicyForm key={settings.version} settings={settings} />
}

function TravelPolicyForm({ settings }: { settings: Settings }) {
  const { draft, setDraft, dirty } = useDraft({
    advancePercent: typeof settings.value.advancePercent === 'number' ? settings.value.advancePercent : 0,
  })

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Travel policy</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        How much of a trip&apos;s estimate may be advanced before the traveller leaves. A request for more than this
        share is refused when the trip is raised.
      </p>

      <div className="mt-5 grid max-w-2xl gap-5 sm:grid-cols-2">
        <label>
          <Label>Advance limit (% of estimate)</Label>
          <input
            type="number"
            min={0}
            max={100}
            value={draft.advancePercent}
            onChange={(event) => setDraft({ advancePercent: Number(event.target.value) })}
            className={inputClass}
          />
          <span className="mt-1 block text-[12px] text-fg-muted">Zero means no advance may be requested at all.</span>
        </label>
      </div>

      <WriteProblem error={settings.saveError} />
      <StaleNotice settings={settings} />
      <SaveButton
        settings={settings}
        dirty={dirty}
        onSave={() => settings.save({ ...draft }, 'Updated the travel advance limit')}
      />

      <p className="mt-8 max-w-3xl text-[13px] leading-relaxed text-fg-muted">
        Two settings that used to live here have been removed rather than left to store a number nothing reads. The
        amount above which a trip needs approval is the threshold on each row of{' '}
        <strong className="font-semibold text-fg">Approval Levels</strong>, which is what the approval chain actually
        consults. A default per-diem is not available on this deployment: there is nowhere to record a per-diem rate or
        the nights it would be claimed for, so a figure saved here could never reach a claim.
      </p>
    </div>
  )
}

/**
 * Travel segment fields.
 *
 * This pane used to print a static catalogue — Flight: Carrier, Cabin,
 * Baggage; Hotel: Room type, Nights — as "the platform defaults", which read
 * as configuration in force. Nothing on this deployment captures any of them:
 * a booking records its kind, vendor, reference, dates and cost, and there is
 * no per-leg segment anywhere to hang a Cabin or a Baggage allowance on. A
 * list of fields nobody fills is the same fabrication as a list of agents that
 * never run.
 */
function SegmentFieldsPane() {
  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Travel segment fields</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        The mode-specific fields a traveller would fill in per leg of a trip.
      </p>
      <div className="mt-5">
        <Unavailable title="Per-leg segment fields are not available on this deployment">
          A trip here carries its purpose, destination, dates and estimate, and a booking against it records a kind,
          vendor, reference, dates and cost — there is no per-leg segment to attach a carrier, cabin or room type to,
          and no screen that would ask for one. Configuring fields nothing collects would describe a form that does
          not exist.
        </Unavailable>
      </div>
    </div>
  )
}

function TravelNotificationsPane() {
  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Travel notifications</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Which travel events notify the requester and their approver.
      </p>
      <div className="mt-5">
        <Unavailable title="Travel notifications are not available on this deployment">
          Nothing here sends mail, so choosing which events notify somebody would decide nothing. The checkboxes are
          not shown rather than saved into a document no notifier reads.
        </Unavailable>
      </div>
    </div>
  )
}

/* ----------------------------- approval levels ---------------------------- */

function ApprovalLevelsPane() {
  const [scope, setScope] = useState<'expense' | 'travel'>('expense')
  const levels = useApprovalLevels(scope)

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Approval Levels</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Claims and trips climb these levels in order. A level with no threshold always applies; one with a threshold
        only applies at or above that amount, so a small claim does not queue behind a level that exists for large
        ones. Each level is decidable once per round. Saving replaces the whole ladder for the selected scope: it
        carries no version, so a second administrator saving after you replaces what you saved, and there is no entry
        in Change History to restore.
      </p>

      <div className="mt-5 inline-flex rounded-xl border border-line bg-surface p-1">
        {(['expense', 'travel'] as const).map((item) => (
          <button
            key={item}
            onClick={() => setScope(item)}
            aria-pressed={scope === item}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] transition ${
              scope === item ? 'bg-accent font-medium text-white' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {item === 'expense' ? 'Expense reports' : 'Travel requests'}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {levels.loading || levels.error ? (
          <FetchProblem state={levels} what="approval levels" />
        ) : (
          <ApprovalLevelsForm key={`${scope}:${levels.levels.map((row) => row.label).join(',')}`} levels={levels} />
        )}
      </div>
    </div>
  )
}

function ApprovalLevelsForm({ levels }: { levels: ReturnType<typeof useApprovalLevels> }) {
  const initial = levels.levels.map((row) => ({ label: row.label, threshold: row.threshold }))
  const { draft, setDraft, dirty } = useDraft(initial)

  return (
    <div>
      {draft.length ? (
        <ul className="max-w-2xl space-y-3">
          {draft.map((level, index) => (
            <li key={index} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
              <span className="w-6 shrink-0 text-[13px] text-fg-muted">{index + 1}</span>
              <input
                aria-label={`Level ${index + 1} label`}
                value={level.label}
                onChange={(event) =>
                  setDraft((prev) => prev.map((item, at) => (at === index ? { ...item, label: event.target.value } : item)))
                }
                className="min-w-[10rem] flex-1 rounded-xl border border-line bg-bg px-3.5 py-2 text-[13px] focus:border-accent focus:outline-none"
              />
              <input
                aria-label={`Level ${index + 1} threshold`}
                value={level.threshold}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev.map((item, at) => (at === index ? { ...item, threshold: event.target.value } : item)),
                  )
                }
                placeholder="always"
                inputMode="decimal"
                className="w-32 rounded-xl border border-line bg-bg px-3.5 py-2 text-right text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => setDraft((prev) => prev.filter((_, at) => at !== index))}
                aria-label={`Remove ${level.label}`}
                className="text-fg-muted transition hover:text-bad"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="max-w-2xl rounded-xl border border-dashed border-line px-6 py-8 text-center text-[14px] text-fg-muted">
          No levels are configured, so a submitted claim is approved by the first person who decides it.
        </p>
      )}

      <WriteProblem error={levels.writeError} />

      <div className="mt-4 flex gap-3">
        <Button
          variant="secondary"
          onClick={() => setDraft((prev) => [...prev, { label: 'New level', threshold: '' }])}
        >
          + Add level
        </Button>
        <Button
          variant="accent"
          disabled={!dirty || levels.writing}
          onClick={() =>
            levels.saveLevels(
              draft.map((level) => ({ label: level.label.trim() || 'Level', threshold: level.threshold.trim() || undefined })),
            )
          }
        >
          {levels.writing ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

/* ---------------------------------- SLA ----------------------------------- */

function SlaPane() {
  const settings = useTeSettings('sla')
  if (settings.loading || settings.error) return <FetchProblem state={settings} what="the reimbursement SLA" />
  return <SlaForm key={settings.version} settings={settings} />
}

function SlaForm({ settings }: { settings: Settings }) {
  const { draft, setDraft, dirty } = useDraft(typeof settings.value.slaDays === 'number' ? settings.value.slaDays : 0)

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Reimbursement SLA</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        The target number of days from approval to disbursement. It is a target this workspace states, not a schedule
        anything runs to: nothing here pays a claim automatically. The Dashboard and the Approval SLA report show the
        figure set here, and show nothing at all when it is unset.
      </p>

      <label className="mt-5 block max-w-xs">
        <Label>Days</Label>
        <input
          type="number"
          min={0}
          value={draft}
          onChange={(event) => setDraft(Number(event.target.value))}
          className={inputClass}
        />
      </label>

      <WriteProblem error={settings.saveError} />
      <StaleNotice settings={settings} />
      <SaveButton
        settings={settings}
        dirty={dirty}
        onSave={() => settings.save({ slaDays: draft }, `Set the reimbursement SLA to ${draft} days`)}
      />
    </div>
  )
}

/* ------------------------------- GL accounts ------------------------------ */

function GlAccountsPane() {
  const categories = useExpenseCategories()

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Reimbursement GL accounts</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        The ledger account recorded against each expense category. Nothing on this deployment posts to a ledger, so
        this is a mapping held on the category rather than an instruction anything acts on.
      </p>

      <div className="mt-5">
        {categories.loading || categories.error ? (
          <FetchProblem state={categories} what="expense categories" />
        ) : categories.categories.length ? (
          <GlAccountsForm key={categories.categories.map((row) => row.id).join(',')} categories={categories} />
        ) : (
          <p className="max-w-3xl rounded-xl border border-dashed border-line px-6 py-8 text-center text-[14px] text-fg-muted">
            No expense categories exist yet. Add them under Expense policy — the ledger account is a column on the
            category, so there is nothing to map until one exists.
          </p>
        )}
      </div>
    </div>
  )
}

function GlAccountsForm({ categories }: { categories: CategoryEditor }) {
  const initial = Object.fromEntries(categories.categories.map((row: ServerCategory) => [row.id, row.glAccount ?? '']))
  const { draft, setDraft, dirty } = useDraft(initial)

  async function saveChanged() {
    for (const category of categories.categories) {
      if (draft[category.id] === initial[category.id]) continue
      const saved = await categories.saveCategory(category.id, { glAccount: draft[category.id].trim() || null })
      // Stop on the first refusal: the next call would clear its error and the
      // grid would look saved with one row silently unchanged.
      if (!saved) return
    }
  }

  return (
    <div>
      <div className="grid max-w-3xl gap-x-8 gap-y-3 sm:grid-cols-2">
        {categories.categories.map((category) => (
          <label key={category.id} className="flex items-center gap-4">
            <span className="w-40 shrink-0 text-[13px] text-fg-2">{category.name}</span>
            <input
              value={draft[category.id]}
              onChange={(event) => setDraft((prev) => ({ ...prev, [category.id]: event.target.value }))}
              placeholder="unmapped"
              className="w-full rounded-xl border border-line bg-bg px-3.5 py-2 font-mono text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
          </label>
        ))}
      </div>
      <WriteProblem error={categories.writeError} />
      <Button variant="accent" className="mt-6" disabled={!dirty || categories.writing} onClick={saveChanged}>
        {categories.writing ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}

/* ------------------------------ the rest of it ---------------------------- */

function CustomFieldsPane() {
  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Custom Fields</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Extra fields captured on every expense report in this tenant.
      </p>
      <div className="mt-5">
        <Unavailable title="Custom fields are not available on this deployment">
          A definition could be stored, but an expense report has nowhere to hold a value for it — so the fields would
          never appear on a claim and nothing would ever be captured. The editor is withheld rather than left to look
          as though it works.
        </Unavailable>
      </div>
    </div>
  )
}

function AgentsPane() {
  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">AI Agents</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Agents that would read receipts, check claims against policy and chase approvals.
      </p>
      <div className="mt-5">
        <Unavailable title="AI agents are not available on this deployment">
          There is no agent runtime and no model provider here, so no agent runs, spends credits or produces anything.
          Naming agents that cannot run would describe a capability this workspace does not have.
        </Unavailable>
      </div>
    </div>
  )
}

function SchedulesPane() {
  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Schedules</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        Timed jobs targeting this app — a nightly policy sweep, a weekly payout run.
      </p>
      <div className="mt-5">
        <Unavailable title="Scheduled jobs are not available on this deployment">
          Nothing here executes work on a timer, so a schedule saved against Travel &amp; Expense would never fire. The
          list is withheld rather than showing jobs that are never run.
        </Unavailable>
      </div>
    </div>
  )
}

/**
 * Change history.
 *
 * Settings changes only, and said so: the server records an audit line for
 * every claim and trip mutation too, but nothing in the API reads that table,
 * so claiming these are "every change made inside this app" would be a promise
 * the list cannot keep.
 */
function ChangeHistoryPane() {
  const history = useSettingsChanges()

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Change History</h2>
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        The 50 most recent changes to this app&apos;s settings documents — Expense policy, Travel policy and the
        Reimbursement SLA — newest first. Reverting restores the values recorded before a change and is itself a new entry, so undoing
        something never erases the evidence it happened. Approval Levels, category limits and GL accounts are rows in
        their own tables rather than settings documents, so they are not listed here and cannot be reverted from here.
        Neither are changes to claims and trips: those are recorded server-side, but there is no API that reads them
        back.
      </p>

      <div className="mt-5">
        {history.loading || history.error ? (
          <FetchProblem state={history} what="the change history" />
        ) : history.changes.length ? (
          <ul className="max-w-3xl divide-y divide-line rounded-2xl border border-line bg-surface">
            {history.changes.map((change) => (
              <li key={change.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <span className="min-w-[14rem] flex-1 text-[13px]">
                  {change.summary}
                  {change.changedByName && <span className="text-fg-muted"> · {change.changedByName}</span>}
                </span>
                <span className="text-[12px] text-fg-muted">{relativeTime(change.changedAt)}</span>
                {change.reverted ? (
                  <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-slate">Reverted</span>
                ) : (
                  /* Version 1 is the change that created the section, so there
                     is no earlier value to restore and the server refuses it.
                     Offering the button anyway makes a refusal look like a
                     fault rather than the nature of the entry. */
                  <Button
                    variant="secondary"
                    className="!py-2 !text-[13px]"
                    disabled={history.writing || change.version <= 1}
                    title={
                      change.version <= 1
                        ? 'This change created the section, so there is no earlier value to restore.'
                        : undefined
                    }
                    onClick={() => history.revert(change.id)}
                  >
                    Revert
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="max-w-3xl rounded-xl border border-dashed border-line px-6 py-10 text-center text-[14px] text-fg-muted">
            No settings changes recorded yet.
          </p>
        )}
        <WriteProblem error={history.writeError} />
      </div>
    </div>
  )
}

function AppearancePane() {
  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Appearance</h2>
      {/* There are no tenant design tokens: the palette is the product's, and
          light/dark is the reader's own choice, kept in their browser. Saying
          it came from the tenant would describe a theming system nobody has. */}
      <p className="mt-2 max-w-3xl text-[14px] text-fg-muted">
        This app has no appearance settings of its own. It uses the product&apos;s palette, and the light/dark control
        in the top bar decides which of the two you see — that choice is yours and is remembered in this browser, not
        stored against the workspace, so it follows neither your colleagues nor your other devices.
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
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-5">
        <div className="min-w-[18rem] flex-1">
          <p className="flex items-center gap-2.5 text-[15px] font-semibold">
            <Icon name="clock" size={17} className="text-accent" />
            Which changes are versioned
          </p>
          {/* Not "every settings change": three panes here edit rows in their
              own tables rather than a settings document, and those rows have no
              version and no entry in Change History. Promising a revert that
              does not exist is worse than naming the exception. */}
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">
            Expense policy, Travel policy and the Reimbursement SLA are settings documents: saving one writes a
            numbered version with a summary, and Change History can restore it. Approval Levels, category limits and
            GL accounts are rows in their own tables — they take effect immediately, but carry no version and cannot
            be restored from Change History. Panes that say a feature is not available on this deployment store
            nothing at all.
          </p>
        </div>
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
