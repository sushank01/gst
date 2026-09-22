'use client'

import { useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { useAuth } from '../../../lib/auth'
import {
  agingBuckets,
  money,
  months,
  orderToCashStages,
  paymentDueBands,
  posReportTabs,
  quoteStatuses,
  toleranceActions,
} from '../../../lib/posData'
import { useWorkspace } from '../../../lib/workspace'
import { Dialog, Label, inputClass } from '../../../components/EnterpriseUi'
import { Bar, Empty, PageHead, Select, Stat } from './parts'

const today = () => new Date().toISOString().slice(0, 10)

/** Days a posted invoice has been outstanding. */
const ageOf = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

function useLedger() {
  const { posDocs } = useWorkspace()
  const invoices = posDocs.filter((doc) => doc.kind === 'invoice')
  const posted = invoices.filter((doc) => doc.status !== 'Draft' && doc.status !== 'Cancelled')
  const open = posted.filter((doc) => doc.payment !== 'Paid')
  return { posDocs, invoices, posted, open }
}

export function PosDashboard() {
  const { posDocs, invoices, posted, open } = useLedger()
  const [period, setPeriod] = useState('30d')

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
  const inPeriod = posted.filter((doc) => ageOf(doc.createdAt) <= days)
  const invoiced = inPeriod.reduce((total, doc) => total + doc.total, 0)
  const customers = new Set(inPeriod.map((doc) => doc.customer)).size
  const outstanding = open.reduce((total, doc) => total + doc.total, 0)
  const overdue = open.filter((doc) => doc.dueDate && doc.dueDate < today())
  const returned = posDocs.filter((doc) => doc.kind === 'return').reduce((total, doc) => total + doc.total, 0)

  const stageCounts = {
    quotations_open: posDocs.filter((d) => d.kind === 'quotation' && ['Draft', 'Sent'].includes(d.status)),
    orders_to_fulfil: posDocs.filter((d) => d.kind === 'order' && d.status !== 'Closed'),
    delivered_not_invoiced: posDocs.filter((d) => d.kind === 'delivery' && d.status !== 'Invoiced'),
    invoices_draft: invoices.filter((d) => d.status === 'Draft'),
    invoices_posted: posted,
  }
  const stageMax = Math.max(1, ...Object.values(stageCounts).map((list) => list.length))

  const year = new Date().getFullYear()
  const byMonth = months.map((_, index) =>
    posted
      .filter((doc) => new Date(doc.createdAt).getMonth() === index)
      .reduce((total, doc) => total + doc.total, 0),
  )
  const monthMax = Math.max(1, ...byMonth)

  const buckets = agingBuckets.map((bucket) => {
    const rows = open.filter((doc) => {
      const age = doc.dueDate ? Math.floor((Date.now() - new Date(doc.dueDate).getTime()) / 86_400_000) : -1
      if (bucket.id === 'current') return age < 0
      if (bucket.id === '1_30') return age >= 0 && age <= 30
      if (bucket.id === '31_60') return age > 30 && age <= 60
      if (bucket.id === '61_90') return age > 60 && age <= 90
      return age > 90
    })
    return { ...bucket, value: rows.reduce((total, doc) => total + doc.total, 0) }
  })
  const bucketMax = Math.max(1, ...buckets.map((b) => b.value))

  const owed = [...open.reduce((map, doc) => map.set(doc.customer, (map.get(doc.customer) ?? 0) + doc.total), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

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
          currency="USD"
          label={`Invoiced (${period})`}
          value={money(invoiced)}
          sub={`${inPeriod.length} invoices · ${customers} customers`}
        />
        <Stat
          currency="USD"
          label="Average invoice"
          value={money(inPeriod.length ? invoiced / inPeriod.length : 0)}
          sub={returned ? `USD ${money(returned)} returned` : 'No returns in period'}
        />
        <Stat
          currency="USD"
          label="AR outstanding"
          value={money(outstanding)}
          sub={`${open.length} open · ${new Set(open.map((d) => d.customer)).size} customers`}
        />
        <Stat
          currency="USD"
          label="Overdue"
          value={money(overdue.reduce((total, doc) => total + doc.total, 0))}
          sub={overdue.length ? `${overdue.length} late` : 'Nothing late'}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_22rem]">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[17px] font-semibold">Invoiced revenue</h2>
          <p className="mt-1 text-[13px] text-fg-muted">Daily total over the last {days} days</p>
          {inPeriod.length ? (
            <p className="mt-10 text-center font-mono text-[22px] font-bold">USD {money(invoiced)}</p>
          ) : (
            <p className="py-24 text-center text-[14px] text-fg-muted">No invoices raised in this period</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[17px] font-semibold">Order to cash</h2>
          <p className="mt-1 text-[13px] text-fg-muted">Documents waiting at each stage</p>
          <ul className="mt-5 space-y-4">
            {orderToCashStages.map((stage) => {
              const rows = stageCounts[stage.id as keyof typeof stageCounts]
              const value = rows.reduce((total, doc) => total + doc.total, 0)
              return (
                <li key={stage.id}>
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span>{stage.label}</span>
                    <span className="text-fg-muted">USD {value}</span>
                  </div>
                  <Bar value={rows.length} max={stageMax} />
                  <p className="mt-1 text-right text-[12px] text-fg-muted">{rows.length}</p>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_22rem]">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[17px] font-semibold">Sales — CY {year}</h2>
              <p className="mt-1 text-[13px] text-fg-muted">
                {year}-01-01 to {year}-12-31 · no fiscal year configured, assuming calendar year
              </p>
            </div>
            <span className="text-[13px] font-medium text-accent">Reports →</span>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-4">
            <Stat currency="USD" label="Invoiced YTD" value={String(Math.round(invoiced))} sub={`${posted.length} invoices`} />
            <Stat label="vs last year" value="—" sub="No trade a year ago" />
            <Stat currency="USD" label="Still outstanding" value={String(Math.round(outstanding))} sub={posted.length ? '' : 'Nothing invoiced'} />
            <Stat currency="USD" label="Returned" value={String(Math.round(returned))} sub={returned ? '' : 'None'} />
          </div>

          <div className="mt-6 flex items-end gap-2">
            {byMonth.map((value, index) => (
              <div key={months[index]} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={`w-full rounded-t ${value ? 'bg-accent' : 'bg-surface-2'}`}
                  style={{ height: `${Math.max(8, (value / monthMax) * 120)}px` }}
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

        <section className="rounded-2xl border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold">Payment due</h2>
              <p className="mt-1 text-[13px] text-fg-muted">When the money is scheduled to land</p>
            </div>
            <span className="text-[13px] font-medium text-accent">Chase →</span>
          </div>
          <ul className="mt-5 space-y-4">
            {paymentDueBands.map((band) => (
              <li key={band}>
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{band}</span>
                  <span className="text-fg-muted">USD 0</span>
                </div>
                <p className="mt-1 text-[12px] text-fg-muted">0 invoices</p>
                <Bar value={0} max={1} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold">AR aging</h2>
              <p className="mt-1 text-[13px] text-fg-muted">
                {open.length} unpaid across {new Set(open.map((d) => d.customer)).size} customers
              </p>
            </div>
            <span className="text-[13px] font-medium text-accent">View all →</span>
          </div>
          <ul className="mt-5 space-y-3">
            {buckets.map((bucket) => (
              <li key={bucket.id}>
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{bucket.label}</span>
                  <span className="text-fg-muted">USD {Math.round(bucket.value)}</span>
                </div>
                <Bar value={bucket.value} max={bucketMax} />
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[17px] font-semibold">Payment status</h2>
          <p className="mt-1 text-[13px] text-fg-muted">Every invoice on the book, by count</p>
          {invoices.length ? (
            <ul className="mt-5 space-y-3">
              {['Paid', 'Part paid', 'Unpaid'].map((state) => (
                <li key={state} className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{state}</span>
                  <span className="text-fg-muted">{invoices.filter((d) => d.payment === state).length}</span>
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
          {owed.length ? (
            <ul className="mt-5 space-y-3">
              {owed.map(([customer, value]) => (
                <li key={customer} className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{customer}</span>
                  <span className="font-mono text-fg-muted">USD {money(value)}</span>
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

export function CustomersPane() {
  const { posCustomers, addPosCustomer } = useWorkspace()
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', email: '', taxId: '' })

  const visible = posCustomers.filter((customer) => {
    if (!showInactive && !customer.active) return false
    if (!query.trim()) return true
    return `${customer.name} ${customer.email} ${customer.taxId}`.toLowerCase().includes(query.toLowerCase())
  })

  function exportCsv() {
    const head = 'name,email,tax_id,active'
    const body = visible.map((c) => `${c.name},${c.email},${c.taxId},${c.active}`).join('\n')
    const url = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: 'text/csv' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'customers.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      (typeof reader.result === 'string' ? reader.result : '')
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .forEach((row) => {
          const [name, email, taxId] = row.split(',')
          if (name?.trim()) addPosCustomer({ name: name.trim(), email: email?.trim() ?? '', taxId: taxId?.trim() ?? '', active: true })
        })
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  return (
    <div>
      <PageHead
        title="Customers"
        blurb="Master directory for billing, credit risk, and AR aging."
        actions={
          <>
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
            >
              <Icon name="download" size={15} /> Export
            </button>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2">
              <Icon name="download" size={15} className="rotate-180" /> Import
              <input type="file" accept=".csv,text/csv" onChange={importCsv} className="hidden" />
            </label>
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
      </div>

      <div className="mt-5">
        {visible.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {visible.map((customer) => (
              <li key={customer.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                <span className="min-w-[12rem] flex-1">
                  <span className="block text-[14px] font-medium">{customer.name}</span>
                  <span className="mt-0.5 block text-[12px] text-fg-muted">
                    {customer.email || 'No email'}
                    {customer.taxId ? ` · ${customer.taxId}` : ''}
                  </span>
                </span>
                {!customer.active && (
                  <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-slate">Inactive</span>
                )}
              </li>
            ))}
          </ul>
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

      {open && (
        <Dialog title="New customer" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            {(['name', 'email', 'taxId'] as const).map((key) => (
              <label key={key}>
                <Label>{key === 'taxId' ? 'Tax ID' : key === 'name' ? 'Name' : 'Email'}</Label>
                <input
                  value={draft[key]}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                  className={inputClass}
                />
              </label>
            ))}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.name.trim()}
              onClick={() => {
                addPosCustomer({ ...draft, name: draft.name.trim(), active: true })
                setDraft({ name: '', email: '', taxId: '' })
                setOpen(false)
              }}
            >
              Create customer
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export function QuotationsPane() {
  const { posDocs, posCustomers, addPosDoc } = useWorkspace()
  const quotes = posDocs.filter((doc) => doc.kind === 'quotation')
  const [status, setStatus] = useState<string>('All')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ customer: '', title: '', total: '' })

  const visible = quotes.filter((quote) => {
    if (status !== 'All' && quote.status !== status) return false
    if (!query.trim()) return true
    return `${quote.reference} ${quote.customer} ${quote.reason}`.toLowerCase().includes(query.toLowerCase())
  })

  const pipeline = quotes.reduce((total, quote) => total + quote.total, 0)
  const decided = quotes.filter((q) => ['Accepted', 'Ordered', 'Rejected'].includes(q.status))
  const won = quotes.filter((q) => ['Accepted', 'Ordered'].includes(q.status))
  const openValue = quotes
    .filter((q) => ['Draft', 'Sent'].includes(q.status))
    .reduce((total, q) => total + q.total, 0)

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total quotes" value={String(quotes.length)} />
        <Stat currency="USD" label="Pipeline value" value={String(Math.round(pipeline))} />
        <Stat
          label="Win rate"
          value={`${decided.length ? ((won.length / decided.length) * 100).toFixed(1) : '0.0'}%`}
        />
        <Stat currency="USD" label="Open (draft + sent)" value={String(Math.round(openValue))} />
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
            placeholder="Search number / title..."
            aria-label="Search quotations"
            className="w-56 rounded-xl border border-line bg-surface py-2 pr-3 pl-9 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </span>
        <Button variant="accent" onClick={() => setOpen(true)}>
          + New quotation
        </Button>
      </div>

      <div className="mt-5">
        {visible.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {visible.map((quote) => (
              <li key={quote.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                <span className="w-24 shrink-0 font-mono text-[12px] text-fg-muted">{quote.reference}</span>
                <span className="min-w-[10rem] flex-1">
                  <span className="block text-[14px] font-medium">{quote.customer}</span>
                  {quote.reason && <span className="mt-0.5 block text-[12px] text-fg-muted">{quote.reason}</span>}
                </span>
                <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-sky">{quote.status}</span>
                <span className="font-mono text-[13px]">USD {money(quote.total)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="file-text" title="No quotations yet. Create your first priced proposal." />
        )}
      </div>

      {open && (
        <Dialog title="New quotation" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Customer</Label>
              {posCustomers.length ? (
                <select
                  value={draft.customer}
                  onChange={(event) => setDraft((prev) => ({ ...prev, customer: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">Select a customer…</option>
                  {posCustomers.map((item) => (
                    <option key={item.id}>{item.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={draft.customer}
                  onChange={(event) => setDraft((prev) => ({ ...prev, customer: event.target.value }))}
                  placeholder="No customers yet — type a name"
                  className={inputClass}
                />
              )}
            </label>
            <label>
              <Label>Title</Label>
              <input
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label>
              <Label>Total (USD)</Label>
              <input
                type="number"
                min={0}
                value={draft.total}
                onChange={(event) => setDraft((prev) => ({ ...prev, total: event.target.value }))}
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
              disabled={!draft.customer.trim()}
              onClick={() => {
                addPosDoc({
                  kind: 'quotation',
                  customer: draft.customer.trim(),
                  status: 'Draft',
                  total: Number(draft.total) || 0,
                  source: 'Manual',
                  payment: 'Unpaid',
                  reason: draft.title.trim(),
                  dueDate: '',
                })
                setDraft({ customer: '', title: '', total: '' })
                setOpen(false)
              }}
            >
              Create quotation
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export function PosTillPane() {
  const { posShifts, openPosShift } = useWorkspace()
  const { session } = useAuth()
  const openShift = posShifts.find((shift) => !shift.closedAt)
  const [float, setFloat] = useState('0')
  const [warehouse, setWarehouse] = useState('— no inventory leg —')
  const [notes, setNotes] = useState('')
  const [counted, setCounted] = useState('')
  const { closePosShift } = useWorkspace()

  if (openShift) {
    const expected = openShift.openingFloat + openShift.cashTaken
    return (
      <div className="grid place-items-center py-10">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[18px] font-semibold">Close till</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
            Opened {new Date(openShift.openedAt).toLocaleString('en-GB')} by {openShift.cashier}. Count the drawer and
            record what is actually in it — the difference is the variance.
          </p>
          <dl className="mt-5 space-y-2 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Opening float</dt>
              <dd className="font-mono">{money(openShift.openingFloat)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Cash taken</dt>
              <dd className="font-mono">{money(openShift.cashTaken)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Expected in drawer</dt>
              <dd className="font-mono font-semibold">{money(expected)}</dd>
            </div>
          </dl>
          <label className="mt-5 block">
            <Label>Counted cash</Label>
            <input
              type="number"
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
              className={inputClass}
            />
          </label>
          <Button
            variant="accent"
            className="mt-5 w-full"
            disabled={counted === ''}
            onClick={() => closePosShift(openShift.id, Number(counted))}
          >
            Close shift
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
          POS sales need an open shift so cash, card, and UPI tenders all roll up to one cashier reconciliation at end
          of day.
        </p>

        <label className="mt-5 block">
          <Label>Opening cash float</Label>
          <input type="number" value={float} onChange={(event) => setFloat(event.target.value)} className={inputClass} />
        </label>

        <div className="mt-5">
          <Label>Till currency</Label>
          <div className="mt-1.5 flex items-center justify-between rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
            <span className="text-[14px] font-medium">USD</span>
            <span className="text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">Org default</span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">
            Only products priced in <strong className="font-semibold text-fg-2">USD</strong> can be sold from this
            shift. To sell mixed currencies, run separate shifts.
          </p>
        </div>

        <label className="mt-5 block">
          <Label>Warehouse (optional)</Label>
          <select value={warehouse} onChange={(event) => setWarehouse(event.target.value)} className={inputClass}>
            <option>— no inventory leg —</option>
            <option>Main warehouse</option>
            <option>Store front</option>
          </select>
        </label>
        <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">
          Sales with this warehouse + a unit cost will post DR COGS / CR Inventory automatically.
        </p>

        <label className="mt-5 block">
          <Label>Notes (optional)</Label>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} />
        </label>

        <Button
          variant="accent"
          className="mt-6 w-full"
          onClick={() =>
            openPosShift({
              cashier: session?.user.fullName ?? 'Cashier',
              openingFloat: Number(float) || 0,
              currency: 'USD',
              warehouse,
              notes,
            })
          }
        >
          Open shift
        </Button>
      </div>
    </div>
  )
}

export function ShiftsPane() {
  const { posShifts, posSettings } = useWorkspace()
  // The bands are whatever Settings › Cash variance tolerance says they are.
  const cashierBands = { red: posSettings.cashVariance.redWorst, amber: posSettings.cashVariance.amberWorst }
  const [period, setPeriod] = useState('30d')
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30

  const closed = posShifts.filter(
    (shift) => shift.closedAt && ageOf(shift.closedAt) <= days,
  )
  const openShifts = posShifts.filter((shift) => !shift.closedAt)
  const varianceOf = (shift: (typeof posShifts)[number]) =>
    (shift.countedCash ?? 0) - (shift.openingFloat + shift.cashTaken)

  const red = closed.filter((shift) => Math.abs(varianceOf(shift)) >= cashierBands.red)
  const amber = closed.filter(
    (shift) => Math.abs(varianceOf(shift)) >= cashierBands.amber && Math.abs(varianceOf(shift)) < cashierBands.red,
  )
  const net = closed.reduce((total, shift) => total + varianceOf(shift), 0)
  const cashTotal = closed.reduce((total, shift) => total + shift.cashTaken, 0)
  const cardTotal = closed.reduce((total, shift) => total + shift.cardTaken, 0)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHead title="Shift dashboard" blurb="Live till activity and cashier reconciliation health." />
        <p className="flex items-center gap-2 text-[12px] text-fg-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
          Auto-refresh 30s
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Cashiers" value={String(new Set(posShifts.map((s) => s.cashier)).size)} />
        <Stat label="Open shifts" value={String(openShifts.length)} sub={openShifts.length ? 'Live' : 'All closed'} />
        <Stat label="Red flags" value={String(red.length)} sub="Variance over threshold" />
        <Stat label="Amber" value={String(amber.length)} sub="Watching" />
        <Stat
          label="Net variance"
          value={`${net >= 0 ? '+' : ''}USD ${Math.round(net)}`}
          sub="Sum across all closed shifts"
        />
      </div>

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
            {closed.length} shifts closed · {closed.length} sales in the last {days} days
          </p>
          {closed.length ? (
            <p className="mt-10 text-center font-mono text-[22px] font-bold">USD {money(cashTotal + cardTotal)}</p>
          ) : (
            <p className="py-20 text-center text-[14px] text-fg-muted">No shifts closed in this period</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[17px] font-semibold">Cash mix</h2>
          <p className="mt-1 text-[13px] text-fg-muted">How much of the take can physically go missing</p>
          <ul className="mt-5 space-y-4">
            <li>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span>Cash</span>
                <span className="text-fg-muted">USD {Math.round(cashTotal)}</span>
              </div>
              <Bar value={cashTotal} max={Math.max(1, cashTotal + cardTotal)} />
            </li>
            <li>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span>Card / UPI / other</span>
                <span className="text-fg-muted">USD {Math.round(cardTotal)}</span>
              </div>
              <Bar value={cardTotal} max={Math.max(1, cashTotal + cardTotal)} />
            </li>
          </ul>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_22rem]">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[17px] font-semibold">Cash variance by shift</h2>
          <p className="mt-1 text-[13px] text-fg-muted">Above the line is over the count, below is short</p>
          {closed.length ? (
            <ul className="mt-5 space-y-2">
              {closed.map((shift) => (
                <li key={shift.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{shift.cashier}</span>
                  <span className={`font-mono ${varianceOf(shift) < 0 ? 'text-bad' : 'text-ok'}`}>
                    {varianceOf(shift) >= 0 ? '+' : ''}
                    {money(varianceOf(shift))}
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
          <p className="mt-1 text-[13px] text-fg-muted">How the team splits by reconciliation health</p>
          <div className="mt-8 grid grid-cols-3 text-center">
            {[
              { label: 'Green', value: closed.length - red.length - amber.length },
              { label: 'Amber', value: amber.length },
              { label: 'Red', value: red.length },
            ].map((band) => (
              <div key={band.label}>
                <p className="text-[18px] font-bold">{Math.max(0, band.value)}</p>
                <p className="mt-8 text-[12px] text-fg-muted">{band.label}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-[17px] font-semibold">Takings by cashier</h2>
        <p className="mt-1 text-[13px] text-fg-muted">Across every closed shift</p>
        {closed.length ? (
          <ul className="mt-5 space-y-2">
            {closed.map((shift) => (
              <li key={shift.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span>{shift.cashier}</span>
                <span className="font-mono text-fg-muted">USD {money(shift.cashTaken + shift.cardTaken)}</span>
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
          {openShifts.length ? `${openShifts.length} till(s) open.` : 'No tills open right now.'}
        </p>
        {openShifts.length ? (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {openShifts.map((shift) => (
              <li key={shift.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5 text-[13px]">
                <span className="min-w-0 flex-1">{shift.cashier}</span>
                <span className="text-fg-muted">float {money(shift.openingFloat)}</span>
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
          Red ≥ USD {cashierBands.red} variance · Amber ≥ USD {cashierBands.amber}.
        </p>
        {closed.length ? (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {closed.map((shift) => (
              <li key={shift.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5 text-[13px]">
                <span className="min-w-0 flex-1">{shift.cashier}</span>
                <span
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                    Math.abs(varianceOf(shift)) >= cashierBands.red
                      ? 'tone-rose'
                      : Math.abs(varianceOf(shift)) >= cashierBands.amber
                        ? 'tone-amber'
                        : 'tone-emerald'
                  }`}
                >
                  {money(Math.abs(varianceOf(shift)))} variance
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 py-10 text-center text-[14px] text-fg-muted">
            No cashier activity yet. Once shifts close with a counted-cash reconciliation, scores appear here.
          </p>
        )}
      </div>
    </div>
  )
}

export function ArAgingPane() {
  const { open } = useLedger()

  const buckets = agingBuckets.map((bucket) => {
    const rows = open.filter((doc) => {
      const age = doc.dueDate ? Math.floor((Date.now() - new Date(doc.dueDate).getTime()) / 86_400_000) : -1
      if (bucket.id === 'current') return age < 0
      if (bucket.id === '1_30') return age >= 0 && age <= 30
      if (bucket.id === '31_60') return age > 30 && age <= 60
      if (bucket.id === '61_90') return age > 60 && age <= 90
      return age > 90
    })
    return { ...bucket, value: rows.reduce((total, doc) => total + doc.total, 0) }
  })
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0)
  const aged = buckets.filter((b) => ['61_90', '90_plus'].includes(b.id)).reduce((sum, b) => sum + b.value, 0)

  const byCustomer = [...open.reduce((map, doc) => map.set(doc.customer, (map.get(doc.customer) ?? 0) + doc.total), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])

  return (
    <div>
      <PageHead title="Accounts receivable aging" blurb={`Live snapshot as of ${today()}.`} />

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Stat currency="USD" label="Total outstanding" value={money(total)} sub={`${open.length} open invoices`} />
        <Stat label="Customers with balance" value={String(byCustomer.length)} sub="Distinct accounts" />
        <Stat currency="USD" label="Aged > 60 days" value={money(aged)} sub="Likely collection issues" />
      </div>

      <section className="mt-6">
        <h2 className="text-[17px] font-semibold">Aging by bucket</h2>
        <p className="mt-1 text-[13px] text-fg-muted">Each row shows the share of total outstanding.</p>
        <ul className="mt-5 space-y-5">
          {buckets.map((bucket) => (
            <li key={bucket.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[15px] font-semibold">
                  {bucket.label} <span className="ml-1.5 text-[13px] font-normal text-fg-muted">{bucket.hint}</span>
                </span>
                <span className="font-mono text-[15px] font-semibold">
                  <span className="mr-1.5 text-[12px] font-medium text-fg-muted">USD</span>
                  {money(bucket.value)}
                </span>
              </div>
              <Bar value={bucket.value} max={Math.max(1, total)} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[17px] font-semibold">By customer</h2>
        <p className="mt-1 text-[13px] text-fg-muted">Sorted by amount owed. Ordered oldest-first within each row.</p>
        {byCustomer.length ? (
          <ul className="mt-5 divide-y divide-line rounded-2xl border border-line bg-surface">
            {byCustomer.map(([customer, value]) => (
              <li key={customer} className="flex items-center justify-between gap-4 px-6 py-3.5 text-[13px]">
                <span>{customer}</span>
                <span className="font-mono">USD {money(value)}</span>
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
    </div>
  )
}

export function PosReportsPane() {
  const { posDocs } = useWorkspace()
  const [tab, setTab] = useState('tracker')
  const [status, setStatus] = useState('All statuses')
  const orders = posDocs.filter((doc) => doc.kind === 'order')
  const visible = orders.filter((order) => status === 'All statuses' || order.status === status)

  return (
    <div>
      <PageHead
        title="Sales reports"
        blurb="Order-to-cash tracking, customer + cashier performance, and an AI cashflow forecast."
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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <Select
          label="Status"
          value={status}
          options={['All statuses', 'Draft', 'Confirmed', 'Delivered', 'Closed']}
          onChange={setStatus}
        />
        <p className="text-[13px] text-fg-muted">
          {visible.length} orders · as of {today()}
        </p>
      </div>

      <div className="mt-4">
        {tab === 'tracker' ? (
          visible.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {visible.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5 text-[13px]">
                  <span className="w-24 shrink-0 font-mono text-[12px] text-fg-muted">{order.reference}</span>
                  <span className="min-w-0 flex-1">{order.customer}</span>
                  <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-sky">{order.status}</span>
                  <span className="font-mono">USD {money(order.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No sales orders match these filters yet." />
          )
        ) : (
          <Empty
            title={`${posReportTabs.find((item) => item.id === tab)?.label} needs trade history this rebuild does not simulate yet.`}
          />
        )}
      </div>
    </div>
  )
}

export function MatchSettingsPane() {
  const { matchSettings, updateMatchSettings } = useWorkspace()
  const [draft, setDraft] = useState(matchSettings)
  const dirty = JSON.stringify(draft) !== JSON.stringify(matchSettings)

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  return (
    <div>
      <PageHead
        title="Match settings"
        blurb="How strictly a Sales Invoice must agree with its Sales Order and Delivery Note before it can post."
        actions={
          <Button variant="accent" disabled={!dirty} onClick={() => updateMatchSettings(draft)}>
            <Icon name="file-text" size={15} /> Save
          </Button>
        }
      />

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="flex items-center gap-2.5 text-[16px] font-semibold">
            <Icon name="network" size={17} className="text-accent" />
            3-way match tolerances
          </h2>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            How far an invoice may drift from the order and the delivery note before the action below applies.
          </p>

          {(
            [
              { key: 'price', label: 'Price', hint: 'Difference between the invoiced rate and the ordered rate.' },
              {
                key: 'quantity',
                label: 'Quantity',
                hint: 'Difference between the invoiced quantity and what was delivered.',
              },
            ] as const
          ).map((row) => (
            <div key={row.key} className="mt-5">
              <p className="text-[14px] font-medium">{row.label}</p>
              <p className="mt-0.5 text-[12px] text-fg-muted">{row.hint}</p>
              <div className="mt-2 flex flex-wrap gap-3">
                <span className="flex items-center rounded-xl border border-line bg-bg pr-3">
                  <input
                    type="number"
                    aria-label={`${row.label} tolerance`}
                    value={row.key === 'price' ? draft.priceTolerance : draft.quantityTolerance}
                    onChange={(event) =>
                      row.key === 'price'
                        ? set('priceTolerance', Number(event.target.value))
                        : set('quantityTolerance', Number(event.target.value))
                    }
                    className="w-20 bg-transparent px-3.5 py-2.5 text-right text-[14px] focus:outline-none"
                  />
                  <span className="text-[13px] text-fg-muted">%</span>
                </span>
                <select
                  aria-label={`${row.label} action`}
                  value={row.key === 'price' ? draft.priceAction : draft.quantityAction}
                  onChange={(event) =>
                    row.key === 'price'
                      ? set('priceAction', event.target.value)
                      : set('quantityAction', event.target.value)
                  }
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
            Refuse an invoice that is not linked back to its paperwork. Worth turning on where every sale must be
            traceable to an order and a shipment.
          </p>

          <ul className="mt-5 space-y-3">
            {(
              [
                {
                  key: 'requireOrder',
                  label: 'Require a Sales Order for every invoice',
                  hint: 'Blocks invoicing anything that was never ordered.',
                },
                {
                  key: 'requireDelivery',
                  label: 'Require a Delivery Note for every invoice',
                  hint: 'Blocks invoicing before the goods have shipped.',
                },
              ] as const
            ).map((row) => (
              <li key={row.key} className="rounded-xl border border-line px-4 py-3.5">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={draft[row.key]}
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
