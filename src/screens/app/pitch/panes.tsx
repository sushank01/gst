'use client'

import { useState } from 'react'
import { Link } from '../../../lib/router'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import {
  inFlightStages,
  kbCategories,
  monthlyAiBudget,
  rfpStages,
  stockSchemas,
  verticals,
  type RfpStage,
} from '../../../lib/pitchData'
import { useWorkspace } from '../../../lib/workspace'
import { Dialog, Label, inputClass } from '../travel/shell'

const money = (value: number) => value.toLocaleString('en-US')

function Crumb() {
  return (
    <Link to="/app/pitch-pilot" className="text-[13px] text-fg-2 transition hover:text-accent">
      ← Dashboard
    </Link>
  )
}

export function PitchDashboard() {
  const { rfps, creditsUsed } = useWorkspace()

  const inFlight = rfps.filter((item) => inFlightStages.includes(item.stage as RfpStage))
  const yourTurn = rfps.filter((item) => item.stage === 'Your turn')
  const outForClient = rfps.filter((item) => item.stage === 'Out for client')
  const pipeline = inFlight.reduce((total, item) => total + item.estimate, 0)
  const decided = rfps.filter((item) => item.stage === 'Won' || item.stage === 'Lost')
  const won = rfps.filter((item) => item.stage === 'Won')

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const tiles = [
    { label: 'In flight', value: String(inFlight.length), sub: 'RFPs in the funnel', icon: 'inbox' },
    { label: 'Your turn', value: String(yourTurn.length), sub: 'Awaiting your review', icon: 'clock' },
    { label: 'Out for client', value: String(outForClient.length), sub: 'Sent, awaiting reply', icon: 'activity' },
    { label: 'Pipeline value', value: `$ ${money(pipeline)}`, sub: 'Total estimate, in-flight RFPs', icon: 'chart' },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">
            Good afternoon — here&apos;s where your pitches stand 👋
          </h1>
          <p className="mt-2 text-[14px] text-fg-muted">
            {today} · {rfps.length} active RFPs · No deadlines this week
          </p>
        </div>
        <Link to="/app/pitch-pilot/new">
          <Button variant="accent">+ New RFP</Button>
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-line bg-surface p-5">
            <p className="flex items-start justify-between gap-2 text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">
              {tile.label}
              <Icon name={tile.icon} size={15} />
            </p>
            <p className="mt-3 text-[28px] leading-none font-bold">{tile.value}</p>
            <p className="mt-3 text-[12px] text-fg-muted">{tile.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_22rem]">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[17px] font-semibold">My queue</h2>
              <p className="mt-1 text-[13px] text-fg-muted">RFPs that need your touch</p>
            </div>
            <Link to="/app/pitch-pilot/inbox" className="text-[13px] font-medium text-accent hover:underline">
              View all →
            </Link>
          </div>

          {yourTurn.length ? (
            <ul className="mt-6 divide-y divide-line rounded-xl border border-line">
              {yourTurn.map((rfp) => (
                <li key={rfp.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                  <span className="min-w-[12rem] flex-1">
                    <span className="block text-[14px] font-medium">{rfp.prospect}</span>
                    <span className="mt-0.5 block text-[12px] text-fg-muted">{rfp.summary}</span>
                  </span>
                  <span className="font-mono text-[13px]">$ {money(rfp.estimate)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-20 text-center">
              <Icon name="inbox" size={30} className="mx-auto text-fg-muted" />
              <p className="mt-4 text-[15px] text-fg-2">No active RFPs yet.</p>
              <Link
                to="/app/pitch-pilot/new"
                className="mt-3 inline-block text-[14px] font-medium text-accent hover:underline"
              >
                Upload your first RFP →
              </Link>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">Win rate</p>
            <p className="mt-3 text-[26px] leading-none font-bold">
              {decided.length ? `${Math.round((won.length / decided.length) * 100)}%` : '—'}
            </p>
            <p className="mt-3 text-[12px] text-fg-muted">
              {decided.length ? `${won.length} of ${decided.length} decided` : 'No completed pitches yet'}
            </p>
          </section>

          <section className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white">
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.06em] uppercase opacity-90">
              <Icon name="zap" size={14} /> Time saved this month
            </p>
            <p className="mt-3 text-[28px] leading-none font-bold">0 hrs</p>
            <p className="mt-3 text-[12px] opacity-90">Telemetry starts after your first sent deck</p>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">AI spend this month</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-[26px] leading-none font-bold">$ {creditsUsed}</p>
              <p className="text-[12px] text-fg-muted">of $ {monthlyAiBudget} budget</p>
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <Link to="/app/account" className="text-[13px] font-medium text-accent hover:underline">
                See in Cost Center →
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export function RfpInbox() {
  const { rfps } = useWorkspace()
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState('All stages')
  const [vertical, setVertical] = useState('All verticals')

  const visible = rfps.filter((rfp) => {
    if (stage !== 'All stages' && rfp.stage !== stage) return false
    if (vertical !== 'All verticals' && rfp.vertical !== vertical) return false
    if (!query.trim()) return true
    return `${rfp.prospect} ${rfp.summary}`.toLowerCase().includes(query.toLowerCase())
  })

  function exportCsv() {
    const head = 'prospect,summary,stage,vertical,estimate'
    const body = visible.map((r) => `"${r.prospect}","${r.summary}",${r.stage},${r.vertical},${r.estimate}`).join('\n')
    const url = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: 'text/csv' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'rfp-inbox.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">RFP Inbox</h1>
          <p className="mt-2 text-[14px] text-fg-muted">
            All RFPs across the agency · {visible.length} of {rfps.length} shown
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={exportCsv}
            disabled={!visible.length}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2 disabled:opacity-50"
          >
            <Icon name="download" size={15} /> Export
          </button>
          <Link to="/app/pitch-pilot/new">
            <Button variant="accent">+ New RFP</Button>
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 rounded-2xl border border-line bg-surface p-4">
        <span className="relative min-w-[16rem] flex-1">
          <Icon name="search" size={15} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search prospect or summary..."
            aria-label="Search RFPs"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-10 text-[14px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </span>
        <select
          aria-label="Stage"
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          className="min-w-[10rem] rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-fg-2 focus:border-accent focus:outline-none"
        >
          <option>All stages</option>
          {rfpStages.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="Vertical"
          value={vertical}
          onChange={(event) => setVertical(event.target.value)}
          className="min-w-[10rem] rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-fg-2 focus:border-accent focus:outline-none"
        >
          <option>All verticals</option>
          {verticals.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-surface">
        {visible.length ? (
          <ul className="divide-y divide-line">
            {visible.map((rfp) => (
              <li key={rfp.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                <span className="min-w-[14rem] flex-1">
                  <span className="block text-[14px] font-medium">{rfp.prospect}</span>
                  <span className="mt-0.5 block text-[12px] text-fg-muted">{rfp.summary}</span>
                </span>
                <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-violet">{rfp.stage}</span>
                <span className="text-[12px] text-fg-muted">{rfp.vertical}</span>
                <span className="font-mono text-[13px]">$ {money(rfp.estimate)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-16 text-center text-[15px] text-fg-muted">
            {rfps.length ? 'No RFPs match these filters.' : 'No RFPs yet — upload one to get started.'}
          </p>
        )}
      </div>
    </div>
  )
}

export function NewRfp() {
  const { addRfp, customSchemas } = useWorkspace()
  const [file, setFile] = useState<File | null>(null)
  const [prospect, setProspect] = useState('')
  const [schema, setSchema] = useState('auto')
  const [busy, setBusy] = useState(false)

  const schemas = [
    { id: 'auto', name: 'Auto-detect', hint: 'Recommended' },
    ...stockSchemas.map((item) => ({ id: item.id, name: item.name, hint: `${item.fields.length} fields` })),
    ...customSchemas.map((item) => ({ id: item.id, name: item.name, hint: 'Custom' })),
  ]

  async function extract() {
    if (!file) return
    setBusy(true)
    await new Promise((resolve) => setTimeout(resolve, 900))
    addRfp({
      // Falls back to the file name when the prospect is left blank, as the hint promises.
      prospect: prospect.trim() || file.name.replace(/\.pdf$/i, ''),
      summary: `Extracted from ${file.name}`,
      stage: 'Your turn',
      vertical: verticals[0],
      estimate: 0,
      schema: schemas.find((item) => item.id === schema)?.name ?? 'Auto-detect',
      deadline: '',
    })
    setBusy(false)
    setFile(null)
    setProspect('')
  }

  return (
    <div>
      <Crumb />
      <h1 className="mt-3 text-[28px] font-bold tracking-tight">New RFP</h1>
      <p className="mt-2 text-[14px] text-fg-muted">
        Drop the client&apos;s RFP — we&apos;ll extract fields + identify the questions to answer in your response deck.
      </p>

      <section className="mt-6 max-w-3xl rounded-2xl border border-line bg-surface p-6">
        <label
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const dropped = event.dataTransfer.files?.[0]
            if (dropped) setFile(dropped)
          }}
          className="block cursor-pointer rounded-xl border border-dashed border-line px-6 py-14 text-center transition hover:border-accent"
        >
          <Icon name="download" size={30} className="mx-auto rotate-180 text-fg-muted" />
          <span className="mt-4 block text-[18px] font-semibold">
            {file ? file.name : "Drop the client's RFP here"}
          </span>
          <span className="mt-1.5 block text-[13px] text-fg-muted">PDF only · Max 50 MB</span>
          <span className="mt-3 block text-[13px] font-medium text-accent">Browse files →</span>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <div className="mt-6">
          <p className="text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">
            Prospect name (optional)
          </p>
          <p className="mt-1 text-[13px] text-fg-muted">We&apos;ll auto-detect from the document if blank</p>
          <input
            value={prospect}
            onChange={(event) => setProspect(event.target.value)}
            placeholder="e.g. City of Hidden Hills"
            aria-label="Prospect name"
            className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </div>

        <div className="mt-6">
          <p className="text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">Extraction schema</p>
          <p className="mt-1 text-[13px] text-fg-muted">
            Which set of fields to pull. Auto-detect picks based on document content.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {schemas.map((item) => (
              <button
                key={item.id}
                onClick={() => setSchema(item.id)}
                aria-pressed={schema === item.id}
                className={`min-w-[12rem] rounded-xl border px-4 py-3 text-left transition ${
                  schema === item.id ? 'border-accent bg-accent-muted' : 'border-line hover:border-fg-muted'
                }`}
              >
                {item.id === 'auto' && <span className="block text-[15px]">✨</span>}
                <span className="mt-1 block text-[14px] font-semibold">{item.name}</span>
                <span className="mt-0.5 block text-[12px] text-fg-muted">{item.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-line pt-5">
          <Button variant="secondary" onClick={() => setFile(null)}>
            Cancel
          </Button>
          <Button variant="accent" disabled={!file} loading={busy} onClick={extract}>
            <Icon name="sparkles" size={15} /> Extract &amp; Open ▶
          </Button>
        </div>
      </section>
    </div>
  )
}

export function KnowledgeBase() {
  const { kbDocs, addKbDoc, removeKbDoc } = useWorkspace()
  const [category, setCategory] = useState('all')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', category: kbCategories[0].id })

  const visible = kbDocs.filter((doc) => category === 'all' || doc.category === category)
  const countFor = (id: string) => (id === 'all' ? kbDocs.length : kbDocs.filter((doc) => doc.category === id).length)

  return (
    <div>
      <Crumb />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-[28px] font-bold tracking-tight">Knowledge Base</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">
            Case studies, team bios, methodology docs. The AI RAGs against this when drafting RFQ answers — better KB →
            better on-brief responses.
          </p>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>
          + Add document
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => setCategory('all')}
          aria-pressed={category === 'all'}
          className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
            category === 'all' ? 'bg-fg font-medium text-bg' : 'border border-line text-fg-2 hover:bg-surface-2'
          }`}
        >
          All ({countFor('all')})
        </button>
        {kbCategories.map((item) => (
          <button
            key={item.id}
            onClick={() => setCategory(item.id)}
            aria-pressed={category === item.id}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
              category === item.id
                ? 'border-accent bg-accent-muted text-accent'
                : 'border-line text-fg-2 hover:bg-surface-2'
            }`}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label} ({countFor(item.id)})
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-line bg-surface">
        {visible.length ? (
          <ul className="divide-y divide-line">
            {visible.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                <Icon name="file-text" size={16} className="text-fg-muted" />
                <span className="min-w-0 flex-1 text-[14px]">{doc.title}</span>
                <span className="text-[12px] text-fg-muted">
                  {kbCategories.find((item) => item.id === doc.category)?.label}
                </span>
                <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => removeKbDoc(doc.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-6 py-16 text-center">
            <Icon name="file-text" size={30} className="mx-auto text-fg-muted" />
            <p className="mt-4 text-[15px] text-fg-2">No knowledge base documents yet.</p>
            <Button variant="accent" className="mt-5" onClick={() => setOpen(true)}>
              <Icon name="download" size={15} className="rotate-180" /> Upload your first document
            </Button>
          </div>
        )}
      </div>

      {open && (
        <Dialog title="Add document" onClose={() => setOpen(false)}>
          <div className="mt-5 grid gap-4">
            <label>
              <Label>Title</Label>
              <input
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label>
              <Label>Category</Label>
              <select
                value={draft.category}
                onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
                className={inputClass}
              >
                {kbCategories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!draft.title.trim()}
              onClick={() => {
                addKbDoc({ title: draft.title.trim(), category: draft.category })
                setDraft({ ...draft, title: '' })
                setOpen(false)
              }}
            >
              Add document
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export function Templates() {
  const { pitchTemplates, addPitchTemplate, setDefaultTemplate, removePitchTemplate } = useWorkspace()
  const active = pitchTemplates.find((item) => item.isDefault)

  function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) addPitchTemplate(file.name)
    event.target.value = ''
  }

  return (
    <div>
      <Crumb />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-[28px] font-bold tracking-tight">Templates</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">
            Upload your firm&apos;s branded .pptx template. Every generated deck inherits its masters, fonts, and
            dimensions — Brand Kit colors paint on top.
          </p>
        </div>
        <label className="cursor-pointer">
          <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95">
            + Upload template
          </span>
          <input type="file" accept=".pptx" onChange={upload} className="hidden" />
        </label>
      </div>

      {!active && (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn-muted/50 px-5 py-3.5 text-[13px] text-warn">
          <Icon name="alert-triangle" size={16} className="mt-0.5 shrink-0" />
          No active template set — decks compose with the built-in navy/amber defaults. Upload a .pptx and mark it
          default to take over the look.
        </p>
      )}

      <div className="mt-5 rounded-2xl border border-line bg-surface">
        {pitchTemplates.length ? (
          <ul className="divide-y divide-line">
            {pitchTemplates.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                <Icon name="file-text" size={16} className="text-fg-muted" />
                <span className="min-w-0 flex-1 text-[14px]">{template.name}</span>
                {template.isDefault ? (
                  <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium tone-emerald">Default</span>
                ) : (
                  <Button
                    variant="secondary"
                    className="!py-2 !text-[13px]"
                    onClick={() => setDefaultTemplate(template.id)}
                  >
                    Make default
                  </Button>
                )}
                <Button
                  variant="secondary"
                  className="!py-2 !text-[13px]"
                  onClick={() => removePitchTemplate(template.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-6 py-16 text-center">
            <Icon name="grid" size={30} className="mx-auto text-fg-muted" />
            <p className="mt-4 text-[15px] text-fg-2">
              No templates uploaded yet. Decks compose with the built-in defaults until you provide one.
            </p>
            <label className="mt-5 inline-block cursor-pointer">
              <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95">
                <Icon name="download" size={15} className="rotate-180" /> Upload your first template
              </span>
              <input type="file" accept=".pptx" onChange={upload} className="hidden" />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}

export function ExtractionSchema() {
  const { customSchemas, addCustomSchema, updateCustomSchema } = useWorkspace()
  const [selected, setSelected] = useState<string | null>(null)

  const all = [
    ...stockSchemas.map((item) => ({ ...item, stock: true })),
    ...customSchemas.map((item) => ({ ...item, stock: false })),
  ]
  const schema = all.find((item) => item.id === selected)

  return (
    <div>
      <Crumb />
      <h1 className="mt-3 text-[28px] font-bold tracking-tight">Extraction Schema</h1>
      <p className="mt-2 text-[14px] text-fg-muted">
        Define which fields the AI pulls from RFPs. Edit defaults or create custom schemas per service line.
      </p>

      <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-accent-muted px-5 py-4 text-[13px] leading-relaxed text-fg-2">
        <span aria-hidden className="mt-0.5">
          🚀
        </span>
        <span>
          <strong className="font-semibold text-fg">4 schemas ship out of the box</strong> — Design &amp; Development,
          Software Development, Services &amp; Consulting, Government / Municipal. Each tunes which fields the AI
          extracts. Add a custom schema any time.
        </span>
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div>
          <button
            onClick={() => {
              addCustomSchema({ name: `Custom schema ${customSchemas.length + 1}`, fields: ['Client name'] })
              setSelected(null)
            }}
            className="w-full rounded-xl border border-dashed border-line px-4 py-3 text-[14px] font-medium text-accent transition hover:border-accent"
          >
            + New custom schema
          </button>

          <ul className="mt-3 space-y-1">
            {all.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setSelected(item.id)}
                  aria-current={selected === item.id ? 'page' : undefined}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-[13.5px] transition ${
                    selected === item.id ? 'bg-accent-muted font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2'
                  }`}
                >
                  {item.name}
                  <span className="text-[12px] text-fg-muted">{item.fields.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <section className="rounded-2xl border border-line bg-surface p-6">
          {schema ? (
            <>
              <h2 className="text-[17px] font-semibold">{schema.name}</h2>
              <p className="mt-1.5 text-[13px] text-fg-muted">
                {schema.stock ? 'Ships with the app. Fields are fixed.' : 'Custom schema — edit its fields below.'}
              </p>
              <ul className="mt-5 space-y-2">
                {schema.fields.map((field, index) => (
                  <li key={`${field}-${index}`}>
                    {schema.stock ? (
                      <span className="block rounded-xl border border-line bg-surface-2/50 px-4 py-2.5 text-[13px]">
                        {field}
                      </span>
                    ) : (
                      <input
                        value={field}
                        aria-label={`Field ${index + 1}`}
                        onChange={(event) =>
                          updateCustomSchema(schema.id, {
                            fields: schema.fields.map((item, i) => (i === index ? event.target.value : item)),
                          })
                        }
                        className="w-full rounded-xl border border-line bg-bg px-4 py-2.5 text-[13px] focus:border-accent focus:outline-none"
                      />
                    )}
                  </li>
                ))}
              </ul>
              {!schema.stock && (
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => updateCustomSchema(schema.id, { fields: [...schema.fields, 'New field'] })}
                >
                  + Add field
                </Button>
              )}
            </>
          ) : (
            <p className="py-16 text-center text-[14px] text-fg-muted">Pick a schema on the left to edit</p>
          )}
        </section>
      </div>
    </div>
  )
}

export function Analytics() {
  const { rfps } = useWorkspace()
  const decided = rfps.filter((item) => item.stage === 'Won' || item.stage === 'Lost')

  return (
    <div>
      <Crumb />
      <h1 className="mt-3 text-[28px] font-bold tracking-tight">Analytics</h1>
      <p className="mt-2 text-[14px] text-fg-muted">
        Win rate, cycle time and pipeline by vertical. The live analytics surface has not been transcribed, so this
        reports only what the tenant&apos;s own RFPs support.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: 'RFPs', value: String(rfps.length) },
          { label: 'Decided', value: String(decided.length) },
          { label: 'Pipeline', value: `$ ${money(rfps.reduce((total, item) => total + item.estimate, 0))}` },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase">{tile.label}</p>
            <p className="mt-3 text-[26px] leading-none font-bold">{tile.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
