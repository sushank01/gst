'use client'

import { useState } from 'react'
import { Navigate, useParams } from '../../../lib/router'
import { Button } from '../../../components/ui'
import { toolBySlug } from '../../../lib/businessData'
import { useWorkspace } from '../../../lib/workspace'
import { BackLink, CreditChip } from './shared'

/**
 * `/app/business/tool/:slug`. The live product opens each tool into its own form;
 * this rebuild gives every tool the same prompt-and-run shell, since the per-tool
 * forms have not been transcribed.
 */
export default function BusinessTool() {
  const { slug = '' } = useParams()
  const tool = toolBySlug[slug]
  const { spend } = useWorkspace()
  const [input, setInput] = useState('')
  const [output, setOutput] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  if (!tool) return <Navigate to="/app/business" replace />

  async function run() {
    if (!tool || !input.trim()) return
    setRunning(true)
    setOutput(null)

    const funded = spend(tool.cost)
    await new Promise((resolve) => setTimeout(resolve, 700))

    setOutput(
      funded
        ? `${tool.name} produced a result for “${input.trim()}”. It cost ${tool.cost} AI Credits from the tenant pool and is tagged to your active company.`
        : 'Not enough AI Credits left in this cycle. An admin can top up the pool or raise your per-user allocation.',
    )
    setRunning(false)
  }

  return (
    <div className="mx-auto max-w-3xl pt-2">
      <BackLink to={`/app/business?category=${tool.category.id}`} label={`Back to ${tool.category.name}`} />

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold tracking-[0.08em] text-fg-muted uppercase">{tool.category.name}</p>
          <h1 className="mt-1.5 text-[26px] font-bold tracking-tight">{tool.name}</h1>
          <p className="mt-2 text-[15px] text-fg-muted">{tool.blurb}</p>
        </div>
        <CreditChip cost={tool.cost} />
      </header>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <label htmlFor="tool-input" className="text-[13px] font-medium">
          What do you need?
        </label>
        <textarea
          id="tool-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={5}
          placeholder={`Describe what ${tool.name} should produce.`}
          className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] focus:border-accent focus:outline-none"
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="accent" onClick={run} loading={running} disabled={!input.trim()}>
            Run · {tool.cost} credits
          </Button>
          <span className="text-[12px] text-fg-muted">Output is soft-tagged to your active company.</span>
        </div>

        {output && (
          <p className="mt-5 rounded-xl bg-bg px-4 py-3.5 text-[13px] leading-relaxed text-fg-2">{output}</p>
        )}
      </section>
    </div>
  )
}
