'use client'

import { Dialog } from '../../components/Dialog'

import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { useSearchParams } from '../../lib/router'
import { Button } from '../../components/ui'
import { connectors } from '../../lib/connectorData'
import { flowTone, inventoryCategories, legalBases, type InventoryCategory } from '../../lib/complianceData'
import { useWorkspace } from '../../lib/workspace'
import { toneFor } from '../../lib/tones'

const tabs = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'dpia', label: 'DPIA' },
  { id: 'decisions', label: 'Automated Decisions' },
  { id: 'inventory', label: 'Data Inventory' },
  { id: 'flows', label: 'Data Flows' },
  { id: 'retention', label: 'Connector Retention' },
] as const

function Metric({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string
  value: number
  sub?: string
  tone?: 'bad'
  icon: string
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="flex items-start justify-between gap-2 text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">
        {label}
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${toneFor(label)}`}>
          <Icon name={icon} size={14} />
        </span>
      </p>
      <p className="mt-3 text-[30px] leading-none font-bold">{value}</p>
      {sub && (
        <p
          className={`mt-3 inline-block rounded-lg px-2 py-1 text-[11px] ${
            tone === 'bad' ? 'bg-bad-muted text-bad' : 'bg-surface-2 text-fg-muted'
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  )
}

/** Every empty register in this surface uses the same inbox-and-line empty state. */
function EmptyTable({ columns, message }: { columns: string[]; message: string }) {
  return (
    <>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[40rem] border-collapse text-[13px]">
          <thead className="border-b border-line bg-surface-2/50 text-[12px] text-fg-muted">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-5 py-3.5 text-left font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={columns.length} className="px-5 py-16 text-center">
                <Icon name="inbox" size={26} className="mx-auto text-fg-muted" />
                <span className="mt-3 block text-[15px] text-fg-2">{message}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[13px] text-fg-muted">0 results</p>
    </>
  )
}

function Dashboard() {
  const { dataInventory, dataFlows, dpias, automatedDecisions } = useWorkspace()

  const sensitive = dataInventory.filter((field) => field.sensitive).length
  const crossBorder = dataFlows.filter((flow) => flow.crossBorder).length
  const needsReview = dpias.filter((dpia) => dpia.status !== 'Approved').length
  const highRisk = dpias.filter((dpia) => dpia.risk === 'High').length
  const unreviewed = automatedDecisions.filter((entry) => entry.profiling && !entry.humanReview).length

  return (
    <>
      {/*
        * Only what this workspace has actually recorded. The tiles that stood
        * here for DSAR turnaround, active DPA templates and completed transfer
        * impact assessments were all `value={0}` literals over features that do
        * not exist — a zero in a compliance dashboard reads as "we checked and
        * there are none", which is a different claim from "we cannot check".
        */}
      <h2 className="mt-6 text-[15px] font-semibold">What you have recorded</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon="file-text" label="DPIA needs review" value={needsReview} sub={`${highRisk} high-risk`} />
        <Metric icon="user-check" label="Profiling w/o human review" value={unreviewed} />
        <Metric icon="shield-alert" label="Sensitive data fields" value={sensitive} sub={`${dataInventory.length} catalogued`} />
        <Metric icon="network" label="Data flows mapped" value={dataFlows.length} sub={`${crossBorder} cross-border`} />
      </div>

      <p className="mt-6 flex items-start gap-3 rounded-2xl bg-surface-2/70 px-5 py-4 text-[13px] leading-relaxed text-fg-2">
        <Icon name="alert-triangle" size={16} className="mt-0.5 text-warn" />
        <span>
          <strong className="font-semibold text-fg">Recording is not enforcing.</strong> These registers are your
          own record of what you process and why. Nothing on this deployment reads them: writing a retention period
          here does not delete anything, and recording a lawful basis does not restrict what the application stores.
          They were also shipped pre-filled with a platform-wide inventory and transfer map, which named tables this
          database does not have and asserted data-processing agreements that do not exist. That is gone.
        </span>
      </p>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-[13px] font-medium text-fg-2">
      {label}
      {children}
    </label>
  )
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none'


function DpiaPane() {
  const { dpias, addDpia } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [activity, setActivity] = useState('')
  const [risk, setRisk] = useState<'Low' | 'Medium' | 'High'>('Medium')

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[14px] text-fg-2">
          Data Protection Impact Assessments for high-risk processing (GDPR Art. 35).
        </p>
        <Button variant="accent" onClick={() => setOpen(true)}>
          + New DPIA
        </Button>
      </div>

      {dpias.length ? (
        <>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[40rem] border-collapse text-[13px]">
              <thead className="border-b border-line bg-surface-2/50 text-[12px] text-fg-muted">
                <tr>
                  {['Title', 'Activity', 'Risk', 'Status'].map((column) => (
                    <th key={column} scope="col" className="px-5 py-3.5 text-left font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {dpias.map((dpia) => (
                  <tr key={dpia.id}>
                    <td className="px-5 py-3.5 font-medium">{dpia.title}</td>
                    <td className="px-5 py-3.5 text-fg-2">{dpia.activity}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                          dpia.risk === 'High' ? 'bg-bad-muted text-bad' : 'bg-surface-2 text-fg-2'
                        }`}
                      >
                        {dpia.risk}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-fg-2">{dpia.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[13px] text-fg-muted">{dpias.length} results</p>
        </>
      ) : (
        <EmptyTable columns={['Title', 'Activity', 'Risk', 'Status']} message="No DPIAs yet" />
      )}

      {open && (
        <Dialog size="lg" title="New DPIA" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <Field label="Title">
              <input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Processing activity">
              <input value={activity} onChange={(event) => setActivity(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Risk">
              <select
                value={risk}
                onChange={(event) => setRisk(event.target.value as typeof risk)}
                className={inputClass}
              >
                {['Low', 'Medium', 'High'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!title.trim()}
              onClick={() => {
                addDpia({ title: title.trim(), activity: activity.trim(), risk, status: 'Draft' })
                setTitle('')
                setActivity('')
                setOpen(false)
              }}
            >
              Create DPIA
            </Button>
          </div>
        </Dialog>
      )}
    </>
  )
}

function DecisionsPane() {
  const { automatedDecisions, addAutomatedDecision } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [profiling, setProfiling] = useState(true)
  const [humanReview, setHumanReview] = useState(true)

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[14px] text-fg-2">
          Profiling / automated decisions (GDPR Art. 22). Flag any that lack a human-review path.
        </p>
        <Button variant="accent" onClick={() => setOpen(true)}>
          + New entry
        </Button>
      </div>

      {automatedDecisions.length ? (
        <>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[40rem] border-collapse text-[13px]">
              <thead className="border-b border-line bg-surface-2/50 text-[12px] text-fg-muted">
                <tr>
                  {['Name', 'Profiling', 'Human review', 'Status'].map((column) => (
                    <th key={column} scope="col" className="px-5 py-3.5 text-left font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {automatedDecisions.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-5 py-3.5 font-medium">{entry.name}</td>
                    <td className="px-5 py-3.5 text-fg-2">{entry.profiling ? 'Yes' : 'No'}</td>
                    <td className="px-5 py-3.5 text-fg-2">{entry.humanReview ? 'Yes' : 'No'}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                          entry.status === 'Needs review' ? 'bg-warn-muted text-warn' : 'bg-ok-muted text-ok'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[13px] text-fg-muted">{automatedDecisions.length} results</p>
        </>
      ) : (
        <EmptyTable
          columns={['Name', 'Profiling', 'Human review', 'Status']}
          message="No automated decisions registered"
        />
      )}

      {open && (
        <Dialog size="lg" title="New automated decision" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <Field label="Name">
              <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
            </Field>
            <label className="flex items-center gap-3 text-[13px] text-fg-2">
              <input
                type="checkbox"
                checked={profiling}
                onChange={(event) => setProfiling(event.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Involves profiling
            </label>
            <label className="flex items-center gap-3 text-[13px] text-fg-2">
              <input
                type="checkbox"
                checked={humanReview}
                onChange={(event) => setHumanReview(event.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Has a human-review path
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!name.trim()}
              onClick={() => {
                addAutomatedDecision({
                  name: name.trim(),
                  profiling,
                  humanReview,
                  // Profiling with nobody in the loop is exactly what Art. 22 flags.
                  status: profiling && !humanReview ? 'Needs review' : 'Registered',
                })
                setName('')
                setOpen(false)
              }}
            >
              Register entry
            </Button>
          </div>
        </Dialog>
      )}
    </>
  )
}

function InventoryPane() {
  const { dataInventory, addInventoryField, removeInventoryField, updateInventoryField } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    entity: '',
    field: '',
    category: 'basic' as InventoryCategory,
    sensitive: false,
    legalBasis: 'Consent',
    retention: '',
  })

  function openFor(id: string | null) {
    const existing = dataInventory.find((item) => item.id === id)
    setDraft(
      existing
        ? {
            entity: existing.entity,
            field: existing.field,
            category: existing.category,
            sensitive: existing.sensitive,
            legalBasis: existing.legalBasis,
            retention: existing.retention,
          }
        : { entity: '', field: '', category: 'basic', sensitive: false, legalBasis: 'Consent', retention: '' },
    )
    setEditing(id)
    setOpen(true)
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-[14px] text-fg-2">
          Your own catalogue of where personal data lives. Entries are the ones you add — nothing is pre-filled, and
          no entry here changes what the application stores.
        </p>
        {/*
          * "Discover PII" has gone. It ran no scan: it set a sentence reading
          * "Scan complete — no personal-data fields found beyond the N already
          * catalogued", which is an assertion about a database nobody looked
          * at. A button that reports a clean result without checking is worse
          * than no button, because somebody will rely on it.
          */}
        <Button variant="accent" onClick={() => openFor(null)}>
          + Add field
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[56rem] border-collapse text-[13px]">
          <thead className="border-b border-line bg-surface-2/50 text-[12px] text-fg-muted">
            <tr>
              {['Entity', 'Field', 'Category', 'Sensitive', 'Legal basis', 'Retention'].map((column) => (
                <th key={column} scope="col" className="px-5 py-3.5 text-left font-medium">
                  {column}
                </th>
              ))}
              <th scope="col" className="px-5 py-3.5 text-left font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {dataInventory.map((item) => (
              <tr key={item.id}>
                <td className="px-5 py-3.5 font-mono text-[12px]">{item.entity}</td>
                <td className="px-5 py-3.5 font-mono text-[12px]">{item.field}</td>
                <td className="px-5 py-3.5">
                  <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${toneFor(item.category)}`}>
                    {item.category}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  {item.sensitive ? (
                    <span className="rounded-lg bg-bad-muted px-2.5 py-1 text-[11px] font-medium text-bad">
                      sensitive
                    </span>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-fg-2">{item.legalBasis}</td>
                <td className="px-5 py-3.5 text-fg-2">{item.retention}</td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <button
                    onClick={() => openFor(item.id)}
                    className="text-[13px] text-fg-2 transition hover:text-accent"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeInventoryField(item.id)}
                    className="ml-4 text-[13px] text-fg-2 transition hover:text-bad"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[13px] text-fg-muted">{dataInventory.length} results</p>

      {open && (
        <Dialog size="lg" title={editing ? 'Edit field' : 'Add field'} onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Entity">
              <input
                value={draft.entity}
                onChange={(event) => setDraft((prev) => ({ ...prev, entity: event.target.value }))}
                placeholder="users"
                className={inputClass}
              />
            </Field>
            <Field label="Field">
              <input
                value={draft.field}
                onChange={(event) => setDraft((prev) => ({ ...prev, field: event.target.value }))}
                placeholder="email"
                className={inputClass}
              />
            </Field>
            <Field label="Category">
              <select
                value={draft.category}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, category: event.target.value as InventoryCategory }))
                }
                className={inputClass}
              >
                {inventoryCategories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Legal basis">
              <select
                value={draft.legalBasis}
                onChange={(event) => setDraft((prev) => ({ ...prev, legalBasis: event.target.value }))}
                className={inputClass}
              >
                {legalBases.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Retention">
              <input
                value={draft.retention}
                onChange={(event) => setDraft((prev) => ({ ...prev, retention: event.target.value }))}
                placeholder="Life of account"
                className={inputClass}
              />
            </Field>
            <label className="mt-7 flex items-center gap-3 text-[13px] text-fg-2">
              <input
                type="checkbox"
                checked={draft.sensitive}
                onChange={(event) => setDraft((prev) => ({ ...prev, sensitive: event.target.checked }))}
                className="h-4 w-4 accent-accent"
              />
              Sensitive
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.entity.trim() || !draft.field.trim()}
              onClick={() => {
                if (editing) updateInventoryField(editing, draft)
                else addInventoryField(draft)
                setOpen(false)
              }}
            >
              {editing ? 'Save field' : 'Add field'}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  )
}

function FlowsPane() {
  const { dataFlows, addDataFlow } = useWorkspace()
  const [view, setView] = useState<'List' | 'Map'>('List')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({
    name: '',
    type: 'egress' as 'ingress' | 'egress' | 'internal',
    source: '',
    destination: '',
    crossBorder: '',
  })

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-[14px] text-fg-2">
          Where personal data enters, moves and leaves the platform (GDPR Art. 30 / transfer mapping).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-line bg-surface p-1">
            {(['List', 'Map'] as const).map((item) => (
              <button
                key={item}
                onClick={() => setView(item)}
                aria-pressed={view === item}
                className={`rounded-lg px-3.5 py-1.5 text-[13px] transition ${
                  view === item ? 'bg-accent-muted font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
                }`}
              >
                {item === 'Map' ? '⇄ Map' : item}
              </button>
            ))}
          </div>
          <Button variant="accent" onClick={() => setOpen(true)}>
            + New flow
          </Button>
        </div>
      </div>

      {view === 'List' ? (
        <>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[52rem] border-collapse text-[13px]">
              <thead className="border-b border-line bg-surface-2/50 text-[12px] text-fg-muted">
                <tr>
                  {['Flow', 'Type', 'Source', 'Destination', 'Cross-border'].map((column) => (
                    <th key={column} scope="col" className="px-5 py-3.5 text-left font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {dataFlows.map((flow) => (
                  <tr key={flow.id}>
                    <td className="px-5 py-3.5 font-medium">{flow.name}</td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${flowTone[flow.type]}`}>
                        {flow.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-fg-2">{flow.source}</td>
                    <td className="px-5 py-3.5 text-fg-2">{flow.destination}</td>
                    <td className="px-5 py-3.5">
                      {flow.crossBorder ? (
                        <span className="rounded-lg bg-bad-muted px-2.5 py-1 text-[11px] font-medium text-bad">
                          {flow.crossBorder}
                        </span>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-[13px] text-fg-muted">
            <p>
              Showing{' '}
              <span className="font-medium text-fg">
                1–{dataFlows.length}
              </span>{' '}
              of <span className="font-medium text-fg">{dataFlows.length}</span>
            </p>
            <div className="ml-auto flex items-center gap-3">
              <span>Rows 10</span>
              <span>
                Page <span className="rounded-lg border border-line px-3 py-1 text-fg">1</span> of 1
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {(['ingress', 'internal', 'egress'] as const).map((type) => (
            <section key={type} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-medium ${flowTone[type]}`}>
                {type}
              </h3>
              <ul className="mt-4 space-y-3">
                {dataFlows
                  .filter((flow) => flow.type === type)
                  .map((flow) => (
                    <li key={flow.id} className="rounded-xl border border-line px-4 py-3">
                      <p className="text-[13px] font-medium">{flow.name}</p>
                      <p className="mt-1 text-[12px] text-fg-muted">
                        {flow.source} → {flow.destination}
                      </p>
                      {flow.crossBorder && (
                        <span className="mt-2 inline-block rounded-lg bg-bad-muted px-2 py-0.5 text-[11px] font-medium text-bad">
                          {flow.crossBorder}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {open && (
        <Dialog size="lg" title="New flow" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <Field label="Flow">
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Type">
              <select
                value={draft.type}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, type: event.target.value as typeof prev.type }))
                }
                className={inputClass}
              >
                {['ingress', 'egress', 'internal'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Source">
              <input
                value={draft.source}
                onChange={(event) => setDraft((prev) => ({ ...prev, source: event.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Destination">
              <input
                value={draft.destination}
                onChange={(event) => setDraft((prev) => ({ ...prev, destination: event.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Cross-border safeguard">
              <input
                value={draft.crossBorder}
                onChange={(event) => setDraft((prev) => ({ ...prev, crossBorder: event.target.value }))}
                placeholder="Leave blank if the data stays in-region"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.name.trim()}
              onClick={() => {
                addDataFlow(draft)
                setDraft({ name: '', type: 'egress', source: '', destination: '', crossBorder: '' })
                setOpen(false)
              }}
            >
              Map flow
            </Button>
          </div>
        </Dialog>
      )}
    </>
  )
}

function RetentionPane() {
  const { retentionPolicies, addRetentionPolicy, removeRetentionPolicy, connections } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [connectorId, setConnectorId] = useState(connectors[0].id)
  const [days, setDays] = useState(90)

  const nameOf = (id: string) => connectors.find((item) => item.id === id)?.name ?? id

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[14px] text-fg-2">How long to keep data pulled in via each connector before it is purged.</p>
        <Button variant="accent" onClick={() => setOpen(true)}>
          + Set policy
        </Button>
      </div>

      {retentionPolicies.length ? (
        <>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[40rem] border-collapse text-[13px]">
              <thead className="border-b border-line bg-surface-2/50 text-[12px] text-fg-muted">
                <tr>
                  {['Connector', 'Keep for', 'Status', 'Purge'].map((column) => (
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
                {retentionPolicies.map((policy) => (
                  <tr key={policy.id}>
                    <td className="px-5 py-3.5 font-medium">{nameOf(policy.connectorId)}</td>
                    <td className="px-5 py-3.5 text-fg-2">{policy.keepForDays} days</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                          policy.enabled ? 'bg-ok-muted text-ok' : 'bg-surface-2 text-fg-muted'
                        }`}
                      >
                        {policy.enabled ? 'Recorded' : 'Off'}
                      </span>
                    </td>
                    {/* "Never" read as "the purge has not run yet". No purge
                        job exists at all, which is a different statement. */}
                    <td className="px-5 py-3.5 text-fg-muted">Not enforced</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => removeRetentionPolicy(policy.id)}
                        className="text-[13px] text-fg-2 transition hover:text-bad"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[13px] text-fg-muted">{retentionPolicies.length} results</p>
        </>
      ) : (
        <EmptyTable
          columns={['Connector', 'Keep for', 'Status', 'Purge']}
          message="No connector retention policies set"
        />
      )}

      {open && (
        <Dialog size="lg" title="Set retention policy" onClose={() => setOpen(false)}>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            {connections.length
              ? 'Applies to data this tenant has pulled through the connector.'
              : 'No connections exist yet — a policy set now applies as soon as one is created.'}
          </p>
          <div className="mt-5 grid gap-4">
            <Field label="Connector">
              <select
                value={connectorId}
                onChange={(event) => setConnectorId(event.target.value)}
                className={inputClass}
              >
                {connectors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Keep for (days)">
              <input
                type="number"
                min={1}
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={days < 1}
              onClick={() => {
                addRetentionPolicy({ connectorId, keepForDays: days, enabled: true, lastRun: '' })
                setOpen(false)
              }}
            >
              Set policy
            </Button>
          </div>
        </Dialog>
      )}
    </>
  )
}

export default function ComplianceCenter() {
  const [params, setParams] = useSearchParams()
  const active = tabs.find((tab) => tab.id === params.get('tab'))?.id ?? 'dashboard'

  return (
    <div className="pt-2">
      <header className="border-b border-line pb-6">
        <h1 className="flex items-center gap-3 text-[26px] font-bold tracking-tight">
          <Icon name="shield-alert" size={24} className="text-accent" />
          Compliance Center
        </h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          DPIAs, automated-decision register, personal-data inventory, data flows and retention.
        </p>
      </header>

      <nav className="mt-6 inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setParams({ tab: tab.id })}
            aria-current={active === tab.id ? 'page' : undefined}
            className={`rounded-lg px-4 py-1.5 text-[14px] transition ${
              active === tab.id ? 'bg-accent-muted font-medium text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {active === 'dashboard' && <Dashboard />}
      {active === 'dpia' && <DpiaPane />}
      {active === 'decisions' && <DecisionsPane />}
      {active === 'inventory' && <InventoryPane />}
      {active === 'flows' && <FlowsPane />}
      {active === 'retention' && <RetentionPane />}
    </div>
  )
}
