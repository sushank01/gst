'use client'

import { useState } from 'react'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { useAuth } from '../../../lib/auth'
import { warrantyAlertDays } from '../../../lib/assetData'
import { formatAmount } from '../../../lib/useWorkspaceSummary'
import { Dialog, Label, inputClass } from '../../../components/EnterpriseUi'
import type { ApiClientError } from '../../../lib/api'
import {
  assetImportColumns,
  assetStatuses,
  commitAssetImport,
  daysUntil,
  downloadAssetExport,
  goneStatuses,
  requestStatusLabel,
  stageAssetImport,
  statusLabel,
  useApprovalLadder,
  useAssetFacets,
  useAssetFilters,
  useAssetRequests,
  useAssets,
  useIssuableAssets,
  useLeaverHoldings,
  useMyAssets,
  useStockReport,
  useTaxonomy,
  useWarrantyReport,
  useWorkspaceMembers,
  type ImportReport,
  type ServerAsset,
  type ServerAssetRequest,
} from './useAssets'

const statusTone: Record<string, string> = {
  in_stock: 'tone-slate',
  assigned: 'tone-emerald',
  in_service: 'tone-violet',
  retired: 'tone-rose',
  lost: 'tone-amber',
  disposed: 'tone-rose',
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * A failed request, rendered as a failure.
 *
 * Never as an empty list: "we could not reach the server" and "you have no
 * assets" are different facts, and a screen that shows the second when the
 * first happened sends somebody to add records they already have.
 */
function PaneError({
  error,
  what,
  denied,
  canRetry,
  onRetry,
}: {
  error: ApiClientError
  what: string
  denied: boolean
  canRetry: boolean
  onRetry: () => void
}) {
  return (
    <div role="alert" className="rounded-2xl border border-bad/40 bg-bad-muted/30 px-6 py-10 text-center">
      <p className="text-[15px] font-medium text-fg">
        {denied ? `You do not have access to ${what} in this workspace.` : `We could not load ${what}.`}
      </p>
      <p className="mt-1.5 text-[13px] text-fg-muted">{error.message}</p>
      {canRetry && (
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

/** A write that was refused, including the conflict that says to refetch. */
function WriteError({ error }: { error: ApiClientError | null }) {
  if (!error) return null
  return (
    <p role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad-muted/30 px-4 py-2.5 text-[13px] text-fg">
      {error.isConflict ? `Somebody else changed this. ${error.message}` : error.message}
    </p>
  )
}

/**
 * The part of custody this report cannot see.
 *
 * An asset issued to a typed name has no account behind it, so no employee
 * record can ever be matched to it. Without this line a zero reads as "nobody
 * who left is holding anything", which is a different claim.
 */
function LabelOnlyCustodyNote({ count }: { count: number }) {
  if (!count) return null
  return (
    <p className="mt-3 text-[12px] text-fg-muted">
      {count} asset{count === 1 ? ' is' : 's are'} issued to a name typed by hand rather than to an account here, so
      {count === 1 ? ' it is' : ' they are'} not matched against leavers at all.
    </p>
  )
}

export function AssetDashboard() {
  const facets = useAssetFacets(warrantyAlertDays)
  const warranty = useWarrantyReport(warrantyAlertDays, false)
  const leavers = useLeaverHoldings()

  const counts = facets.data
  // Retired, lost and disposed units are no longer part of the estate.
  const active = counts
    ? Object.entries(counts.byStatus)
        .filter(([status]) => !goneStatuses.includes(status))
        .reduce((total, [, count]) => total + count, 0)
    : null

  // A zero from a workspace with no employee records is not a measurement:
  // there is nothing to match custody against, so there is no figure.
  const leaverCount = leavers.data && leavers.data.employees > 0 ? leavers.data.total : null

  const tiles: { label: string; value: number | null; note: string; loading: boolean }[] = [
    {
      label: 'Pending requests',
      value: counts?.pendingRequests ?? null,
      note: 'waiting for a decision',
      loading: facets.loading,
    },
    { label: 'Out of warranty', value: counts?.outOfWarranty ?? null, note: 'warranty already passed', loading: facets.loading },
    {
      label: 'Warranty expiring',
      value: counts?.warrantyExpiring ?? null,
      note: `within ${counts?.warrantyWithinDays ?? warrantyAlertDays} days`,
      loading: facets.loading,
    },
    {
      label: 'With leavers',
      value: leaverCount,
      note: leavers.error
        ? 'this count could not be read'
        : leavers.data?.employees === 0
          ? 'no employee records to match against'
          : 'still out with a leaver',
      loading: leavers.loading,
    },
  ]

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Active assets</p>
        {facets.loading ? (
          <p className="mt-2 text-[14px] text-fg-muted" role="status">
            Counting…
          </p>
        ) : facets.error ? (
          <p className="mt-2 text-[14px] text-fg-muted" role="alert">
            Not available — {facets.error.message}
          </p>
        ) : (
          <p className="mt-2 text-[40px] leading-none font-bold">{active}</p>
        )}
        <p className="mt-4 text-[13px] text-fg-muted">
          Everything the company still owns. Retired, lost and disposed units are excluded — they are no longer part of
          the estate.
        </p>
      </section>

      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">
          Needs attention{' '}
          <span className="ml-2 text-[12px] font-normal tracking-normal normal-case">
            Things waiting on a person. A zero here means there is nothing to do.
          </span>
        </p>

        {facets.error ? (
          <div className="mt-3">
            <PaneError
              error={facets.error}
              what="these counts"
              denied={facets.denied}
              canRetry={facets.canRetry}
              onRetry={facets.refetch}
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-2xl border border-line bg-surface p-5">
                <p className="text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">{tile.label}</p>
                {tile.loading ? (
                  <p className="mt-2.5 text-[15px] leading-none font-medium text-fg-muted" role="status">
                    Counting…
                  </p>
                ) : tile.value === null ? (
                  <p className="mt-2.5 text-[15px] leading-none font-medium text-fg-muted">Not available</p>
                ) : (
                  <p className="mt-2.5 text-[24px] leading-none font-bold">{tile.value}</p>
                )}
                <p className="mt-2.5 text-[12px] text-fg-muted">
                  {tile.loading || tile.value === null ? tile.note : tile.value ? `${tile.value} ${tile.note}` : 'Nothing to do'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h3 className="text-[16px] font-semibold">Warranty expiring</h3>
          {warranty.loading ? (
            <p className="mt-4 text-[14px] text-fg-muted" role="status">
              Loading…
            </p>
          ) : warranty.error ? (
            <div className="mt-4">
              <PaneError
                error={warranty.error}
                what="the warranty list"
                denied={warranty.denied}
                canRetry={warranty.canRetry}
                onRetry={warranty.refetch}
              />
            </div>
          ) : warranty.data?.rows.length ? (
            <>
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                {warranty.data.rows.map((asset) => (
                  <li key={asset.id} className="flex items-center gap-4 px-4 py-3">
                    <span className="min-w-0 flex-1 text-[13px]">{asset.name}</span>
                    <span className="font-mono text-[12px] text-fg-muted">{asset.tag}</span>
                    <span className="text-[12px] text-warn">{asset.daysLeft}d left</span>
                  </li>
                ))}
              </ul>
              {/* The endpoint returns a page, and the count beside it is the
                  whole window — so a shorter list says it is a shorter list. */}
              {warranty.data.total > warranty.data.rows.length && (
                <p className="mt-3 text-[12px] text-fg-muted">
                  Showing the {warranty.data.rows.length} soonest of {warranty.data.total}. The rest are under Reports →
                  Warranty.
                </p>
              )}
            </>
          ) : (
            <p className="mt-4 flex items-center gap-2.5 text-[14px] text-fg-muted">
              <Icon name="shield" size={16} />
              Nothing expiring in the next {warranty.data?.withinDays ?? warrantyAlertDays} days.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6">
          <h3 className="text-[16px] font-semibold">Assets not returned by leavers</h3>
          {leavers.loading ? (
            <p className="mt-4 text-[14px] text-fg-muted" role="status">
              Loading…
            </p>
          ) : leavers.error ? (
            <div className="mt-4">
              <PaneError
                error={leavers.error}
                what="leaver holdings"
                denied={leavers.denied}
                canRetry={leavers.canRetry}
                onRetry={leavers.refetch}
              />
            </div>
          ) : leavers.data?.employees === 0 ? (
            /* Custody is matched through employee records; with none there is
               nothing to match against, and a zero would be read as measured. */
            <p className="mt-4 text-[14px] text-fg-muted">
              Not available — this workspace has no employee records, so equipment held by people who have left cannot
              be worked out.
            </p>
          ) : leavers.data?.rows.length ? (
            <>
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                {leavers.data.rows.map((holding) => (
                  <li key={holding.assetId} className="flex items-center gap-4 px-4 py-3">
                    <span className="min-w-0 flex-1 text-[13px]">{holding.name}</span>
                    <span className="font-mono text-[12px] text-fg-muted">{holding.tag}</span>
                    <span className="text-[12px] text-fg-muted">{holding.holderName}</span>
                  </li>
                ))}
              </ul>
              {leavers.data.total > leavers.data.rows.length && (
                <p className="mt-3 text-[12px] text-fg-muted">
                  Showing {leavers.data.rows.length} of {leavers.data.total} outstanding holdings.
                </p>
              )}
              {Boolean(leavers.data.exitedUnlinked) && (
                <p className="mt-3 text-[12px] text-fg-muted">
                  {leavers.data.exitedUnlinked} departed employee
                  {leavers.data.exitedUnlinked === 1 ? ' has' : 's have'} no linked account, so anything they hold is
                  not counted here.
                </p>
              )}
              <LabelOnlyCustodyNote count={leavers.data.unlinkedCustody} />
            </>
          ) : (
            <>
              <p className="mt-4 flex items-center gap-2.5 text-[14px] text-fg-muted">
                <Icon name="bag" size={16} />
                No departed employee is holding an asset.
              </p>
              <LabelOnlyCustodyNote count={leavers.data?.unlinkedCustody ?? 0} />
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export function AssetRegisterPane() {
  const { filters, query, status, assetType, location, page, pageSize, setQuery, setStatus, setAssetType, setLocation, setPage } =
    useAssetFilters()
  const { tenants, activeTenantId } = useAuth()
  const register = useAssets(filters)
  /* Unfiltered: the Location list has to offer every location the register
     holds, not only those inside the filter currently applied. */
  const catalogue = useAssetFacets(warrantyAlertDays)
  /* Filtered: a chip's number is what clicking that chip would show. Asked
     for only when something else is narrowing the list — with no other
     filter the two answers are the same, and one request is enough. */
  const scoped = Boolean(query || assetType || location)
  const chips = useAssetFacets(warrantyAlertDays, { q: query, assetType, location }, { enabled: scoped })
  const types = useTaxonomy('asset_types')

  const [creating, setCreating] = useState(false)
  const [issuing, setIssuing] = useState<ServerAsset | null>(null)
  const [retiring, setRetiring] = useState<ServerAsset | null>(null)
  const [importing, setImporting] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  /*
   * Only a hint for the reader. The server checks the permission on every
   * write — `record.update` to issue or return, `record.delete` to retire or
   * archive — so this decides what is offered, never what is allowed. A
   * viewer shown a Retire button gets a refusal and no way to act on it.
   */
  const role = tenants.find((tenant) => tenant.id === activeTenantId)?.role
  const canWrite = role === 'owner' || role === 'admin' || role === 'member'
  const canRetire = role === 'owner'

  const locations = Object.keys(catalogue.data?.byLocation ?? {}).filter((key) => key !== 'unassigned')
  /** Everything in the register, unfiltered — null until the counts are in. */
  const registerSize = () =>
    catalogue.data ? Object.values(catalogue.data.byStatus).reduce((total, count) => total + count, 0) : null
  const pageCount = Math.max(1, Math.ceil(register.total / pageSize))
  // Every write moves a chip count too, so the counts are re-read with the
  // list rather than sitting one status behind what the table shows.
  const refreshCounts = () => {
    catalogue.refetch()
    if (scoped) chips.refetch()
  }
  const counts = scoped ? chips.data : catalogue.data
  const countFor = (item: string) =>
    counts
      ? item === ''
        ? Object.values(counts.byStatus).reduce((total, count) => total + count, 0)
        : (counts.byStatus[item] ?? 0)
      : null

  async function exportRegister() {
    setNote(null)
    try {
      const exported = await downloadAssetExport()
      /*
       * Two things the file does not say about itself: it covers the whole
       * register rather than the filters on screen, and the endpoint writes
       * at most a page of it. Either one unsaid is a partial file somebody
       * files as the full estate.
       */
      const held = registerSize()
      const short = held !== null && exported < held
      setNote(
        `Exported ${exported} asset${exported === 1 ? '' : 's'} — the whole register, not the filters on screen.` +
          (short ? ` Only the first ${exported} of ${held} rows fit in one export.` : ''),
      )
    } catch (error) {
      setNote((error as Error).message)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-[20px] font-bold tracking-tight">Asset Register</h2>
          <select
            aria-label="Type"
            value={assetType}
            onChange={(event) => setAssetType(event.target.value)}
            className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
          >
            <option value="">All types</option>
            {types.entries.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
          >
            <option value="">All locations</option>
            {locations.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={exportRegister}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
          >
            <Icon name="download" size={15} /> Export
          </button>
          {canWrite && (
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
            >
              <Icon name="download" size={15} className="rotate-180" /> Import
            </button>
          )}
          {canWrite && (
            <Button variant="accent" onClick={() => setCreating(true)}>
              + New asset
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {['', ...assetStatuses].map((item) => (
          <button
            key={item || 'all'}
            onClick={() => setStatus(item)}
            aria-pressed={status === item}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] transition ${
              status === item ? 'bg-accent-muted font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {item ? statusLabel(item) : 'All'}
            <span className="text-fg-muted">{countFor(item) ?? '·'}</span>
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
      <WriteError error={register.writeError} />

      {register.loading ? (
        <div role="status" className="mt-4 rounded-2xl border border-line bg-surface px-6 py-16 text-center text-[14px] text-fg-muted">
          Loading the register…
        </div>
      ) : register.error ? (
        <div className="mt-4">
          <PaneError
            error={register.error}
            what="the register"
            denied={register.denied}
            canRetry={register.canRetry}
            onRetry={register.refetch}
          />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[58rem] border-collapse text-[13px]">
            <thead className="border-b border-line text-[12px] text-fg-muted">
              <tr>
                {['Asset', 'Tag No.', 'Status', 'Location', 'Invoice ref', 'Assigned to', 'Warranty', 'Age'].map((column) => (
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
              {register.assets.length ? (
                register.assets.map((asset) => {
                  const warrantyDays = daysUntil(asset.warrantyExpiresOn)
                  const age = daysUntil(asset.acquiredOn)
                  return (
                    <tr key={asset.id}>
                      <td className="px-5 py-3.5 font-medium">{asset.name}</td>
                      <td className="px-5 py-3.5 font-mono text-[12px] text-fg-muted">{asset.tag}</td>
                      <td className="px-5 py-3.5">
                        {/* Read-only: status moves through issue, return,
                            service and retirement, never by being picked. */}
                        <span
                          className={`rounded-lg px-2 py-1 text-[11px] font-medium ${statusTone[asset.status] ?? 'tone-slate'}`}
                        >
                          {statusLabel(asset.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-fg-2">{asset.location || '—'}</td>
                      <td className="px-5 py-3.5 text-fg-2">{asset.invoiceRef || '—'}</td>
                      <td className="px-5 py-3.5 text-fg-2">{asset.holder?.label ?? asset.holder?.name ?? '—'}</td>
                      <td className="px-5 py-3.5 text-fg-2">{warrantyDays === null ? '—' : `${warrantyDays}d`}</td>
                      {/* Age comes from the acquisition date, which is
                          optional — a blank one is unknown, not new. */}
                      <td className="px-5 py-3.5 text-fg-2">{age === null ? '—' : `${Math.max(0, -age)}d`}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="flex justify-end gap-2">
                          {canWrite && asset.status === 'in_stock' && (
                            <Button variant="secondary" className="!py-1.5 !text-[12px]" onClick={() => setIssuing(asset)}>
                              Issue
                            </Button>
                          )}
                          {canWrite && asset.status === 'assigned' && (
                            <Button
                              variant="secondary"
                              className="!py-1.5 !text-[12px]"
                              disabled={register.writing}
                              onClick={async () => {
                                await register.returnAsset(asset.id)
                                refreshCounts()
                              }}
                            >
                              Return
                            </Button>
                          )}
                          {canRetire && !goneStatuses.includes(asset.status) && asset.status !== 'assigned' && (
                            <Button variant="secondary" className="!py-1.5 !text-[12px]" onClick={() => setRetiring(asset)}>
                              Retire
                            </Button>
                          )}
                          {canRetire && (
                            <button
                              onClick={async () => {
                                await register.archiveAsset(asset.id, asset.version)
                                refreshCounts()
                              }}
                              disabled={register.writing}
                              aria-label={`Archive ${asset.name}`}
                              title="Archive — refused while the asset is still issued"
                              className="text-fg-muted transition hover:text-bad disabled:opacity-40"
                            >
                              🗑
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <Icon name="inbox" size={28} className="mx-auto text-fg-muted" />
                    <span className="mt-3 block text-[16px] font-medium">
                      {query || status || assetType || location ? 'No assets match these filters' : 'No assets yet'}
                    </span>
                    <span className="mt-1.5 block text-[13px] text-fg-muted">
                      {canWrite
                        ? 'Add one, or bulk-import your existing register from a spreadsheet.'
                        : 'Your role can read the register but not add to it.'}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {/* "0 results" is an answer. While the request is in flight, or after
            it failed, there is no answer to give — so none is given. */}
        <p className="text-[13px] text-fg-muted" aria-live="polite">
          {register.loading
            ? 'Counting…'
            : register.error
              ? ''
              : register.refreshing
                ? 'Updating…'
                : `${register.total} result${register.total === 1 ? '' : 's'}`}
        </p>
        {!register.error && !register.loading && register.total > pageSize && (
          <nav aria-label="Asset pagination" className="flex items-center gap-3 text-[13px]">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="rounded-xl border border-line px-3 py-2 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <button
              disabled={page + 1 >= pageCount}
              onClick={() => setPage(page + 1)}
              className="rounded-xl border border-line px-3 py-2 disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        )}
      </div>

      {creating && (
        <NewAssetDialog
          types={types.entries}
          typesFailed={types.failed}
          pending={register.writing}
          error={register.writeError}
          fieldErrors={register.fieldErrors}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            const created = await register.createAsset(input)
            if (created) {
              setNote(`Registered ${created.name} as ${created.tag}.`)
              setCreating(false)
              refreshCounts()
            }
          }}
        />
      )}

      {issuing && (
        <IssueDialog
          asset={issuing}
          pending={register.writing}
          error={register.writeError}
          onClose={() => setIssuing(null)}
          onSubmit={async (holder, dueBackOn) => {
            const issued = await register.issueAsset(issuing.id, holder, dueBackOn)
            if (issued) {
              setIssuing(null)
              refreshCounts()
            }
          }}
        />
      )}

      {retiring && (
        <RetireDialog
          asset={retiring}
          pending={register.writing}
          error={register.writeError}
          onClose={() => setRetiring(null)}
          onSubmit={async (reason, retiredOn) => {
            const retired = await register.retireAsset(retiring.id, reason, retiredOn)
            if (retired) {
              setRetiring(null)
              refreshCounts()
            }
          }}
        />
      )}

      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={(created) => {
            setNote(`Imported ${created} asset${created === 1 ? '' : 's'}.`)
            setImporting(false)
            register.refetch()
            refreshCounts()
          }}
        />
      )}
    </div>
  )
}

function NewAssetDialog({
  types,
  typesFailed,
  pending,
  error,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  types: { value: string; label: string }[]
  typesFailed: boolean
  pending: boolean
  error: ApiClientError | null
  fieldErrors: Record<string, string>
  onClose: () => void
  onSubmit: (input: {
    name: string
    assetType: string
    location: string
    invoiceRef: string
    warrantyExpiresOn: string
    acquiredOn: string
  }) => void
}) {
  const [draft, setDraft] = useState({
    name: '',
    assetType: '',
    location: '',
    invoiceRef: '',
    warrantyExpiresOn: '',
    acquiredOn: '',
  })

  return (
    <Dialog title="New asset" onClose={onClose}>
      <div className="mt-5 grid gap-4">
        <label>
          <Label>Asset</Label>
          <input
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="MacBook Pro 14"
            className={inputClass}
          />
          {fieldErrors.name && <span className="mt-1 block text-[12px] text-bad">{fieldErrors.name}</span>}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <Label>Type</Label>
            <select
              value={draft.assetType}
              onChange={(event) => setDraft((prev) => ({ ...prev, assetType: event.target.value }))}
              className={inputClass}
            >
              <option value="">No type</option>
              {types.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            {typesFailed && (
              <span className="mt-1 block text-[12px] text-fg-muted">
                The type list could not be loaded, so only the types shown above are offered.
              </span>
            )}
          </label>
          <label>
            <Label>Location</Label>
            <input
              value={draft.location}
              onChange={(event) => setDraft((prev) => ({ ...prev, location: event.target.value }))}
              className={inputClass}
            />
          </label>
          <label>
            <Label>Invoice ref</Label>
            <input
              value={draft.invoiceRef}
              onChange={(event) => setDraft((prev) => ({ ...prev, invoiceRef: event.target.value }))}
              placeholder="INV-1042"
              className={inputClass}
            />
          </label>
          <label>
            <Label>Acquired on</Label>
            <input
              type="date"
              value={draft.acquiredOn}
              onChange={(event) => setDraft((prev) => ({ ...prev, acquiredOn: event.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="sm:col-span-2">
            <Label>Warranty ends</Label>
            <input
              type="date"
              value={draft.warrantyExpiresOn}
              onChange={(event) => setDraft((prev) => ({ ...prev, warrantyExpiresOn: event.target.value }))}
              className={inputClass}
            />
          </label>
        </div>
        <p className="text-[12px] text-fg-muted">
          The tag is allocated by the server from the sequence for this type, so two people registering at once cannot
          be handed the same sticker.
        </p>
      </div>
      <WriteError error={error} />
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="accent"
          disabled={!draft.name.trim() || pending}
          onClick={() => onSubmit({ ...draft, name: draft.name.trim() })}
        >
          {pending ? 'Creating…' : 'Create asset'}
        </Button>
      </div>
    </Dialog>
  )
}

/**
 * Issues an asset, to an account wherever there is one.
 *
 * Custody recorded as a typed string is custody nothing else can find: it
 * never reaches that person's My Asset page, and the leaver report — which
 * matches employees through their account — cannot see it either. So the
 * workspace directory is offered first, and a typed name is the deliberate
 * exception, with the consequence stated where the choice is made.
 */
function IssueDialog({
  asset,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  asset: ServerAsset
  pending: boolean
  error: ApiClientError | null
  onClose: () => void
  onSubmit: (holder: { userId?: string; label?: string }, dueBackOn: string) => void
}) {
  const directory = useWorkspaceMembers()
  const [userId, setUserId] = useState('')
  const [label, setLabel] = useState('')
  const [byName, setByName] = useState(false)
  const [dueBackOn, setDueBackOn] = useState('')

  // A directory nobody may read leaves the typed name as the only route, so
  // the dialog offers it rather than an empty picker.
  const pickerUnavailable = directory.denied || Boolean(directory.error)
  const naming = byName || pickerUnavailable
  const ready = naming ? Boolean(label.trim()) : Boolean(userId)

  return (
    <Dialog title={`Issue ${asset.name}`} onClose={onClose}>
      <div className="mt-5 grid gap-4">
        {naming ? (
          <label>
            <Label>Who is taking it</Label>
            <input value={label} onChange={(event) => setLabel(event.target.value)} className={inputClass} />
            <span className="mt-1 block text-[12px] text-fg-muted">
              {pickerUnavailable
                ? 'Your role cannot read the member list, so the holder can only be recorded as a name.'
                : 'Recorded as text: it will not appear on anybody’s My Asset page, and the leaver report cannot see it.'}
            </span>
          </label>
        ) : (
          <label>
            <Label>Who is taking it</Label>
            <select value={userId} onChange={(event) => setUserId(event.target.value)} className={inputClass}>
              <option value="">{directory.loading ? 'Loading people…' : 'Choose somebody in this workspace'}</option>
              {directory.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.fullName}
                </option>
              ))}
            </select>
          </label>
        )}
        {!pickerUnavailable && (
          <button
            type="button"
            onClick={() => setByName((previous) => !previous)}
            className="justify-self-start text-[12px] font-medium text-accent hover:underline"
          >
            {byName ? 'Choose somebody in this workspace instead' : 'This person has no account here'}
          </button>
        )}
        <label>
          <Label>Due back</Label>
          <input type="date" value={dueBackOn} onChange={(event) => setDueBackOn(event.target.value)} className={inputClass} />
        </label>
        <p className="text-[12px] text-fg-muted">
          An asset is held by one person at a time. Issuing one that is already out is refused rather than replacing
          the holder.
        </p>
      </div>
      <WriteError error={error} />
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="accent"
          disabled={!ready || pending}
          onClick={() => onSubmit(naming ? { label: label.trim() } : { userId }, dueBackOn)}
        >
          {pending ? 'Issuing…' : 'Issue'}
        </Button>
      </div>
    </Dialog>
  )
}

function RetireDialog({
  asset,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  asset: ServerAsset
  pending: boolean
  error: ApiClientError | null
  onClose: () => void
  onSubmit: (reason: string, retiredOn: string) => void
}) {
  const reasons = useTaxonomy('retirement_reasons')
  const [reason, setReason] = useState('')
  const [retiredOn, setRetiredOn] = useState(today())

  return (
    <Dialog title={`Retire ${asset.name}`} onClose={onClose}>
      <div className="mt-5 grid gap-4">
        <label>
          <Label>Reason</Label>
          <select value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass}>
            <option value="">Choose a reason</option>
            {reasons.entries.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Label>Retired on</Label>
          <input type="date" value={retiredOn} onChange={(event) => setRetiredOn(event.target.value)} className={inputClass} />
        </label>
        <p className="text-[12px] text-fg-muted">Retirement happens once, and never while somebody still holds the asset.</p>
      </div>
      <WriteError error={error} />
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="accent" disabled={!reason || !retiredOn || pending} onClick={() => onSubmit(reason, retiredOn)}>
          {pending ? 'Retiring…' : 'Retire'}
        </Button>
      </div>
    </Dialog>
  )
}

/**
 * Import in two steps, because that is what the server does.
 *
 * Staging validates the whole file and writes nothing, so every bad row is
 * reported with its line before anything lands. The previous importer skipped
 * rows it could not read without saying so.
 */
function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (created: number) => void }) {
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [report, setReport] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  /*
   * Rows the server refused while writing — a tag already in use, say. They
   * are not staging problems: staging passed them. Closing on "Imported 40"
   * without them is how ten assets go missing quietly.
   */
  const [rejected, setRejected] = useState<{ line: number; message: string }[]>([])
  const [partial, setPartial] = useState<{ created: number; failed: number } | null>(null)

  async function read(file: File) {
    const text = await file.text()
    setCsv(text)
    setFileName(file.name)
    setReport(null)
    setFailure(null)
    setRejected([])
    setPartial(null)
    setBusy(true)
    try {
      setReport(await stageAssetImport(text))
    } catch (error) {
      setFailure((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    setBusy(true)
    setFailure(null)
    setRejected([])
    setPartial(null)
    try {
      const result = await commitAssetImport(csv)
      const failed = result.failed ?? []
      if (failed.length) {
        // Some of the file landed and some did not. The dialog stays open
        // with the lines that were refused, because "Imported 40" over a
        // 50-row file is a success message covering ten failures.
        setRejected(failed)
        setPartial({ created: result.created ?? 0, failed: failed.length })
        return
      }
      onImported(result.created ?? 0)
    } catch (error) {
      setFailure((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Import assets" onClose={onClose} size="lg">
      <div className="mt-5 grid gap-4">
        <p className="text-[13px] text-fg-muted">Columns: {assetImportColumns}.</p>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2">
          <Icon name="download" size={15} className="rotate-180" /> {fileName || 'Choose a CSV file'}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void read(file)
            }}
          />
        </label>

        {busy && (
          <p role="status" className="text-[13px] text-fg-muted">
            Checking the file…
          </p>
        )}
        {failure && (
          <p role="alert" className="rounded-xl border border-bad/40 bg-bad-muted/30 px-4 py-2.5 text-[13px]">
            {failure}
          </p>
        )}

        {partial && (
          <div role="alert" className="rounded-xl border border-bad/40 bg-bad-muted/30 px-4 py-3 text-[13px]">
            <p>
              {partial.created} row{partial.created === 1 ? '' : 's'} imported, {partial.failed} refused by the server.
              The refused rows were not written — fix them and import those separately.
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-bad">
              {rejected.map((problem) => (
                <li key={`${problem.line}-${problem.message}`}>
                  Line {problem.line}: {problem.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {report && (
          <div className="rounded-xl border border-line px-4 py-3 text-[13px]">
            <p>
              {report.total} row{report.total === 1 ? '' : 's'} read, {report.ready} ready to import.
            </p>
            {report.problems.length > 0 && (
              <ul className="mt-2 space-y-1 text-[12px] text-bad">
                {report.problems.map((problem) => (
                  <li key={`${problem.line}-${problem.message}`}>
                    Line {problem.line}: {problem.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={() => (partial ? onImported(partial.created) : onClose())}>
          {partial ? 'Close' : 'Cancel'}
        </Button>
        <Button
          variant="accent"
          disabled={!report || !report.ready || Boolean(report.problems.length) || busy || Boolean(partial)}
          onClick={commit}
        >
          {report ? `Import ${report.ready} row${report.ready === 1 ? '' : 's'}` : 'Import'}
        </Button>
      </div>
      {report && Boolean(report.problems.length) && (
        <p className="mt-2 text-right text-[12px] text-fg-muted">Fix the rows above and choose the file again.</p>
      )}
    </Dialog>
  )
}

export function MyAssetPane() {
  const { session } = useAuth()
  const mine = useMyAssets(session?.user.id)

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">My Asset</h2>
      <p className="mt-1.5 text-[14px] text-fg-muted">
        What is currently issued to your account. Past holdings are not shown — no report returns a holder&apos;s
        closed custody periods yet — and neither is anything logged against a typed name rather than an account, which
        this page has no way to match to you.
      </p>

      <section className="mt-6 rounded-2xl border border-line bg-surface">
        <h3 className="border-b border-line px-6 py-4 text-[15px] font-semibold">My Asset</h3>
        {mine.loading ? (
          <p role="status" className="px-6 py-6 text-[14px] text-fg-muted">
            Loading…
          </p>
        ) : mine.error ? (
          <div className="p-6">
            <PaneError
              error={mine.error}
              what="your equipment"
              denied={mine.denied}
              canRetry={mine.canRetry}
              onRetry={mine.refetch}
            />
          </div>
        ) : mine.data?.assets.length ? (
          <>
            {mine.data.total > mine.data.assets.length && (
              <p className="px-6 pt-4 text-[12px] text-fg-muted">
                Showing {mine.data.assets.length} of {mine.data.total} items issued to you.
              </p>
            )}
            <ul className="divide-y divide-line">
              {mine.data.assets.map((asset) => (
                <li key={asset.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                  <span className="min-w-0 flex-1 text-[14px]">{asset.name}</span>
                  <span className="font-mono text-[12px] text-fg-muted">{asset.tag}</span>
                  {asset.holder?.dueBackOn && (
                    <span className="text-[12px] text-fg-muted">Due back {asset.holder.dueBackOn}</span>
                  )}
                  <span
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${statusTone[asset.status] ?? 'tone-slate'}`}
                  >
                    {statusLabel(asset.status)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="px-6 py-6 text-[14px] text-fg-muted">
            Nothing is issued to your account at the moment. If you are holding something that was booked out under
            your name rather than your account, it will not appear here — ask whoever issued it to re-record it.
          </p>
        )}
      </section>
    </div>
  )
}

export function AssetRequestsPane() {
  const { session, tenants, activeTenantId } = useAuth()
  const types = useTaxonomy('asset_types')
  const ladder = useApprovalLadder()

  const [scope, setScope] = useState<'all' | 'mine' | 'pending'>('all')
  const [assetType, setAssetType] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState(false)
  const [issuing, setIssuing] = useState<ServerAssetRequest | null>(null)
  const pageSize = 25

  const requests = useAssetRequests({ scope, assetType, status, limit: pageSize, offset: page * pageSize })
  const pageCount = Math.max(1, Math.ceil(requests.total / pageSize))

  /*
   * Only a hint for the reader: the server re-checks `approval.decide` on
   * every decision, so hiding the buttons changes what is shown and not what
   * is allowed.
   */
  const role = tenants.find((tenant) => tenant.id === activeTenantId)?.role
  const canDecide = role === 'owner' || role === 'admin'

  const choose = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(0)
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-[20px] font-bold tracking-tight">Asset requests</h2>
          <p className="mt-1.5 text-[14px] text-fg-muted">
            Request → approve → issue. Issuing against an approved request hands the asset to whoever raised it and
            closes the request in the same step.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Type"
            value={assetType}
            onChange={(event) => choose(setAssetType)(event.target.value)}
            className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
          >
            <option value="">All types</option>
            {types.entries.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Status"
            value={status}
            onChange={(event) => choose(setStatus)(event.target.value)}
            className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
          >
            <option value="">All statuses</option>
            {['submitted', 'approved', 'rejected', 'issued', 'cancelled'].map((item) => (
              <option key={item} value={item}>
                {requestStatusLabel(item)}
              </option>
            ))}
          </select>
          <Button variant="accent" onClick={() => setOpen(true)}>
            + New request
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {([
          ['all', 'All'],
          ['mine', 'Mine'],
          ['pending', 'Pending'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => choose(setScope)(value)}
            aria-pressed={scope === value}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
              scope === value ? 'bg-accent-muted font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* What the ladder actually does, rather than a claim about who you are. */}
      {ladder.loaded && (
        <p className="mt-4 rounded-xl bg-surface-2/60 px-5 py-3 text-[13px] text-fg-2">
          {ladder.levels.length ? (
            <>
              <strong className="font-semibold text-fg">
                {ladder.levels.length} approval level{ladder.levels.length === 1 ? '' : 's'} configured.
              </strong>{' '}
              A request is approved once every level has agreed, in order.
              {canDecide ? ' You can decide requests that are waiting.' : ''}
            </>
          ) : (
            <>
              <strong className="font-semibold text-fg">No approval levels are configured.</strong> A request is
              approved as soon as it is raised — set up a ladder under Settings → Approval Levels to have requests
              reviewed.
            </>
          )}
        </p>
      )}

      <WriteError error={requests.writeError} />

      <section className="mt-4 rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <h3 className="text-[15px] font-semibold">
            Requests{requests.loading || requests.error ? '' : ` (${requests.total})`}
          </h3>
          <span className="text-[13px] text-fg-muted" aria-live="polite">
            {requests.refreshing ? 'Updating…' : ''}
          </span>
        </div>

        <div className="overflow-x-auto border-t border-line">
          {requests.loading ? (
            <p role="status" className="px-6 py-16 text-center text-[14px] text-fg-muted">
              Loading requests…
            </p>
          ) : requests.error ? (
            <div className="p-6">
              <PaneError
                error={requests.error}
                what="asset requests"
                denied={requests.denied}
                canRetry={requests.canRetry}
                onRetry={requests.refetch}
              />
            </div>
          ) : (
            <table className="w-full min-w-[46rem] border-collapse text-[13px]">
              <thead className="border-b border-line text-[12px] text-fg-muted">
                <tr>
                  {['Request', 'Asset type', 'Status', 'Raised by', 'Approved by'].map((column) => (
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
                {requests.requests.length ? (
                  requests.requests.map((request) => (
                    <RequestRow
                      key={request.id}
                      request={request}
                      canDecide={canDecide}
                      mine={request.requesterUserId === session?.user.id}
                      pending={requests.writing}
                      onDecide={(decision) => requests.decideRequest(request.id, decision, request.version)}
                      onIssue={() => setIssuing(request)}
                    />
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
          )}
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-fg-muted">
          {requests.loading ? 'Counting…' : requests.error ? '' : `${requests.total} result${requests.total === 1 ? '' : 's'}`}
        </p>
        {!requests.error && !requests.loading && requests.total > pageSize && (
          <nav aria-label="Request pagination" className="flex items-center gap-3 text-[13px]">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="rounded-xl border border-line px-3 py-2 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <button
              disabled={page + 1 >= pageCount}
              onClick={() => setPage(page + 1)}
              className="rounded-xl border border-line px-3 py-2 disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        )}
      </div>

      {open && (
        <NewRequestDialog
          types={types.entries}
          pending={requests.writing}
          error={requests.writeError}
          fieldErrors={requests.fieldErrors}
          onClose={() => setOpen(false)}
          onSubmit={async (input) => {
            const raised = await requests.raiseRequest(input)
            if (raised) setOpen(false)
          }}
        />
      )}

      {issuing && (
        <IssueRequestDialog
          request={issuing}
          pending={requests.writing}
          error={requests.writeError}
          onClose={() => setIssuing(null)}
          onSubmit={async (assetId, dueBackOn) => {
            const issued = await requests.issueAgainstRequest(issuing.id, assetId, issuing.version, dueBackOn)
            if (issued) setIssuing(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * Hands an asset over against an approved request.
 *
 * Only assets that are actually in stock are offered, and the asset goes to
 * whoever raised the request — which is what makes it appear on their My
 * Asset page rather than under a name somebody typed.
 */
function IssueRequestDialog({
  request,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  request: ServerAssetRequest
  pending: boolean
  error: ApiClientError | null
  onClose: () => void
  onSubmit: (assetId: string, dueBackOn: string) => void
}) {
  const available = useIssuableAssets(request.assetType)
  const [assetId, setAssetId] = useState('')
  const [dueBackOn, setDueBackOn] = useState('')

  return (
    <Dialog title={`Issue against ${request.reference}`} onClose={onClose}>
      <div className="mt-5 grid gap-4">
        <p className="text-[13px] text-fg-muted">
          Going to {request.requesterName ?? 'whoever raised this request'}
          {request.assetType ? `, who asked for a ${request.assetType}` : ''}.
        </p>
        {available.error ? (
          <p role="alert" className="text-[13px] text-fg-muted">
            The list of available assets could not be loaded — {available.error.message}
          </p>
        ) : (
          <label>
            <Label>Asset to hand over</Label>
            <select value={assetId} onChange={(event) => setAssetId(event.target.value)} className={inputClass}>
              <option value="">{available.loading ? 'Loading…' : 'Choose an asset in stock'}</option>
              {available.assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.tag} — {asset.name}
                </option>
              ))}
            </select>
            {!available.loading && !available.assets.length && (
              <span className="mt-1 block text-[12px] text-fg-muted">
                Nothing of this type is in stock. Register or return one first.
              </span>
            )}
            {available.total > available.assets.length && (
              <span className="mt-1 block text-[12px] text-fg-muted">
                {available.assets.length} of {available.total} in stock are listed — search the register if the one you
                want is missing.
              </span>
            )}
          </label>
        )}
        <label>
          <Label>Due back</Label>
          <input type="date" value={dueBackOn} onChange={(event) => setDueBackOn(event.target.value)} className={inputClass} />
        </label>
      </div>
      <WriteError error={error} />
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="accent" disabled={!assetId || pending} onClick={() => onSubmit(assetId, dueBackOn)}>
          {pending ? 'Issuing…' : 'Issue'}
        </Button>
      </div>
    </Dialog>
  )
}

function RequestRow({
  request,
  canDecide,
  mine,
  pending,
  onDecide,
  onIssue,
}: {
  request: ServerAssetRequest
  canDecide: boolean
  mine: boolean
  pending: boolean
  onDecide: (decision: 'approved' | 'rejected') => void
  onIssue: () => void
}) {
  return (
    <tr>
      <td className="px-6 py-3.5">
        <span className="block font-mono text-[12px] text-fg-muted">{request.reference}</span>
        <span className="mt-0.5 block">{request.reason ?? '—'}</span>
      </td>
      <td className="px-6 py-3.5 text-fg-2">{request.assetType ?? '—'}</td>
      <td className="px-6 py-3.5">
        <span
          className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
            request.status === 'submitted' ? 'tone-amber' : request.status === 'rejected' ? 'tone-rose' : 'tone-emerald'
          }`}
        >
          {requestStatusLabel(request.status)}
        </span>
      </td>
      <td className="px-6 py-3.5 text-fg-2">{request.requesterName ?? (mine ? 'You' : '—')}</td>
      <td className="px-6 py-3.5 text-fg-2">{request.decidedByName ?? '—'}</td>
      <td className="px-6 py-3.5 text-right">
        {request.status === 'submitted' && canDecide && (
          <span className="flex justify-end gap-2">
            <Button variant="secondary" className="!py-1.5 !text-[12px]" disabled={pending} onClick={() => onDecide('approved')}>
              Approve
            </Button>
            <Button variant="secondary" className="!py-1.5 !text-[12px]" disabled={pending} onClick={() => onDecide('rejected')}>
              Reject
            </Button>
          </span>
        )}
        {request.status === 'approved' && (
          <Button variant="secondary" className="!py-1.5 !text-[12px]" disabled={pending} onClick={onIssue}>
            Issue
          </Button>
        )}
      </td>
    </tr>
  )
}

function NewRequestDialog({
  types,
  pending,
  error,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  types: { value: string; label: string }[]
  pending: boolean
  error: ApiClientError | null
  fieldErrors: Record<string, string>
  onClose: () => void
  onSubmit: (input: { assetType: string; reason: string; quantity: number }) => void
}) {
  const [assetType, setAssetType] = useState(types[0]?.value ?? '')
  const [reason, setReason] = useState('')
  const [quantity, setQuantity] = useState('1')

  return (
    <Dialog title="New request" onClose={onClose}>
      <div className="mt-5 grid gap-4">
        <label>
          <Label>Asset type</Label>
          <select value={assetType} onChange={(event) => setAssetType(event.target.value)} className={inputClass}>
            <option value="">Choose a type</option>
            {types.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {fieldErrors.assetType && <span className="mt-1 block text-[12px] text-bad">{fieldErrors.assetType}</span>}
        </label>
        <label>
          <Label>How many</Label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className={inputClass}
          />
        </label>
        <label>
          <Label>What do you need?</Label>
          <textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass} />
        </label>
      </div>
      <WriteError error={error} />
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="accent"
          disabled={!assetType || pending}
          onClick={() => onSubmit({ assetType, reason: reason.trim(), quantity: Math.max(1, Number(quantity) || 1) })}
        >
          {pending ? 'Raising…' : 'Raise request'}
        </Button>
      </div>
    </Dialog>
  )
}

/**
 * Reports, narrowed to the two the server can answer.
 *
 * Asset ledger, Support notes and Audit log are gone rather than showing a
 * sentence about history that does not exist: a tab that explains why it is
 * empty every time is a tab that has never worked.
 */
const reportTabs = ['Stock summary', 'Warranty'] as const

const groupings = [
  { label: 'By asset type', value: 'type' },
  { label: 'By location', value: 'location' },
  { label: 'By status', value: 'status' },
] as const

export function AssetReportsPane() {
  const [tab, setTab] = useState<(typeof reportTabs)[number]>('Stock summary')
  const [groupBy, setGroupBy] = useState<'type' | 'location' | 'status'>('type')
  const stock = useStockReport(groupBy)
  const warranty = useWarrantyReport(warrantyAlertDays)
  const types = useTaxonomy('asset_types')

  const labelFor = (value: string) =>
    groupBy === 'type' ? (types.entries.find((item) => item.value === value)?.label ?? value) : value

  /*
   * One cell, safe in a spreadsheet.
   *
   * A name with a comma in it splits a row that was joined by hand, and a
   * value starting with `=` runs as a formula when the file is opened — the
   * same guard the server's own export applies, applied here because this
   * file is assembled in the browser from rows already on screen.
   */
  function cell(value: string | number | null): string {
    const text = String(value ?? '')
    const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
  }

  function exportCsv() {
    const rows =
      tab === 'Stock summary'
        ? [
            'group,assets,purchase_value,currency',
            ...(stock.data?.lines ?? []).map((line) =>
              [
                cell(labelFor(line.key)),
                cell(line.count),
                // A group holding several currencies has no single total, so
                // the file says so rather than printing one.
                cell(line.currencies > 1 ? 'mixed currencies' : line.currencies === 1 ? line.value : ''),
                cell(line.currencies === 1 ? (line.currency ?? '') : ''),
              ].join(','),
            ),
          ]
        : [
            'asset,tag,expires_on,days_left,holder',
            ...(warranty.data?.rows ?? []).map((row) =>
              [cell(row.name), cell(row.tag), cell(row.warrantyExpiresOn), cell(row.daysLeft), cell(row.holderLabel)].join(','),
            ),
          ]
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = tab === 'Stock summary' ? 'asset-stock.csv' : 'asset-warranty.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const resource = tab === 'Stock summary' ? stock : warranty
  const empty = tab === 'Stock summary' ? !stock.data?.lines.length : !warranty.data?.rows.length

  return (
    <div>
      <nav className="flex flex-wrap gap-6 border-b border-line">
        {reportTabs.map((item) => (
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
            {tab === 'Stock summary'
              ? 'Assets and purchase value'
              : `Warranty already expired, or within ${warranty.data?.withinDays ?? warrantyAlertDays} days`}
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            {tab === 'Stock summary' && (
              <select
                aria-label="Group by"
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as 'type' | 'location' | 'status')}
                className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg-2 focus:border-accent focus:outline-none"
              >
                {groupings.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={exportCsv}
              disabled={empty}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2 disabled:opacity-40"
            >
              <Icon name="download" size={15} /> Export CSV
            </button>
          </div>
        </div>

        <div className="border-t border-line px-6 py-5">
          {resource.loading ? (
            <p role="status" className="text-[14px] text-fg-muted">
              Loading…
            </p>
          ) : resource.error ? (
            <PaneError
              error={resource.error}
              what="this report"
              denied={resource.denied}
              canRetry={resource.canRetry}
              onRetry={resource.refetch}
            />
          ) : tab === 'Stock summary' ? (
            stock.data?.lines.length ? (
              <table className="w-full border-collapse text-[13px]">
                <thead className="text-[12px] text-fg-muted">
                  <tr>
                    <th className="py-2 text-left font-medium">Group</th>
                    <th className="py-2 text-right font-medium">Assets</th>
                    <th className="py-2 text-right font-medium">Purchase value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {stock.data.lines.map((line) => (
                    <tr key={line.key}>
                      <td className="py-2.5">{groupBy === 'status' ? statusLabel(line.key) : labelFor(line.key)}</td>
                      <td className="py-2.5 text-right">{line.count}</td>
                      {/* Assets with no recorded cost count but add no value,
                          so the two columns are reported side by side — and
                          costs in different currencies are not added at all. */}
                      <td className="py-2.5 text-right">
                        {line.currencies > 1 ? (
                          <span className="text-fg-muted">Mixed currencies</span>
                        ) : line.currencies === 1 && line.currency ? (
                          formatAmount(line.value, line.currency)
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[14px] text-fg-muted">No assets to report on.</p>
            )
          ) : warranty.data?.rows.length ? (
            <table className="w-full border-collapse text-[13px]">
              <thead className="text-[12px] text-fg-muted">
                <tr>
                  <th className="py-2 text-left font-medium">Asset</th>
                  <th className="py-2 text-left font-medium">Tag</th>
                  <th className="py-2 text-left font-medium">Expires</th>
                  <th className="py-2 text-right font-medium">Days left</th>
                  <th className="py-2 text-left font-medium">Held by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {warranty.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5">{row.name}</td>
                    <td className="py-2.5 font-mono text-[12px] text-fg-muted">{row.tag}</td>
                    <td className="py-2.5">{row.warrantyExpiresOn}</td>
                    <td className={`py-2.5 text-right ${row.daysLeft < 0 ? 'text-bad' : 'text-warn'}`}>{row.daysLeft}</td>
                    <td className="py-2.5 text-fg-2">{row.holderLabel ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[14px] text-fg-muted">
              No warranty has expired or runs out in the next {warranty.data?.withinDays ?? warrantyAlertDays} days.
              Assets with no warranty date recorded are not counted here.
            </p>
          )}
          {/* The report returns a page; its counts cover the whole window. */}
          {tab === 'Warranty' && warranty.data && warranty.data.total > warranty.data.rows.length && (
            <p className="mt-3 text-[12px] text-fg-muted">
              Showing the {warranty.data.rows.length} soonest of {warranty.data.total} — {warranty.data.expired} already
              expired, {warranty.data.expiring} still in cover. The export below carries the rows shown, not all
              {' '}
              {warranty.data.total}.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
