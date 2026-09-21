'use client'

import { useMemo, useState } from 'react'
import { Link } from '../lib/router'
import { SiteLayout } from '../components/SiteLayout'
import { Button, Eyebrow, Pill } from '../components/ui'
import { marketApps } from '../lib/appData'
import { marketplacePicks } from '../lib/landingData'

const filters = ['All', 'Agents', 'Apps'] as const

export default function PublicMarketplace() {
  const [filter, setFilter] = useState<(typeof filters)[number]>('All')
  const [query, setQuery] = useState('')

  const agents = useMemo(
    () =>
      marketApps.flatMap((app) =>
        app.agents.map((agent) => ({ kind: 'Agents' as const, name: agent, meta: app.name, icon: app.icon, blurb: `Bound to ${app.name} — fires on records as they arrive.` })),
      ),
    [],
  )

  const apps = useMemo(
    () => marketApps.map((app) => ({ kind: 'Apps' as const, name: app.name, meta: `${app.agents.length} bound agents`, icon: app.icon, blurb: app.blurb })),
    [],
  )

  const results = useMemo(() => {
    const all = [...apps, ...agents]
    const scoped = filter === 'All' ? all : all.filter((item) => item.kind === filter)
    const needle = query.trim().toLowerCase()
    return needle ? scoped.filter((item) => `${item.name} ${item.meta} ${item.blurb}`.toLowerCase().includes(needle)) : scoped
  }, [apps, agents, filter, query])

  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-5">
        <header className="relative isolate py-16">
          <div
            aria-hidden
            className="absolute inset-x-0 -top-14 -z-10 h-72 bg-[radial-gradient(55%_100%_at_25%_0%,rgb(var(--accent)/0.14),transparent)]"
          />
          <Eyebrow>Marketplace</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-3xl leading-[1.12] font-extrabold tracking-tight sm:text-5xl">
            50+ agents and apps. Plug and play.
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
            Curated agents and apps built by Apragya, partners, and certified developers. Install in one click,
            customize for your tenant.
          </p>
          <div className="mt-8">
            <Link to="/register">
              <Button variant="accent">Start Free</Button>
            </Link>
          </div>
        </header>

        <section className="pb-6">
          <Eyebrow>Staff picks</Eyebrow>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {marketplacePicks.map((pick) => (
              <li key={pick.name} className="card p-6">
                <span aria-hidden className="text-xl">
                  {pick.icon}
                </span>
                <h2 className="mt-3 text-sm font-semibold">{pick.name}</h2>
                <p className="text-[11px] text-fg-muted">{pick.meta}</p>
                <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">{pick.blurb}</p>
                <p className="mt-4 text-[12px] text-fg-muted">
                  <span className="text-warn">★ {pick.rating}</span> · {pick.installs} installs
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="pb-20">
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-8">
            <div className="inline-flex rounded-xl border border-line bg-surface p-1">
              {filters.map((item) => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  aria-pressed={filter === item}
                  className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition ${
                    filter === item ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the catalog…"
              aria-label="Search the marketplace"
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
            <span className="text-[13px] text-fg-muted">{results.length} listings</span>
          </div>

          {results.length ? (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((item) => (
                <li key={`${item.kind}-${item.name}`} className="card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span aria-hidden className="text-lg">
                      {item.icon}
                    </span>
                    <Pill>{item.kind === 'Apps' ? 'App' : 'Agent'}</Pill>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold">{item.name}</h3>
                  <p className="text-[11px] text-fg-muted">{item.meta}</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{item.blurb}</p>
                  <Link to="/register" className="mt-4 inline-block">
                    <Button variant="secondary" className="!py-2 !text-[13px]">
                      Install
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center text-sm text-fg-muted">
              Nothing matches “{query}”. Try a different search.
            </p>
          )}
        </section>
      </div>
    </SiteLayout>
  )
}
