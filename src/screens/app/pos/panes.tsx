'use client'

import { useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { useAuth } from '../../../lib/auth'
import { months, posReportTabs, quoteStatuses, toleranceActions } from '../../../lib/posData'
import { Dialog, Label, inputClass } from '../../../components/EnterpriseUi'
import { Bar, DocListPane, Empty, Failure, Loading, NotAvailable, PageHead, Select, Stat, WriteError } from './parts'
import {
  absAmount,
  addAmounts,
  barPercent,
  commitCustomerImport,
  compareAmounts,
  createReturn,
  customerExportUrl,
  daysAgo,
  displayStatus,
  divideAmount,
  isAmount,
  isoDay,
  maxAmount,
  money,
  negateAmount,
  rollupCount,
  rollupValue,
  runSubscriptionSweep,
  scheduleSubscriptionPeriods,
  stageCustomerImport,
  useAging,
  useCustomerGroups,
  useMatchPolicy,
  useOrderToCash,
  useRateContracts,
  useReturnableLines,
  useRevenue,
  useSalesCustomers,
  useSalesDocuments,
  useShifts,
  useTopDebtors,
  useVarianceReport,
  useWorkspaceCurrency,
  type CommitResult,
  type SalesDocumentRow,
  type StageResult,
} from './usePos'

const today = () => isoDay(new Date())

/**
 * The aging buckets that are NOT late, as the report labels them.
 *
 * Named the other way round on purpose: a bucket the server adds later is
 * overdue by default, which is the safer way to be wrong about it.
 */
const NOT_OVERDUE = ['Current', 'Not due']

/** The two buckets the "aged over 60 days" figure covers. */
const AGED_BUCKETS = ['61–90', '90+']

/* ------------------------------- dashboard -------------------------------- */

export function PosDashboard() {
  const [period, setPeriod] = useState('30d')
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
  const from = daysAgo(days)
  const to = today()

  const year = new Date().getFullYear()
  const revenue = useRevenue(from, to, 'day')
  const thisYear = useRevenue(`${year}-01-01`, `${year}-12-31`, 'month')
  const lastYear = useRevenue(`${year - 1}-01-01`, `${year - 1}-12-31`, 'month')
  const funnel = useOrderToCash(from, to)
  const aging = useAging()
  const debtors = useTopDebtors(5)
  const invoices = useSalesDocuments({ kind: 'invoice', limit: 1 })
  const returns = useSalesDocuments({ kind: 'return', limit: 1 })

  const buckets = aging.data?.buckets ?? []
  const overdue = buckets.filter((bucket) => !NOT_OVERDUE.includes(bucket.label))
  const overdueTotal = addAmounts(...overdue.map((bucket) => bucket.amount))
  const overdueCount = overdue.reduce((sum, bucket) => sum + bucket.count, 0)
  const openCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

  const average = revenue.data && revenue.data.invoices > 0 ? divideAmount(revenue.data.total, revenue.data.invoices) : null
  const returned = rollupValue(returns.byStatus)

  const stages = funnel.data
    ? [
        { label: 'Quoted', amount: funnel.data.quoted },
        { label: 'Ordered', amount: funnel.data.ordered },
        { label: 'Delivered', amount: funnel.data.delivered },
        { label: 'Invoiced', amount: funnel.data.invoiced },
        { label: 'Collected', amount: funnel.data.collected },
      ]
    : []
  const stageMax = maxAmount(...stages.map((stage) => stage.amount))

  const monthly = months.map((_, index) => {
    const match = thisYear.data?.buckets.find((bucket) => Number(bucket.bucket.slice(5, 7)) === index + 1)
    return match?.amount ?? '0'
  })
  const monthMax = maxAmount(...monthly)

  return (
    <div>
      <PageHead title="Sales overview" blurb="Trade, pipeline and receivables at a glance." />

      <div className="mt-5 flex items-center gap-2">
        <span className="text-[13px] text-fg-2">Period</span>
        {['7d', '30d', '90d'].map((item) => (
          <button
            key={item}
            onClick={() => setPeriod(item)}
            aria-pressed={period === item}
            className={`rounded-lg px-3 py-1.5 text-[13px] transition ${
              period === item ? 'bg-surface-2 font-medium text-fg' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={`Invoiced (${period})`}
          currency={revenue.data?.currency ?? undefined}
          value={revenue.data ? money(revenue.data.total, null) : '—'}
          sub={
            revenue.loading
              ? 'Loading…'
              : revenue.data
                ? `${revenue.data.invoices} posted invoice${revenue.data.invoices === 1 ? '' : 's'}`
                : 'Not available'
          }
        />
        <Stat
          label="Average invoice"
          currency={average ? (revenue.data?.currency ?? undefined) : undefined}
          value={average ? money(average, null) : '—'}
          sub={average ? 'Across the period' : 'Nothing invoiced in this period'}
        />
        <Stat
          label="AR outstanding"
          currency={aging.data?.currency ?? undefined}
          value={aging.data ? money(aging.data.total, null) : '—'}
          sub={aging.data ? `${openCount} open invoice${openCount === 1 ? '' : 's'}` : 'Not available'}
        />
        <Stat
          label="Overdue"
          currency={aging.data?.currency ?? undefined}
          value={aging.data ? money(overdueTotal, null) : '—'}
          sub={aging.data ? (overdueCount ? `${overdueCount} past due` : 'Nothing past due') : 'Not available'}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_22rem]">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[17px] font-semibold">Invoiced revenue</h2>
          <p className="mt-1 text-[13px] text-fg-muted">Daily posted invoice value over the last {days} days</p>
          {revenue.loading ? (
            <p className="py-24 text-center text-[14px] text-fg-muted">Loading…</p>
          ) : revenue.error ? (
            <div className="mt-5">
              <Failure
                what="revenue"
                error={revenue.error}
                denied={revenue.denied}
                canRetry={revenue.canRetry}
                onRetry={revenue.refetch}
              />
            </div>
          ) : revenue.data?.buckets.length ? (
            <>
              <div className="mt-6 flex h-32 items-end gap-1">
                {revenue.data.buckets.map((bucket) => (
                  <div
                    key={bucket.bucket}
                    title={`${bucket.bucket} · ${money(bucket.amount, revenue.data?.currency ?? null)}`}
                    className="flex-1 rounded-t bg-accent"
                    style={{
                      height: `${Math.max(4, barPercent(bucket.amount, maxAmount(...revenue.data!.buckets.map((item) => item.amount))))}%`,
                    }}
                  />
                ))}
              </div>
              <p className="mt-4 text-center font-mono text-[18px] font-bold">
                {money(revenue.data.total, revenue.data.currency)}
              </p>
              {revenue.data.otherCurrencies.length > 0 && (
                <p className="mt-2 text-center text-[12px] text-fg-muted">
                  {revenue.data.otherCurrencies.join(', ')} invoices are not included — amounts are never converted.
                </p>
              )}
            </>
          ) : (
            <p className="py-24 text-center text-[14px] text-fg-muted">No invoices posted in this period</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[17px] font-semibold">Order to cash</h2>
          <p className="mt-1 text-[13px] text-fg-muted">Posted value at each stage over the last {days} days</p>
          {funnel.loading ? (
            <p className="py-20 text-center text-[14px] text-fg-muted">Loading…</p>
          ) : funnel.error ? (
            <div className="mt-5">
              <Failure
                what="the order-to-cash funnel"
                error={funnel.error}
                denied={funnel.denied}
                canRetry={funnel.canRetry}
                onRetry={funnel.refetch}
              />
            </div>
          ) : (
            <ul className="mt-5 space-y-4">
              {stages.map((stage) => (
                <li key={stage.label}>
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span>{stage.label}</span>
                    <span className="text-fg-muted">{money(stage.amount, funnel.data?.currency ?? null)}</span>
                  </div>
                  <Bar value={barPercent(stage.amount, stageMax)} max={100} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold">Sales — {year}</h2>
            <p className="mt-1 text-[13px] text-fg-muted">
              {year}-01-01 to {year}-12-31, by calendar month
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-4">
          <Stat
            label={`Invoiced ${year}`}
            currency={thisYear.data?.currency ?? undefined}
            value={thisYear.data ? money(thisYear.data.total, null) : '—'}
            sub={thisYear.data ? `${thisYear.data.invoices} invoices` : 'Not available'}
          />
          <YearOnYear
            current={thisYear.data?.total}
            previous={lastYear.data?.total}
            loading={thisYear.loading || lastYear.loading}
            year={year - 1}
          />
          <Stat
            label="Still outstanding"
            currency={aging.data?.currency ?? undefined}
            value={aging.data ? money(aging.data.total, null) : '—'}
            sub={aging.data ? `As at ${aging.data.asOf}` : 'Not available'}
          />
          <Stat
            label="Returns and credits"
            currency={returns.loaded && returned.currencies.length === 1 ? returned.currencies[0] : undefined}
            value={
              returns.loaded
                ? returned.currencies.length > 1
                  ? 'Several currencies'
                  : money(returned.total, null)
                : '—'
            }
            sub={returns.loaded ? `${returns.total} raised` : 'Not available'}
          />
        </div>

        <div className="mt-6 flex items-end gap-2">
          {monthly.map((amount, index) => (
            <div key={months[index]} className="flex flex-1 flex-col items-center gap-2">
              <div
                className={`w-full rounded-t ${compareAmounts(amount, '0') > 0 ? 'bg-accent' : 'bg-surface-2'}`}
                style={{ height: `${Math.max(8, (barPercent(amount, monthMax) * 120) / 100)}px` }}
                title={`${months[index]} · ${money(amount, thisYear.data?.currency ?? null)}`}
              />
              <span
                className={`text-[11px] ${
                  index === new Date().getMonth() ? 'font-semibold text-fg' : 'text-fg-muted'
                }`}
              >
                {months[index]}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[17px] font-semibold">AR aging</h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            {aging.data ? `${openCount} unpaid, as at ${aging.data.asOf}` : 'Receivables by how late each invoice is'}
          </p>
          {aging.loading ? (
            <p className="py-16 text-center text-[14px] text-fg-muted">Loading…</p>
          ) : aging.error ? (
            <div className="mt-5">
              <Failure
                what="the aging report"
                error={aging.error}
                denied={aging.denied}
                canRetry={aging.canRetry}
                onRetry={aging.refetch}
              />
            </div>
          ) : (
            <ul className="mt-5 space-y-3">
              {buckets.map((bucket) => (
                <li key={bucket.label}>
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span>{bucket.label}</span>
                    <span className="text-fg-muted">{money(bucket.amount, aging.data?.currency ?? null)}</span>
                  </div>
                  <Bar value={barPercent(bucket.amount, maxAmount(...buckets.map((item) => item.amount)))} max={100} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[17px] font-semibold">Invoices by status</h2>
          <p className="mt-1 text-[13px] text-fg-muted">Every invoice on the book, counted by the server</p>
          {invoices.loading ? (
            <p className="py-16 text-center text-[14px] text-fg-muted">Loading…</p>
          ) : invoices.error ? (
            <div className="mt-5">
              <Failure
                what="invoices"
                error={invoices.error}
                denied={invoices.denied}
                canRetry={invoices.canRetry}
                onRetry={invoices.refetch}
              />
            </div>
          ) : invoices.byStatus.length ? (
            <ul className="mt-5 space-y-3">
              {invoices.byStatus.map((row) => (
                <li key={row.status} className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{displayStatus(row.status)}</span>
                  <span className="text-fg-muted">{row.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-16 text-center text-[14px] text-fg-muted">No invoices yet</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[17px] font-semibold">Who owes the most</h2>
          <p className="mt-1 text-[13px] text-fg-muted">By outstanding balance</p>
          {debtors.loading ? (
            <p className="py-16 text-center text-[14px] text-fg-muted">Loading…</p>
          ) : debtors.error ? (
            <div className="mt-5">
              <Failure
                what="the debtor list"
                error={debtors.error}
                denied={debtors.denied}
                canRetry={debtors.canRetry}
                onRetry={debtors.refetch}
              />
            </div>
          ) : debtors.data?.debtors.length ? (
            <ul className="mt-5 space-y-3">
              {debtors.data.debtors.map((debtor) => (
                <li key={debtor.customerId} className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{debtor.name}</span>
                  <span className="font-mono text-fg-muted">{money(debtor.outstanding, debtor.currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-16 text-center text-[14px] text-fg-muted">Everyone is settled up</p>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * Trade against the same window a year ago.
 *
 * Omitted rather than filled in: with nothing invoiced last year there is no
 * comparison to make, and the tile that used to sit here asserted "no trade a
 * year ago" without ever having asked.
 */
function YearOnYear({
  current,
  previous,
  loading,
  year,
}: {
  current: string | undefined
  previous: string | undefined
  loading: boolean
  year: number
}) {
  if (loading) return <Stat label={`vs ${year}`} value="—" sub="Loading…" />
  if (current === undefined || previous === undefined) {
    return <Stat label={`vs ${year}`} value="—" sub="Not available" />
  }
  if (compareAmounts(previous, '0') === 0) {
    return <Stat label={`vs ${year}`} value="—" sub={`Nothing invoiced in ${year}`} />
  }
  const change = addAmounts(current, negateAmount(previous))
  const direction = compareAmounts(change, '0')
  return (
    <Stat
      label={`vs ${year}`}
      value={`${direction > 0 ? '+' : ''}${money(change, null)}`}
      sub={`${year} total ${money(previous, null)}`}
    />
  )
}

/* -------------------------------- customers ------------------------------- */

export function CustomersPane() {
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [open, setOpen] = useState(false)
  const [importing, setImporting] = useState(false)

  const customers = useSalesCustomers({ q: query, activeOnly: !showInactive, limit: 50 })

  return (
    <div>
      <PageHead
        title="Customers"
        blurb="Master directory for billing, credit risk, and AR aging."
        actions={
          <>
            <a
              href={customerExportUrl}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
            >
              <Icon name="download" size={15} /> Export
            </a>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Icon name="download" size={15} className="rotate-180" /> Import
            </Button>
            <Button variant="accent" onClick={() => setOpen(true)}>
              + New customer
            </Button>
          </>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-5">
        <span className="relative min-w-[18rem] flex-1">
          <Icon name="search" size={15} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, tax ID..."
            aria-label="Search customers"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-10 text-[14px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </span>
        <label className="flex items-center gap-2.5 text-[14px] text-fg-2">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Show inactive
        </label>
        <span className="text-[13px] text-fg-muted" aria-live="polite">
          {customers.loading
            ? 'Counting…'
            : customers.error
              ? 'Count unavailable'
              : customers.refreshing
                ? 'Updating…'
                : `${customers.total} matching`}
        </span>
      </div>

      <div className="mt-5">
        {customers.loading ? (
          <Loading what="customers" />
        ) : customers.error ? (
          <Failure
            what="customers"
            error={customers.error}
            denied={customers.denied}
            canRetry={customers.canRetry}
            onRetry={customers.refetch}
          />
        ) : customers.customers.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {customers.customers.map((customer) => (
              <li key={customer.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                <span className="min-w-[12rem] flex-1">
                  <span className="block text-[14px] font-medium">{customer.name}</span>
                  <span className="mt-0.5 block text-[12px] text-fg-muted">
                    {customer.email || 'No email'}
                    {customer.taxId ? ` · ${customer.taxId}` : ''}
                    {customer.groupName ? ` · ${customer.groupName}` : ''}
                  </span>
                </span>
                <span className="text-[12px] text-fg-muted">{customer.currency}</span>
                {!customer.active && (
                  <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-slate">Inactive</span>
                )}
              </li>
            ))}
          </ul>
        ) : query ? (
          <Empty title="No customers match that search." />
        ) : (
          <Empty
            title="No customers yet."
            hint={
              <>
                Click <strong className="font-semibold text-fg-2">New customer</strong> to create the first one.
              </>
            }
          />
        )}
      </div>

      {open && <NewCustomerDialog customers={customers} onClose={() => setOpen(false)} />}
      {importing && (
        <ImportCustomersDialog
          onClose={() => setImporting(false)}
          onImported={() => {
            customers.refetch()
            setImporting(false)
          }}
        />
      )}
    </div>
  )
}

function NewCustomerDialog({
  customers,
  onClose,
}: {
  customers: ReturnType<typeof useSalesCustomers>
  onClose: () => void
}) {
  const workspaceCurrency = useWorkspaceCurrency()
  const groups = useCustomerGroups()
  const [draft, setDraft] = useState({ name: '', email: '', taxId: '', groupId: '' })
  const [currency, setCurrency] = useState(workspaceCurrency ?? '')

  return (
    <Dialog title="New customer" onClose={onClose}>
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
          <Label>Email</Label>
          <input
            value={draft.email}
            onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
            className={inputClass}
          />
        </label>
        <label>
          <Label>Tax ID</Label>
          <input
            value={draft.taxId}
            onChange={(event) => setDraft((prev) => ({ ...prev, taxId: event.target.value }))}
            className={inputClass}
          />
        </label>
        <label>
          <Label>Billing currency</Label>
          <input
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            maxLength={3}
            placeholder={workspaceCurrency ?? 'USD'}
            className={inputClass}
          />
          <span className="mt-1.5 block text-[12px] text-fg-muted">
            Every document for this customer is raised in this currency. Defaults to the workspace currency.
          </span>
        </label>
        <label>
          <Label>Group</Label>
          {groups.rows.length ? (
            <select
              value={draft.groupId}
              onChange={(event) => setDraft((prev) => ({ ...prev, groupId: event.target.value }))}
              className={inputClass}
            >
              <option value="">No group</option>
              {groups.rows.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-1.5 text-[12px] text-fg-muted">
              No customer groups yet. Create them under Settings › Customer groups.
            </p>
          )}
        </label>
        {Object.entries(customers.fieldErrors).map(([field, message]) => (
          <p key={field} className="text-[13px] text-bad" role="alert">
            {message}
          </p>
        ))}
        <WriteError error={customers.writeError} />
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="accent"
          disabled={!draft.name.trim() || currency.trim().length !== 3 || customers.writing}
          onClick={async () => {
            const created = await customers.createCustomer({
              name: draft.name.trim(),
              currency: currency.trim(),
              email: draft.email.trim(),
              taxId: draft.taxId.trim(),
              groupId: draft.groupId,
            })
            if (created) onClose()
          }}
        >
          {customers.writing ? 'Saving…' : 'Create customer'}
        </Button>
      </div>
    </Dialog>
  )
}

/**
 * CSV import, staged before it writes.
 *
 * Staging parses the whole file and reports every problem with its line number
 * without writing anything; the commit is a second, deliberate request. The
 * browser-side loop this replaces created a customer per line with no
 * validation and no way to see what it had refused.
 */
function ImportCustomersDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState('')
  const [staged, setStaged] = useState<StageResult | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That file could not be imported.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Import customers" onClose={onClose}>
      <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
        A CSV with the columns <span className="font-mono">Name</span>, <span className="font-mono">Code</span>,{' '}
        <span className="font-mono">Currency</span>, <span className="font-mono">Credit limit</span>,{' '}
        <span className="font-mono">Payment terms (days)</span> and <span className="font-mono">Tax ID</span>. The file
        is checked in full before anything is written.
      </p>

      <label className="mt-5 block">
        <Label>File</Label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0]
            setStaged(null)
            setResult(null)
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              const content = typeof reader.result === 'string' ? reader.result : ''
              setText(content)
              void run(async () => setStaged(await stageCustomerImport(content)))
            }
            reader.readAsText(file)
          }}
          className="mt-2 w-full text-[13px]"
        />
      </label>

      {error && (
        <p role="alert" className="mt-4 text-[13px] text-bad">
          {error}
        </p>
      )}

      {staged && !result && (
        <div className="mt-5 rounded-xl border border-line px-4 py-3 text-[13px]">
          <p>
            {staged.ready} of {staged.total} row{staged.total === 1 ? '' : 's'} are ready to import.
          </p>
          {staged.problems.length > 0 && (
            <ul className="mt-3 space-y-1 text-[12px] text-bad">
              {staged.problems.slice(0, 10).map((problem) => (
                <li key={`${problem.line}-${problem.message}`}>
                  Line {problem.line}: {problem.message}
                </li>
              ))}
              {staged.problems.length > 10 && <li>…and {staged.problems.length - 10} more.</li>}
            </ul>
          )}
        </div>
      )}

      {result && (
        <p className="mt-5 text-[13px]">
          Imported {result.created} customer{result.created === 1 ? '' : 's'}.
          {result.failed.length > 0 && ` ${result.failed.length} row(s) were refused.`}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {staged && !result && (
          <Button
            variant="accent"
            disabled={busy || staged.ready === 0}
            onClick={() =>
              void run(async () => {
                // A file with any bad row is refused whole unless the person
                // has seen the problems and asked to import the rest anyway.
                const committed = await commitCustomerImport(text, staged.problems.length > 0)
                setResult(committed)
                onImported()
              })
            }
          >
            {busy ? 'Importing…' : `Import ${staged.ready} row${staged.ready === 1 ? '' : 's'}`}
          </Button>
        )}
      </div>
    </Dialog>
  )
}

/* ------------------------------- quotations ------------------------------- */

export function QuotationsPane() {
  const [status, setStatus] = useState<string>('All')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const quotes = useSalesDocuments({ kind: 'quotation', status, q: query, limit: 50 })
  const pipeline = rollupValue(quotes.byStatus)
  const openValue = rollupValue(quotes.byStatus, ['draft', 'sent'])
  const won = rollupCount(quotes.byStatus, ['accepted', 'ordered'])
  const decided = won + rollupCount(quotes.byStatus, ['rejected'])
  const totalQuotes = rollupCount(quotes.byStatus)

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total quotes" value={quotes.loaded ? String(totalQuotes) : '—'} />
        <Stat
          label="Pipeline value"
          currency={quotes.loaded && pipeline.currencies.length === 1 ? pipeline.currencies[0] : undefined}
          value={
            !quotes.loaded
              ? '—'
              : pipeline.currencies.length > 1
                ? 'Several currencies'
                : money(pipeline.total, null)
          }
          sub={pipeline.currencies.length > 1 ? pipeline.currencies.join(', ') : undefined}
        />
        {/* 0 of 0 is not a win rate. Until something has been decided there is
            nothing to measure, and printing "0.0%" asserts that there is. */}
        <Stat
          label="Win rate"
          value={decided ? `${Math.round((won / decided) * 100)}%` : '—'}
          sub={decided ? `of ${decided} decided` : 'No quotation decided yet'}
        />
        <Stat
          label="Open (draft + sent)"
          currency={quotes.loaded && openValue.currencies.length === 1 ? openValue.currencies[0] : undefined}
          value={
            !quotes.loaded
              ? '—'
              : openValue.currencies.length > 1
                ? 'Several currencies'
                : money(openValue.total, null)
          }
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {quoteStatuses.map((item) => (
          <button
            key={item}
            onClick={() => setStatus(item)}
            aria-pressed={status === item}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
              status === item ? 'bg-accent-muted font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {item}
          </button>
        ))}
        <span className="relative ml-auto">
          <Icon name="search" size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search quotation number..."
            aria-label="Search quotations"
            className="w-56 rounded-xl border border-line bg-surface py-2 pr-3 pl-9 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </span>
        <Button variant="accent" onClick={() => setOpen(true)}>
          + New quotation
        </Button>
      </div>

      <WriteError error={quotes.writeError} />

      <div className="mt-5">
        {quotes.loading ? (
          <Loading what="quotations" />
        ) : quotes.error ? (
          <Failure
            what="quotations"
            error={quotes.error}
            denied={quotes.denied}
            canRetry={quotes.canRetry}
            onRetry={quotes.refetch}
          />
        ) : quotes.documents.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {quotes.documents.map((quote) => (
              <li key={quote.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                <span className="w-24 shrink-0 font-mono text-[12px] text-fg-muted">{quote.reference}</span>
                <span className="min-w-[10rem] flex-1 text-[14px] font-medium">
                  {quote.customerName ?? 'No customer'}
                </span>
                <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-sky">
                  {displayStatus(quote.status)}
                </span>
                <span className="font-mono text-[13px]">{money(quote.grandTotal, quote.currency)}</span>
              </li>
            ))}
          </ul>
        ) : query || status !== quoteStatuses[0] ? (
          // The list being empty under a filter says nothing about whether any
          // quotation exists, so it must not be reported as though it did.
          <Empty title="No quotation matches these filters." />
        ) : (
          <Empty icon="file-text" title="No quotations yet. Create your first priced proposal." />
        )}
      </div>

      {open && <NewQuotationDialog quotes={quotes} onClose={() => setOpen(false)} />}
    </div>
  )
}

function NewQuotationDialog({
  quotes,
  onClose,
}: {
  quotes: ReturnType<typeof useSalesDocuments>
  onClose: () => void
}) {
  const customers = useSalesCustomers({ activeOnly: true, limit: 200 })
  const [customerId, setCustomerId] = useState('')
  const [title, setTitle] = useState('')
  const [total, setTotal] = useState('')
  const selected = customers.customers.find((customer) => customer.id === customerId)

  return (
    <Dialog title="New quotation" onClose={onClose}>
      {customers.loading ? (
        <p className="mt-5 text-[14px] text-fg-muted">Loading customers…</p>
      ) : !customers.customers.length ? (
        <p className="mt-5 text-[14px] leading-relaxed text-fg-muted">
          There are no customers yet. A quotation is priced in its customer&apos;s currency, so create one on the
          Customers page first.
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Customer</Label>
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={inputClass}>
                <option value="">Select a customer…</option>
                {customers.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} · {customer.currency}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label>Title</Label>
              <input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} />
            </label>
            <label>
              <Label>Amount{selected ? ` (${selected.currency})` : ''}</Label>
              <input
                inputMode="decimal"
                value={total}
                onChange={(event) => setTotal(event.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
              <span className="mt-1.5 block text-[12px] leading-relaxed text-fg-muted">
                The quotation is created with a single line for this amount. Line-by-line pricing is not available on
                this screen.
              </span>
            </label>
            <WriteError error={quotes.writeError} />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!selected || !total.trim() || quotes.writing}
              onClick={async () => {
                if (!selected) return
                const created = await quotes.createDocument({
                  customerId: selected.id,
                  currency: selected.currency,
                  status: 'Draft',
                  description: title.trim() || 'Quotation',
                  total: total.trim(),
                })
                if (created) onClose()
              }}
            >
              {quotes.writing ? 'Saving…' : 'Create quotation'}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  )
}

/* ----------------------------- rate contracts ----------------------------- */

export function RateContractsPane() {
  const contracts = useRateContracts()
  const [open, setOpen] = useState(false)

  return (
    <div>
      <PageHead
        title="Rate contracts"
        blurb="Negotiated rates with a committed volume and a term. A contract rate overrides the price list, so what is agreed is what gets invoiced."
        actions={
          <Button variant="accent" onClick={() => setOpen(true)}>
            + New contract
          </Button>
        }
      />

      <div className="mt-5">
        {contracts.loading ? (
          <Loading what="rate contracts" />
        ) : contracts.error ? (
          <Failure
            what="rate contracts"
            error={contracts.error}
            denied={contracts.denied}
            canRetry={contracts.canRetry}
            onRetry={contracts.refetch}
          />
        ) : contracts.contracts.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {contracts.contracts.map((contract) => (
              <li key={contract.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                <span className="w-28 shrink-0 font-mono text-[12px] text-fg-muted">{contract.reference}</span>
                <span className="min-w-[10rem] flex-1 text-[14px]">
                  {contract.lines.length} rate{contract.lines.length === 1 ? '' : 's'} · from {contract.validFrom}
                  {contract.validTo ? ` to ${contract.validTo}` : ' — no end date'}
                </span>
                <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-sky">
                  {displayStatus(contract.status)}
                </span>
                <span className="text-[12px] text-fg-muted">{contract.currency}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            icon="file-text"
            title="No rate contracts yet"
            hint="A rate contract holds an agreed rate, a committed volume and a term. Until one exists, every customer is invoiced from the price list."
          />
        )}
      </div>

      {open && <NewContractDialog contracts={contracts} onClose={() => setOpen(false)} />}
    </div>
  )
}

function NewContractDialog({
  contracts,
  onClose,
}: {
  contracts: ReturnType<typeof useRateContracts>
  onClose: () => void
}) {
  const customers = useSalesCustomers({ activeOnly: true, limit: 200 })
  const workspaceCurrency = useWorkspaceCurrency()
  const [draft, setDraft] = useState({
    reference: '',
    customerId: '',
    validFrom: today(),
    validTo: '',
    itemCode: '',
    unitPrice: '',
    minQuantity: '',
  })
  const selected = customers.customers.find((customer) => customer.id === draft.customerId)
  const currency = selected?.currency ?? workspaceCurrency ?? ''
  const set = (key: keyof typeof draft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog title="New contract" onClose={onClose}>
      <div className="mt-5 grid gap-4">
        <label>
          <Label>Reference</Label>
          <input value={draft.reference} onChange={(event) => set('reference', event.target.value)} className={inputClass} />
        </label>
        <label>
          <Label>Customer</Label>
          <select value={draft.customerId} onChange={(event) => set('customerId', event.target.value)} className={inputClass}>
            <option value="">Every customer</option>
            {customers.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · {customer.currency}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <Label>Valid from</Label>
            <input type="date" value={draft.validFrom} onChange={(event) => set('validFrom', event.target.value)} className={inputClass} />
          </label>
          <label>
            <Label>Valid to (optional)</Label>
            <input type="date" value={draft.validTo} onChange={(event) => set('validTo', event.target.value)} className={inputClass} />
          </label>
        </div>
        <div className="rounded-xl border border-line p-4">
          <p className="text-[14px] font-medium">Agreed rate</p>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
            A contract needs at least one rate. Further rates can be added through the API; this screen creates one.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label>
              <Label>Item code</Label>
              <input value={draft.itemCode} onChange={(event) => set('itemCode', event.target.value)} className={inputClass} />
            </label>
            <label>
              <Label>Unit price{currency ? ` (${currency})` : ''}</Label>
              <input inputMode="decimal" value={draft.unitPrice} onChange={(event) => set('unitPrice', event.target.value)} className={inputClass} />
            </label>
            <label>
              <Label>Minimum quantity</Label>
              <input inputMode="decimal" value={draft.minQuantity} onChange={(event) => set('minQuantity', event.target.value)} className={inputClass} />
            </label>
          </div>
        </div>
        {Object.entries(contracts.fieldErrors).map(([field, message]) => (
          <p key={field} className="text-[13px] text-bad" role="alert">
            {message}
          </p>
        ))}
        <WriteError error={contracts.writeError} />
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="accent"
          disabled={!draft.reference.trim() || !draft.itemCode.trim() || !draft.unitPrice.trim() || !currency || contracts.writing}
          onClick={async () => {
            const created = await contracts.createContract({
              reference: draft.reference.trim(),
              currency,
              validFrom: draft.validFrom,
              validTo: draft.validTo || undefined,
              customerId: draft.customerId || undefined,
              lines: [
                {
                  itemCode: draft.itemCode.trim(),
                  unitPrice: draft.unitPrice.trim(),
                  minQuantity: draft.minQuantity.trim() || undefined,
                },
              ],
            })
            if (created) onClose()
          }}
        >
          {contracts.writing ? 'Saving…' : 'Create contract'}
        </Button>
      </div>
    </Dialog>
  )
}

/* -------------------------------- invoices -------------------------------- */

export function SalesInvoicesPane({ onViewReturns }: { onViewReturns: () => void }) {
  const [returning, setReturning] = useState<SalesDocumentRow | null>(null)

  return (
    <>
      <DocListPane
        kind="invoice"
        title="Sales invoices"
        blurb="Draft, post to GL, refund, and chase outstanding. A posted invoice is corrected by a credit note, never edited."
        createLabel="New invoice"
        statuses={['All statuses', 'Draft', 'Posted', 'Paid', 'Cancelled']}
        searchable
        emptyTitle="No sales invoices yet."
        emptyHint={
          <>
            Click <strong className="font-semibold text-fg-2">New invoice</strong> to create the first one.
          </>
        }
        extraActions={
          <Button variant="secondary" onClick={onViewReturns}>
            <Icon name="refresh" size={15} /> Returns (RMA)
          </Button>
        }
        rowAction={(doc) =>
          doc.postedAt ? (
            <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => setReturning(doc)}>
              Return / credit note
            </Button>
          ) : null
        }
      />
      {returning && <ReturnDialog invoice={returning} onClose={() => setReturning(null)} />}
    </>
  )
}

/**
 * Raising a credit note against a posted invoice.
 *
 * The quantities come from the server's returnable figures, which are the
 * billed quantity less anything already returned — the only way a line cannot
 * be credited twice across two returns that each look reasonable alone.
 */
function ReturnDialog({ invoice, onClose }: { invoice: SalesDocumentRow; onClose: () => void }) {
  const returnable = useReturnableLines(invoice.id)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [kind, setKind] = useState<'return' | 'credit_note'>('return')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const lines = (returnable.data?.lines ?? []).filter((line) => compareAmounts(line.returnable, '0') > 0)
  const chosen = lines
    .map((line) => ({ sourceLineId: line.lineId, quantity: quantities[line.lineId]?.trim() ?? '' }))
    .filter((line) => line.quantity && compareAmounts(line.quantity, '0') > 0)

  return (
    <Dialog title={`Return against ${invoice.reference}`} onClose={onClose} size="lg">
      {returnable.loading ? (
        <p className="mt-5 text-[14px] text-fg-muted">Loading what is still returnable…</p>
      ) : returnable.error ? (
        <div className="mt-5">
          <Failure
            what="the invoice lines"
            error={returnable.error}
            denied={returnable.denied}
            canRetry={returnable.canRetry}
            onRetry={returnable.refetch}
          />
        </div>
      ) : done ? (
        <p className="mt-5 text-[14px]">
          Created {done}. It is posted already — a draft credit note is a promise of money that has not been given back.
        </p>
      ) : !lines.length ? (
        <p className="mt-5 text-[14px] text-fg-muted">
          Nothing on this invoice is still returnable. Every line has already been credited in full.
        </p>
      ) : (
        <>
          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {lines.map((line) => (
              <li key={line.lineId} className="flex flex-wrap items-center gap-4 px-4 py-3 text-[13px]">
                <span className="min-w-[10rem] flex-1">
                  <span className="block font-medium">{line.description}</span>
                  <span className="mt-0.5 block text-[12px] text-fg-muted">
                    Billed {line.billed} · already returned {line.returned} · {money(line.unitPrice, invoice.currency)}{' '}
                    each
                  </span>
                </span>
                <label className="flex items-center gap-2">
                  <span className="text-[12px] text-fg-muted">Return</span>
                  <input
                    inputMode="decimal"
                    aria-label={`Quantity to return of ${line.description}`}
                    value={quantities[line.lineId] ?? ''}
                    onChange={(event) =>
                      setQuantities((prev) => ({ ...prev, [line.lineId]: event.target.value }))
                    }
                    placeholder={line.returnable}
                    className="w-24 rounded-xl border border-line bg-surface px-3 py-2 text-right text-[13px] focus:border-accent focus:outline-none"
                  />
                  <span className="text-[12px] text-fg-muted">of {line.returnable}</span>
                </label>
              </li>
            ))}
          </ul>

          <div className="mt-5 grid gap-4">
            <label>
              <Label>Reason</Label>
              <input value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass} />
            </label>
            <label>
              <Label>Document</Label>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as 'return' | 'credit_note')}
                className={inputClass}
              >
                <option value="return">Sales return (RMA)</option>
                <option value="credit_note">Credit note</option>
              </select>
            </label>
          </div>

          {error && (
            <p role="alert" className="mt-4 text-[13px] text-bad">
              {error}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!chosen.length || !reason.trim() || saving}
              onClick={async () => {
                setSaving(true)
                setError(null)
                try {
                  const created = await createReturn({
                    invoiceId: invoice.id,
                    reason: reason.trim(),
                    kind,
                    lines: chosen,
                  })
                  setDone(created.document.reference)
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : 'That could not be raised.')
                } finally {
                  setSaving(false)
                }
              }}
            >
              {saving ? 'Raising…' : 'Raise credit'}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  )
}

/* --------------------------------- returns -------------------------------- */

export function SalesReturnsPane() {
  return (
    <DocListPane
      kind="return"
      title="Sales returns"
      blurb="Credits raised against sales invoices — what has been credited back to customers, and whether it has reached the ledger."
      statuses={['All statuses', 'Posted']}
      note={
        <>
          A return is raised from the invoice it credits, so that it is priced at what was charged and bounded by what
          is still returnable. Open <strong className="font-semibold text-fg-2">Sales invoices</strong>, find the
          posted invoice and use its <strong className="font-semibold text-fg-2">Return / credit note</strong> action.
        </>
      }
      emptyTitle="No sales returns yet."
      emptyHint="Raise one from a posted invoice's Return / credit note action."
    />
  )
}

/* ------------------------------ subscriptions ----------------------------- */

export function SubscriptionsPane() {
  const [scheduling, setScheduling] = useState<SalesDocumentRow | null>(null)
  const [sweep, setSweep] = useState<string | null>(null)
  const [sweeping, setSweeping] = useState(false)

  return (
    <>
      <DocListPane
        kind="subscription"
        title="Subscriptions"
        blurb="Recurring billing schedules for customers. A sweep invoices every period that has come due and is not yet billed."
        createLabel="New subscription"
        statuses={['All', 'Active', 'Paused', 'Ended']}
        emptyTitle="No subscriptions yet. Create one to start recurring billing."
        note={
          <>
            A sweep bills <em>periods</em>, not subscriptions — which is what stops it re-invoicing on every run — so a
            new subscription bills nothing until its periods are scheduled. There is no automatic daily sweep on this
            deployment; run it here.
            {sweep && <span className="mt-2 block text-fg-2">{sweep}</span>}
          </>
        }
        extraActions={
          <Button
            variant="secondary"
            disabled={sweeping}
            onClick={async () => {
              setSweeping(true)
              setSweep(null)
              try {
                const summary = await runSubscriptionSweep()
                setSweep(
                  summary.invoiced
                    ? `Invoiced ${summary.invoiced} period${summary.invoiced === 1 ? '' : 's'}.`
                    : 'No period is due and unbilled.',
                )
              } catch (caught) {
                setSweep(caught instanceof Error ? caught.message : 'The sweep could not be run.')
              } finally {
                setSweeping(false)
              }
            }}
          >
            <Icon name="refresh" size={15} /> {sweeping ? 'Running…' : 'Run due now'}
          </Button>
        }
        rowAction={(doc) => (
          <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => setScheduling(doc)}>
            Schedule periods
          </Button>
        )}
      />
      {scheduling && <SchedulePeriodsDialog subscription={scheduling} onClose={() => setScheduling(null)} />}
    </>
  )
}

function SchedulePeriodsDialog({
  subscription,
  onClose,
}: {
  subscription: SalesDocumentRow
  onClose: () => void
}) {
  const [count, setCount] = useState('12')
  const [cadence, setCadence] = useState('30')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<number | null>(null)

  return (
    <Dialog title={`Billing periods for ${subscription.reference}`} onClose={onClose}>
      <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
        Each period is billed once, ever. Scheduling the same dates again creates nothing further, so this is safe to
        run twice.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label>
          <Label>How many periods</Label>
          <input
            type="number"
            min={1}
            max={120}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            className={inputClass}
          />
        </label>
        <label>
          <Label>Days per period</Label>
          <input
            type="number"
            min={1}
            max={366}
            value={cadence}
            onChange={(event) => setCadence(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {created !== null && (
        <p className="mt-4 text-[13px]">
          {created} new period{created === 1 ? '' : 's'} scheduled.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-[13px] text-bad">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="accent"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            setError(null)
            try {
              const result = await scheduleSubscriptionPeriods(
                subscription.id,
                Number(count) || 1,
                Number(cadence) || 30,
              )
              setCreated(result.created)
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Those periods could not be scheduled.')
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? 'Scheduling…' : 'Schedule'}
        </Button>
      </div>
    </Dialog>
  )
}

/* ---------------------------------- till ---------------------------------- */

export function PosTillPane() {
  const { session } = useAuth()
  const workspaceCurrency = useWorkspaceCurrency()
  const shifts = useShifts({ open: true, limit: 200 })
  const mine = shifts.shifts.find((shift) => shift.cashierUserId === session?.user.id)

  const [float, setFloat] = useState('0')
  const [warehouse, setWarehouse] = useState('')
  const [counted, setCounted] = useState('')
  const [reason, setReason] = useState('')

  if (shifts.loading) return <Loading what="your till" />
  if (shifts.error) {
    return (
      <Failure
        what="your till"
        error={shifts.error}
        denied={shifts.denied}
        canRetry={shifts.canRetry}
        onRetry={shifts.refetch}
      />
    )
  }

  if (mine) {
    const variance = isAmount(counted.trim())
      ? addAmounts(counted.trim(), negateAmount(mine.totals.expectedCash))
      : null
    const diverges = variance !== null && compareAmounts(absAmount(variance), '0') > 0

    return (
      <div className="grid place-items-center py-10">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[18px] font-semibold">Close till</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
            Opened {new Date(mine.openedAt).toLocaleString('en-GB')} by {mine.cashierName ?? 'you'}. Count the drawer
            and record what is actually in it — the difference is the variance.
          </p>
          <dl className="mt-5 space-y-2 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Opening float</dt>
              <dd className="font-mono">{money(mine.openingFloat, mine.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Cash taken</dt>
              <dd className="font-mono">{money(mine.totals.byMethod.cash ?? '0', mine.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Sales recorded</dt>
              <dd className="font-mono">{mine.totals.sales}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Expected in drawer</dt>
              <dd className="font-mono font-semibold">{money(mine.totals.expectedCash, mine.currency)}</dd>
            </div>
          </dl>
          <label className="mt-5 block">
            <Label>Counted cash</Label>
            <input
              inputMode="decimal"
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
              className={inputClass}
            />
          </label>
          {diverges && (
            <label className="mt-4 block">
              <Label>Why the drawer is out by {money(variance, mine.currency)}</Label>
              <input value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass} />
              <span className="mt-1.5 block text-[12px] leading-relaxed text-fg-muted">
                Above the workspace&apos;s tolerance the close is refused without a reason. &ldquo;The drawer was
                light&rdquo; with no explanation is the beginning of a loss nobody investigated.
              </span>
            </label>
          )}
          <WriteError error={shifts.writeError} />
          <Button
            variant="accent"
            className="mt-5 w-full"
            disabled={counted.trim() === '' || shifts.writing}
            onClick={() =>
              void shifts.closeShift(mine.id, {
                countedCash: counted.trim(),
                reason: reason.trim(),
                version: mine.version,
              })
            }
          >
            {shifts.writing ? 'Closing…' : 'Close shift'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid place-items-center py-10">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-[18px] font-semibold">Open till</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
          A shift is what cash, card and UPI tenders roll up to at end of day, so every takings figure can be
          reconciled against one cashier&apos;s drawer.
        </p>

        <label className="mt-5 block">
          <Label>Opening cash float</Label>
          <input inputMode="decimal" value={float} onChange={(event) => setFloat(event.target.value)} className={inputClass} />
        </label>

        <div className="mt-5">
          <Label>Till currency</Label>
          <div className="mt-1.5 flex items-center justify-between rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
            <span className="text-[14px] font-medium">{workspaceCurrency ?? 'Loading…'}</span>
            <span className="text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">Workspace</span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">
            A till takes one currency and refuses a sale in another. To sell in a second currency, run a separate
            shift.
          </p>
        </div>

        <label className="mt-5 block">
          <Label>Warehouse (optional)</Label>
          <input
            value={warehouse}
            onChange={(event) => setWarehouse(event.target.value)}
            placeholder="Where this till is trading from"
            className={inputClass}
          />
        </label>
        <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">
          Recorded on the shift as a label. There is no inventory module behind it on this deployment, so no stock or
          COGS entry follows from it.
        </p>

        <WriteError error={shifts.writeError} />

        <Button
          variant="accent"
          className="mt-6 w-full"
          disabled={!workspaceCurrency || shifts.writing}
          onClick={() =>
            void shifts.openShift({
              currency: workspaceCurrency ?? '',
              openingFloat: float.trim() || '0',
              warehouse: warehouse.trim(),
            })
          }
        >
          {shifts.writing ? 'Opening…' : 'Open shift'}
        </Button>

        <NotAvailable>
          Sales cannot be rung up here: this deployment has no basket or tender screen, so a shift opened now closes
          with nothing but its float unless sales are recorded through the API. Takings figures across the Shifts pane
          reflect that.
        </NotAvailable>
      </div>
    </div>
  )
}

/* --------------------------------- shifts --------------------------------- */

const TENDER_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  voucher: 'Voucher',
  loyalty: 'Loyalty',
  other: 'Other',
}

export function ShiftsPane() {
  const [period, setPeriod] = useState('30d')
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
  const from = daysAgo(days)

  const closed = useShifts({ closed: true, closedFrom: from, limit: 200 })
  const open = useShifts({ open: true, limit: 200 })
  const variance = useVarianceReport(from)

  const currencies = [...new Set(closed.shifts.map((shift) => shift.currency))]
  const currency = currencies.length === 1 ? currencies[0] : null

  const byMethod = new Map<string, string>()
  for (const shift of closed.shifts) {
    for (const [method, amount] of Object.entries(shift.totals.byMethod)) {
      byMethod.set(method, addAmounts(byMethod.get(method) ?? '0', amount))
    }
  }
  const takings = addAmounts(...byMethod.values())
  const salesCount = closed.shifts.reduce((sum, shift) => sum + shift.totals.sales, 0)
  const bands = variance.data?.bands

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHead title="Shift dashboard" blurb="Till activity and cashier reconciliation health." />
        <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => {
          closed.refetch()
          open.refetch()
          variance.refetch()
        }}>
          <Icon name="refresh" size={14} /> {closed.refreshing || open.refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {closed.error ? (
        <div className="mt-5">
          <Failure
            what="shifts"
            error={closed.error}
            denied={closed.denied}
            canRetry={closed.canRetry}
            onRetry={closed.refetch}
          />
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat
              label="Cashiers"
              value={variance.data ? String(variance.data.cashiers) : '—'}
              sub="With a closed till in this period"
            />
            <Stat
              label="Open shifts"
              value={open.loaded ? String(open.total) : '—'}
              sub={open.loaded ? (open.total ? 'Trading now' : 'All closed') : undefined}
            />
            <Stat
              label="Red flags"
              value={variance.data ? String(variance.data.byBand.red) : '—'}
              sub={bands ? `Variance at or over ${money(bands.redWorstShift, currency)}` : undefined}
            />
            <Stat
              label="Amber"
              value={variance.data ? String(variance.data.byBand.amber) : '—'}
              sub={bands ? `At or over ${money(bands.amberWorstShift, currency)}` : undefined}
            />
            <Stat
              label="Net variance"
              currency={currency ?? undefined}
              value={variance.data ? money(variance.data.total, null) : '—'}
              sub={
                variance.data
                  ? `Across ${variance.data.shifts} closed shift${variance.data.shifts === 1 ? '' : 's'}`
                  : undefined
              }
            />
          </div>

          {currencies.length > 1 && (
            <NotAvailable>
              These tills traded in {currencies.join(', ')}. Amounts are never converted, so the figures above cover
              every currency without stating one.
            </NotAvailable>
          )}
          {closed.total > closed.shifts.length && (
            <NotAvailable>
              Showing the most recent {closed.shifts.length} of {closed.total} closed tills; the takings below cover
              those.
            </NotAvailable>
          )}

          <div className="mt-5 flex items-center gap-2">
            <span className="text-[13px] text-fg-2">Trend period</span>
            {['7d', '30d', '90d'].map((item) => (
              <button
                key={item}
                onClick={() => setPeriod(item)}
                aria-pressed={period === item}
                className={`rounded-lg px-3 py-1.5 text-[13px] transition ${
                  period === item ? 'bg-surface-2 font-medium text-fg' : 'text-fg-2 hover:bg-surface-2'
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_22rem]">
            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="text-[17px] font-semibold">Till takings</h2>
              <p className="mt-1 text-[13px] text-fg-muted">
                {closed.shifts.length} shift{closed.shifts.length === 1 ? '' : 's'} closed · {salesCount} sale
                {salesCount === 1 ? '' : 's'} in the last {days} days
              </p>
              {closed.loading ? (
                <p className="py-20 text-center text-[14px] text-fg-muted">Loading…</p>
              ) : closed.shifts.length ? (
                <p className="mt-10 text-center font-mono text-[22px] font-bold">{money(takings, currency)}</p>
              ) : (
                <p className="py-20 text-center text-[14px] text-fg-muted">No shifts closed in this period</p>
              )}
            </section>

            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="text-[17px] font-semibold">Tender mix</h2>
              <p className="mt-1 text-[13px] text-fg-muted">How much of the take can physically go missing</p>
              {byMethod.size ? (
                <ul className="mt-5 space-y-4">
                  {[...byMethod].map(([method, amount]) => (
                    <li key={method}>
                      <div className="flex items-center justify-between gap-3 text-[13px]">
                        <span>{TENDER_LABELS[method] ?? method}</span>
                        <span className="text-fg-muted">{money(amount, currency)}</span>
                      </div>
                      <Bar value={barPercent(amount, maxAmount(...byMethod.values()))} max={100} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-16 text-center text-[14px] text-fg-muted">
                  No tenders recorded on these shifts.
                </p>
              )}
            </section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_22rem]">
            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="text-[17px] font-semibold">Cash variance by shift</h2>
              <p className="mt-1 text-[13px] text-fg-muted">Above the line is over the count, below is short</p>
              {closed.shifts.length ? (
                <ul className="mt-5 space-y-2">
                  {closed.shifts.map((shift) => (
                    <li key={shift.id} className="flex items-center justify-between gap-3 text-[13px]">
                      <span>{shift.cashierName ?? 'Unnamed cashier'}</span>
                      <span
                        className={`font-mono ${compareAmounts(shift.variance ?? '0', '0') < 0 ? 'text-bad' : 'text-ok'}`}
                      >
                        {compareAmounts(shift.variance ?? '0', '0') >= 0 ? '+' : ''}
                        {money(shift.variance, shift.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-16 text-center text-[14px] text-fg-muted">No closed shifts to compare yet</p>
              )}
            </section>

            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="text-[17px] font-semibold">Cashier bands</h2>
              <p className="mt-1 text-[13px] text-fg-muted">How the closed shifts split by reconciliation health</p>
              {variance.data ? (
                <div className="mt-8 grid grid-cols-3 text-center">
                  {[
                    { label: 'Green', value: variance.data.byBand.green },
                    { label: 'Amber', value: variance.data.byBand.amber },
                    { label: 'Red', value: variance.data.byBand.red },
                  ].map((band) => (
                    <div key={band.label}>
                      <p className="text-[18px] font-bold">{band.value}</p>
                      <p className="mt-8 text-[12px] text-fg-muted">{band.label}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-16 text-center text-[14px] text-fg-muted">Loading…</p>
              )}
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-[17px] font-semibold">Takings by cashier</h2>
            <p className="mt-1 text-[13px] text-fg-muted">Tenders taken on each closed shift</p>
            {closed.shifts.length ? (
              <ul className="mt-5 space-y-2">
                {closed.shifts.map((shift) => (
                  <li key={shift.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span>{shift.cashierName ?? 'Unnamed cashier'}</span>
                    <span className="font-mono text-fg-muted">
                      {money(addAmounts(...Object.values(shift.totals.byMethod)), shift.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-14 text-center text-[14px] text-fg-muted">No cashier activity yet</p>
            )}
          </section>

          <div className="mt-6">
            <h2 className="text-[17px] font-semibold">Live open shifts</h2>
            <p className="mt-1 text-[13px] text-fg-muted">
              {open.loaded ? (open.total ? `${open.total} till(s) open.` : 'No tills open right now.') : 'Loading…'}
            </p>
            {open.shifts.length ? (
              <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
                {open.shifts.map((shift) => (
                  <li key={shift.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5 text-[13px]">
                    <span className="min-w-0 flex-1">{shift.cashierName ?? 'Unnamed cashier'}</span>
                    <span className="text-fg-muted">float {money(shift.openingFloat, shift.currency)}</span>
                    <span className="text-fg-muted">{new Date(shift.openedAt).toLocaleTimeString('en-GB')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 py-10 text-center text-[14px] text-fg-muted">
                Nothing to watch — open a shift from the POS to start tracking.
              </p>
            )}
          </div>

          <div className="mt-6">
            <h2 className="text-[17px] font-semibold">Cashier scorecard</h2>
            <p className="mt-1 text-[13px] text-fg-muted">
              {bands
                ? `Red at or over ${money(bands.redWorstShift, currency)} variance · amber at or over ${money(bands.amberWorstShift, currency)}.`
                : 'Loading the thresholds this workspace closes tills against…'}
            </p>
            {closed.shifts.length && bands ? (
              <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
                {closed.shifts.map((shift) => {
                  const magnitude = absAmount(shift.variance ?? '0')
                  const tone =
                    compareAmounts(magnitude, bands.redWorstShift) >= 0
                      ? 'tone-rose'
                      : compareAmounts(magnitude, bands.amberWorstShift) >= 0
                        ? 'tone-amber'
                        : 'tone-emerald'
                  return (
                    <li key={shift.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5 text-[13px]">
                      <span className="min-w-0 flex-1">{shift.cashierName ?? 'Unnamed cashier'}</span>
                      {shift.varianceReason && (
                        <span className="text-[12px] text-fg-muted">{shift.varianceReason}</span>
                      )}
                      <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${tone}`}>
                        {money(magnitude, shift.currency)} variance
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-5 py-10 text-center text-[14px] text-fg-muted">
                No cashier activity yet. Once shifts close with a counted-cash reconciliation, scores appear here.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* -------------------------------- AR aging -------------------------------- */

export function ArAgingPane() {
  const aging = useAging()
  const debtors = useTopDebtors(50)

  const buckets = aging.data?.buckets ?? []
  const openCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
  const aged = buckets.filter((bucket) => AGED_BUCKETS.includes(bucket.label))
  const agedTotal = addAmounts(...aged.map((bucket) => bucket.amount))

  return (
    <div>
      <PageHead
        title="Accounts receivable aging"
        blurb={aging.data ? `Posted, unpaid invoices as at ${aging.data.asOf}.` : 'Posted, unpaid invoices.'}
      />

      {aging.loading ? (
        <div className="mt-5">
          <Loading what="the aging report" />
        </div>
      ) : aging.error ? (
        <div className="mt-5">
          <Failure
            what="the aging report"
            error={aging.error}
            denied={aging.denied}
            canRetry={aging.canRetry}
            onRetry={aging.refetch}
          />
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Stat
              label="Total outstanding"
              currency={aging.data?.currency ?? undefined}
              value={money(aging.data?.total, null)}
              sub={`${openCount} open invoice${openCount === 1 ? '' : 's'}`}
            />
            <Stat
              label="Customers with balance"
              value={debtors.data ? String(debtors.data.debtors.length) : '—'}
              sub="Distinct accounts"
            />
            <Stat
              label="Aged over 60 days"
              currency={aging.data?.currency ?? undefined}
              value={money(agedTotal, null)}
              sub="Likely collection issues"
            />
          </div>

          <section className="mt-6">
            <h2 className="text-[17px] font-semibold">Aging by bucket</h2>
            <p className="mt-1 text-[13px] text-fg-muted">
              An invoice with no due date sits in &ldquo;Not due&rdquo; rather than counting as current — inferring
              terms nobody agreed would age it wrongly.
            </p>
            <ul className="mt-5 space-y-5">
              {buckets.map((bucket) => (
                <li key={bucket.label}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[15px] font-semibold">
                      {bucket.label}
                      <span className="ml-1.5 text-[13px] font-normal text-fg-muted">
                        {bucket.count} invoice{bucket.count === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="font-mono text-[15px] font-semibold">
                      {money(bucket.amount, aging.data?.currency ?? null)}
                    </span>
                  </div>
                  <Bar value={barPercent(bucket.amount, aging.data?.total ?? '0')} max={100} />
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-[17px] font-semibold">By customer</h2>
            <p className="mt-1 text-[13px] text-fg-muted">
              Sorted by amount owed, with what is merely owed separated from what is late.
            </p>
            {debtors.error ? (
              <div className="mt-5">
                <Failure
                  what="the debtor list"
                  error={debtors.error}
                  denied={debtors.denied}
                  canRetry={debtors.canRetry}
                  onRetry={debtors.refetch}
                />
              </div>
            ) : debtors.data?.debtors.length ? (
              <ul className="mt-5 divide-y divide-line rounded-2xl border border-line bg-surface">
                {debtors.data.debtors.map((debtor) => (
                  <li
                    key={debtor.customerId}
                    className="flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 text-[13px]"
                  >
                    <span>{debtor.name}</span>
                    <span className="flex items-center gap-4">
                      {compareAmounts(debtor.overdue, '0') > 0 && (
                        <span className="text-[12px] text-bad">{money(debtor.overdue, debtor.currency)} late</span>
                      )}
                      <span className="font-mono">{money(debtor.outstanding, debtor.currency)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-8 text-center">
                <p className="text-[15px] text-fg-2">Nothing outstanding.</p>
                <p className="mt-1.5 text-[13px] text-fg-muted">
                  Only posted, unpaid invoices appear here — a draft invoice is not yet a receivable.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/* --------------------------------- reports -------------------------------- */

/** The one report tab with a query behind it. */
const TRACKER = 'tracker'

export function PosReportsPane() {
  const [tab, setTab] = useState(TRACKER)
  const [status, setStatus] = useState('All statuses')
  const orders = useSalesDocuments({ kind: 'order', status, limit: 50 })

  return (
    <div>
      <PageHead
        title="Sales reports"
        blurb="Order-to-cash tracking. The remaining tabs are listed because the live product has them; none of them is computed on this deployment."
      />

      <nav className="mt-6 flex flex-wrap gap-6 border-b border-line">
        {posReportTabs.map((item) => (
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

      {tab === TRACKER ? (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <Select
              label="Status"
              value={status}
              options={['All statuses', 'Draft', 'Confirmed', 'Delivered', 'Closed']}
              onChange={setStatus}
            />
            <p className="text-[13px] text-fg-muted" aria-live="polite">
              {orders.loading
                ? 'Counting orders…'
                : orders.error
                  ? 'Count unavailable'
                  : `${orders.total} order${orders.total === 1 ? '' : 's'} · as at ${today()}`}
            </p>
          </div>

          <div className="mt-4">
            {orders.loading ? (
              <Loading what="sales orders" />
            ) : orders.error ? (
              <Failure
                what="sales orders"
                error={orders.error}
                denied={orders.denied}
                canRetry={orders.canRetry}
                onRetry={orders.refetch}
              />
            ) : orders.documents.length ? (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {orders.documents.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5 text-[13px]">
                    <span className="w-24 shrink-0 font-mono text-[12px] text-fg-muted">{order.reference}</span>
                    <span className="min-w-0 flex-1">{order.customerName ?? 'No customer'}</span>
                    <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-sky">
                      {displayStatus(order.status)}
                    </span>
                    <span className="font-mono">{money(order.grandTotal, order.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No sales orders match these filters yet." />
            )}
          </div>
        </>
      ) : (
        <div className="mt-6">
          <Empty
            icon="chart"
            title={`${posReportTabs.find((item) => item.id === tab)?.label} is not available on this deployment.`}
            hint={
              tab === 'cashier' || tab === 'zreport' || tab === 'daily' || tab === 'item'
                ? 'It needs till sales, and there is no sale-entry screen here. The Shifts pane shows what the tills do record.'
                : 'Nothing computes this report yet, and an empty chart would read as a measurement of nothing.'
            }
          />
        </div>
      )}
    </div>
  )
}

/* ----------------------------- match settings ----------------------------- */

const ACTION_BY_LABEL: Record<string, 'warn' | 'block' | 'ignore'> = {
  [toleranceActions[0]]: 'warn',
  [toleranceActions[1]]: 'block',
  [toleranceActions[2]]: 'ignore',
}
const LABEL_BY_ACTION: Record<string, string> = {
  warn: toleranceActions[0],
  block: toleranceActions[1],
  ignore: toleranceActions[2],
}

export function MatchSettingsPane() {
  const policy = useMatchPolicy()
  const [draft, setDraft] = useState<Record<string, string | boolean> | null>(null)

  const saved = policy.policy
  const current = {
    priceTolerancePercent: String(draft?.priceTolerancePercent ?? saved?.priceTolerancePercent ?? ''),
    priceAction: String(draft?.priceAction ?? saved?.priceAction ?? 'warn') as 'warn' | 'block' | 'ignore',
    quantityTolerancePercent: String(draft?.quantityTolerancePercent ?? saved?.quantityTolerancePercent ?? ''),
    quantityAction: String(draft?.quantityAction ?? saved?.quantityAction ?? 'warn') as 'warn' | 'block' | 'ignore',
    requireOrder: Boolean(draft?.requireOrder ?? saved?.requireOrder ?? false),
    requireDelivery: Boolean(draft?.requireDelivery ?? saved?.requireDelivery ?? false),
  }
  const dirty = draft !== null
  const set = (key: string, value: string | boolean) => setDraft((prev) => ({ ...(prev ?? {}), [key]: value }))

  if (policy.loading) return <Loading what="the match policy" />
  if (policy.error) {
    return (
      <Failure
        what="the match policy"
        error={policy.error}
        denied={policy.denied}
        canRetry={policy.canRetry}
        onRetry={policy.refetch}
      />
    )
  }

  return (
    <div>
      <PageHead
        title="Match settings"
        blurb="How strictly a sales invoice must agree with the order and delivery note it was raised from, before it can post."
        actions={
          <Button
            variant="accent"
            disabled={!dirty || policy.saving}
            onClick={async () => {
              const result = await policy.save({ ...current, updatedAt: saved?.updatedAt ?? null })
              if (result) setDraft(null)
            }}
          >
            <Icon name="file-text" size={15} /> {policy.saving ? 'Saving…' : 'Save'}
          </Button>
        }
      />

      {saved?.updatedAt === null && (
        <NotAvailable>
          No policy has been saved for this workspace, so nothing is being enforced yet. The figures below are the
          defaults on display; they take effect the first time you save.
        </NotAvailable>
      )}
      <WriteError error={policy.saveError} />

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="flex items-center gap-2.5 text-[16px] font-semibold">
            <Icon name="network" size={17} className="text-accent" />
            3-way match tolerances
          </h2>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Checked when an invoice posts, against the order and delivery note it links back to. An invoice that links
            to neither has nothing to be compared with and is not checked.
          </p>

          {(
            [
              {
                key: 'price',
                label: 'Price',
                hint: 'How far the invoiced value may drift from the value ordered.',
                tolerance: 'priceTolerancePercent',
                action: 'priceAction',
              },
              {
                key: 'quantity',
                label: 'Quantity',
                hint: 'How far the invoiced quantity may drift from what was delivered.',
                tolerance: 'quantityTolerancePercent',
                action: 'quantityAction',
              },
            ] as const
          ).map((row) => (
            <div key={row.key} className="mt-5">
              <p className="text-[14px] font-medium">{row.label}</p>
              <p className="mt-0.5 text-[12px] text-fg-muted">{row.hint}</p>
              <div className="mt-2 flex flex-wrap gap-3">
                <span className="flex items-center rounded-xl border border-line bg-bg pr-3">
                  <input
                    inputMode="decimal"
                    aria-label={`${row.label} tolerance`}
                    value={current[row.tolerance]}
                    onChange={(event) => set(row.tolerance, event.target.value)}
                    className="w-20 bg-transparent px-3.5 py-2.5 text-right text-[14px] focus:outline-none"
                  />
                  <span className="text-[13px] text-fg-muted">%</span>
                </span>
                <select
                  aria-label={`${row.label} action`}
                  value={LABEL_BY_ACTION[current[row.action]]}
                  onChange={(event) => set(row.action, ACTION_BY_LABEL[event.target.value] ?? 'warn')}
                  className="min-w-[16rem] flex-1 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] focus:border-accent focus:outline-none"
                >
                  {toleranceActions.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="flex items-center gap-2.5 text-[16px] font-semibold">
            <Icon name="file-text" size={17} className="text-accent" />
            Required documents
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
            Refuse to post an invoice that is not linked back to its paperwork. Worth turning on where every sale must
            be traceable to an order and a shipment.
          </p>

          <ul className="mt-5 space-y-3">
            {(
              [
                {
                  key: 'requireOrder',
                  label: 'Require a sales order for every invoice',
                  hint: 'Refuses to post an invoice that was never ordered.',
                },
                {
                  key: 'requireDelivery',
                  label: 'Require a delivery note for every invoice',
                  hint: 'Refuses to post an invoice before the goods have shipped.',
                },
              ] as const
            ).map((row) => (
              <li key={row.key} className="rounded-xl border border-line px-4 py-3.5">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(current[row.key])}
                    onChange={(event) => set(row.key, event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-accent"
                  />
                  <span>
                    <span className="block text-[14px] font-medium">{row.label}</span>
                    <span className="mt-0.5 block text-[12px] text-fg-muted">{row.hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
