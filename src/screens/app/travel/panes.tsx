'use client'

import { useMemo, useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { currencies, reportViews } from '../../../lib/travelExpenseData'
import { Dialog, EmptyBlock, Label, Panel, Stat, inputClass } from '../../../components/EnterpriseUi'
import {
  addAmounts,
  amount,
  useCardTransactions,
  useEmployees,
  useExpenseCategories,
  useExpenseReports,
  useExpenseSummary,
  useExpenseWriting,
  useReimbursementRuns,
  useSelfEmployee,
  useTeSettings,
  useTravelRequests,
  useUnfiledExpenses,
  CARD_PAGE,
  RUN_PAGE,
  TRIP_PAGE,
  UNFILED_PAGE,
  type CardFilter,
  type Fetching,
  type ServerReport,
  type ServerTrip,
  type TripScope,
} from './useTravel'

/*
 * The server's vocabulary, rendered as it is.
 *
 * The prototype knew four report states and two trip states; the database has
 * six and eight. A state the screen had never heard of used to index these maps
 * to `undefined` and render an unstyled badge with no action beside it, which
 * is how a rejected claim looked like a bug rather than a decision.
 */
const reportTone: Record<string, string> = {
  draft: 'tone-slate',
  submitted: 'tone-amber',
  approved: 'tone-sky',
  rejected: 'tone-rose',
  reimbursed: 'tone-emerald',
  cancelled: 'tone-slate',
}

const tripTone: Record<string, string> = {
  draft: 'tone-slate',
  submitted: 'tone-amber',
  approved: 'tone-sky',
  rejected: 'tone-rose',
  booked: 'tone-violet',
  in_progress: 'tone-teal',
  completed: 'tone-emerald',
  cancelled: 'tone-slate',
}

/** `in_progress` → `In progress`; anything unrecognised prints as it arrived. */
function stateLabel(status: string) {
  const words = status.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function Badge({ status, tones }: { status: string; tones: Record<string, string> }) {
  return (
    <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${tones[status] ?? 'tone-slate'}`}>
      {stateLabel(status)}
    </span>
  )
}

/**
 * Loading, refused and failed — rendered rather than collapsed into an empty
 * list. An empty list is a statement about the workspace; a failed request is
 * a statement about the request, and the two must not look the same.
 */
export function FetchProblem({ state, what }: { state: Fetching; what: string }) {
  if (state.loading) {
    return (
      <div role="status" className="rounded-xl border border-line px-6 py-12 text-center text-[14px] text-fg-muted">
        Loading {what}…
      </div>
    )
  }
  if (!state.error) return null
  return (
    <div role="alert" className="rounded-xl border border-bad/40 bg-bad-muted/30 px-6 py-8 text-center">
      <p className="text-[15px] font-medium text-fg">
        {state.denied ? `You do not have access to ${what} in this workspace.` : `We could not load ${what}.`}
      </p>
      <p className="mt-1.5 text-[13px] text-fg-muted">{state.error.message}</p>
      {state.canRetry && (
        <div className="mt-4">
          <Button variant="secondary" onClick={state.refetch}>
            Try again
          </Button>
        </div>
      )}
      {state.error.requestId && (
        <p className="mt-3 font-mono text-[11px] text-fg-muted">Reference {state.error.requestId}</p>
      )}
    </div>
  )
}

/** A refused write. A 409 says so in its own words, so it is shown verbatim. */
export function WriteProblem({ error }: { error: { message: string } | null }) {
  if (!error) return null
  return (
    <p role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad-muted/30 px-4 py-2.5 text-[13px] text-fg">
      {error.message}
    </p>
  )
}

/** A surface with nothing behind it on this deployment, said plainly. */
export function Unavailable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <Icon name="inbox" size={26} className="mx-auto text-fg-muted" />
      <p className="mt-3 text-[15px] text-fg-2">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-fg-muted">{children}</p>
    </div>
  )
}

/**
 * A money tile, one line per currency.
 *
 * Never one number: the figure this replaces summed a dollar claim and a rupee
 * claim into a single unlabelled total. No rows at all means no claims are in
 * that state, which is said in words rather than as a currency-less zero.
 */
function MoneyStat({
  label,
  totals,
  reports,
}: {
  label: string
  totals: { currency: string; total: string }[]
  reports: number
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-[13px] text-fg-2">{label}</p>
      {totals.length ? (
        <div className="mt-2 space-y-1.5">
          {totals.map((row) => (
            <p key={row.currency} className="font-mono text-[22px] leading-none font-bold">
              {amount(row.total, row.currency)}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[26px] leading-none font-bold">None</p>
      )}
      <p className="mt-2.5 text-[12px] text-fg-muted">
        {reports} report{reports === 1 ? '' : 's'}
      </p>
    </div>
  )
}

/**
 * A list's count, from the server.
 *
 * Never a zero while the request is still out: "0 reports" and "we have not
 * asked yet" are different statements, and the first is the one that gets
 * believed.
 */
function CountLabel({ state, count, noun }: { state: Fetching; count: number; noun: string }) {
  const text = state.loading
    ? 'Counting…'
    : state.error
      ? 'count unavailable'
      : state.refreshing
        ? 'Updating…'
        : `${count} ${noun}${count === 1 ? '' : 's'}`
  return (
    <span className="text-[13px] text-fg-muted" aria-live="polite">
      {text}
    </span>
  )
}

type StatusRow = { status: string; currency: string; reports: number; total: string }

/** Per-currency totals for a set of states, kept separate all the way down. */
function totalsFor(rows: StatusRow[], statuses: string[]) {
  const wanted = rows.filter((row) => statuses.includes(row.status))
  const codes = [...new Set(wanted.map((row) => row.currency))].sort()
  return {
    totals: codes.map((code) => ({
      currency: code,
      total: addAmounts(wanted.filter((row) => row.currency === code).map((row) => row.total)),
    })),
    reports: wanted.reduce((count, row) => count + row.reports, 0),
  }
}

export function DashboardPane() {
  const summary = useExpenseSummary()
  const pendingTrips = useTravelRequests('Pending')
  const sla = useTeSettings('sla')
  const slaDays = typeof sla.value.slaDays === 'number' ? sla.value.slaDays : null

  const byStatus = summary.summary?.byStatus ?? []
  const approvedSpend = totalsFor(byStatus, ['approved', 'reimbursed'])
  const awaitingPayment = totalsFor(byStatus, ['approved'])
  const reimbursed = totalsFor(byStatus, ['reimbursed'])
  const drafts = totalsFor(byStatus, ['draft'])
  const submitted = totalsFor(byStatus, ['submitted'])

  const pipeline = [
    { label: 'Draft', statuses: ['draft'] },
    { label: 'Pending approval', statuses: ['submitted'] },
    { label: 'Approved (awaiting payment)', statuses: ['approved'] },
    { label: 'Reimbursed', statuses: ['reimbursed'] },
  ]

  /** Largest bar in each currency, so two currencies do not share a scale. */
  const categoryPeaks = useMemo(() => {
    const peaks = new Map<string, string>()
    // The server orders these largest first, so the first row seen for a
    // currency is that currency's peak.
    for (const row of summary.summary?.byCategory ?? []) {
      if (!peaks.has(row.currency)) peaks.set(row.currency, row.total)
    }
    return peaks
  }, [summary.summary])

  if (summary.loading || summary.error) return <FetchProblem state={summary} what="the dashboard figures" />

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyStat label="Approved spend" totals={approvedSpend.totals} reports={approvedSpend.reports} />
        <MoneyStat label="Pending reimbursement" totals={awaitingPayment.totals} reports={awaitingPayment.reports} />
        <MoneyStat label="Reimbursed" totals={reimbursed.totals} reports={reimbursed.reports} />
        {/* Omitted, not zeroed: with nothing yet reimbursed there is no elapsed
            time to average, and "0.0d" would read as an instant payout. */}
        {summary.summary?.turnaround && (
          <Stat
            label="Avg turnaround"
            value={`${summary.summary.turnaround.days}d`}
            sub={`submit → reimbursed, over ${summary.summary.turnaround.reports} claim${
              summary.summary.turnaround.reports === 1 ? '' : 's'
            }`}
          />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat mono label="Awaiting approval" value={String(submitted.reports)} sub="expense reports" />
        <Stat mono label="Drafts" value={String(drafts.reports)} />
        <Stat mono label="Unmatched card txns" value={String(summary.summary?.cards.unmatched ?? 0)} />
        <Stat
          mono={!pendingTrips.error && !pendingTrips.loading}
          label="Travel pending"
          value={pendingTrips.error ? 'Unavailable' : pendingTrips.loading ? '…' : String(pendingTrips.total)}
          sub={pendingTrips.error ? pendingTrips.error.message : 'awaiting a decision'}
        />
      </div>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold">Reimbursement pipeline</h2>
          {/* An unset target is not a target, and a target that could not be
              read is not an unset one. */}
          {sla.error ? (
            <p className="text-[13px] text-fg-muted">SLA target could not be loaded</p>
          ) : slaDays !== null ? (
            <p className="text-[13px] text-fg-muted">SLA {slaDays}d</p>
          ) : null}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {pipeline.map((stage) => {
            const stageTotals = totalsFor(byStatus, stage.statuses)
            return (
              <div key={stage.label} className="rounded-xl border border-line px-5 py-4">
                <p className="text-[13px] text-fg-2">{stage.label}</p>
                <p className="mt-2 font-mono text-[22px] leading-none font-bold">{stageTotals.reports}</p>
                <div className="mt-2.5 space-y-0.5">
                  {stageTotals.totals.map((row) => (
                    <p key={row.currency} className="font-mono text-[12px] text-fg-muted">
                      {amount(row.total, row.currency)}
                    </p>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <Panel title="Spend by category" blurb="Approved and reimbursed claim lines, by the category each line was filed under.">
        {summary.summary?.byCategory.length ? (
          <ul className="space-y-3">
            {summary.summary.byCategory.map((row) => (
              <li key={`${row.categoryId ?? 'none'}:${row.currency}`}>
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{row.name ?? 'No category'}</span>
                  <span className="font-mono text-fg-muted">{amount(row.total, row.currency)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${barWidth(row.total, categoryPeaks.get(row.currency))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-fg-muted">No approved spend yet.</p>
        )}
      </Panel>
    </div>
  )
}

/** A bar's share of the largest bar in the same currency, to one decimal. */
function barWidth(value: string, peak: string | undefined) {
  if (!peak) return 0
  const units = (text: string) => {
    const [whole, fraction = ''] = text.split('.')
    return BigInt(whole + fraction.slice(0, 4).padEnd(4, '0'))
  }
  const top = units(peak)
  if (top === 0n) return 0
  return Number((units(value) * 1000n) / top) / 10
}

/* -------------------------------- the claims ------------------------------ */

const PAGE_SIZE = 25

/**
 * Whose claim this is.
 *
 * Every write here names an employee and the signed-in account need not be
 * one. Rather than filing against somebody arbitrary, the screen resolves the
 * caller's own record and otherwise offers the list — and says so plainly when
 * neither is available.
 */
function useFiler() {
  const self = useSelfEmployee()
  const employees = useEmployees(!self.loading && !self.employee)
  const [chosen, setChosen] = useState('')
  const employeeId = self.employee?.id ?? (chosen || null)
  return { self, employees, employeeId, chosen, setChosen }
}

function FilerPicker({ filer }: { filer: ReturnType<typeof useFiler> }) {
  if (filer.self.loading) return <p className="text-[13px] text-fg-muted">Checking your employee record…</p>
  if (filer.self.employee) {
    return <p className="text-[13px] text-fg-muted">Filed for {filer.self.employee.fullName}.</p>
  }
  // A failed lookup is not the same answer as "you are not an employee", and
  // a list still in flight is not the same as an empty one — saying either of
  // those tells somebody their account is unlinked when nothing established it.
  if (filer.self.error) {
    return (
      <p role="alert" className="rounded-xl border border-bad/40 bg-bad-muted/30 px-4 py-3 text-[13px] text-fg">
        We could not check which employee record your account is linked to. {filer.self.error.message}
      </p>
    )
  }
  if (!filer.employees.answered && !filer.employees.error) {
    return <p className="text-[13px] text-fg-muted">Loading the people you may file for…</p>
  }
  if (filer.employees.error) {
    return (
      <p role="alert" className="rounded-xl border border-bad/40 bg-bad-muted/30 px-4 py-3 text-[13px] text-fg">
        Your account is not linked to an employee record, and the list of people could not be loaded.{' '}
        {filer.employees.error.message}
      </p>
    )
  }
  if (filer.employees.employees.length) {
    return (
      <label>
        <Label>
          Employee <span className="text-bad">*</span>
        </Label>
        <select value={filer.chosen} onChange={(event) => filer.setChosen(event.target.value)} className={inputClass}>
          <option value="">- Select a person -</option>
          {filer.employees.employees.map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName}
            </option>
          ))}
        </select>
      </label>
    )
  }
  return (
    <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13px] text-fg-muted">
      Your account is not linked to an employee record, and no employees are visible to you, so a claim cannot be
      filed from here. Ask an administrator to link your account in People.
    </p>
  )
}

export function ExpenseReportsPane() {
  const [page, setPage] = useState(0)
  const reports = useExpenseReports({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })
  const categories = useExpenseCategories()
  const filer = useFiler()
  const lines = useExpenseWriting(reports.refetch)

  const [open, setOpen] = useState<'report' | 'quick' | null>(null)
  const [adding, setAdding] = useState<ServerReport | null>(null)
  const [title, setTitle] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [value, setValue] = useState('')
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState('')

  const pageCount = Math.max(1, Math.ceil(reports.total / PAGE_SIZE))

  async function create() {
    if (!filer.employeeId) return
    const created =
      open === 'quick'
        ? await lines.quickExpense({
            employeeId: filer.employeeId,
            title: title.trim(),
            spentOn,
            amount: value.trim(),
            currency,
            categoryId: categoryId || undefined,
          })
        : await reports.openReport({ employeeId: filer.employeeId, title: title.trim(), currency })
    if (!created) return
    setTitle('')
    setValue('')
    setOpen(null)
  }

  return (
    <>
      <Panel
        title="Expense reports"
        icon="file-text"
        blurb="Group several expenses into one report - submit, approve and reimburse the whole trip once, instead of a claim per receipt. For a single one-off expense, use Quick expense. Approved claims are recorded as paid from the Reimbursements tab."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <CountLabel state={reports} count={reports.total} noun="report" />
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
        {reports.loading || reports.error ? (
          <FetchProblem state={reports} what="expense reports" />
        ) : reports.reports.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {reports.reports.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                <div className="min-w-[14rem] flex-1">
                  <p className="text-[14px] font-medium">{report.title}</p>
                  <p className="mt-0.5 font-mono text-[12px] text-fg-muted">
                    {report.reference} · {amount(report.totalAmount, report.currency)}
                  </p>
                  {report.policyFlags.length > 0 && (
                    <p className="mt-1 text-[12px] text-warn">
                      {report.policyFlags.map((flag) => flag.message).join(' ')}
                    </p>
                  )}
                </div>
                <Badge status={report.status} tones={reportTone} />
                <ReportActions
                  report={report}
                  busy={reports.writing || lines.writing}
                  onAdd={() => setAdding(report)}
                  onSubmit={() => reports.submit(report)}
                  onDecide={(decision) => reports.decide(report, decision)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock title="No expense reports yet." />
        )}
        <WriteProblem error={reports.writeError ?? lines.writeError} />

        {reports.total > PAGE_SIZE && (
          <nav aria-label="Report pagination" className="mt-4 flex items-center justify-end gap-3 text-[13px]">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="rounded-xl border border-line px-3 py-2 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <button
              disabled={page + 1 >= pageCount}
              onClick={() => setPage(page + 1)}
              className="rounded-xl border border-line px-3 py-2 disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        )}
      </Panel>

      {open && (
        <Dialog title={open === 'quick' ? 'Quick expense' : 'New expense report'} onClose={() => setOpen(null)}>
          <div className="mt-5 grid gap-4">
            <FilerPicker filer={filer} />

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
                  <Label>
                    Amount <span className="text-bad">*</span>
                  </Label>
                  <input
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className={inputClass}
                  />
                </label>
                <label>
                  <Label>Spent on</Label>
                  <input
                    type="date"
                    value={spentOn}
                    onChange={(event) => setSpentOn(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label>
                  <Label>Category</Label>
                  {categories.categories.length ? (
                    <select
                      value={categoryId}
                      onChange={(event) => setCategoryId(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">- None -</option>
                      {categories.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  ) : categories.loading ? (
                    <p className="mt-1.5 text-[13px] text-fg-muted">Loading categories…</p>
                  ) : categories.error ? (
                    /* "None are configured" is a statement about the workspace.
                       A request that failed or has not answered is a statement
                       about the request, and saying the first for the second
                       sends somebody to add categories that already exist. */
                    <p role="alert" className="mt-1.5 text-[13px] text-fg">
                      The expense categories could not be loaded, so none can be chosen here.{' '}
                      {categories.error.message}
                    </p>
                  ) : (
                    /* Categories are rows, not a list of words: policy limits and
                       ledger accounts hang off them, so an invented name here
                       would file the expense under nothing. */
                    <p className="mt-1.5 text-[13px] text-fg-muted">
                      No expense categories are configured yet. Add them in Settings → Expense policy.
                    </p>
                  )}
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

          <WriteProblem error={reports.writeError ?? lines.writeError} />

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={
                !title.trim() ||
                !filer.employeeId ||
                reports.writing ||
                lines.writing ||
                (open === 'quick' && !value.trim())
              }
              onClick={create}
            >
              {reports.writing || lines.writing ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </Dialog>
      )}

      {adding && (
        <AddExpenseDialog
          report={adding}
          onClose={() => setAdding(null)}
          onFiled={() => {
            reports.refetch()
            setAdding(null)
          }}
        />
      )}
    </>
  )
}

function ReportActions({
  report,
  busy,
  onAdd,
  onSubmit,
  onDecide,
}: {
  report: ServerReport
  busy: boolean
  onAdd: () => void
  onSubmit: () => void
  onDecide: (decision: 'approved' | 'rejected') => void
}) {
  const empty = addAmounts([report.totalAmount]) === '0.0000'

  if (report.status === 'draft' || report.status === 'rejected') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="!py-2 !text-[13px]" onClick={onAdd}>
          Add expense
        </Button>
        <Button
          variant="secondary"
          className="!py-2 !text-[13px]"
          disabled={busy || empty}
          title={empty ? 'A claim needs at least one reimbursable expense before it can be submitted.' : undefined}
          onClick={onSubmit}
        >
          Submit
        </Button>
      </div>
    )
  }
  if (report.status === 'submitted') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="!py-2 !text-[13px]" disabled={busy} onClick={() => onDecide('approved')}>
          Approve
        </Button>
        <Button variant="secondary" className="!py-2 !text-[13px]" disabled={busy} onClick={() => onDecide('rejected')}>
          Reject
        </Button>
      </div>
    )
  }
  return null
}

/** Files an already-recorded expense onto a draft claim. */
function AddExpenseDialog({
  report,
  onClose,
  onFiled,
}: {
  report: ServerReport
  onClose: () => void
  onFiled: () => void
}) {
  const unfiled = useUnfiledExpenses(report.employeeId)
  const writing = useExpenseWriting(onFiled)
  // The report is in one currency and a line converts into exactly one, so a
  // line that converts elsewhere cannot go on this claim — the server refuses
  // it, and offering it here would only produce that refusal.
  const eligible = unfiled.expenses.filter((expense) => expense.baseCurrency === report.currency)

  return (
    <Dialog title={`Add an expense to ${report.reference}`} size="xl" onClose={onClose}>
      <p className="mt-2 text-[13px] text-fg-muted">
        Expenses already recorded for this person that are not yet on a claim, in {report.currency}.
      </p>
      <div className="mt-4">
        {unfiled.loading || unfiled.error ? (
          <FetchProblem state={unfiled} what="unfiled expenses" />
        ) : eligible.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {eligible.map((expense) => (
              <li key={expense.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-24 shrink-0 font-mono text-[12px] text-fg-muted">{expense.spentOn}</span>
                <span className="min-w-[8rem] flex-1 text-[13px]">{expense.merchant ?? 'Expense'}</span>
                <span className="font-mono text-[13px]">{amount(expense.baseAmount, expense.baseCurrency)}</span>
                <Button
                  variant="secondary"
                  className="!py-2 !text-[13px]"
                  disabled={writing.writing}
                  onClick={() => writing.fileExpense(report.id, expense.id)}
                >
                  File
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock title={`Nothing unfiled in ${report.currency} for this person.`} />
        )}
        {/* A full page means there may be older ones behind it, which matters
            most when the list above looks empty for this currency. */}
        {unfiled.capped && !unfiled.loading && !unfiled.error && (
          <p className="mt-3 text-[13px] text-fg-muted">
            Only the {UNFILED_PAGE} most recent unfiled expenses were loaded; anything older is not listed here.
          </p>
        )}
      </div>
      <WriteProblem error={writing.writeError} />
    </Dialog>
  )
}

/* --------------------------------- the cards ------------------------------ */

/** The columns a statement has to carry for the server to accept a line. */
const CARD_COLUMNS: Record<string, string[]> = {
  externalRef: ['reference', 'external_ref', 'externalref', 'id', 'transaction id'],
  postedOn: ['date', 'posted_on', 'posted on', 'posted'],
  merchant: ['merchant', 'description', 'narrative'],
  amount: ['amount', 'value'],
  currency: ['currency', 'ccy'],
}

type ParsedStatement = {
  lines: { externalRef: string; postedOn: string; merchant: string; amount: string; currency: string }[]
  /** Rows under the header this parser could not read. Counted, never dropped in silence. */
  skipped: number
}

/**
 * Reads a statement CSV by its header row.
 *
 * The provider's own reference is what makes a re-import add nothing, so a file
 * without one is refused rather than imported with invented keys — which would
 * duplicate every charge on the second upload.
 */
function parseStatement(text: string): ParsedStatement | string {
  const rows = text.trim().split(/\r?\n/)
  if (rows.length < 2) return 'That file has no rows under its header.'
  const header = rows[0].split(',').map((cell) => cell.trim().replace(/^"|"$/g, '').toLowerCase())
  const index: Record<string, number> = {}
  for (const [field, aliases] of Object.entries(CARD_COLUMNS)) {
    const found = header.findIndex((cell) => aliases.includes(cell))
    if (found === -1) return `That file has no ${aliases[0]} column. Columns needed: ${Object.values(CARD_COLUMNS).map((names) => names[0]).join(', ')}.`
    index[field] = found
  }
  const body = rows.slice(1).map((row) => row.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')))
  const lines = body
    .filter((cells) => cells.length >= header.length)
    .map((cells) => ({
      externalRef: cells[index.externalRef],
      postedOn: cells[index.postedOn],
      merchant: cells[index.merchant],
      amount: cells[index.amount],
      currency: cells[index.currency],
    }))
    .filter((line) => line.externalRef && line.amount)
  /*
   * A short row, or one missing its reference or amount, is dropped here. How
   * many were dropped travels with the result: an import that reports only
   * what it stored reads as the whole statement, and the charges that never
   * arrived are the ones nobody goes looking for.
   */
  return lines.length
    ? { lines, skipped: body.length - lines.length }
    : 'No usable rows: every row needs a reference and an amount.'
}

export function CardsPane() {
  const [filter, setFilter] = useState<CardFilter>('All')
  const cards = useCardTransactions(filter)
  const [note, setNote] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [matching, setMatching] = useState<string | null>(null)

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setNote(null)
    setProblem(null)
    const reader = new FileReader()
    // A file that could not be read is said so, rather than leaving a click
    // that produced nothing at all.
    reader.onerror = () => setProblem(`${file.name} could not be read.`)
    reader.onload = async () => {
      const parsed = parseStatement(typeof reader.result === 'string' ? reader.result : '')
      if (typeof parsed === 'string') {
        setProblem(parsed)
        return
      }
      const result = await cards.importLines(parsed.lines)
      // The server's own counts: what it stored and what it already had. The
      // number of rows parsed counts a duplicate as an import. The rows this
      // parser could not read are named too, so a part-imported statement
      // cannot pass for a whole one.
      if (result) {
        setNote(
          `Imported ${result.imported} line${result.imported === 1 ? '' : 's'}; ${result.duplicates} were already on file.`,
        )
        if (parsed.skipped > 0) {
          setProblem(
            `${parsed.skipped} row${parsed.skipped === 1 ? '' : 's'} in that file could not be read — a row needs every column, including its reference and amount — and ${parsed.skipped === 1 ? 'was' : 'were'} not imported.`,
          )
        }
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Corporate card statement"
        icon="briefcase"
        blurb="Import a card statement as CSV. Each line needs the provider's own reference, which is what makes re-importing the same statement add nothing. A line is reconciled by matching it to the expense that claims it, so a card-paid expense is not reimbursed twice."
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2">
            <Icon name="file-text" size={15} /> Import statement
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
          {cards.writing && <p className="text-[13px] text-fg-muted">Importing…</p>}
          {note && <p className="text-[13px] text-fg-muted">{note}</p>}
        </div>
        {problem && (
          <p role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad-muted/30 px-4 py-2.5 text-[13px] text-fg">
            {problem}
          </p>
        )}
        <WriteProblem error={cards.writeError} />
        <p className="mt-3 text-[13px] text-fg-muted">
          Automatic matching is not available on this deployment: the server ties one card line to one expense, and
          nothing here can tell which expense a charge belongs to. Use <strong className="font-semibold text-fg">Match
          to…</strong> on a row to make the pairing yourself.
        </p>
      </Panel>

      <Panel
        title="Transactions"
        action={
          <div className="flex items-center gap-3">
            <CountLabel state={cards} count={cards.total} noun="line" />
            <select
              aria-label="Filter transactions"
              value={filter}
              onChange={(event) => setFilter(event.target.value as CardFilter)}
              className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
            >
              {(['All', 'Matched', 'Unmatched'] as const).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        }
      >
        {cards.loading || cards.error ? (
          <FetchProblem state={cards} what="card transactions" />
        ) : cards.transactions.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {cards.transactions.map((txn) => (
              <li key={txn.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <span className="w-24 shrink-0 font-mono text-[12px] text-fg-muted">{txn.postedOn}</span>
                <span className="min-w-[10rem] flex-1 text-[13px]">{txn.merchant}</span>
                <span className="font-mono text-[13px]">{amount(txn.amount, txn.currency)}</span>
                <span
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                    txn.matchedExpenseId ? 'tone-emerald' : 'tone-amber'
                  }`}
                >
                  {txn.matchedExpenseId ? 'Matched' : 'Unmatched'}
                </span>
                {!txn.matchedExpenseId && (
                  <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => setMatching(txn.id)}>
                    Match to…
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock
            title={
              filter === 'All'
                ? 'No card transactions. Import a statement to begin.'
                : `No ${filter.toLowerCase()} transactions.`
            }
          />
        )}
        {/* The count beside the filter is every matching line; these are the
            most recent page of them. */}
        {cards.total > CARD_PAGE && !cards.loading && !cards.error && (
          <p className="mt-4 text-[13px] text-fg-muted">
            Showing the {CARD_PAGE} most recently posted, of {cards.total} matching lines.
          </p>
        )}
      </Panel>

      {matching && (
        <MatchDialog
          onClose={() => setMatching(null)}
          onMatched={async (expenseId) => {
            await cards.matchTo(matching, expenseId)
            setMatching(null)
          }}
        />
      )}
    </div>
  )
}

