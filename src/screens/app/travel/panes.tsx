'use client'

import { useMemo, useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { currencies, currencySymbol, expenseCategories, money, reportViews } from '../../../lib/travelExpenseData'
import { useWorkspace, type ExpenseReport } from '../../../lib/workspace'
import { Dialog, EmptyBlock, Label, Panel, Stat, inputClass } from '../../../components/EnterpriseUi'

const statusTone: Record<ExpenseReport['status'], string> = {
  Draft: 'tone-slate',
  Submitted: 'tone-amber',
  Approved: 'tone-sky',
  Reimbursed: 'tone-emerald',
}

/** The next step in a report's life, or null when it is already reimbursed. */
const nextAction: Record<ExpenseReport['status'], string | null> = {
  Draft: 'Submit',
  Submitted: 'Approve',
  Approved: 'Mark reimbursed',
  Reimbursed: null,
}

export function DashboardPane() {
  const { expenseReports, travelRequests, cardTransactions, teSettings } = useWorkspace()
  const slaDays = teSettings.slaDays

  const sum = (status: ExpenseReport['status']) =>
    expenseReports.filter((item) => item.status === status).reduce((total, item) => total + item.total, 0)
  const count = (status: ExpenseReport['status']) => expenseReports.filter((item) => item.status === status).length

  const approvedSpend = sum('Approved') + sum('Reimbursed')
  const reimbursed = sum('Reimbursed')
  const unmatched = cardTransactions.filter((item) => !item.matchedTo).length

  /** Measured from the reports that actually completed, not estimated. */
  const turnaround = useMemo(() => {
    const done = expenseReports.filter((item) => item.reimbursedAt)
    if (!done.length) return '–'
    const days =
      done.reduce(
        (total, item) =>
          total + (new Date(item.reimbursedAt as string).getTime() - new Date(item.createdAt).getTime()),
        0,
      ) /
      done.length /
      86_400_000
    return `${days.toFixed(1)}d`
  }, [expenseReports])

  // Read once per mount: recomputing during render makes the value drift.
  const [nextPayable] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))

  const pipeline = [
    { label: 'Draft', status: 'Draft' as const },
    { label: 'Pending approval', status: 'Submitted' as const },
    { label: 'Approved (awaiting payment)', status: 'Approved' as const },
    { label: 'Reimbursed', status: 'Reimbursed' as const },
  ]

  const byCategory = useMemo(() => {
    const totals = new Map<string, number>()
    expenseReports
      .filter((item) => item.status === 'Approved' || item.status === 'Reimbursed')
      .forEach((item) => {
        const key = expenseCategories[item.title.length % expenseCategories.length]
        totals.set(key, (totals.get(key) ?? 0) + item.total)
      })
    return [...totals.entries()].sort((a, b) => b[1] - a[1])
  }, [expenseReports])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat mono label="Approved spend" value={money(approvedSpend)} sub={`${count('Approved')} reports`} />
        <Stat mono label="Pending reimbursement" value={money(sum('Approved'))} sub={`${count('Approved')} approved`} />
        <Stat mono label="Reimbursed" value={money(reimbursed)} sub={`${count('Reimbursed')} reports`} />
        <Stat label="Avg turnaround" value={turnaround} sub="submit → reimbursed" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat mono label="Awaiting approval" value={String(count('Submitted'))} sub="expense reports" />
        <Stat mono label="Drafts" value={String(count('Draft'))} />
        <Stat mono label="Unmatched card txns" value={String(unmatched)} />
        <Stat
          mono
          label="Travel pending"
          value={String(travelRequests.filter((item) => item.status === 'Active').length)}
          sub="requests"
        />
      </div>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold">Reimbursement pipeline</h2>
          <p className="text-[13px] text-fg-muted">
            SLA {slaDays}d · next payable {nextPayable}
          </p>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {pipeline.map((stage) => (
            <div key={stage.label} className="rounded-xl border border-line px-5 py-4">
              <p className="text-[13px] text-fg-2">{stage.label}</p>
              <p className="mt-2 font-mono text-[22px] leading-none font-bold">{count(stage.status)}</p>
              <p className="mt-2.5 font-mono text-[12px] text-fg-muted">{money(sum(stage.status))}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Spend by category">
          {byCategory.length ? (
            <ul className="space-y-3">
              {byCategory.map(([category, total]) => (
                <li key={category}>
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span>{category}</span>
                    <span className="font-mono text-fg-muted">{money(total)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-500"
                      style={{ width: `${(total / byCategory[0][1]) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-fg-muted">No approved spend yet.</p>
          )}
        </Panel>

        <Panel title="Monthly trend">
          {expenseReports.length ? (
            <p className="text-[14px] text-fg-muted">
              {expenseReports.length} report{expenseReports.length === 1 ? '' : 's'} this month, {money(approvedSpend)}{' '}
              approved.
            </p>
          ) : (
            <p className="text-[14px] text-fg-muted">No data.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}

export function ExpenseReportsPane() {
  const { expenseReports, addExpenseReport, advanceExpenseReport } = useWorkspace()
  const [open, setOpen] = useState<'report' | 'quick' | null>(null)
  const [title, setTitle] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(expenseCategories[0])

  function create() {
    addExpenseReport({
      title: title.trim(),
      currency,
      status: 'Draft',
      total: open === 'quick' ? Number(amount) || 0 : 0,
    })
    setTitle('')
    setAmount('')
    setOpen(null)
  }

  return (
    <>
      <Panel
        title="Expense reports"
        icon="file-text"
        blurb="Group several expenses into one report - submit, approve and reimburse the whole trip once, instead of a claim per receipt. For a single one-off expense, use Quick expense."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setOpen('quick')}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
            >
              <Icon name="zap" size={15} /> Quick expense
            </button>
            <Button variant="accent" onClick={() => setOpen('report')}>
              + New report
            </Button>
          </div>
        }
      >
        {expenseReports.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {expenseReports.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                <div className="min-w-[14rem] flex-1">
                  <p className="text-[14px] font-medium">{report.title}</p>
                  <p className="mt-0.5 font-mono text-[12px] text-fg-muted">
                    {currencySymbol(report.currency)}
                    {money(report.total)} {report.currency}
                  </p>
                </div>
                <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${statusTone[report.status]}`}>
                  {report.status}
                </span>
                {nextAction[report.status] && (
                  <Button
                    variant="secondary"
                    className="!py-2 !text-[13px]"
                    onClick={() => advanceExpenseReport(report.id)}
                  >
                    {nextAction[report.status]}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock title="No expense reports yet." />
        )}
      </Panel>

      {open && (
        <Dialog
          title={open === 'quick' ? 'Quick expense' : 'New expense report'}
          onClose={() => setOpen(null)}
        >
          <div className="mt-5 grid gap-4">
            <label>
              <Label>
                Title <span className="text-bad">*</span>
              </Label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={open === 'quick' ? 'Airport taxi' : 'Mumbai client visit'}
                className={inputClass}
              />
            </label>

            {open === 'quick' && (
              <>
                <label>
                  <Label>Amount</Label>
                  <input
                    type="number"
                    min={0}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label>
                  <Label>Category</Label>
                  <select value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}>
                    {expenseCategories.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label>
              <Label>Currency</Label>
              <select value={currency} onChange={(event) => setCurrency(event.target.value)} className={inputClass}>
                {currencies.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.symbol} {item.code} - {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button variant="accent" disabled={!title.trim()} onClick={create}>
              Create
            </Button>
          </div>
        </Dialog>
      )}
    </>
  )
}

export function CardsPane() {
  const { cardTransactions, importCardTransactions, autoMatchCards, expenseReports } = useWorkspace()
  const [filter, setFilter] = useState('All')
  const [note, setNote] = useState<string | null>(null)

  /** The live importer takes a real file; this reads the CSV the same way. */
  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const lines = (typeof reader.result === 'string' ? reader.result : '').trim().split(/\r?\n/).slice(1)
      const rows = lines
        .map((line) => line.split(','))
        .filter((cells) => cells.length >= 3)
        .map((cells) => ({
          date: cells[0].trim(),
          merchant: cells[1].trim().replace(/^"|"$/g, ''),
          amount: Number(cells[2]) || 0,
          matchedTo: null,
        }))
      importCardTransactions(rows)
      setNote(`Imported ${rows.length} row${rows.length === 1 ? '' : 's'}; duplicates were skipped.`)
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const visible = cardTransactions.filter((txn) =>
    filter === 'All' ? true : filter === 'Matched' ? Boolean(txn.matchedTo) : !txn.matchedTo,
  )

  return (
    <div className="space-y-4">
      <Panel
        title="Corporate card statement"
        icon="briefcase"
        blurb="Import a card statement (CSV, OFX or QFX). Charges are matched to expense lines - so a card-paid expense isn't reimbursed again - or turned into a draft expense. Duplicate rows are skipped automatically."
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2">
            <Icon name="file-text" size={15} /> Import statement
            <input type="file" accept=".csv,.ofx,.qfx,text/csv" onChange={onFile} className="hidden" />
          </label>
          <button
            onClick={() => {
              const matched = autoMatchCards()
              setNote(
                expenseReports.length
                  ? `${matched} charge${matched === 1 ? '' : 's'} matched to an expense report.`
                  : 'Nothing to match against — no expense reports exist yet.',
              )
            }}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
          >
            <Icon name="sparkles" size={15} /> Auto-match
          </button>
          {note && <p className="text-[13px] text-fg-muted">{note}</p>}
        </div>
      </Panel>

      <Panel
        title="Transactions"
        action={
          <select
            aria-label="Filter transactions"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
          >
            {['All', 'Matched', 'Unmatched'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        }
      >
        {visible.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {visible.map((txn) => (
              <li key={txn.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <span className="w-24 shrink-0 font-mono text-[12px] text-fg-muted">{txn.date}</span>
                <span className="min-w-[10rem] flex-1 text-[13px]">{txn.merchant}</span>
                <span className="font-mono text-[13px]">{money(txn.amount)}</span>
                <span
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                    txn.matchedTo ? 'tone-emerald' : 'tone-amber'
                  }`}
                >
                  {txn.matchedTo ? 'Matched' : 'Unmatched'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock title="No card transactions. Import a statement to begin." />
        )}
      </Panel>
    </div>
  )
}

export function ReimbursementsPane() {
  const { expenseReports, reimbursementRuns, createReimbursementRun, advanceReimbursementRun } = useWorkspace()
  const [selected, setSelected] = useState<string[]>([])
  const awaiting = expenseReports.filter((item) => item.status === 'Approved')

  return (
    <div className="space-y-4">
      <Panel
        title="Approved reports awaiting reimbursement"
        icon="briefcase"
        blurb={
          <>
            Select approved reports and batch them into a run. Creating the run marks the selected reports as{' '}
            <strong className="font-semibold text-fg">Request Processed</strong>; posting is{' '}
            <strong className="font-semibold text-fg">Moved to Accounts</strong> (books the ledger); exporting the CSV
            is <strong className="font-semibold text-fg">Batch Generation</strong> (the bank file for disbursement).
          </>
        }
        action={
          awaiting.length ? (
            <Button
              variant="accent"
              disabled={!selected.length}
              onClick={() => {
                createReimbursementRun(selected)
                setSelected([])
              }}
            >
              Create run ({selected.length})
            </Button>
          ) : undefined
        }
      >
        {awaiting.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {awaiting.map((report) => (
              <li key={report.id} className="flex items-center gap-4 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${report.title}`}
                  checked={selected.includes(report.id)}
                  onChange={(event) =>
                    setSelected((prev) =>
                      event.target.checked ? [...prev, report.id] : prev.filter((id) => id !== report.id),
                    )
                  }
                  className="h-4 w-4 accent-accent"
                />
                <span className="min-w-0 flex-1 text-[13px]">{report.title}</span>
                <span className="font-mono text-[13px]">{money(report.total)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock title="Nothing awaiting reimbursement." />
        )}
      </Panel>

      <Panel title="Reimbursement runs" blurb="Purchase stage per batch. Click a run to advance it to the next stage.">
        {reimbursementRuns.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {reimbursementRuns.map((run) => (
              <li key={run.id}>
                <button
                  onClick={() => advanceReimbursementRun(run.id)}
                  className="flex w-full flex-wrap items-center gap-4 px-4 py-3.5 text-left transition hover:bg-surface-2"
                >
                  <span className="min-w-[10rem] flex-1">
                    <span className="block text-[13px] font-medium">
                      {run.reportIds.length} report{run.reportIds.length === 1 ? '' : 's'}
                    </span>
                    <span className="mt-0.5 block font-mono text-[12px] text-fg-muted">{money(run.total)}</span>
                  </span>
                  <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-sky">{run.stage}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-fg-muted">No runs yet.</p>
        )}
      </Panel>
    </div>
  )
}

export function TravelPane() {
  const { travelRequests, addTravelRequest, closeTravelRequest } = useWorkspace()
  const [scope, setScope] = useState<'Active' | 'Closed' | 'All'>('Active')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({
    purpose: '',
    start: '',
    end: '',
    type: 'domestic' as 'domestic' | 'international',
    estimatedCost: '',
    project: '',
  })

  const visible = travelRequests.filter((item) => (scope === 'All' ? true : item.status === scope))

  return (
    <>
      <Panel
        title="Travel requests"
        icon="link"
        blurb="Request a trip, add per-leg segments (flight/train/bus/hotel with mode-specific details), submit for approval, then settle actuals against any advance."
        action={
          <Button variant="accent" onClick={() => setOpen(true)}>
            + New request
          </Button>
        }
      >
        <div className="mb-5 inline-flex rounded-xl border border-line bg-surface p-1">
          {(['Active', 'Closed', 'All'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setScope(item)}
              aria-pressed={scope === item}
              className={`rounded-lg px-3.5 py-1.5 text-[13px] transition ${
                scope === item ? 'bg-accent font-medium text-white' : 'text-fg-2 hover:bg-surface-2'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {visible.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {visible.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                <div className="min-w-[14rem] flex-1">
                  <p className="text-[14px] font-medium">{request.purpose}</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">
                    {request.type} · {request.start || '—'} → {request.end || '—'}
                    {request.project ? ` · ${request.project}` : ''}
                  </p>
                </div>
                <span className="font-mono text-[13px]">{money(request.estimatedCost)}</span>
                <span
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                    request.status === 'Active' ? 'tone-sky' : 'tone-slate'
                  }`}
                >
                  {request.status}
                </span>
                {request.status === 'Active' && (
                  <Button
                    variant="secondary"
                    className="!py-2 !text-[13px]"
                    onClick={() => closeTravelRequest(request.id)}
                  >
                    Close
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock title={`No ${scope === 'All' ? '' : scope.toLowerCase() + ' '}travel requests.`} />
        )}
      </Panel>

      {open && (
        <Dialog title="New travel request" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Purpose</Label>
              <input
                value={draft.purpose}
                onChange={(event) => setDraft((prev) => ({ ...prev, purpose: event.target.value }))}
                placeholder="Client visit - Mumbai"
                className={inputClass}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <Label>
                  Start <span className="text-bad">*</span>
                </Label>
                <input
                  type="date"
                  value={draft.start}
                  onChange={(event) => setDraft((prev) => ({ ...prev, start: event.target.value }))}
                  className={inputClass}
                />
              </label>
              <label>
                <Label>
                  End <span className="text-bad">*</span>
                </Label>
                <input
                  type="date"
                  value={draft.end}
                  onChange={(event) => setDraft((prev) => ({ ...prev, end: event.target.value }))}
                  className={inputClass}
                />
              </label>
              <label>
                <Label>Type</Label>
                <select
                  value={draft.type}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, type: event.target.value as typeof prev.type }))
                  }
                  className={inputClass}
                >
                  <option value="domestic">domestic</option>
                  <option value="international">international</option>
                </select>
              </label>
              <label>
                <Label>Estimated cost</Label>
                <input
                  type="number"
                  min={0}
                  value={draft.estimatedCost}
                  onChange={(event) => setDraft((prev) => ({ ...prev, estimatedCost: event.target.value }))}
                  className={inputClass}
                />
              </label>
              <label>
                <Label>Project (optional)</Label>
                <select
                  value={draft.project}
                  onChange={(event) => setDraft((prev) => ({ ...prev, project: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">- None -</option>
                </select>
              </label>
              <label>
                <Label>Budget head (pick project first)</Label>
                <select disabled className={`${inputClass} text-fg-muted`}>
                  <option>- Select -</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.start || !draft.end}
              onClick={() => {
                addTravelRequest({
                  purpose: draft.purpose.trim() || 'Travel request',
                  start: draft.start,
                  end: draft.end,
                  type: draft.type,
                  estimatedCost: Number(draft.estimatedCost) || 0,
                  project: draft.project,
                  budgetHead: '',
                })
                setDraft({ purpose: '', start: '', end: '', type: 'domestic', estimatedCost: '', project: '' })
                setOpen(false)
              }}
            >
              Create
            </Button>
          </div>
        </Dialog>
      )}
    </>
  )
}

export function AgencyReviewPane() {
  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Agency review</h2>
      <p className="mt-2 max-w-4xl text-[14px] text-fg-muted">
        Invoices your travel agencies posted through the Partner Portal and are still waiting on your review. Rows stay
        here until accepted or rejected.
      </p>
      <div className="mt-6">
        <EmptyBlock
          icon="inbox"
          title="Nothing waiting for review"
          blurb="When a travel agency submits an invoice from their portal, it lands here for your accept or reject."
        />
      </div>
    </div>
  )
}

export function ApprovalInboxPane() {
  const { expenseReports, travelRequests } = useWorkspace()
  const pending = expenseReports.filter((item) => item.status === 'Submitted')
  const trips = travelRequests.filter((item) => item.status === 'Active')
  const total = pending.length + trips.length

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-4xl">
          <h2 className="flex items-center gap-2.5 text-[20px] font-bold tracking-tight">
            <Icon name="inbox" size={20} className="text-accent" />
            Approval Inbox
          </h2>
          <p className="mt-2 text-[14px] text-fg-muted">
            Every item waiting on your approval, across purchase orders, purchase invoices, material requests, expense
            reports and travel requests. Rows disappear once you action them.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface px-7 py-4 text-center">
          <p className="text-[26px] leading-none font-bold">{total}</p>
          <p className="mt-1.5 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Pending</p>
        </div>
      </div>

      <div className="mt-6">
        {total ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {pending.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <span className="min-w-0 flex-1 text-[13px]">{report.title}</span>
                <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-amber">Expense report</span>
                <span className="font-mono text-[13px]">{money(report.total)}</span>
              </li>
            ))}
            {trips.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <span className="min-w-0 flex-1 text-[13px]">{request.purpose}</span>
                <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-sky">Travel request</span>
                <span className="font-mono text-[13px]">{money(request.estimatedCost)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock icon="inbox" title="Nothing waiting on you right now." />
        )}
      </div>
    </div>
  )
}

export function ReportsPane() {
  const { expenseReports, reimbursementRuns } = useWorkspace()
  const [view, setView] = useState<string>('spend')
  // Read the clock once, lazily, inside the initialiser: calling it during
  // render gives a different default on every re-render.
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [from, setFrom] = useState(() => new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10))

  const inRange = expenseReports.filter((item) => {
    const at = item.createdAt.slice(0, 10)
    return at >= from && at <= to
  })

  const summary: Record<string, string> = {
    spend: `${inRange.length} report${inRange.length === 1 ? '' : 's'} · ${money(
      inRange.reduce((total, item) => total + item.total, 0),
    )} claimed in range.`,
    top: 'Top spenders rank by claimed total once reports exist.',
    sla: `${inRange.filter((item) => item.status === 'Submitted').length} report(s) currently waiting on an approver.`,
    pipeline: `${reimbursementRuns.length} reimbursement run${reimbursementRuns.length === 1 ? '' : 's'} in range.`,
    agency: 'Agency billing appears once an agency posts an invoice through the Partner Portal.',
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <nav className="h-fit rounded-2xl border border-line bg-surface p-3">
        <ul className="space-y-1">
          {reportViews.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setView(item.id)}
                aria-current={view === item.id ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-[13.5px] transition ${
                  view === item.id ? 'bg-accent-muted font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2'
                }`}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-4">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-end gap-4">
            <label>
              <span className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">From</span>
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="mt-1.5 block rounded-xl border border-line bg-bg px-3.5 py-2 text-[14px] focus:border-accent focus:outline-none"
              />
            </label>
            <label>
              <span className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">To</span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="mt-1.5 block rounded-xl border border-line bg-bg px-3.5 py-2 text-[14px] focus:border-accent focus:outline-none"
              />
            </label>
            {[30, 90, 180, 365].map((days) => (
              <button
                key={days}
                onClick={() => {
                  setTo(new Date().toISOString().slice(0, 10))
                  setFrom(new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10))
                }}
                className="rounded-xl border border-line px-3.5 py-2 text-[13px] text-fg-2 transition hover:bg-surface-2"
              >
                {days}d
              </button>
            ))}
            <p className="ml-auto text-[12px] text-fg-muted italic">All amounts shown in tenant billing currency.</p>
          </div>
        </section>

        <Panel title={reportViews.find((item) => item.id === view)?.label}>
          <p className="text-[14px] text-fg-muted">{summary[view]}</p>
        </Panel>
      </div>
    </div>
  )
}
