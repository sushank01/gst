'use client'

import { Link } from '../../../lib/router'
import { Icon } from '../../../components/Icon'

/** `/app/setup` — the platform-level configuration index. */
const cards = [
  {
    icon: 'building',
    name: 'Companies',
    to: '/app/setup/companies',
    blurb:
      "Legal entities under this tenant. Define companies, mark intercompany pairs, and run a consolidated trial balance rolled up to the parent's currency.",
  },
]

export default function Setup() {
  return (
    <div className="pt-2">
      <header className="border-b border-line pb-5">
        <h1 className="text-[28px] font-bold tracking-tight">Setup</h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          Platform-level configuration that scopes every module. Set up your legal entities, defaults, and reference
          data here once - every app uses them.
        </p>
      </header>

      <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <li key={card.name}>
            <Link
              to={card.to}
              className="flex h-full gap-4 rounded-2xl border border-line bg-surface p-5 transition hover:border-accent hover:bg-surface-2"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-muted text-accent">
                <Icon name={card.icon} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[16px] font-semibold">{card.name}</span>
                  <span aria-hidden className="text-fg-muted">
                    ›
                  </span>
                </span>
                <span className="mt-1.5 block text-[13px] leading-relaxed text-fg-muted">{card.blurb}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
