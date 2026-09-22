'use client'

import { useMemo, useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { useAuth } from '../../../lib/auth'
import {
  assetReportTabs,
  assetStages,
  requestStatuses,
  requestTypes,
  warrantyAlertDays,
} from '../../../lib/assetData'
import { useWorkspace } from '../../../lib/workspace'
import { Dialog, Label, inputClass } from '../../../components/EnterpriseUi'

const stageTone: Record<string, string> = {
  'In Stock': 'tone-slate',
  Allocated: 'tone-sky',
  Issued: 'tone-emerald',
  'Awaiting check': 'tone-amber',
  'In Repair': 'tone-violet',
  Retired: 'tone-rose',
}

/** Days until a date, negative once it has passed. */
const daysUntil = (iso: string) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : Infinity)

export function AssetDashboard() {
  const { assets, assetRequests } = useWorkspace()

  // Retired units are no longer part of the estate, so they are excluded.
  const active = assets.filter((item) => item.stage !== 'Retired')
  const pending = assetRequests.filter((item) => item.status === 'Pending')
  const outOfWarranty = active.filter((item) => daysUntil(item.warrantyEnd) < 0)
  const expiring = active.filter((item) => {
    const days = daysUntil(item.warrantyEnd)
    return days >= 0 && days <= warrantyAlertDays
  })
  const withLeavers = active.filter((item) => item.stage === 'Issued' && item.assignedTo?.endsWith('(leaver)'))

  const tiles = [
    { label: 'Pending requests', value: pending.length },
    { label: 'Out of warranty', value: outOfWarranty.length },
    { label: 'Warranty expiring', value: expiring.length },
    { label: 'With leavers', value: withLeavers.length },
  ]

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Active assets</p>
        <p className="mt-2 text-[40px] leading-none font-bold">{active.length}</p>
        <p className="mt-4 text-[13px] text-fg-muted">
          Everything the company still owns. Retired units are excluded — they are no longer part of the estate.
        </p>
      </section>

      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">
          Needs attention{' '}
          <span className="ml-2 text-[12px] font-normal tracking-normal normal-case">
            Things waiting on a person. A zero here means there is nothing to do.
          </span>
        </p>

        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">{tile.label}</p>
              <p className="mt-2.5 text-[24px] leading-none font-bold">{tile.value}</p>
              <p className="mt-2.5 text-[12px] text-fg-muted">
                {tile.value ? `${tile.value} waiting` : 'Nothing to do'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h3 className="text-[16px] font-semibold">Warranty expiring</h3>
          {expiring.length ? (
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
              {expiring.map((asset) => (
                <li key={asset.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="min-w-0 flex-1 text-[13px]">{asset.name}</span>
                  <span className="font-mono text-[12px] text-fg-muted">{asset.tagNo}</span>
                  <span className="text-[12px] text-warn">{daysUntil(asset.warrantyEnd)}d left</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 flex items-center gap-2.5 text-[14px] text-fg-muted">
              <Icon name="shield" size={16} />
              Nothing expiring in the alert window.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6">
          <h3 className="text-[16px] font-semibold">Assets not returned by leavers</h3>
          {withLeavers.length ? (
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
              {withLeavers.map((asset) => (
                <li key={asset.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="min-w-0 flex-1 text-[13px]">{asset.name}</span>
                  <span className="text-[12px] text-fg-muted">{asset.assignedTo}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 flex items-center gap-2.5 text-[14px] text-fg-muted">
              <Icon name="bag" size={16} />
              No departed employee is holding an asset.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

export function AssetRegisterPane() {
  // One clock read per mount, so a row's age does not change mid-render.
  // A lazy state initialiser, not useMemo: a memo body still runs during render.
  const [renderedAt] = useState(() => Date.now())
  const { assets, assetSettings, addAsset, removeAsset, updateAsset } = useWorkspace()
  const types = assetSettings.taxonomies.asset_types ?? []
  const [type, setType] = useState('All types')
  const [project, setProject] = useState('All projects')
  const [stage, setStage] = useState<string>('All')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const [draft, setDraft] = useState({
    name: '',
    type: types[0]?.value ?? 'laptop',
    stage: 'In Stock',
    project: '',
    purchase: '',
    warrantyEnd: '',
  })

  const projects = [...new Set(assets.map((item) => item.project).filter(Boolean))]

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return assets.filter((asset) => {
      if (type !== 'All types' && asset.type !== type) return false
      if (project !== 'All projects' && asset.project !== project) return false
      if (stage !== 'All' && asset.stage !== stage) return false
      if (!needle) return true
      return `${asset.name} ${asset.tagNo} ${asset.assignedTo ?? ''}`.toLowerCase().includes(needle)
    })
  }, [assets, type, project, stage, query])

  const countFor = (item: string) =>
    item === 'All' ? assets.length : assets.filter((asset) => asset.stage === item).length

  function exportCsv() {
    const head = 'asset,tag_no,type,stage,project,purchase,assigned_to,warranty_end'
    const body = visible
      .map((a) =>
        [a.name, a.tagNo, a.type, a.stage, a.project, a.purchase, a.assignedTo ?? '', a.warrantyEnd].join(','),
      )
      .join('\n')
    const url = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: 'text/csv' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'asset-register.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // `result` is string | ArrayBuffer; treating a buffer as text would
      // silently import the literal string "[object ArrayBuffer]".
      const text = typeof reader.result === 'string' ? reader.result : ''
      const rows = text.trim().split(/\r?\n/).slice(1)
      let added = 0
      rows.forEach((row) => {
        const [name, assetType, assetStage, proj, purchase, warranty] = row.split(',')
        if (!name?.trim()) return
        addAsset({
          name: name.trim(),
          type: (assetType ?? '').trim() || types[0]?.value || 'laptop',
          stage: (assetStage ?? '').trim() || 'In Stock',
          project: (proj ?? '').trim(),
          purchase: (purchase ?? '').trim(),
          assignedTo: null,
          warrantyEnd: (warranty ?? '').trim(),
        })
        added += 1
      })
      setNote(`Imported ${added} asset${added === 1 ? '' : 's'}.`)
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-[20px] font-bold tracking-tight">Asset Register</h2>
          <select
            aria-label="Type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
          >
            <option>All types</option>
            {types.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Project"
            value={project}
            onChange={(event) => setProject(event.target.value)}
            className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
          >
            <option>All projects</option>
            {projects.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
          <button
            onClick={() => setNote('No purchase receipts are waiting. Assets appear here once a PO is received.')}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
          >
            <Icon name="bag" size={15} /> Receive from purchase
          </button>
          <Button variant="accent" onClick={() => setOpen(true)}>
            + New asset
          </Button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {['All', ...assetStages].map((item) => (
          <button
            key={item}
            onClick={() => setStage(item)}
            aria-pressed={stage === item}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] transition ${
              stage === item ? 'bg-accent-muted font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {item}
            <span className="text-fg-muted">{countFor(item)}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 max-w-sm">
        <span className="relative block">
          <Icon name="search" size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            aria-label="Search assets"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </span>
      </div>

      {note && <p className="mt-3 text-[13px] text-fg-muted">{note}</p>}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[58rem] border-collapse text-[13px]">
          <thead className="border-b border-line text-[12px] text-fg-muted">
            <tr>
              {['Asset', 'Tag No.', 'Stage', 'Project', 'Purchase', 'Assigned to', 'Warranty', 'Age'].map((column) => (
                <th key={column} scope="col" className="px-5 py-3.5 text-left font-medium">
                  {column}
                </th>
              ))}
              <th scope="col" className="px-5 py-3.5 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.length ? (
              visible.map((asset) => (
                <tr key={asset.id}>
                  <td className="px-5 py-3.5 font-medium">{asset.name}</td>
                  <td className="px-5 py-3.5 font-mono text-[12px] text-fg-muted">{asset.tagNo}</td>
                  <td className="px-5 py-3.5">
                    <select
                      aria-label={`Stage of ${asset.name}`}
                      value={asset.stage}
                      onChange={(event) => updateAsset(asset.id, { stage: event.target.value })}
                      className={`rounded-lg px-2 py-1 text-[11px] font-medium ${stageTone[asset.stage] ?? 'tone-slate'}`}
                    >
                      {assetStages.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3.5 text-fg-2">{asset.project || '—'}</td>
                  <td className="px-5 py-3.5 text-fg-2">{asset.purchase || '—'}</td>
                  <td className="px-5 py-3.5 text-fg-2">{asset.assignedTo ?? '—'}</td>
                  <td className="px-5 py-3.5 text-fg-2">
                    {asset.warrantyEnd ? `${daysUntil(asset.warrantyEnd)}d` : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-fg-2">
                    {Math.max(0, Math.floor((renderedAt - new Date(asset.acquiredAt).getTime()) / 86_400_000))}d
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => removeAsset(asset.id)}
                      aria-label={`Remove ${asset.name}`}
                      className="text-fg-muted transition hover:text-bad"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="px-5 py-16 text-center">
                  <Icon name="inbox" size={28} className="mx-auto text-fg-muted" />
                  <span className="mt-3 block text-[16px] font-medium">No assets yet</span>
                  <span className="mt-1.5 block text-[13px] text-fg-muted">
                    Add one, or bulk-import your existing register from a spreadsheet.
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[13px] text-fg-muted">{visible.length} results</p>

      {open && (
        <Dialog title="New asset" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Asset</Label>
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="MacBook Pro 14"
                className={inputClass}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <Label>Type</Label>
                <select
                  value={draft.type}
                  onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))}
                  className={inputClass}
                >
                  {types.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Label>Stage</Label>
                <select
                  value={draft.stage}
                  onChange={(event) => setDraft((prev) => ({ ...prev, stage: event.target.value }))}
                  className={inputClass}
                >
                  {assetStages.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <Label>Project</Label>
                <input
                  value={draft.project}
                  onChange={(event) => setDraft((prev) => ({ ...prev, project: event.target.value }))}
                  className={inputClass}
                />
              </label>
              <label>
                <Label>Purchase</Label>
                <input
                  value={draft.purchase}
                  onChange={(event) => setDraft((prev) => ({ ...prev, purchase: event.target.value }))}
                  placeholder="PO-1042"
                  className={inputClass}
                />
              </label>
              <label className="sm:col-span-2">
                <Label>Warranty ends</Label>
                <input
                  type="date"
                  value={draft.warrantyEnd}
                  onChange={(event) => setDraft((prev) => ({ ...prev, warrantyEnd: event.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.name.trim()}
              onClick={() => {
                addAsset({ ...draft, name: draft.name.trim(), assignedTo: null })
                setDraft({ ...draft, name: '', project: '', purchase: '', warrantyEnd: '' })
                setOpen(false)
              }}
            >
              Create asset
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export function MyAssetPane() {
  const { assets } = useWorkspace()
  const { session } = useAuth()
  const mine = assets.filter((asset) => asset.assignedTo === session?.user.fullName)

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">My Asset</h2>
      <p className="mt-1.5 text-[14px] text-fg-muted">
        Everything issued to you, past and present. Only your own periods are shown — not who held the item before or
        after you.
      </p>

      <section className="mt-6 rounded-2xl border border-line bg-surface">
        <h3 className="border-b border-line px-6 py-4 text-[15px] font-semibold">My Asset</h3>
        {mine.length ? (
          <ul className="divide-y divide-line">
            {mine.map((asset) => (
              <li key={asset.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                <span className="min-w-0 flex-1 text-[14px]">{asset.name}</span>
                <span className="font-mono text-[12px] text-fg-muted">{asset.tagNo}</span>
                <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${stageTone[asset.stage]}`}>
                  {asset.stage}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-6 text-[14px] text-fg-muted">
            Your account isn&apos;t linked to an employee record, so no equipment can be issued to you. Ask an admin to
            link it.
          </p>
        )}
      </section>
    </div>
  )
}

export function AssetRequestsPane() {
  const { assetRequests, addAssetRequest, decideAssetRequest } = useWorkspace()
  const { session } = useAuth()
  const me = session?.user.fullName ?? 'Me'

  const [scope, setScope] = useState<'All' | 'Mine' | 'Waiting on me'>('All')
  const [type, setType] = useState('All types')
  const [status, setStatus] = useState('All statuses')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ type: requestTypes[0], detail: '' })

  const visible = assetRequests.filter((request) => {
    if (scope === 'Mine' && request.raisedBy !== me) return false
    if (scope === 'Waiting on me' && request.status !== 'Pending') return false
    if (type !== 'All types' && request.type !== type) return false
    if (status !== 'All statuses' && request.status !== status) return false
    if (!query.trim()) return true
    return `${request.reference} ${request.type} ${request.raisedBy}`.toLowerCase().includes(query.toLowerCase())
  })

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-[20px] font-bold tracking-tight">Asset requests</h2>
          <p className="mt-1.5 text-[14px] text-fg-muted">
            Request → approve → issue. An asset cannot be issued without a matching approved request.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
          >
            <option>All types</option>
            {requestTypes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
          >
            <option>All statuses</option>
            {requestStatuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <Button variant="accent" onClick={() => setOpen(true)}>
            + New request
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(['All', 'Mine', 'Waiting on me'] as const).map((item) => (
          <button
            key={item}
            onClick={() => setScope(item)}
            aria-pressed={scope === item}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
              scope === item ? 'bg-accent-muted font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <p className="mt-4 rounded-xl bg-surface-2/60 px-5 py-3 text-[13px] text-fg-2">
        <strong className="font-semibold text-fg">You can approve requests.</strong> Your request is sent for review
        like everyone else&apos;s — you can also decide other people&apos;s.
      </p>

      <section className="mt-4 rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <h3 className="text-[15px] font-semibold">Requests ({visible.length})</h3>
          <span className="relative">
            <Icon name="search" size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search reference, type, person or..."
              aria-label="Search requests"
              className="w-64 rounded-xl border border-line bg-surface py-2 pr-3 pl-9 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
          </span>
        </div>

        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[46rem] border-collapse text-[13px]">
            <thead className="border-b border-line text-[12px] text-fg-muted">
              <tr>
                {['Request', 'Type', 'Status', 'Raised by', 'Approved by'].map((column) => (
                  <th key={column} scope="col" className="px-6 py-3.5 text-left font-medium">
                    {column}
                  </th>
                ))}
                <th scope="col" className="px-6 py-3.5 text-right font-medium">
                  <span className="sr-only">Decide</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.length ? (
                visible.map((request) => (
                  <tr key={request.id}>
                    <td className="px-6 py-3.5">
                      <span className="block font-mono text-[12px] text-fg-muted">{request.reference}</span>
                      <span className="mt-0.5 block">{request.detail}</span>
                    </td>
                    <td className="px-6 py-3.5 text-fg-2">{request.type}</td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                          request.status === 'Pending'
                            ? 'tone-amber'
                            : request.status === 'Rejected'
                              ? 'tone-rose'
                              : 'tone-emerald'
                        }`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-fg-2">{request.raisedBy}</td>
                    <td className="px-6 py-3.5 text-fg-2">{request.approvedBy ?? '—'}</td>
                    <td className="px-6 py-3.5 text-right">
                      {request.status === 'Pending' && (
                        <span className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            className="!py-1.5 !text-[12px]"
                            onClick={() => decideAssetRequest(request.id, 'Approved', me)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="secondary"
                            className="!py-1.5 !text-[12px]"
                            onClick={() => decideAssetRequest(request.id, 'Rejected', me)}
                          >
                            Reject
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <Icon name="inbox" size={28} className="mx-auto text-fg-muted" />
                    <span className="mt-3 block text-[16px]">No requests yet</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="mt-4 text-[13px] text-fg-muted">{visible.length} results</p>

      {open && (
        <Dialog title="New request" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Type</Label>
              <select
                value={draft.type}
                onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))}
                className={inputClass}
              >
                {requestTypes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <Label>What do you need?</Label>
              <textarea
                rows={3}
                value={draft.detail}
                onChange={(event) => setDraft((prev) => ({ ...prev, detail: event.target.value }))}
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
              disabled={!draft.detail.trim()}
              onClick={() => {
                addAssetRequest({
                  type: draft.type,
                  status: 'Pending',
                  raisedBy: me,
                  detail: draft.detail.trim(),
                })
                setDraft({ ...draft, detail: '' })
                setOpen(false)
              }}
            >
              Raise request
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export function AssetReportsPane() {
  const { assets, assetSettings } = useWorkspace()
  const [tab, setTab] = useState<string>('Stock summary')
  const [groupBy, setGroupBy] = useState('By asset type')

  const types = assetSettings.taxonomies.asset_types ?? []
  const labelFor = (value: string) => types.find((item) => item.value === value)?.label ?? value

  const rows = useMemo(() => {
    const key = (asset: (typeof assets)[number]) =>
      groupBy === 'By asset type' ? labelFor(asset.type) : asset.project || 'Unassigned'
    const counts = new Map<string, { issued: number; stock: number }>()
    assets.forEach((asset) => {
      const entry = counts.get(key(asset)) ?? { issued: 0, stock: 0 }
      if (asset.stage === 'Issued') entry.issued += 1
      if (asset.stage === 'In Stock') entry.stock += 1
      counts.set(key(asset), entry)
    })
    return [...counts.entries()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, groupBy, types])

  function exportCsv() {
    const head = 'group,issued,in_stock'
    const body = rows.map(([label, value]) => `${label},${value.issued},${value.stock}`).join('\n')
    const url = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: 'text/csv' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'issued-vs-in-stock.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <nav className="flex flex-wrap gap-6 border-b border-line">
        {assetReportTabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            aria-current={tab === item ? 'page' : undefined}
            className={`-mb-px border-b-2 px-1 pb-3 text-[14px] transition ${
              tab === item ? 'border-accent font-medium text-accent' : 'border-transparent text-fg-2 hover:text-fg'
            }`}
          >
            {item}
          </button>
        ))}
      </nav>

      <section className="mt-5 rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <h3 className="text-[15px] font-semibold">
            {tab === 'Stock summary' ? 'Issued vs in stock' : tab}
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            {tab === 'Stock summary' && (
              <select
                aria-label="Group by"
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value)}
                className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
              >
                <option>By asset type</option>
                <option>By project</option>
              </select>
            )}
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
            >
              <Icon name="download" size={15} /> Export CSV
            </button>
            <button
              onClick={exportCsv}
              className="rounded-xl px-3 py-2 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
            >
              Excel
            </button>
          </div>
        </div>

        <div className="border-t border-line px-6 py-5">
          {!assets.length ? (
            <p className="text-[14px] text-fg-muted">No assets to report on.</p>
          ) : tab === 'Stock summary' ? (
            <table className="w-full border-collapse text-[13px]">
              <thead className="text-[12px] text-fg-muted">
                <tr>
                  <th className="py-2 text-left font-medium">Group</th>
                  <th className="py-2 text-right font-medium">Issued</th>
                  <th className="py-2 text-right font-medium">In stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(([label, value]) => (
                  <tr key={label}>
                    <td className="py-2.5">{label}</td>
                    <td className="py-2.5 text-right">{value.issued}</td>
                    <td className="py-2.5 text-right">{value.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[14px] text-fg-muted">
              {tab} needs history this rebuild does not simulate yet — the register has {assets.length} asset
              {assets.length === 1 ? '' : 's'}.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
