'use client'

import { useState } from 'react'
import { Navigate, useParams } from '../../../lib/router'
import { Button } from '../../../components/ui'
import { toolBySlug } from '../../../lib/businessData'
import { NoModelConnected } from '../../../components/NotBuilt'
import { BackLink, CreditChip } from './shared'

/**
 * `/app/business/tool/:slug`.
 *
 * Every tool shares one prompt-and-run shell. The Run button used to spend the
 * tool's credits, wait 700ms, and emit the same sentence for all of them —
 * "<tool> produced a result for …, and is tagged to your active company" —
 * under a caption asserting the output was tagged to the active company.
 * Nothing was produced and nothing was tagged, and the credits were gone.
 *
 * The editor stays, because writing the brief is a real thing to do. Running
 * it is what needs a provider (D3).
 */
export default function BusinessTool() {
  const { slug = '' } = useParams()
  const tool = toolBySlug[slug]
  const [input, setInput] = useState('')

  if (!tool) return <Navigate to="/app/business" replace />

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
          <Button variant="accent" disabled title="No model is connected on this deployment">
            Run · {tool.cost} credits
          </Button>
        </div>

        <div className="mt-5">
          <NoModelConnected what={tool.name} />
        </div>
      </section>
    </div>
  )
}
