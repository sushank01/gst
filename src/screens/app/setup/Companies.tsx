'use client'

import { useState } from 'react'
import { useSearchParams } from '../../../lib/router'
import { Button } from '../../../components/ui'
import { useWorkspace, type Company } from '../../../lib/workspace'
import { Icon } from '../../../components/Icon'
import { useCompanies } from './useCompanies'

const tabs = [
  { id: 'companies', label: 'Companies', icon: 'building' },
  { id: 'pairs', label: 'Intercompany pairs', icon: 'network' },
  { id: 'tb', label: 'Consolidated TB', icon: 'scale' },
] as const

const currencies = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD']
const countries = ['US', 'GB', 'DE', 'IN', 'AE', 'SG', 'AU', 'CA']

function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'ok' | 'accent' }) {
  const tones = {
    muted: 'bg-surface-2 text-fg-2',
    ok: 'bg-ok-muted text-ok',
    accent: 'bg-accent-muted text-accent',
  }
  return <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

/** Add or edit a legal entity. The primary entity's name follows the organization. */
function CompanyForm({
  entity,
  entities,
  onClose,
}: {
  entity: Company | null
  entities: Company[]
  onClose: () => void
}) {
  const { addCompany, updateCompany } = useWorkspace()
  const editing = Boolean(entity)
  const [name, setName] = useState(entity?.name ?? '')
  const [code, setCode] = useState(entity?.code ?? '')
  const [currency, setCurrency] = useState(entity?.currency ?? 'USD')
  const [country, setCountry] = useState(entity?.country ?? 'US')
  const [parentId, setParentId] = useState(entity?.parentId ?? 'primary')

  function save() {
    const patch = { name: name.trim(), code: code.trim().toUpperCase(), currency, country, parentId }
    if (!patch.name || !patch.code) return
    if (entity) updateCompany(entity.id, patch)
    else addCompany({ ...patch, parentId })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-[18px] font-semibold">{editing ? 'Edit legal entity' : 'New legal entity'}</h2>
        <p className="mt-1.5 text-[13px] text-fg-muted">
          Entities are tenant-scoped. Every module — ledgers, agents, approvals — reads this list.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-[13px] font-medium">
            Legal entity
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
            />
          </label>
          <label className="text-[13px] font-medium">
            Code
            <input
              value={code}
              maxLength={6}
              onChange={(event) => setCode(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal uppercase focus:border-accent focus:outline-none"
            />
          </label>
          <label className="text-[13px] font-medium">
            Currency
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
            >
              {currencies.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-medium">
            Country
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
            >
              {countries.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          {entity?.id !== 'primary' && (
            <label className="text-[13px] font-medium sm:col-span-2">
              Parent
              <select
                value={parentId ?? ''}
                onChange={(event) => setParentId(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
              >
                {entities
                  .filter((item) => item.id !== entity?.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.currency})
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" onClick={save} disabled={!name.trim() || !code.trim()}>
            {editing ? 'Save entity' : 'Create entity'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function CompaniesTab({ entities }: { entities: Company[] }) {
  const [form, setForm] = useState<{ open: boolean; entity: Company | null }>({ open: false, entity: null })
  const byId = new Map(entities.map((item) => [item.id, item]))

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-fg-muted">
          {entities.length === 1
            ? 'Single-entity tenant. Add a new legal entity to enable multi-company consolidation.'
            : `${entities.length} legal entities. Intercompany pairs and consolidation are available.`}
        </p>
        <Button variant="accent" onClick={() => setForm({ open: true, entity: null })}>
          + New company
        </Button>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[54rem] border-collapse text-[13px]">
          <thead className="border-b border-line text-[12px] font-medium text-fg-muted">
            <tr>
              {['Legal entity', 'Code', 'Currency', 'Country', 'Parent', 'Role', 'Status'].map((column) => (
                <th key={column} scope="col" className="px-5 py-3 text-left font-medium">
                  {column}
                </th>
              ))}
              <th scope="col" className="px-5 py-3 text-right font-medium">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entities.map((entity) => (
              <tr key={entity.id}>
                <td className="px-5 py-3.5 font-medium">{entity.name}</td>
                <td className="px-5 py-3.5 text-fg-2">{entity.code}</td>
                <td className="px-5 py-3.5">
                  <Chip>{entity.currency}</Chip>
                </td>
                <td className="px-5 py-3.5 text-fg-2">{entity.country}</td>
                <td className="px-5 py-3.5 text-fg-2">
                  {entity.parentId ? (byId.get(entity.parentId)?.name ?? '–') : '–'}
                </td>
                <td className="px-5 py-3.5">
                  <Chip tone="accent">{entity.parentId ? 'Subsidiary' : 'Primary'}</Chip>
                </td>
                <td className="px-5 py-3.5">
                  <Chip tone="ok">{entity.status}</Chip>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    onClick={() => setForm({ open: true, entity })}
                    aria-label={`Edit ${entity.name}`}
                    className="text-fg-muted transition hover:text-accent"
                  >
                    ✎
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form.open && (
        <CompanyForm entity={form.entity} entities={entities} onClose={() => setForm({ open: false, entity: null })} />
      )}
    </>
  )
}

function PairsTab({ entities }: { entities: Company[] }) {
  const { intercompanyPairs, addIntercompanyPair } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [account, setAccount] = useState('')
  const byId = new Map(entities.map((item) => [item.id, item]))
  const enabled = entities.length > 1

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-fg-muted">
          Pair entities that transact internally. Post each side of the inter-co transaction to the elimination
          account; the consolidated TB nets it out.
        </p>
        <Button
          variant="accent"
          disabled={!enabled}
          onClick={() => {
            setFromId(entities[0]?.id ?? '')
            setToId(entities[1]?.id ?? '')
            setOpen(true)
          }}
          title={enabled ? undefined : 'Add a second legal entity first'}
        >
          + New pair
        </Button>
      </div>

      {intercompanyPairs.length ? (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[40rem] border-collapse text-[13px]">
            <thead className="border-b border-line text-[12px] text-fg-muted">
              <tr>
                {['Entity', 'Counterparty', 'Elimination account'].map((column) => (
                  <th key={column} scope="col" className="px-5 py-3 text-left font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {intercompanyPairs.map((pair) => (
                <tr key={pair.id}>
                  <td className="px-5 py-3.5 font-medium">{byId.get(pair.fromId)?.name ?? '—'}</td>
                  <td className="px-5 py-3.5">{byId.get(pair.toId)?.name ?? '—'}</td>
                  <td className="px-5 py-3.5 font-mono text-[12px] text-fg-muted">{pair.eliminationAccount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border border-line bg-surface-2 px-5 py-14 text-center text-[14px] text-fg-muted">
          No intercompany pairs defined.
        </p>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-[18px] font-semibold">New intercompany pair</h2>
            <div className="mt-5 grid gap-4">
              <label className="text-[13px] font-medium">
                Entity
                <select
                  value={fromId}
                  onChange={(event) => setFromId(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
                >
                  {entities.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[13px] font-medium">
                Counterparty
                <select
                  value={toId}
                  onChange={(event) => setToId(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
                >
                  {entities
                    .filter((item) => item.id !== fromId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-[13px] font-medium">
                Elimination account
                <input
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                  placeholder="e.g. 3900 — Intercompany elimination"
                  className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="accent"
                disabled={!fromId || !toId || fromId === toId || !account.trim()}
                onClick={() => {
                  addIntercompanyPair({ fromId, toId, eliminationAccount: account.trim() })
                  setAccount('')
                  setOpen(false)
                }}
              >
                Create pair
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ConsolidatedTab({ entities }: { entities: Company[] }) {
  const [parentId, setParentId] = useState('primary')
  const [asOf, setAsOf] = useState('')
  const parent = entities.find((item) => item.id === parentId) ?? entities[0]

  // Everything rolling up under the selected parent, however deep the chain runs.
  const consolidated = entities.filter((item) => {
    let cursor = item.parentId
    while (cursor) {
      if (cursor === parentId) return true
      cursor = entities.find((candidate) => candidate.id === cursor)?.parentId ?? null
    }
    return false
  })

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-6">
        <label className="text-[13px] font-medium">
          Roll up under
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className="mt-1.5 block w-64 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
          >
            {entities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.currency})
              </option>
            ))}
          </select>
        </label>
        <label className="text-[13px] font-medium">
          As of (optional)
          <input
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
            className="mt-1.5 block w-64 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 px-5 py-3 text-[13px] text-fg-2">
        <span>Reporting currency:</span>
        <Chip tone="ok">🌐 {parent?.currency ?? 'USD'}</Chip>
        <span className="ml-3">Entities consolidated:</span>
        <Chip>{consolidated.length}</Chip>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[46rem] border-collapse text-[13px]">
          <thead className="border-b border-line text-[12px] text-fg-muted">
            <tr>
              <th scope="col" className="px-5 py-3 text-left font-medium">
                Code
              </th>
              <th scope="col" className="px-5 py-3 text-left font-medium">
                Account
              </th>
              <th scope="col" className="px-5 py-3 text-left font-medium">
                Type
              </th>
              {['Debit', 'Credit', 'Balance'].map((column) => (
                <th key={column} scope="col" className="px-5 py-3 text-right font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="font-medium">
              <td className="px-5 py-3.5">Total</td>
              <td className="px-5 py-3.5" />
              <td className="px-5 py-3.5" />
              <td className="px-5 py-3.5 text-right">0.00</td>
              <td className="px-5 py-3.5 text-right">0.00</td>
              <td className="px-5 py-3.5 text-right">0.00</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-fg-muted">
        The trial balance stays at zero until a ledger posts against these entities.
      </p>
    </>
  )
}

export default function Companies() {
  const [params, setParams] = useSearchParams()
  const entities = useCompanies()
  const tab = (tabs.find((item) => item.id === params.get('tab'))?.id ?? 'companies')

  return (
    <div className="pt-2">
      <header className="border-b border-line pb-5">
        <h1 className="text-[28px] font-bold tracking-tight">Companies &amp; consolidation</h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          Legal entities under this tenant. Define companies, mark intercompany pairs with their elimination account,
          and run a consolidated Trial Balance rolled up to the parent&apos;s currency.
        </p>
      </header>

      <nav className="flex gap-7 border-b border-line">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setParams({ tab: item.id })}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-1 py-3.5 text-[14px] transition ${
              tab === item.id
                ? 'border-accent font-medium text-accent'
                : 'border-transparent text-fg-2 hover:text-fg'
            }`}
          >
            <Icon name={item.icon} size={16} />
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'companies' && <CompaniesTab entities={entities} />}
      {tab === 'pairs' && <PairsTab entities={entities} />}
      {tab === 'tb' && <ConsolidatedTab entities={entities} />}
    </div>
  )
}
