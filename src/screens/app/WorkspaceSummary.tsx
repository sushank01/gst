'use client'

import { Link } from '../../lib/router'
import { formatAmount, useOverview } from '../../lib/useWorkspaceSummary'

/**
 * The workspace figures, from the server.
 *
 * Two things this does that the prototype's dashboard did not. It shows the
 * states a real fetch has — first load, failure, retry — rather than rendering
 * zeroes while a request is in flight or after it failed. And where the server
 * says a figure cannot be computed, it says so, because "no ticket has had a
 * first response yet" and "the median is zero" are different facts and a
 * dashboard that renders both as 0 is lying about one of them.
 */

function Figure({ label, value, hint, to }: { label: string; value: string; hint?: string; to?: string }) {
  const body = (
    <>
      <p className="text-[12px] font-medium text-fg-muted">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums leading-none">{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-fg-muted">{hint}</p>}
    </>
  )
  const className = 'block rounded-xl border border-line bg-surface p-4 transition'
  return to ? (
    <Link to={to} className={`${className} hover:border-accent/50`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-fg-2">{title}</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  )
}

export function WorkspaceSummary() {
  const { data, loading, error, canRetry, refetch, refreshing } = useOverview()

  if (loading) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6" aria-busy="true">
        <p className="text-[13px] text-fg-muted">Loading your workspace figures…</p>
      </section>
    )
  }

  if (error || !data) {
    return (
      <section className="rounded-2xl border border-bad/30 bg-bad-muted/30 p-6">
        <h2 className="text-[15px] font-semibold text-bad">These figures could not be loaded</h2>
        <p className="mt-1 text-[13px] text-fg-2">
          {error?.message ?? 'Something went wrong.'}{' '}
          {/* Deliberately not a zero. A failed request is not an empty workspace. */}
          Nothing is shown rather than showing zeroes, which would look like an empty workspace.
        </p>
        {canRetry && (
          <button
            onClick={refetch}
            className="mt-3 rounded-xl border border-line bg-surface px-4 py-2 text-[13px] font-medium transition hover:bg-surface-2"
          >
            Try again
          </button>
        )}
      </section>
    )
  }

  const unavailable = new Map(data.unavailable.map((entry) => [entry.metric, entry.reason]))
  const median = data.support.medianFirstResponseMinutes

  return (
    <section className="space-y-5" aria-busy={refreshing}>
      <Section title="People">
        <Figure label="Headcount" value={String(data.people.headcount)} to="/app/hr?tab=employees" />
        <Figure label="On probation" value={String(data.people.onProbation)} to="/app/hr?tab=employees" />
        <Figure
          label="Joiners this month"
          value={String(data.people.joinersThisMonth)}
          hint={`${data.people.leaversThisMonth} leaver(s)`}
        />
        <Figure label="On leave today" value={String(data.people.onLeaveToday)} to="/app/hr?tab=leaves" />
      </Section>

      <Section title="Support">
        <Figure label="Open tickets" value={String(data.support.open)} to="/app/support" />
        <Figure label="Breached SLAs" value={String(data.support.breached)} to="/app/support?tab=sla" />
        <Figure label="Unassigned" value={String(data.support.unassigned)} to="/app/support" />
        <Figure
          label="Median first response"
          value={median === null ? 'Not yet' : `${median} min`}
          hint={median === null ? unavailable.get('support.medianFirstResponseMinutes') : undefined}
        />
      </Section>

      <Section title="Sales">
        <Figure
          label="Posted this month"
          value={formatAmount(data.sales.postedThisMonth, data.sales.currency)}
          to="/app/pos?tab=documents"
        />
        <Figure label="Outstanding" value={formatAmount(data.sales.outstanding, data.sales.currency)} />
        <Figure label="Overdue invoices" value={String(data.sales.overdueInvoices)} to="/app/pos?tab=documents" />
        <Figure
          label="Awaiting reimbursement"
          value={formatAmount(data.expenses.awaitingPayment, data.expenses.currency)}
          hint={`${data.expenses.awaitingApproval} claim(s) awaiting approval`}
          to="/app/te"
        />
      </Section>

      <Section title="Assets and credits">
        <Figure label="Assets registered" value={String(data.assets.registered)} to="/app/assets" />
        <Figure label="Issued" value={String(data.assets.issued)} hint={`${data.assets.inService} in service`} />
        <Figure label="Warranty expiring" value={String(data.assets.warrantyExpiring)} hint="within 90 days" />
        <Figure
          label="AI credits available"
          value={data.credits.available.toLocaleString()}
          hint={`${data.credits.used.toLocaleString()} of ${data.credits.granted.toLocaleString()} used`}
          to="/app/account"
        />
      </Section>

      <p className="text-[12px] text-fg-muted">
        Computed from your records at {new Date(data.generatedAt).toLocaleTimeString()}. Every figure is read from the
        same rows the module itself shows, so this cannot disagree with the screen underneath it.
      </p>
    </section>
  )
}
