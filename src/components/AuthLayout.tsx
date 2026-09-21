'use client'

import type { ReactNode } from 'react'
import { Link } from '../lib/router'
import { Logo } from './ui'
import { CountUp } from './CountUp'

type Stat = { value: string; label: string }

type Props = {
  eyebrow: string
  headline: ReactNode
  blurb: string
  points: string[]
  stats?: Stat[]
  children: ReactNode
}

/** The split marketing/form shell used by both /register and /login. */
export function AuthLayout({ eyebrow, headline, blurb, points, stats, children }: Props) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      <aside className="relative isolate overflow-hidden bg-[#0b1220] px-6 py-12 text-white lg:px-14 lg:py-16">
        <div
          aria-hidden
          className="absolute -top-40 -left-24 -z-10 h-[520px] w-[520px] rounded-full bg-accent/25 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute right-[-120px] bottom-[-160px] -z-10 h-[420px] w-[420px] rounded-full bg-accent/20 blur-3xl"
        />

        <Link to="/" className="inline-flex">
          <Logo tone="light" />
        </Link>

        <div className="mt-14 max-w-lg lg:mt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {eyebrow}
          </span>

          <h1 className="mt-6 text-3xl leading-[1.15] font-bold tracking-tight lg:text-[42px]">{headline}</h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/60">{blurb}</p>

          {stats && (
            <dl className="mt-9 grid max-w-md grid-cols-3 gap-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="text-2xl font-bold brand-gradient-text">
                    <CountUp value={stat.value} />
                  </dd>
                  <p className="mt-0.5 text-[11px] text-white/50">{stat.label}</p>
                </div>
              ))}
            </dl>
          )}

          <ul className="mt-9 space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-white/70">
                <span className="mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-accent/20 text-[10px] text-accent">
                  ✓
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex items-center bg-surface px-6 py-12 lg:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex justify-end lg:mb-10">
            <Link to="/" className="text-[13px] font-medium text-fg-muted transition hover:text-fg">
              ← Back to home
            </Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
