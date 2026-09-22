'use client'

import { useState } from 'react'
import { useSearchParams } from '../../../lib/router'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { useCompanies, type ServerCompany } from './useCompanies'

const tabs = [
  { id: 'companies', label: 'Companies', icon: 'building' },
  { id: 'pairs', label: 'Intercompany pairs', icon: 'network' },
  { id: 'tb', label: 'Consolidated TB', icon: 'scale' },
] as const

const currencies = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD']
const countries = ['US', 'GB', 'DE', 'IN', 'AE', 'SG', 'AU', 'CA']

type CompaniesApi = ReturnType<typeof useCompanies>

function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'ok' | 'accent' }) {
  const tones = {
    muted: 'bg-surface-2 text-fg-2',
    ok: 'bg-ok-muted text-ok',
    accent: 'bg-accent-muted text-accent',
  }
  return <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

/**
 * A failed request, shown as a failure.
 *
 * Never as an empty table: "this workspace has no legal entities" and "we could
 * not ask" look identical once the rows are gone, and only one of them is a
 * reason to start typing.
 */
function LoadFailure({ companies }: { companies: CompaniesApi }) {
  return (
    <div role="alert" className="mt-5 rounded-2xl border border-bad/40 bg-bad-muted/30 px-6 py-10 text-center">
      <p className="text-[15px] font-medium text-fg">
        {companies.denied
          ? 'Your role cannot see the legal entities in this workspace.'
          : 'We could not load your legal entities.'}
      </p>
      <p className="mt-1.5 text-[13px] text-fg-muted">{companies.error?.message}</p>
      {companies.canRetry && (
        <div className="mt-4">
          <Button variant="secondary" onClick={companies.refetch}>
            Try again
          </Button>
        </div>
      )}
      {companies.error?.requestId && (
        <p className="mt-3 font-mono text-[11px] text-fg-muted">Reference {companies.error.requestId}</p>
      )}
    </div>
  )
}

/** Add or edit a legal entity. A code is fixed once created, so it is set here only. */
function CompanyForm({
  entity,
  entities,
  companies,
  onClose,
}: {
  entity: ServerCompany | null
  entities: ServerCompany[]
  companies: CompaniesApi
  onClose: () => void
}) {
  const editing = Boolean(entity)
  const [name, setName] = useState(entity?.name ?? '')
  const [code, setCode] = useState(entity?.code ?? '')
  const [currency, setCurrency] = useState(entity?.currency ?? 'USD')
  const [country, setCountry] = useState(entity?.country ?? '')
  const [parentId, setParentId] = useState(entity?.parentId ?? '')

  const fields = companies.fieldErrors

  async function save() {
    const trimmedName = name.trim()
    if (!trimmedName) return

    const saved = entity
      ? await companies.updateCompany(entity.id, {
          name: trimmedName,
          currency,
          // Null clears it. Defaulting an unset country to a guess would put a
          // country nobody chose in the same column as ones somebody did.
          country: country || null,
          // The primary entity has no parent selector, so nothing is sent for it.
          ...(entity.isPrimary ? {} : { parentId: parentId || null }),
        })
      : await companies.createCompany({
          name: trimmedName,
          currency,
          country,
          code: code.trim().toUpperCase(),
          parentId,
        })
    // A refusal — a duplicate code, a parent cycle — keeps the dialog open with
    // the server's own message rather than closing over a write that failed.
    if (saved) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-[18px] font-semibold">{editing ? 'Edit legal entity' : 'New legal entity'}</h2>
        <p className="mt-1.5 text-[13px] text-fg-muted">
          {/* Named only where a `company_id` actually exists. The prototype's
              line here promised ledgers and agents, and this deployment has
              neither — no chart of accounts, no agent runtime. */}
          Entities are tenant-scoped. Sales, HR, assets, travel and expenses all record which one a row belongs to.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-[13px] font-medium">
            Legal entity
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
            />
            {fields.name && <span className="mt-1 block text-[12px] font-normal text-bad">{fields.name}</span>}
          </label>
          <label className="text-[13px] font-medium">
            Code
            <input
              value={code}
              maxLength={20}
              disabled={editing}
              onChange={(event) => setCode(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal uppercase focus:border-accent focus:outline-none disabled:text-fg-muted"
            />
            <span className="mt-1 block text-[12px] font-normal text-fg-muted">
              {/* The honest reason it is read-only: PATCH /companies/{id} has no
                  `code`, so an editable box here would discard what was typed
                  and report a save. */}
              {editing ? 'Set when the entity is created, and not editable afterwards.' : 'Unique in this workspace.'}
            </span>
            {fields.code && <span className="mt-1 block text-[12px] font-normal text-bad">{fields.code}</span>}
          </label>
          <label className="text-[13px] font-medium">
            Currency
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
            >
              {(currencies.includes(currency) ? currencies : [currency, ...currencies]).map((item) => (
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
              <option value="">Not set</option>
              {countries.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          {!entity?.isPrimary && (
            <label className="text-[13px] font-medium sm:col-span-2">
              Parent
              <select
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
              >
                <option value="">No parent</option>
                {entities
                  .filter((item) => item.id !== entity?.id && !item.archivedAt)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.currency})
                    </option>
                  ))}
              </select>
              {fields.parentId && <span className="mt-1 block text-[12px] font-normal text-bad">{fields.parentId}</span>}
            </label>
          )}
        </div>

        {companies.writeError && (
          <p role="alert" className="mt-4 rounded-xl border border-bad/40 bg-bad-muted/30 px-3.5 py-2.5 text-[13px] text-bad">
            {companies.writeError.message}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={companies.writing}
            onClick={save}
            disabled={!name.trim() || (!editing && !code.trim()) || companies.writing}
          >
            {editing ? 'Save entity' : 'Create entity'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function CompaniesTab({
  companies,
  includeArchived,
  onIncludeArchived,
}: {
  companies: CompaniesApi
  includeArchived: boolean
  onIncludeArchived: (next: boolean) => void
}) {
  const [form, setForm] = useState<{ open: boolean; entity: ServerCompany | null }>({ open: false, entity: null })
  const entities = companies.entities
  const archivedCount = entities.filter((entity) => entity.archivedAt).length

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-fg-muted" aria-live="polite">
          {/*
            A failed read counts nothing, so it says nothing. Rendered without
            that branch this line read "0 legal entities." directly above the
            panel explaining that we could not ask — a count asserted over a
            number the screen does not have.

            The archived tally rides along because "Show archived" puts retired
            rows in the same list: a bare total would count them as entities the
            workspace still trades through.
          */}
          {companies.loading
            ? 'Loading legal entities…'
            : companies.error
              ? 'Legal entities unavailable.'
              : entities.length === 1 && archivedCount === 0
                ? 'Single-entity tenant. Add a new legal entity to record a group structure.'
                : `${entities.length} legal ${entities.length === 1 ? 'entity' : 'entities'}${
                    archivedCount ? `, ${archivedCount} of them archived` : ''
                  }.`}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[13px] text-fg-2">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => onIncludeArchived(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Show archived
          </label>
          <Button variant="accent" onClick={() => setForm({ open: true, entity: null })}>
            + New company
          </Button>
        </div>
      </div>

      {/* A row action that failed — archiving one with subsidiaries, promoting
          one that has just been archived — reports the server's own refusal. */}
      {!form.open && companies.writeError && (
        <p role="alert" className="mt-4 rounded-xl border border-bad/40 bg-bad-muted/30 px-3.5 py-2.5 text-[13px] text-bad">
          {companies.writeError.message}
        </p>
      )}

      {companies.error ? (
        <LoadFailure companies={companies} />
      ) : (
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
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {companies.loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-fg-muted" role="status">
                    Loading legal entities…
                  </td>
                </tr>
              ) : entities.length ? (
                entities.map((entity) => (
                  <tr key={entity.id}>
                    <td className="px-5 py-3.5 font-medium">{entity.name}</td>
                    <td className="px-5 py-3.5 text-fg-2">{entity.code}</td>
                    <td className="px-5 py-3.5">
                      <Chip>{entity.currency}</Chip>
                    </td>
                    <td className="px-5 py-3.5 text-fg-2">{entity.country ?? '–'}</td>
                    <td className="px-5 py-3.5 text-fg-2">{entity.parentName ?? '–'}</td>
                    <td className="px-5 py-3.5">
                      <Chip tone="accent">
                        {entity.isPrimary ? 'Primary' : entity.parentId ? 'Subsidiary' : 'Unattached'}
                      </Chip>
                    </td>
                    <td className="px-5 py-3.5">
                      <Chip tone={entity.archivedAt ? 'muted' : 'ok'}>{entity.archivedAt ? 'ARCHIVED' : 'ACTIVE'}</Chip>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="flex items-center justify-end gap-4">
                        <button
                          onClick={() => setForm({ open: true, entity })}
                          aria-label={`Edit ${entity.name}`}
                          className="text-fg-muted transition hover:text-accent"
                        >
                          ✎
                        </button>
                        {!entity.isPrimary && !entity.archivedAt && (
                          <>
                            <button
                              onClick={() => companies.makePrimary(entity.id)}
                              disabled={companies.writing}
                              aria-label={`Make ${entity.name} the primary entity`}
                              className="text-fg-muted transition hover:text-accent disabled:opacity-40"
                            >
                              ★
                            </button>
                            <button
                              onClick={() => companies.archiveCompany(entity.id)}
                              disabled={companies.writing}
                              aria-label={`Archive ${entity.name}`}
                              className="text-fg-muted transition hover:text-bad disabled:opacity-40"
                            >
                              🗑
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-fg-muted">
                    No legal entities are visible in this workspace.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {form.open && (
        <CompanyForm
          entity={form.entity}
          entities={companies.entities}
          companies={companies}
          onClose={() => setForm({ open: false, entity: null })}
        />
      )}
    </>
  )
}

/**
 * Intercompany pairs and the consolidated trial balance.
 *
 * Both are switched off rather than mocked. There is no intercompany table and
 * no ledger in this deployment, so a pair typed here would have been kept in
 * the browser and lost, and the trial balance could only ever print zeroes —
 * which reads as "the books balance at nothing", not as "there are no books".
 */
function Unavailable({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
      <Icon name="scale" size={30} className="mx-auto text-fg-muted" />
      <p className="mt-4 text-[16px] text-fg-2">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-fg-muted">{blurb}</p>
    </div>
  )
}

export default function Companies() {
  const [params, setParams] = useSearchParams()
  const [includeArchived, setIncludeArchived] = useState(false)
  const companies = useCompanies(includeArchived)
  const tab = tabs.find((item) => item.id === params.get('tab'))?.id ?? 'companies'

  return (
    <div className="pt-2">
      <header className="border-b border-line pb-5">
        <h1 className="text-[28px] font-bold tracking-tight">Companies &amp; consolidation</h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          Legal entities under this tenant: their codes, currencies and the hierarchy they report through. Records
          across the workspace carry the entity they were raised against.
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

      {tab === 'companies' && (
        <CompaniesTab companies={companies} includeArchived={includeArchived} onIncludeArchived={setIncludeArchived} />
      )}
      {tab === 'pairs' && (
        <Unavailable
          title="Intercompany pairs are not available on this deployment."
          blurb="A pair names two entities and the account their internal transactions eliminate against. Nothing here stores that yet, and a pair kept only in this browser would disappear on the next device — so the screen does not pretend to save one."
        />
      )}
      {tab === 'tb' && (
        <Unavailable
          title="The consolidated trial balance is not available on this deployment."
          blurb="A trial balance is read from posted journals against a chart of accounts. This workspace has neither, so any figure shown here would be an invention — including a total of zero, which would read as balanced books rather than as no books at all."
        />
      )}
    </div>
  )
}
