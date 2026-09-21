'use client'

import { Link } from '../../lib/router'
import { useMemo, useState } from 'react'
import { marketApps, mobileApps, webApps } from '../../lib/appData'
import type { MarketApp, SmallApp } from '../../lib/appData'
import { agentGroups, agentsByAppCode, totalEnterpriseAgents } from '../../lib/agentCatalog'
import { useWorkspace } from '../../lib/workspace'
import { Dialog } from './travel/shell'

type TabId = 'enterprise' | 'web' | 'mobile' | 'agents' | 'enterpriseAgents'
type View = 'grid' | 'list'
type Sort = 'Latest' | 'Most installed' | 'A–Z'

const sorts: Sort[] = ['Latest', 'Most installed', 'A–Z']

const kindTone: Record<string, string> = {
  'Data App': 'bg-accent-muted text-accent',
  Hybrid: 'bg-accent-muted text-accent',
  'AI-Native': 'bg-accent-muted text-accent',
}

function AppIcon({ icon, tone, size = 'md' }: { icon: string; tone: string; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-xl text-white ${tone} ${
        size === 'sm' ? 'h-8 w-8 text-[13px]' : 'h-11 w-11 text-lg'
      }`}
    >
      {icon}
    </span>
  )
}

function InstallControls({ app }: { app: { code: string; gated?: boolean } }) {
  const { installed, disabledApps, install, uninstall, toggleAppDisabled } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const isInstalled = installed.includes(app.code)

  if (isInstalled) {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => toggleAppDisabled(app.code)}
          title="Disabling keeps the app installed but stops its agents"
          className={`flex-1 rounded-xl border px-3 py-2 text-[13px] font-medium transition ${
            disabledApps.includes(app.code)
              ? 'border-ok/50 text-ok hover:bg-ok-muted/40'
              : 'border-warn/50 text-warn hover:bg-warn-muted/40'
          }`}
        >
          {disabledApps.includes(app.code) ? '▸ Enable' : '🔒 Disable'}
        </button>
        <button
          onClick={() => uninstall(app.code)}
          className="flex-1 rounded-xl border border-bad/50 px-3 py-2 text-[13px] font-medium text-bad transition hover:bg-bad-muted/40"
        >
          ✕ Uninstall
        </button>
      </div>
    )
  }

  if (app.gated) {
    return (
      <Link
        to="/app/account"
        title="This app is above your current plan"
        className="block w-full rounded-xl border border-line px-3 py-2 text-center text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
      >
        ⚡ Upgrade
      </Link>
    )
  }

  return (
    <button
      onClick={async () => {
        setBusy(true)
        // The live product quotes a 10–20s install; compressed here.
        await new Promise((resolve) => setTimeout(resolve, 800))
        install(app.code)
        setBusy(false)
      }}
      disabled={busy}
      className="w-full rounded-xl bg-accent px-3 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
    >
      {busy ? 'Installing…' : '⚡ Install'}
    </button>
  )
}

function AppCard({ app, view }: { app: MarketApp | SmallApp; view: View }) {
  const featured = 'featured' in app && app.featured
  const [about, setAbout] = useState(false)
  const agents = agentsByAppCode.get(app.code) ?? []

  if (view === 'list') {
    return (
      <li className="relative flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-4">
        <AppIcon icon={app.icon} tone={app.tone} size="sm" />
        <div className="min-w-[14rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold">{app.name}</h3>
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${kindTone[app.kind]}`}>{app.kind}</span>
            <span className="text-[12px] text-fg-muted">{app.category}</span>
            {featured && <span className="rounded-md bg-warn-muted px-1.5 py-0.5 text-[11px] font-medium text-warn">Featured</span>}
          </div>
          <p className="mt-1 line-clamp-1 text-[13px] text-fg-muted">{app.blurb}</p>
        </div>
        <span className="text-[12px] whitespace-nowrap text-fg-muted">⤓ {app.installs} installs</span>
        <div className="w-44">
          <InstallControls app={app} />
        </div>
      </li>
    )
  }

  return (
    <li className="relative flex flex-col rounded-2xl border border-line bg-surface p-5">
      {featured && (
        <span className="absolute -top-2.5 right-4 rounded-md bg-warn-muted px-2 py-0.5 text-[11px] font-medium text-warn">
          ✦ Featured
        </span>
      )}

      <div className="flex items-start gap-3">
        <AppIcon icon={app.icon} tone={app.tone} />
        <div className="min-w-0">
          <h3 className="truncate text-[17px] font-semibold">{app.name}</h3>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${kindTone[app.kind]}`}>{app.kind}</span>
            <span className="text-[12px] text-fg-muted">{app.category}</span>
          </div>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 text-[14px] leading-relaxed text-fg-2">{app.blurb}</p>

      <div className="mt-4 flex items-center justify-between text-[12px] text-fg-muted">
        <span>⤓ {app.installs} installs</span>
        <button
          onClick={() => setAbout(true)}
          aria-label={`About ${app.name}`}
          className="grid h-5 w-5 place-items-center rounded-full border border-line transition hover:border-accent hover:text-accent"
        >
          i
        </button>
      </div>

      {about && (
        <Dialog title={app.name} onClose={() => setAbout(false)}>
          <p className="mt-1 text-[13px] text-fg-muted">
            {app.kind} · {app.category} · {app.installs} installs
          </p>
          <p className="mt-4 text-[14px] leading-relaxed text-fg-2">{app.blurb}</p>
          <p className="mt-5 text-[12px] font-semibold tracking-[0.06em] text-fg-muted uppercase">
            Agents included ({agents.length})
          </p>
          {agents.length ? (
            <ul className="mt-2.5 space-y-2.5">
              {agents.map((agent) => (
                <li key={agent.name} className="text-[13px]">
                  <span className="font-medium">{agent.name}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-fg-muted">{agent.blurb}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-fg-muted">This app ships without agents of its own.</p>
          )}
        </Dialog>
      )}

      <div className="mt-4">
        <InstallControls app={app} />
      </div>
    </li>
  )
}

function EmptyCatalog() {
  return (
    <div className="py-24 text-center">
      <span aria-hidden className="text-4xl">
        📦
      </span>
      <p className="mt-5 text-xl font-semibold">No apps available yet</p>
      <p className="mt-1.5 text-[14px] text-fg-muted">Check back later or contact your administrator</p>
    </div>
  )
}

export default function Marketplace() {
  const [tab, setTab] = useState<TabId>('enterprise')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('Latest')
  const [view, setView] = useState<View>('grid')

  const tabs: { id: TabId; icon: string; label: string; count: number }[] = [
    { id: 'enterprise', icon: '🗂', label: 'Enterprise Apps', count: marketApps.length },
    { id: 'web', icon: '🌐', label: 'Web Apps', count: webApps.length },
    { id: 'mobile', icon: '📱', label: 'Mobile Apps', count: mobileApps.length },
    { id: 'agents', icon: '✦', label: 'Agents', count: 0 },
    { id: 'enterpriseAgents', icon: '🤖', label: 'Enterprise Agents', count: totalEnterpriseAgents },
  ]

  const needle = query.trim().toLowerCase()
  const matches = (text: string) => !needle || text.toLowerCase().includes(needle)

  const listed = useMemo(() => {
    const source: (MarketApp | SmallApp)[] =
      tab === 'enterprise' ? marketApps : tab === 'web' ? webApps : tab === 'mobile' ? mobileApps : []

    const filtered = source.filter((app) => matches(`${app.name} ${app.blurb} ${app.category} ${app.kind}`))

    if (sort === 'Most installed') return [...filtered].sort((a, b) => b.installs - a.installs)
    if (sort === 'A–Z') return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    return filtered
  }, [tab, needle, sort])

  const agentSections = useMemo(
    () =>
      agentGroups
        .map((group) => ({
          ...group,
          agents: group.agents.filter((agent) => matches(`${agent.name} ${agent.blurb} ${group.name}`)),
        }))
        .filter((group) => group.agents.length > 0),
    [needle],
  )

  const appByCode = new Map(marketApps.map((app) => [app.code, app]))

  return (
    <div className="mx-auto max-w-6xl pt-2">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketplace</h1>
          <p className="mt-1.5 text-[15px] text-fg-muted">Discover and install enterprise apps and AI agents</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <span aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted">
              ⌕
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search..."
              aria-label="Search the marketplace"
              className="w-56 rounded-xl border border-line bg-surface py-2.5 pr-3 pl-8 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
          </div>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            aria-label="Sort listings"
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-fg focus:border-accent focus:outline-none"
          >
            {sorts.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>

          <div className="flex overflow-hidden rounded-xl border border-line">
            {(['grid', 'list'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setView(option)}
                aria-pressed={view === option}
                aria-label={`${option} view`}
                className={`px-2.5 py-2 text-[13px] transition ${
                  view === option ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:bg-surface-2'
                }`}
              >
                {option === 'grid' ? '▦' : '☰'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              aria-pressed={tab === item.id}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[14px] font-medium transition ${
                tab === item.id ? 'bg-accent text-white' : 'border border-line text-fg-2 hover:bg-surface-2'
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
              <span className={tab === item.id ? 'text-white/70' : 'text-fg-muted'}>({item.count})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 pb-8">
        {tab === 'agents' && <EmptyCatalog />}

        {tab === 'enterpriseAgents' &&
          (agentSections.length ? (
            <div className="space-y-10">
              {agentSections.map((group) => {
                const app = appByCode.get(group.code)
                return (
                  <section key={group.code}>
                    <div className="mb-4 flex items-center gap-3">
                      <AppIcon icon={app?.icon ?? '🤖'} tone={app?.tone ?? 'bg-accent'} />
                      <div>
                        <h2 className="text-xl font-bold tracking-tight">{group.name}</h2>
                        <p className="text-[13px] text-fg-muted">{group.agents.length} agents bundled</p>
                      </div>
                    </div>

                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {group.agents.map((agent) => (
                        <li key={agent.name} className="rounded-2xl border border-line bg-surface p-4">
                          <div className="flex items-start gap-2.5">
                            <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent-muted text-[12px] text-accent">
                              🤖
                            </span>
                            <h3 className="truncate text-[15px] font-semibold">{agent.name}</h3>
                          </div>
                          <span
                            className={`mt-2.5 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                              agent.custom ? 'bg-accent text-white' : 'bg-accent-muted text-accent'
                            }`}
                          >
                            {agent.custom ? 'Custom · Agent Studio' : 'Enterprise Agent'}
                          </span>
                          <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-fg-muted">{agent.blurb}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          ) : (
            <p className="py-20 text-center text-[14px] text-fg-muted">Nothing matches “{query}”.</p>
          ))}

        {tab !== 'agents' &&
          tab !== 'enterpriseAgents' &&
          (listed.length ? (
            <ul className={view === 'grid' ? 'grid gap-5 sm:grid-cols-2 xl:grid-cols-4' : 'space-y-3'}>
              {listed.map((app) => (
                <AppCard key={app.code} app={app} view={view} />
              ))}
            </ul>
          ) : (
            <p className="py-20 text-center text-[14px] text-fg-muted">Nothing matches “{query}”.</p>
          ))}
      </div>
    </div>
  )
}
