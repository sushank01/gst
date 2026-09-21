'use client'

import { useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { money } from '../../../lib/posData'
import { useWorkspace, type PosDoc } from '../../../lib/workspace'
import { Dialog, Label, inputClass } from '../travel/shell'

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

export function Stat({ label, value, sub, currency }: { label: string; value: string; sub?: string; currency?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">{label}</p>
      <p className="mt-2.5 text-[24px] leading-none font-bold">
        {currency && <span className="mr-1.5 text-[14px] font-medium text-fg-muted">{currency}</span>}
        {value}
      </p>
      {sub && <p className="mt-2.5 text-[12px] text-fg-muted">{sub}</p>}
    </div>
  )
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
  filters,
}: {
  kind: PosDoc['kind']
  title: string
  blurb: React.ReactNode
  createLabel: string
  statuses: readonly string[]
  emptyTitle: React.ReactNode
  emptyHint?: React.ReactNode
  emptyIcon?: string
  extraActions?: React.ReactNode
  filters?: React.ReactNode
}) {
  const { posDocs, posCustomers, addPosDoc, removePosDoc } = useWorkspace()
  const [status, setStatus] = useState(statuses[0])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ customer: '', total: '', reason: '' })

  const rows = posDocs.filter((doc) => {
    if (doc.kind !== kind) return false
    if (status !== statuses[0] && doc.status !== status) return false
    return true
  })

  return (
    <div>
      <PageHead
        title={title}
        blurb={blurb}
        actions={
          <>
            {extraActions}
            <Button variant="accent" onClick={() => setOpen(true)}>
              + {createLabel}
            </Button>
          </>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {filters}
        <Select label="Status" value={status} options={statuses} onChange={setStatus} />
      </div>

      <div className="mt-5">
        {rows.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {rows.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                <span className="w-24 shrink-0 font-mono text-[12px] text-fg-muted">{doc.reference}</span>
                <span className="min-w-[10rem] flex-1 text-[14px]">{doc.customer}</span>
                <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-sky">{doc.status}</span>
                <span className="font-mono text-[13px]">USD {money(doc.total)}</span>
                <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => removePosDoc(doc.id)}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title={emptyTitle} hint={emptyHint} icon={emptyIcon} />
        )}
      </div>

      {open && (
        <Dialog title={createLabel} onClose={() => setOpen(false)}>
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
              <Label>Total (USD)</Label>
              <input
                type="number"
                min={0}
                value={draft.total}
                onChange={(event) => setDraft((prev) => ({ ...prev, total: event.target.value }))}
                className={inputClass}
              />
            </label>
            {(kind === 'credit' || kind === 'return' || kind === 'refund') && (
              <label>
                <Label>Reason</Label>
                <input
                  value={draft.reason}
                  onChange={(event) => setDraft((prev) => ({ ...prev, reason: event.target.value }))}
                  className={inputClass}
                />
              </label>
            )}
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
                  kind,
                  customer: draft.customer.trim(),
                  status: statuses[1] ?? 'Draft',
                  total: Number(draft.total) || 0,
                  source: 'Manual',
                  payment: 'Unpaid',
                  reason: draft.reason.trim(),
                  dueDate: '',
                })
                setDraft({ customer: '', total: '', reason: '' })
                setOpen(false)
              }}
            >
              Create
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
