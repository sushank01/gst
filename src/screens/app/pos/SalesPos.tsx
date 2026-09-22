'use client'

import { NavGroup } from '../../../components/NavGroup'
import { Link, useSearchParams } from '../../../lib/router'
import { Icon } from '../../../components/Icon'
import { marketApps } from '../../../lib/appData'
import { deliveryStatuses, orderStatuses, posNav } from '../../../lib/posData'
import { useInstallations } from '../../../lib/useInstallations'
import { DocListPane, Empty, Failure, Loading } from './parts'
import {
  ArAgingPane,
  CustomersPane,
  MatchSettingsPane,
  PosDashboard,
  PosReportsPane,
  PosTillPane,
  QuotationsPane,
  RateContractsPane,
  SalesInvoicesPane,
  SalesReturnsPane,
  ShiftsPane,
  SubscriptionsPane,
} from './panes'
import { PosSettingsPane } from './settings'

const app = marketApps.find((item) => item.code === 'POS')
const allItems = posNav.flatMap((group) => group.items)

export default function SalesPos() {
  const [params, setParams] = useSearchParams()
  const installations = useInstallations()
  const section = allItems.find((item) => item.id === params.get('tab'))?.id ?? 'dashboard'

  const entry = installations.apps.find((item) => item.code === 'POS')
  const trialDaysLeft = installations.entitlement?.trialDaysLeft ?? null

  if (installations.loading) return <Loading what="this application" />
  if (installations.error) {
    return (
      <Failure
        what="this application"
        error={installations.error}
        canRetry={installations.error.retryable}
        onRetry={installations.refetch}
      />
    )
  }

  // Disabled is not the same as absent: the data is still there, the app is
  // closed to users, and only an admin can reopen it.
  if (!app || entry?.status !== 'installed') {
    const disabled = entry?.status === 'disabled'
    return (
      <div className="mx-auto max-w-2xl pt-2">
        <h1 className="text-[22px] font-bold tracking-tight">
          Sales &amp; POS is {disabled ? 'switched off' : 'not installed'}
        </h1>
        <p className="mt-2 text-[14px] text-fg-muted">
          {disabled
            ? 'Its records are intact. An administrator can switch it back on from the marketplace.'
            : 'Install it from the marketplace and its customers, orders and till appear here.'}
        </p>
        <Link to="/app/marketplace" className="mt-5 inline-block text-[13px] font-medium text-accent hover:underline">
          Browse marketplace →
        </Link>
      </div>
    )
  }

  const select = (id: string) => setParams(id === 'dashboard' ? {} : { tab: id })

  const panes: Record<string, React.ReactElement> = {
    dashboard: <PosDashboard />,
    customers: <CustomersPane />,
    rate_contracts: <RateContractsPane />,
    quotations: <QuotationsPane />,
    sales_orders: (
      <DocListPane
        kind="order"
        title="Sales orders"
        blurb="Confirm orders and track them through to delivery and invoice."
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
        blurb="Record shipments against an order, so an invoice can be matched to what actually went out."
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
    sales_invoices: <SalesInvoicesPane onViewReturns={() => select('sales_returns')} />,
    pos: <PosTillPane />,
    shift_dashboard: <ShiftsPane />,
    sales_returns: <SalesReturnsPane />,
    credit_notes: (
      <DocListPane
        kind="credit"
        title="Credit notes"
        blurb="Credits raised against a customer's account — goodwill, settlements, rebates and post-sale corrections that answer no single invoice."
        createLabel="Record a credit note"
        statuses={['All statuses', 'Draft', 'Posted']}
        emptyIcon="file-text"
        emptyTitle="No credit notes yet. Record one for a goodwill credit, a settlement or a rebate that no single invoice covers."
        note={
          <>
            A credit that answers one invoice belongs on that invoice instead: it is priced at what was charged and
            bounded by what is still returnable. Use the invoice&apos;s{' '}
            <strong className="font-semibold text-fg-2">Return / credit note</strong> action for those.
          </>
        }
      />
    ),
    refunds: (
      <DocListPane
        kind="refund"
        title="Refunds"
        blurb="Money actually sent back to a customer, against a credit note or an over-payment."
        createLabel="Record a refund"
        statuses={['All statuses', 'Draft', 'Posted']}
        emptyIcon="refresh"
        emptyTitle="No refunds yet."
        emptyHint="A refund settles a credit note in cash rather than against a future invoice."
        note="Recording a refund here creates the document and its number. It does not move money — nothing on this deployment sends a payment."
      />
    ),
    ar_aging: <ArAgingPane />,
    reports: <PosReportsPane />,
    subscriptions: <SubscriptionsPane />,
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
          <h1 className="text-[20px] font-bold tracking-tight">{entry.name}</h1>
          <p className="mt-1 max-w-5xl text-[13.5px] leading-relaxed text-fg-2">
            Order-to-cash for retail and B2B: customers, sales orders, delivery notes, sales invoices with GL post, AR
            aging, payments, plus a point-of-sale till with shift reconciliation.
          </p>
        </div>
        {/* Shown only while the workspace is actually on a trial with a
            computed end date. The badge used to count down from a constant. */}
        {trialDaysLeft !== null && (
          <span className="rounded-full bg-warn-muted px-3.5 py-1.5 text-[13px] font-medium text-warn">
            Trial · {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left
          </span>
        )}
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
