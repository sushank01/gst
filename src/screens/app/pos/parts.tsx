'use client'

import { StatCard } from '../../../components/StatCard'

import { useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { Dialog, Label, inputClass } from '../../../components/EnterpriseUi'
import type { ApiClientError } from '../../../lib/api'
import { displayStatus, money, useSalesCustomers, useSalesDocuments } from './usePos'

export function PageHead({
  title,
  blurb,
  actions,
}: {
  title: string
  blurb?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        {blurb && <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">{blurb}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  )
}

export function Stat(props: Omit<React.ComponentProps<typeof StatCard>, 'variant'>) {
  return <StatCard {...props} variant="pos" />
}

export function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: max > 0 ? `${(value / max) * 100}%` : '0%' }}
      />
    </div>
  )
}

export function Empty({ title, hint, icon }: { title: React.ReactNode; hint?: React.ReactNode; icon?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-16 text-center">
      {icon && <Icon name={icon} size={28} className="mx-auto text-fg-muted" />}
      <p className={`text-[15px] text-fg-2 ${icon ? 'mt-4' : ''}`}>{title}</p>
      {hint && <p className="mt-1.5 text-[13px] text-fg-muted">{hint}</p>}
    </div>
  )
}

export function Loading({ what }: { what: string }) {
  return (
    <div role="status" className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-[14px] text-fg-muted">
      Loading {what}…
    </div>
  )
}

/**
 * A failed read, shown as a failure.
 *
 * Never as an empty list: an empty list is a fact about the data, and rendering
 * one here is how "the server is down" reads as "you have no orders".
 */
export function Failure({
  what,
  error,
  denied,
  canRetry,
  onRetry,
}: {
  what: string
  error: ApiClientError
  denied?: boolean
  canRetry?: boolean
  onRetry?: () => void
}) {
  return (
    <div role="alert" className="rounded-2xl border border-bad/40 bg-bad-muted/30 px-6 py-10 text-center">
      <p className="text-[15px] font-medium text-fg">
        {denied ? `You do not have access to ${what} in this workspace.` : `We could not load ${what}.`}
      </p>
      <p className="mt-1.5 text-[13px] text-fg-muted">{error.message}</p>
      {canRetry && onRetry && (
        <div className="mt-4">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
      {error.requestId && <p className="mt-3 font-mono text-[11px] text-fg-muted">Reference {error.requestId}</p>}
    </div>
  )
}

/** A write that failed, beside the control that attempted it. */
export function WriteError({ error }: { error: ApiClientError | null }) {
  if (!error) return null
  return (
    <p role="alert" className="mt-3 text-[13px] text-bad">
      {error.isConflict ? `Somebody else changed this. ${error.message}` : error.message}
    </p>
  )
}

/** A note about something this deployment genuinely cannot do. */
export function NotAvailable({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-3 text-[13px] leading-relaxed text-fg-muted">
      {children}
    </p>
  )
}

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (next: string) => void
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-fg-2 focus:border-accent focus:outline-none"
    >
      {options.map((item) => (
        <option key={item}>{item}</option>
      ))}
    </select>
  )
}

/**
 * The order-to-invoice lists all have the same shape — a filtered list of
 * documents of one kind with a create dialog — so they share this component.
 *
 * The filter, the search and the count all happen on the server: the figure
 * beside the list is the number of documents that match, not the number that
 * happened to load. A row's money keeps the currency the document was raised
 * in rather than a prefix the screen chose.
 */