function MatchDialog({ onClose, onMatched }: { onClose: () => void; onMatched: (expenseId: string) => void }) {
  const unfiled = useUnfiledExpenses(null)

  return (
    <Dialog title="Match this charge to an expense" size="xl" onClose={onClose}>
      <p className="mt-2 text-[13px] text-fg-muted">
        Expenses that are not yet on a claim. A charge matches one expense and an expense one charge, which is what
        stops a card-paid expense being reimbursed as well.
      </p>
      <div className="mt-4">
        {unfiled.loading || unfiled.error ? (
          <FetchProblem state={unfiled} what="expenses" />
        ) : unfiled.expenses.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {unfiled.expenses.map((expense) => (
              <li key={expense.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-24 shrink-0 font-mono text-[12px] text-fg-muted">{expense.spentOn}</span>
                <span className="min-w-[8rem] flex-1 text-[13px]">{expense.merchant ?? 'Expense'}</span>
                <span className="font-mono text-[13px]">{amount(expense.amount, expense.currency)}</span>
                <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => onMatched(expense.id)}>
                  Match
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock title="No unfiled expenses to match against." />
        )}
        {unfiled.capped && !unfiled.loading && !unfiled.error && (
          <p className="mt-3 text-[13px] text-fg-muted">
            Only the {UNFILED_PAGE} most recent unfiled expenses were loaded; anything older is not listed here.
          </p>
        )}
      </div>
    </Dialog>
  )
}

/* ----------------------------- the reimbursement -------------------------- */

const AWAITING_PAGE = 200

export function ReimbursementsPane() {
  const approved = useExpenseReports({ status: 'approved', limit: AWAITING_PAGE, offset: 0 })
  const summary = useExpenseSummary()
  const runs = useReimbursementRuns()
  const [selected, setSelected] = useState<string[]>([])

  const byCurrency = useMemo(() => {
    const groups = new Map<string, ServerReport[]>()
    for (const report of approved.reports) {
      groups.set(report.currency, [...(groups.get(report.currency) ?? []), report])
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [approved.reports])

  /* What is owed in each currency, as the server totals it — the rows below are
     a page of claims to pick from, and their sum is not the amount due. */
  const owed = new Map(
    (summary.summary?.byStatus ?? [])
      .filter((row) => row.status === 'approved')
      .map((row) => [row.currency, row]),
  )

  return (
    <div className="space-y-4">
      <Panel
        title="Approved reports awaiting reimbursement"
        icon="briefcase"
        /* "Pay" records a payment; it does not make one. Saying so is the
           difference between a claim marked reimbursed and money that left the
           business — there is no ledger posting and no bank file behind this. */
        blurb="Select approved claims and record them as paid. Marking a run is one step, not four: it records what was paid and marks those claims reimbursed, and a claim can appear in one run ever, so a repeated click pays nobody twice. A run is in one currency, so the claims are grouped by theirs. Nothing here moves money — no ledger entry is posted and no bank file is produced, so the transfer itself is still made wherever your finance team makes it."
      >
        {approved.loading || approved.error ? (
          <FetchProblem state={approved} what="approved claims" />
        ) : byCurrency.length ? (
          <div className="space-y-5">
            {byCurrency.map(([currency, rows]) => {
              const chosen = rows.filter((report) => selected.includes(report.id))
              const due = owed.get(currency)
              return (
                <section key={currency}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-[14px] font-semibold">
                      {due
                        ? `${amount(due.total, currency)} across ${due.reports} claim${due.reports === 1 ? '' : 's'}`
                        : `${currency} · total unavailable`}
                    </h3>
                    <Button
                      variant="accent"
                      disabled={!chosen.length || runs.writing}
                      onClick={async () => {
                        const paid = await runs.payRun(
                          currency,
                          chosen.map((report) => report.id),
                        )
                        if (paid) {
                          setSelected((prev) => prev.filter((id) => !chosen.some((report) => report.id === id)))
                          approved.refetch()
                          summary.refetch()
                        }
                      }}
                    >
                      Mark {chosen.length} claim{chosen.length === 1 ? '' : 's'} paid
                    </Button>
                  </div>
                  <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                    {rows.map((report) => (
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
                        <span className="font-mono text-[12px] text-fg-muted">{report.reference}</span>
                        <span className="font-mono text-[13px]">
                          {amount(report.approvedAmount ?? report.totalAmount, report.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        ) : (
          <EmptyBlock title="Nothing awaiting reimbursement." />
        )}
        {approved.total > AWAITING_PAGE && (
          <p className="mt-4 text-[13px] text-fg-muted">
            Showing the first {AWAITING_PAGE} of {approved.total} approved claims; the totals above are for all of
            them. Pay these and the rest appear here.
          </p>
        )}
        <WriteProblem error={runs.writeError} />
      </Panel>

      <Panel
        title="Reimbursement runs"
        blurb="Every payout batch, with what it actually paid."
        action={
          <CountLabel state={runs} count={runs.total} noun="run" />
        }
      >
        {runs.loading || runs.error ? (
          <FetchProblem state={runs} what="reimbursement runs" />
        ) : runs.runs.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {runs.runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                <span className="min-w-[10rem] flex-1">
                  <span className="block text-[13px] font-medium">
                    {run.reference} · {run.reports} report{run.reports === 1 ? '' : 's'}
                  </span>
                  <span className="mt-0.5 block font-mono text-[12px] text-fg-muted">
                    {amount(run.totalAmount, run.currency)}
                    {run.paidAt ? ` · paid ${run.paidAt.slice(0, 10)}` : ''}
                  </span>
                </span>
                <Badge status={run.status} tones={reportTone} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-fg-muted">No runs yet.</p>
        )}
        {runs.total > RUN_PAGE && !runs.loading && !runs.error && (
          <p className="mt-4 text-[13px] text-fg-muted">
            Showing the {RUN_PAGE} most recent, of {runs.total} runs.
          </p>
        )}
      </Panel>
    </div>
  )
}

/* -------------------------------- the travel ------------------------------ */

export function TravelPane() {
  const [scope, setScope] = useState<TripScope>('Active')
  const trips = useTravelRequests(scope)
  const filer = useFiler()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({
    purpose: '',
    destination: '',
    start: '',
    end: '',
    type: 'domestic' as 'domestic' | 'international',
    estimatedCost: '',
    currency: 'USD',
    projectCode: '',
    advance: '',
  })

  async function create() {
    if (!filer.employeeId) return
    const created = await trips.createTrip({
      employeeId: filer.employeeId,
      purpose: draft.purpose.trim() || 'Travel request',
      destination: draft.destination.trim(),
      departsOn: draft.start,
      returnsOn: draft.end,
      tripKind: draft.type,
      estimatedCost: draft.estimatedCost.trim() || undefined,
      currency: draft.estimatedCost.trim() ? draft.currency : undefined,
      projectCode: draft.projectCode.trim() || undefined,
      advanceRequested: draft.advance.trim() || undefined,
    })
    if (!created) return
    setDraft({
      purpose: '',
      destination: '',
      start: '',
      end: '',
      type: 'domestic',
      estimatedCost: '',
      currency: 'USD',
      projectCode: '',
      advance: '',
    })
    setOpen(false)
  }

  return (
    <>
      <Panel
        title="Travel requests"
        icon="link"
        /* What this pane does, and where it stops. The overlap rule is the
           server's, and the server applies it to submitted and approved trips
           only — two drafts may cover the same week until one is sent. */
        blurb="Raise a trip, submit it, and have it approved or refused. A submitted or approved request stops another covering the same dates for the same person; two drafts do not clash until one is sent. Bookings made against an approved trip are not recorded from this screen."
        action={
          <div className="flex items-center gap-3">
            <CountLabel state={trips} count={trips.total} noun="request" />
            <Button variant="accent" onClick={() => setOpen(true)}>
              + New request
            </Button>
          </div>
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

        {trips.loading || trips.error ? (
          <FetchProblem state={trips} what="travel requests" />
        ) : trips.trips.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {trips.trips.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                <div className="min-w-[14rem] flex-1">
                  <p className="text-[14px] font-medium">{request.purpose}</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">
                    {request.reference} · {request.tripKind} · {request.destination} · {request.departsOn} →{' '}
                    {request.returnsOn}
                  </p>
                </div>
                <span className="font-mono text-[13px]">{amount(request.estimatedCost, request.currency)}</span>
                <Badge status={request.status} tones={tripTone} />
                <TripActions trip={request} busy={trips.writing} trips={trips} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock title={`No ${scope === 'All' ? '' : scope.toLowerCase() + ' '}travel requests.`} />
        )}
        {/* The count above is every matching trip; this list is one page of
            them, and there is no pager, so it says which page. */}
        {trips.total > TRIP_PAGE && !trips.loading && !trips.error && (
          <p className="mt-4 text-[13px] text-fg-muted">
            Showing the {TRIP_PAGE} with the latest departure dates, of {trips.total} matching requests.
          </p>
        )}
        <WriteProblem error={trips.writeError} />
      </Panel>

      {open && (
        <Dialog title="New travel request" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <FilerPicker filer={filer} />

            <label>
              <Label>Purpose</Label>
              <input
                value={draft.purpose}
                onChange={(event) => setDraft((prev) => ({ ...prev, purpose: event.target.value }))}
                placeholder="Client visit - Mumbai"
                className={inputClass}
              />
            </label>

            <label>
              <Label>
                Destination <span className="text-bad">*</span>
              </Label>
              <input
                value={draft.destination}
                onChange={(event) => setDraft((prev) => ({ ...prev, destination: event.target.value }))}
                placeholder="Mumbai"
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
                  onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value as typeof prev.type }))}
                  className={inputClass}
                >
                  <option value="domestic">domestic</option>
                  <option value="international">international</option>
                </select>
              </label>
              <label>
                <Label>Estimated cost</Label>
                <input
                  value={draft.estimatedCost}
                  onChange={(event) => setDraft((prev) => ({ ...prev, estimatedCost: event.target.value }))}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={inputClass}
                />
              </label>
              <label>
                <Label>Currency of the estimate</Label>
                <select
                  value={draft.currency}
                  onChange={(event) => setDraft((prev) => ({ ...prev, currency: event.target.value }))}
                  className={inputClass}
                >
                  {currencies.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.symbol} {item.code} - {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Label>Advance requested</Label>
                <input
                  value={draft.advance}
                  onChange={(event) => setDraft((prev) => ({ ...prev, advance: event.target.value }))}
                  inputMode="decimal"
                  placeholder="none"
                  className={inputClass}
                />
              </label>
              <label className="sm:col-span-2">
                {/* Free text, because there is no projects table to choose from —
                    the column the server stores is a code somebody types. */}
                <Label>Project code (optional)</Label>
                <input
                  value={draft.projectCode}
                  onChange={(event) => setDraft((prev) => ({ ...prev, projectCode: event.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          <WriteProblem error={trips.writeError} />

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.start || !draft.end || !draft.destination.trim() || !filer.employeeId || trips.writing}
              onClick={create}
            >
              {trips.writing ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  )
}

function TripActions({
  trip,
  busy,
  trips,
}: {
  trip: ServerTrip
  busy: boolean
  trips: ReturnType<typeof useTravelRequests>
}) {
  if (trip.status === 'draft' || trip.status === 'rejected') {
    return (
      <Button variant="secondary" className="!py-2 !text-[13px]" disabled={busy} onClick={() => trips.submitTrip(trip)}>
        Submit
      </Button>
    )
  }
  if (trip.status === 'submitted') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="!py-2 !text-[13px]"
          disabled={busy}
          onClick={() => trips.decideTrip(trip, 'approved')}
        >
          Approve
        </Button>
        <Button
          variant="secondary"
          className="!py-2 !text-[13px]"
          disabled={busy}
          onClick={() => trips.decideTrip(trip, 'rejected')}
        >
          Reject
        </Button>
      </div>
    )
  }
  if (trip.status === 'approved' || trip.status === 'booked' || trip.status === 'in_progress') {
    return (
      <Button variant="secondary" className="!py-2 !text-[13px]" disabled={busy} onClick={() => trips.cancelTrip(trip)}>
        Cancel
      </Button>
    )
  }
  return null
}

/* ------------------------------ the other tabs ---------------------------- */

export function AgencyReviewPane() {
  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">Agency review</h2>
      <p className="mt-2 max-w-4xl text-[14px] text-fg-muted">
        Invoices a travel agency raises against this workspace, for you to accept or reject.
      </p>
      <div className="mt-6">
        <Unavailable title="Agency review is not available on this deployment">
          There is no external party model here — an agency has no account, no way to sign in and no invoice to post —
          so nothing can ever arrive in this queue. It is shown empty rather than removed because the tab is part of
          the product; it is not waiting on anything you can do.
        </Unavailable>
      </div>
    </div>
  )
}

/** One page of claims in the inbox; the trips beside them come a page at a time too. */
const INBOX_PAGE = 100

export function ApprovalInboxPane() {
  const reports = useExpenseReports({ status: 'submitted', limit: INBOX_PAGE, offset: 0 })
  const trips = useTravelRequests('Pending')
  const total = reports.total + trips.total
  // The tile counts everything waiting; the rows are one page of each. Without
  // saying so, a queue of 130 shows "130" over 100 rows and the rest look done.
  const hidden = Math.max(0, reports.total - reports.reports.length) + Math.max(0, trips.total - trips.trips.length)
  const failed = Boolean(reports.error || trips.error)
  const pending = reports.loading || trips.loading

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-4xl">
          <h2 className="flex items-center gap-2.5 text-[20px] font-bold tracking-tight">
            <Icon name="inbox" size={20} className="text-accent" />
            Approval Inbox
          </h2>
          <p className="mt-2 text-[14px] text-fg-muted">
            Expense reports and travel requests waiting on a decision. Rows disappear once you action them.
          </p>
        </div>
        {/* A count that could not be fetched is not a count of zero, so the
            tile is absent and the failure is reported underneath instead. */}
        {!failed && !pending && (
          <div className="rounded-2xl border border-line bg-surface px-7 py-4 text-center">
            <p className="text-[26px] leading-none font-bold">{total}</p>
            <p className="mt-1.5 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Pending</p>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {reports.loading || reports.error ? (
          <FetchProblem state={reports} what="expense reports awaiting approval" />
        ) : null}
        {trips.loading || trips.error ? <FetchProblem state={trips} what="travel requests awaiting approval" /> : null}

        {!reports.loading && !reports.error && !trips.loading && !trips.error ? (
          total ? (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {reports.reports.map((report) => (
                <li key={report.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <span className="min-w-0 flex-1 text-[13px]">{report.title}</span>
                  <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-amber">Expense report</span>
                  <span className="font-mono text-[13px]">{amount(report.totalAmount, report.currency)}</span>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="!py-2 !text-[13px]"
                      disabled={reports.writing}
                      onClick={() => reports.decide(report, 'approved')}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      className="!py-2 !text-[13px]"
                      disabled={reports.writing}
                      onClick={() => reports.decide(report, 'rejected')}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
              {trips.trips.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <span className="min-w-0 flex-1 text-[13px]">{request.purpose}</span>
                  <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-sky">Travel request</span>
                  <span className="font-mono text-[13px]">{amount(request.estimatedCost, request.currency)}</span>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="!py-2 !text-[13px]"
                      disabled={trips.writing}
                      onClick={() => trips.decideTrip(request, 'approved')}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      className="!py-2 !text-[13px]"
                      disabled={trips.writing}
                      onClick={() => trips.decideTrip(request, 'rejected')}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyBlock icon="inbox" title="Nothing waiting on you right now." />
          )
        ) : null}
        {hidden > 0 && !reports.loading && !trips.loading && !reports.error && !trips.error && (
          <p className="text-[13px] text-fg-muted">
            {hidden} more {hidden === 1 ? 'item is' : 'items are'} waiting and not listed here. Action these and the
            rest appear.
          </p>
        )}
        <WriteProblem error={reports.writeError ?? trips.writeError} />
      </div>
    </div>
  )
}

export function ReportsPane() {
  const [view, setView] = useState<string>('spend')
  // Read the clock once, lazily, inside the initialiser: calling it during
  // render gives a different default on every re-render.
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [from, setFrom] = useState(() => new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10))

  const summary = useExpenseSummary({ from, to })
  const runs = useReimbursementRuns({ from, to })
  const sla = useTeSettings('sla')
  const slaDays = typeof sla.value.slaDays === 'number' ? sla.value.slaDays : null

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
            {/* The range is a query parameter, so it narrows the figures below
                rather than filtering whatever page happened to be loaded. */}
            <p className="ml-auto text-[12px] text-fg-muted italic">Claims raised between these dates.</p>
          </div>
        </section>

        <Panel title={reportViews.find((item) => item.id === view)?.label}>
          {view === 'agency' ? (
            <Unavailable title="Agency billing is not available on this deployment">
              No agency can raise an invoice here, so there is no billing pipeline to report on.
            </Unavailable>
          ) : summary.loading || summary.error ? (
            <FetchProblem state={summary} what="these figures" />
          ) : view === 'spend' ? (
            <SpendView rows={summary.summary?.byStatus ?? []} />
          ) : view === 'top' ? (
            <TopSpendersView rows={summary.summary?.byEmployee ?? []} />
          ) : view === 'sla' ? (
            <SlaView rows={summary.summary?.byStatus ?? []} slaDays={slaDays} slaFailed={Boolean(sla.error)} />
          ) : (
            <PipelineView runs={runs} />
          )}
        </Panel>
      </div>
    </div>
  )
}

function SpendView({ rows }: { rows: StatusRow[] }) {
  if (!rows.length) return <p className="text-[14px] text-fg-muted">No claims were raised in this range.</p>
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {rows.map((row) => (
        <li key={`${row.status}:${row.currency}`} className="flex flex-wrap items-center gap-4 px-4 py-3 text-[13px]">
          <span className="min-w-[8rem] flex-1">{stateLabel(row.status)}</span>
          <span className="text-fg-muted">
            {row.reports} report{row.reports === 1 ? '' : 's'}
          </span>
          <span className="font-mono">{amount(row.total, row.currency)}</span>
        </li>
      ))}
    </ul>
  )
}

function TopSpendersView({
  rows,
}: {
  rows: { employeeId: string; name: string; currency: string; reports: number; total: string }[]
}) {
  return (
    <div className="space-y-4">
      {rows.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {rows.map((row) => (
            <li key={`${row.employeeId}:${row.currency}`} className="flex flex-wrap items-center gap-4 px-4 py-3 text-[13px]">
              <span className="min-w-[10rem] flex-1">{row.name}</span>
              <span className="text-fg-muted">
                {row.reports} claim{row.reports === 1 ? '' : 's'}
              </span>
              <span className="font-mono">{amount(row.total, row.currency)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-fg-muted">Nobody claimed anything in this range.</p>
      )}
      <p className="text-[13px] text-fg-muted">
        Ranked by what each person actually claimed. Projects and agencies are not ranked here: a project is a free-text
        code with no register behind it, and no agency can raise anything against this workspace.
      </p>
    </div>
  )
}

function SlaView({ rows, slaDays, slaFailed }: { rows: StatusRow[]; slaDays: number | null; slaFailed: boolean }) {
  const waiting = totalsFor(rows, ['submitted'])
  return (
    <div className="space-y-3">
      <p className="text-[14px]">
        {waiting.reports} report{waiting.reports === 1 ? '' : 's'} raised in this range {waiting.reports === 1 ? 'is' : 'are'}{' '}
        waiting on an approver.
      </p>
      {waiting.totals.map((row) => (
        <p key={row.currency} className="font-mono text-[13px] text-fg-muted">
          {amount(row.total, row.currency)} claimed
        </p>
      ))}
      <p className="text-[13px] text-fg-muted">
        {slaFailed
          ? 'The reimbursement SLA could not be read, so there is no target shown here.'
          : slaDays === null
            ? 'No reimbursement SLA has been set for this workspace, so there is no target to measure against.'
            : `The workspace target is ${slaDays} days from approval to disbursement.`}
      </p>
    </div>
  )
}

function PipelineView({ runs }: { runs: ReturnType<typeof useReimbursementRuns> }) {
  if (runs.loading || runs.error) return <FetchProblem state={runs} what="reimbursement runs" />
  if (!runs.runs.length) return <p className="text-[14px] text-fg-muted">No payout runs in this range.</p>
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {runs.runs.map((run) => (
        <li key={run.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-[13px]">
          <span className="min-w-[8rem] flex-1 font-mono">{run.reference}</span>
          <span className="text-fg-muted">
            {run.reports} report{run.reports === 1 ? '' : 's'}
          </span>
          <span className="font-mono">{amount(run.totalAmount, run.currency)}</span>
          <Badge status={run.status} tones={reportTone} />
        </li>
      ))}
    </ul>
  )
}
