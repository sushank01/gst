'use client'

import type { ReactNode } from 'react'
import { Link } from '../lib/router'
import { Logo } from './ui'
import { SiteRail, moreLinks } from './SiteRail'
import { VippyWidget } from './VippyWidget'
import { Pointer } from './Pointer'
import { ScrollProgress } from './ScrollProgress'
import { useAuth } from '../lib/auth'
import { vibeSkillIndex } from '../lib/pages/vibeSkills'

const platformLinks = [
  { to: '/vibe-studio', label: 'Vibe Studio' },
  { to: '/agent-studio', label: 'Agent Studio' },
  { to: '/business-suite', label: 'Business Suite' },
  { to: '/enterprise-apps', label: 'Enterprise Apps' },
  { to: '/prompt-lab', label: 'Prompt Lab' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/integrations', label: 'Integrations' },
  { to: '/trust', label: 'Trust & Governance' },
]

function SiteHeader() {
  const { session } = useAuth()
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="lg:hidden" aria-label="Apragya AI home">
          <Logo />
        </Link>
        <div className="hidden lg:block" />

        <nav className="hidden items-center gap-1 md:flex">
          {platformLinks.slice(0, 4).map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="underline-grow rounded-lg px-3 py-1.5 text-[13px] font-medium text-fg-muted transition hover:text-fg"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {session ? (
            <Link to="/app" className="rounded-xl bg-fg px-4 py-2 text-[13px] font-semibold text-bg transition hover:opacity-90">
              Open workspace
            </Link>
          ) : (
            <>
              <Link to="/login" className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-fg-2 transition hover:bg-surface-2">
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-xl bg-gradient-to-r from-accent to-emerald-500 px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-95"
              >
                Register →
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-fg-muted">
            The AI operating system for businesses. A product of Fronseye Tech Private Limited.
          </p>
        </div>

        <nav aria-label="Platform">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-fg-muted uppercase">Platform</h2>
          <ul className="mt-3 space-y-1.5">
            {platformLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-[13px] text-fg-2 transition hover:text-accent">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Vibe Studio skills">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-fg-muted uppercase">Vibe Studio skills</h2>
          <ul className="mt-3 space-y-1.5">
            {vibeSkillIndex.map((skill) => (
              <li key={skill.to}>
                <Link to={skill.to} className="text-[13px] text-fg-2 transition hover:text-accent">
                  {skill.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Company">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-fg-muted uppercase">Company</h2>
          <ul className="mt-3 space-y-1.5">
            {moreLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-[13px] text-fg-2 transition hover:text-accent">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-5 text-xs text-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Apragya AI — rebuild for demonstration.</p>
          <div className="flex gap-4">
            <Link to="/legal/privacy" className="transition hover:text-accent">
              Privacy
            </Link>
            <Link to="/legal/terms" className="transition hover:text-accent">
              Terms
            </Link>
            <Link to="/legal/cookies" className="transition hover:text-accent">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

/** Marketing chrome: the fixed rail, header, footer, and Vippy on every public page. */
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lg:pl-14">
      <ScrollProgress />
      <Pointer />
      <SiteRail />
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
      <VippyWidget />
    </div>
  )
}
