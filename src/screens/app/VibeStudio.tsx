'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from '../../lib/router'
import { Button } from '../../components/ui'
import {
  capabilities,
  vibeModel,
  vibeModels,
  vibePromptPlaceholder,
  vibeTopNav,
} from '../../lib/vibeData'
import type { Capability } from '../../lib/vibeData'
import { NoModelConnected } from '../../components/NotBuilt'



function TopBar() {
  const [active, setActive] = useState(vibeTopNav[0].id)
  const [model, setModel] = useState(vibeModel)

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
        {/*
          * The chips that sat here read "Claude · SaaS Key" and an AIU spend
          * figure — both asserting a provider key in force for this studio.
          * There is no key. The model picker stays: choosing one in advance is
          * a real preference, and it is labelled as such.
          */}
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

  const [prompt, setPrompt] = useState(params.get('prompt') ?? '')
  const [capability, setCapability] = useState<Capability>(capabilities[0])
  const [phase, setPhase] = useState<'idle' | 'kept'>('idle')

  // The prompt arrives from Home or the landing hero; consume it once.
  useEffect(() => {
    if (params.get('prompt')) setParams({}, { replace: true })
  }, [params, setParams])

  /**
   * There is no build.
   *
   * This used to walk four labels — "Reading the prompt", "Proposing the
   * shape", "Wiring tools + guardrails", "Snapshotting version 1" — on a 450ms
   * timer, spend fifteen credits, and add an artifact row. No prompt was read,
   * nothing was wired, and the "snapshot" was an object in one browser's
   * localStorage that the next panel described as "versioned inside your
   * tenant" and "an immutable snapshot".
   *
   * Generating an application needs a model (D3) and somewhere to run what it
   * generates (D1). Until both exist, the prompt is kept and nothing is
   * claimed.
   */
  function keep(from: Capability = capability) {
    if (!prompt.trim()) return
    setCapability(from)
    setPhase('kept')
  }


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
            // Fire-and-forget by design; `build` reports its own failures in state.
            keep()
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

      {phase === 'kept' && (
        <div className="mx-auto mt-6 max-w-xl">
          <NoModelConnected what="Generating an application" />
        </div>
      )}

      {/* The "Build complete" panel is gone with the build that never happened. */}

      <section className="mx-auto mt-16 max-w-5xl">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-fg-muted uppercase">
            Start from a capability
          </h2>
          <span className="text-[12px] text-fg-muted">each opens its own workspace</span>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {capabilities.map((item) => (
            <CapabilityCard key={item.id} capability={item} onPick={() => keep(item)} />
          ))}
        </ul>
      </section>

      {/* The artifact list is gone with the builds that produced it: every entry
          was an object in this browser's localStorage, described on screen as
          "versioned inside your tenant". */}
    </div>
  )
}
