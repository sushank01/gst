'use client'

import { useState } from 'react'
import { Link, useSearchParams } from '../../../lib/router'
import { Icon } from '../../../components/Icon'
import { marketApps } from '../../../lib/appData'
import {
  deliveryStatuses,
  invoiceStatuses,
  orderStatuses,
  paymentFilters,
  posNav,
  sourceFilters,
} from '../../../lib/posData'
import { useWorkspace } from '../../../lib/workspace'
import { DocListPane, Empty } from './parts'
import {
  ArAgingPane,
  CustomersPane,
  MatchSettingsPane,
  PosDashboard,
  PosReportsPane,
  PosTillPane,
  QuotationsPane,
  ShiftsPane,
} from './panes'
import { PosSettingsPane } from './settings'
import { Button } from '../../../components/ui'

const app = marketApps.find((item) => item.code === 'POS')
const allItems = posNav.flatMap((group) => group.items)

/** A collapsible group in the app's own left rail. */
function NavGroup({
  group,
  items,
  active,
  onSelect,
}: {
  group: string
  items: typeof posNav[number]['items']
  active: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mt-4 first:mt-0">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2 pb-1.5 text-[11px] font-semibold tracking-[0.1em] text-accent uppercase"
      >
        <span aria-hidden className="text-[9px]">
          {open ? '⌄' : '›'}
        </span>
        {group}
      </button>
      {open && (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onSelect(item.id)}
                aria-current={active === item.id ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-left text-[13.5px] transition ${
                  active === item.id ? 'bg-accent-muted font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2'
                }`}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function SalesPos() {
  const [params, setParams] = useSearchParams()
  const { installed, trialDaysLeft, posDocs, addPosDoc } = useWorkspace()
  const section = allItems.find((item) => item.id === params.get('tab'))?.id ?? 'dashboard'

  if (!app || !installed.includes('POS')) {
    return (
      <div className="mx-auto max-w-2xl pt-2">
        <h1 className="text-[22px] font-bold tracking-tight">Sales &amp; POS is not installed</h1>
        <p className="mt-2 text-[14px] text-fg-muted">
          Install it from the marketplace and its customers, orders and till appear here.
        </p>
        <Link to="/app/marketplace" className="mt-5 inline-block text-[13px] font-medium text-accent hover:underline">
          Browse marketplace →
        </Link>
      </div>
    )
  }

  const select = (id: string) => setParams(id === 'dashboard' ? {} : { tab: id })

  // "Run due now" is the manual version of the daily beat task the blurb describes:
  // every active subscription drafts one invoice, then the invoice list opens.
  const dueSubscriptions = posDocs.filter((doc) => doc.kind === 'subscription' && doc.status === 'Active')
  const runSubscriptionSweep = () => {
    dueSubscriptions.forEach((sub) =>
      addPosDoc({
        kind: 'invoice',
        customer: sub.customer,
        status: 'Draft',
        total: sub.total,
        source: `Subscription ${sub.reference}`,
        payment: 'Unpaid',
        reason: '',
        dueDate: '',
      }),
    )
    select('sales_invoices')
  }

  const panes: Record<string, React.ReactElement> = {
    dashboard: <PosDashboard />,
    customers: <CustomersPane />,
    rate_contracts: (
      <DocListPane
        kind="contract"
        title="Rate contracts"
        blurb="Negotiated rates with a committed volume and a term. A contract rate overrides the price list, so what is agreed is what gets invoiced."
        createLabel="New contract"
        statuses={['All statuses', 'Active', 'Expired']}
        emptyIcon="file-text"
        emptyTitle="No rate contracts yet"
        emptyHint="A rate contract holds an agreed rate, a committed volume and a term. Until one exists, every customer is invoiced from the price list."
      />
    ),
    quotations: <QuotationsPane />,
    sales_orders: (
      <DocListPane
        kind="order"
        title="Sales orders"
        blurb="Confirm orders, track fulfilment status, and roll forward to delivery + invoice."
        createLabel="New sales order"
        statuses={orderStatuses}
        emptyTitle="No sales orders yet."
        emptyHint={
          <>
            Click <strong className="font-semibold text-fg-2">New sales order</strong> to create the first one.
          </>
        }
      />
    ),
    delivery_notes: (
      <DocListPane
        kind="delivery"
        title="Delivery notes"
        blurb="Record shipments, post COGS, and route revenue / inventory journal entries."
        createLabel="New delivery note"
        statuses={deliveryStatuses}
        emptyTitle="No delivery notes yet."
        emptyHint={
          <>
            Click <strong className="font-semibold text-fg-2">New delivery note</strong> to record a shipment.
          </>
        }
      />
    ),
    sales_invoices: (
      <DocListPane
        kind="invoice"
        title="Sales invoices"
        blurb="Draft, post to GL, run a 3-way match, refund, and chase outstanding."
        createLabel="New invoice"
        statuses={invoiceStatuses}
        emptyTitle="No sales invoices yet."
        emptyHint={
          <>
            Click <strong className="font-semibold text-fg-2">New invoice</strong> to create the first one.
          </>
        }
        extraActions={
          <Button variant="secondary" onClick={() => select('sales_returns')}>
            <Icon name="refresh" size={15} /> Returns (RMA)
          </Button>
        }
        filters={
          <>
            <input
              placeholder="Scan receipt or type invoice no..."
              aria-label="Scan receipt"
              className="min-w-[16rem] rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
            <select
              aria-label="Payment"
              className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-fg-2 focus:border-accent focus:outline-none"
            >
              {paymentFilters.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              aria-label="Source"
              className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-fg-2 focus:border-accent focus:outline-none"
            >
              {sourceFilters.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </>
        }
      />
    ),
    pos: <PosTillPane />,
    shift_dashboard: <ShiftsPane />,
    sales_returns: (
      <DocListPane
        kind="return"
        title="Sales returns"
        blurb="Credit notes raised against sales invoices — what has been credited back to customers, and whether it has reached the ledger."
        createLabel="New return"
        statuses={invoiceStatuses}
        emptyTitle="No sales returns yet."
        emptyHint={
          <>
            Raise one from an invoice&apos;s <strong className="font-semibold text-fg-2">Return / credit note</strong>{' '}
            action.
          </>
        }
      />
    ),
    credit_notes: (
      <DocListPane
        kind="credit"
        title="Credit notes"
        blurb="Credits raised against a customer's account — goodwill, settlements, rebates and post-sale corrections that answer no single invoice."
        createLabel="Record a credit note"
        statuses={['All statuses', 'Draft', 'Posted', 'Applied']}
        emptyIcon="file-text"
        emptyTitle="No credit notes yet. Record one for a goodwill credit, a settlement or a rebate that no single invoice covers."
      />
    ),
    refunds: (
      <DocListPane
        kind="refund"
        title="Refunds"
        blurb="Money actually sent back to a customer, against a credit note or an over-payment."
        createLabel="Record a refund"
        statuses={['All statuses', 'Pending', 'Sent', 'Failed']}
        emptyIcon="refresh"
        emptyTitle="No refunds yet."
        emptyHint="A refund settles a credit note in cash rather than against a future invoice."
      />
    ),
    ar_aging: <ArAgingPane />,
    reports: <PosReportsPane />,
    subscriptions: (
      <DocListPane
        kind="subscription"
        title="Subscriptions"
        blurb="Recurring billing schedules for customers. Daily beat task auto-generates draft invoices; admins can run a sweep manually."
        createLabel="New subscription"
        statuses={['All', 'Active', 'Paused', 'Ended']}
        emptyTitle="No subscriptions yet. Create one to start recurring billing."
        extraActions={
          <Button variant="secondary" disabled={!dueSubscriptions.length} onClick={runSubscriptionSweep}>
            <Icon name="refresh" size={15} /> Run due now
          </Button>
        }
      />
    ),
    match_settings: <MatchSettingsPane />,
    settings: <PosSettingsPane />,
  }

  return (
    <div className="pt-2">
      <header className="flex flex-wrap items-start gap-5 border-b border-line pb-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-white">
          <Icon name="bag" size={22} />
        </span>
        <div className="min-w-[18rem] flex-1">
          <h1 className="text-[20px] font-bold tracking-tight">{app.name}</h1>
          <p className="mt-1 max-w-5xl text-[13.5px] leading-relaxed text-fg-2">
            Order-to-cash for retail and B2B: customers, sales orders, delivery notes, sales invoices with GL post, AR
            aging, payments, plus a full point-of-sale till with shift reconciliation.
          </p>
          <p className="mt-1 text-[13px] text-fg-muted">v1.0.0</p>
        </div>
        <span className="rounded-full bg-warn-muted px-3.5 py-1.5 text-[13px] font-medium text-warn">
          Trial · {trialDaysLeft} days left
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Sales & POS" className="border-r border-line py-5 pr-4">
          {posNav.map((group) => (
            <NavGroup key={group.group} group={group.group} items={group.items} active={section} onSelect={select} />
          ))}
        </nav>

        <div key={section} className="app-enter py-5">
          {panes[section] ?? <Empty title="Not found" />}
        </div>
      </div>
    </div>
  )
}