export function DocListPane({
  kind,
  title,
  blurb,
  createLabel,
  statuses,
  emptyTitle,
  emptyHint,
  emptyIcon,
  extraActions,
  searchable,
  rowAction,
  note,
}: {
  kind: string
  title: string
  blurb: React.ReactNode
  /** Omitted where this screen cannot honestly create the document itself. */
  createLabel?: string
  statuses: readonly string[]
  emptyTitle: React.ReactNode
  emptyHint?: React.ReactNode
  emptyIcon?: string
  extraActions?: React.ReactNode
  /** Matches on the document reference, which is what the server can search. */
  searchable?: boolean
  rowAction?: (document: DocumentRow) => React.ReactNode
  /** Said plainly, where a surface cannot do what its heading implies. */
  note?: React.ReactNode
}) {
  const [status, setStatus] = useState(statuses[0])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  const documents = useSalesDocuments({ kind, status, q: query, limit: 50 })

  return (
    <div>
      <PageHead
        title={title}
        blurb={blurb}
        actions={
          <>
            {extraActions}
            {createLabel && (
              <Button variant="accent" onClick={() => setOpen(true)}>
                + {createLabel}
              </Button>
            )}
          </>
        }
      />

      {note && <NotAvailable>{note}</NotAvailable>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {searchable && (
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by document number…"
            aria-label="Search by document number"
            className="min-w-[16rem] rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        )}
        <Select label="Status" value={status} options={statuses} onChange={setStatus} />
        {/* Never a figure while the figure is unknown: "0 matching" beside a
            request that is still in flight, or one that failed, is read as a
            fact about the data rather than as the absence of an answer. */}
        <span className="text-[13px] text-fg-muted" aria-live="polite">
          {documents.loading
            ? 'Counting…'
            : documents.error
              ? 'Count unavailable'
              : documents.refreshing
                ? 'Updating…'
                : `${documents.total} matching`}
        </span>
      </div>

      <WriteError error={documents.writeError} />

      <div className="mt-5">
        {documents.loading ? (
          <Loading what={title.toLowerCase()} />
        ) : documents.error ? (
          <Failure
            what={title.toLowerCase()}
            error={documents.error}
            denied={documents.denied}
            canRetry={documents.canRetry}
            onRetry={documents.refetch}
          />
        ) : documents.documents.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {documents.documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                <span className="w-24 shrink-0 font-mono text-[12px] text-fg-muted">{doc.reference}</span>
                <span className="min-w-[10rem] flex-1 text-[14px]">{doc.customerName ?? 'No customer'}</span>
                <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-sky">
                  {displayStatus(doc.status)}
                </span>
                <span className="font-mono text-[13px]">{money(doc.grandTotal, doc.currency)}</span>
                {rowAction?.(doc)}
                {/* A posted document is evidence; the correction for it is a
                    credit note, so there is nothing to offer here. */}
                {!doc.postedAt && !doc.cancelledAt && (
                  <Button
                    variant="secondary"
                    className="!py-2 !text-[13px]"
                    disabled={documents.writing}
                    onClick={() => {
                      if (confirming !== doc.id) {
                        setConfirming(doc.id)
                        return
                      }
                      setConfirming(null)
                      void documents.cancelDocument(doc.id, doc.version)
                    }}
                  >
                    {confirming === doc.id ? 'Confirm cancel' : 'Cancel'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : query || status !== statuses[0] ? (
          <Empty title="Nothing matches these filters." />
        ) : (
          <Empty title={emptyTitle} hint={emptyHint} icon={emptyIcon} />
        )}
      </div>

      {open && createLabel && (
        <CreateDocumentDialog
          title={createLabel}
          kind={kind}
          defaultStatus={statuses[1] ?? 'Draft'}
          documents={documents}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

type DocumentRow = ReturnType<typeof useSalesDocuments>['documents'][number]

/**
 * The create dialog for every document kind.
 *
 * A document is priced from its lines on the server, so the one figure this
 * form collects becomes one line and says so. A customer is required: the
 * currency and the terms come from their record, and the old free-text name
 * produced a document addressed to a customer that did not exist.
 */
export function CreateDocumentDialog({
  title,
  kind,
  defaultStatus,
  documents,
  onClose,
}: {
  title: string
  kind: string
  defaultStatus: string
  documents: ReturnType<typeof useSalesDocuments>
  onClose: () => void
}) {
  const customers = useSalesCustomers({ activeOnly: true, limit: 200 })
  const [customerId, setCustomerId] = useState('')
  const [description, setDescription] = useState('')
  const [total, setTotal] = useState('')

  const selected = customers.customers.find((customer) => customer.id === customerId)
  const needsReason = ['credit', 'return', 'refund'].includes(kind)

  return (
    <Dialog title={title} onClose={onClose}>
      {customers.loading ? (
        <p className="mt-5 text-[14px] text-fg-muted">Loading customers…</p>
      ) : customers.error ? (
        <div className="mt-5">
          <Failure
            what="customers"
            error={customers.error}
            denied={customers.denied}
            canRetry={customers.canRetry}
            onRetry={customers.refetch}
          />
        </div>
      ) : !customers.customers.length ? (
        <p className="mt-5 text-[14px] leading-relaxed text-fg-muted">
          There are no customers yet. A document is raised against a customer record — its currency and payment terms
          come from there — so create one on the Customers page first.
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
              {customers.total > customers.customers.length && (
                <span className="mt-1.5 block text-[12px] text-fg-muted">
                  Showing {customers.customers.length} of {customers.total}. Search on the Customers page for the rest.
                </span>
              )}
            </label>
            <label>
              <Label>{needsReason ? 'Reason' : 'Description'}</Label>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={needsReason ? 'Why this is being raised' : 'What this covers'}
                className={inputClass}
              />
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
                This creates the document with a single line for the amount above, in the customer&apos;s currency.
                Line-by-line entry and tax categories are not available on this screen.
              </span>
            </label>
            {documents.fieldErrors &&
              Object.entries(documents.fieldErrors).map(([field, message]) => (
                <p key={field} className="text-[13px] text-bad" role="alert">
                  {message}
                </p>
              ))}
            <WriteError error={documents.writeError} />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!selected || !total.trim() || documents.writing}
              onClick={async () => {
                if (!selected) return
                const created = await documents.createDocument({
                  customerId: selected.id,
                  currency: selected.currency,
                  status: defaultStatus,
                  description: description.trim() || title,
                  total: total.trim(),
                })
                if (created) onClose()
              }}
            >
              {documents.writing ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  )
}
