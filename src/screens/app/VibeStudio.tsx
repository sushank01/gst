'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from '../../lib/router'
import { Button } from '../../components/ui'
import {
  capabilities,
  vibeControls,
  vibeModel,
  vibeModels,
  vibePromptPlaceholder,
  vibeTopNav,
} from '../../lib/vibeData'
import type { Capability } from '../../lib/vibeData'
import { useWorkspace } from '../../lib/workspace'

const buildSteps = ['Reading the prompt', 'Proposing the shape', 'Wiring tools + guardrails', 'Snapshotting version 1']

/** Artifact names come from free text, so trim on a word boundary rather than mid-word. */
function toArtifactName(prompt: string, max = 48) {
  const clean = prompt.trim().replace(/\s+/g, ' ')
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:]$/, '')}…`
}

function TopBar() {
  const [active, setActive] = useState(vibeTopNav[0].id)
  const [model, setModel] = useState(vibeModel)
  const { creditsUsed } = useWorkspace()

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <nav aria-label="Vibe Studio" className="flex flex-wrap gap-1">
        {vibeTopNav.map((item) => (
          <button
            key={item.id}
            onClick={() => setActive(item.id)}
            aria-current={active === item.id ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-medium transition ${
              active === item.id ? 'bg-accent/10 text-accent' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            <span aria-hidden className="text-[13px]">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        {/* Readouts, not actions: the spend and the key in force for this studio. */}
        {vibeControls.map((control) => (
          <span
            key={control.id}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-[13px] text-fg-2"
          >
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${control.tone}`} />
            {control.id === 'aiu' ? `${creditsUsed} AIU` : control.label}
          </span>
        ))}
        <select
          aria-label="Model"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          className="rounded-xl border border-line bg-surface py-1.5 pr-8 pl-3 text-[13px] text-fg-2 transition hover:bg-surface-2 focus:border-accent focus:outline-none"
        >
          {vibeModels.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function CapabilityCard({ capability, onPick }: { capability: Capability; onPick: () => void }) {
  return (
    <li>
      <button
        onClick={onPick}
        className="flex h-full w-full flex-col rounded-2xl border border-line bg-surface p-5 text-left transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg"
      >
        <span
          aria-hidden
          className="grid h-10 w-10 place-items-center rounded-xl bg-accent-muted text-[15px] text-accent"
        >
          {capability.icon}
        </span>
        <p className="mt-4 text-[15px] font-semibold">{capability.name}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{capability.blurb}</p>
      </button>
    </li>
  )
}

export default function VibeStudio() {
  const [params, setParams] = useSearchParams()
  const { addArtifact, publishArtifact, artifacts, spend } = useWorkspace()

  const [prompt, setPrompt] = useState(params.get('prompt') ?? '')
  const [capability, setCapability] = useState<Capability>(capabilities[0])
  const [phase, setPhase] = useState<'idle' | 'building' | 'done'>('idle')
  const [step, setStep] = useState(0)
  const [builtId, setBuiltId] = useState<string | null>(null)

  // The prompt arrives from Home or the landing hero; consume it once.
  useEffect(() => {
    if (params.get('prompt')) setParams({}, { replace: true })
  }, [params, setParams])

  async function build(from: Capability = capability) {
    if (!prompt.trim()) return
    setCapability(from)
    setPhase('building')

    for (let index = 0; index < buildSteps.length; index += 1) {
      setStep(index)
      await new Promise((resolve) => setTimeout(resolve, 450))
    }

    spend(15)
    const artifact = addArtifact({ name: toArtifactName(prompt), skill: from.name, kind: from.name })
    setBuiltId(artifact.id)
    setPhase('done')
  }

  const built = artifacts.find((artifact) => artifact.id === builtId)

  return (
    <div className="-mx-6 -mt-2 min-h-full bg-[color-mix(in_oklab,var(--color-accent)_4%,var(--color-bg))] px-6 pt-2 pb-10">
      <TopBar />

      <section className="mx-auto max-w-3xl pt-14 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Describe it. <span className="brand-gradient-text">Vibe Studio builds it.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-2">
          One builder for apps, sites, mobile, decks, sheets, reports, RPA bots and agents - each with its own
          purpose-built workspace, using your tools, on your LLM.
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-[14px] leading-relaxed text-accent italic">
          Not sure where to start? Tell me your problem - I'll ask a few quick questions and guide you to build it.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            build()
          }}
          className="mt-8 rounded-2xl border border-line bg-surface p-5 text-left shadow-sm focus-within:border-accent"
        >
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={2}
            aria-label="Describe what to build"
            placeholder={vibePromptPlaceholder}
            className="w-full resize-none bg-transparent text-[15px] text-fg placeholder:text-fg-muted focus:outline-none"
          />
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[13px] text-fg-2">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              Claude
            </span>
            <Button
              type="submit"
              variant="accent"
              disabled={!prompt.trim()}
              aria-label="Build it"
              className="!rounded-xl !px-4"
            >
              →
            </Button>
          </div>
        </form>
      </section>

      {phase === 'building' && (
        <ol className="mx-auto mt-6 max-w-xl space-y-2 rounded-2xl border border-line bg-surface p-5">
          {buildSteps.map((label, index) => (
            <li
              key={label}
              className={`flex items-center gap-2.5 text-[13px] ${index <= step ? 'text-fg' : 'text-fg-muted'}`}
            >
              <span className={index < step ? 'text-ok' : ''}>{index < step ? '✓' : index === step ? '◐' : '○'}</span>
              {label}
            </li>
          ))}
        </ol>
      )}

      {phase === 'done' && built && (
        <section className="mx-auto mt-6 max-w-xl rounded-2xl border border-ok/40 bg-ok-muted/40 p-5">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-ok uppercase">Build complete</p>
          <h2 className="mt-2 text-lg font-semibold">{built.name}</h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            {built.kind} · v{built.version} · {built.status}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-fg-2">
            Versioned inside your tenant. Refine it in conversation, edit the graph by hand, or publish — publishing
            needs the app-publish permission and creates an immutable snapshot.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => publishArtifact(built.id)} disabled={built.status === 'published'}>
              {built.status === 'published' ? `Published · v${built.version}` : 'Publish to tenant'}
            </Button>
            <Button variant="secondary" onClick={() => setPhase('idle')}>
              Build another
            </Button>
          </div>
        </section>
      )}

      <section className="mx-auto mt-16 max-w-5xl">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-fg-muted uppercase">
            Start from a capability
          </h2>
          <span className="text-[12px] text-fg-muted">each opens its own workspace</span>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {capabilities.map((item) => (
            <CapabilityCard key={item.id} capability={item} onPick={() => build(item)} />
          ))}
        </ul>
      </section>

      {artifacts.length > 0 && (
        <section className="mx-auto mt-12 max-w-5xl">
          <h2 className="mb-3 text-sm font-semibold">Your artifacts</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {artifacts.map((artifact) => (
              <li key={artifact.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{artifact.name}</p>
                  <p className="text-xs text-fg-muted">
                    {artifact.skill} · v{artifact.version}
                  </p>
                </div>
                <span
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                    artifact.status === 'published' ? 'bg-ok-muted text-ok' : 'bg-surface-2 text-fg-muted'
                  }`}
                >
                  {artifact.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
