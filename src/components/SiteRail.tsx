'use client'

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from '../lib/router'
import { useTheme, type ThemePreference } from '../lib/theme'
import { Icon } from './Icon'

/** The fixed icon rail apragya.ai pins to the left edge of every marketing page. */

type RailItem = { icon: string; label: string; to: string }

const railItems: RailItem[] = [
  { icon: '✦', label: 'Ask', to: '/#ask' },
  { icon: '▤', label: 'Suites', to: '/#suites' },
  { icon: '⊞', label: 'Apps', to: '/#apps' },
  { icon: '▣', label: 'Market', to: '/#marketplace' },
  { icon: '★', label: 'Why Us', to: '/#why-us' },
  { icon: '◈', label: 'Pricing', to: '/#pricing' },
  { icon: '?', label: 'FAQ', to: '/#faq' },
]

const themeOptions: { id: ThemePreference; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'Auto', icon: 'monitor' },
]

export const moreLinks = [
  { to: '/about', label: 'About', blurb: 'Our mission, team, and story' },
  { to: '/partners', label: 'Partners', blurb: 'Build with us, sell with us' },
  { to: '/docs', label: 'Docs', blurb: 'Setup, guides, how-tos' },
  { to: '/blog', label: 'Blog', blurb: 'Engineering and product notes' },
  { to: '/help-center', label: 'Help Center', blurb: 'How-to articles + answers' },
  { to: '/contact-sales', label: 'Contact Sales', blurb: 'Talk to a person' },
  { to: '/contact-support', label: 'Support', blurb: 'Open a ticket — SLA-tracked' },
]

export function SiteRail() {
  const { preference, setPreference } = useTheme()
  const [moreOpen, setMoreOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Close the flyout on outside click, Escape, or navigation.
  useEffect(() => setMoreOpen(false), [location.pathname])

  useEffect(() => {
    if (!moreOpen) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setMoreOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [moreOpen])

  return (
    <div
      ref={containerRef}
      className="fixed inset-y-0 left-0 z-40 hidden w-14 flex-col items-center border-r border-line bg-surface py-3 lg:flex"
    >
      <Link to="/" aria-label="Apragya AI home" className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-emerald-400 text-[13px] font-bold text-white">
        A
      </Link>

      <nav aria-label="Sections" className="flex flex-1 flex-col items-center gap-0.5">
        {railItems.map((item) => (
          <a
            key={item.label}
            href={item.to}
            aria-label={item.label}
            className="grid w-12 place-items-center rounded-xl py-2 text-[9px] text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <span aria-hidden className="text-base leading-none">
              {item.icon}
            </span>
            <span className="mt-1">{item.label}</span>
          </a>
        ))}

        <button
          onClick={() => setMoreOpen((prev) => !prev)}
          aria-label="More pages"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          className="grid w-12 place-items-center rounded-xl py-2 text-[9px] text-fg-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <span aria-hidden className="text-base leading-none">
            ⋮
          </span>
          <span className="mt-1">More</span>
        </button>
      </nav>

      {/* Three explicit choices, stacked to fit the rail's 48px column. */}
      <div role="radiogroup" aria-label="Appearance" className="w-12 rounded-xl bg-surface-2/60 p-1">
        {themeOptions.map((option) => (
          <button
            key={option.id}
            role="radio"
            aria-checked={preference === option.id}
            onClick={() => setPreference(option.id)}
            title={`${option.label} theme`}
            className={`grid w-full place-items-center rounded-lg py-1.5 text-[9px] transition ${
              preference === option.id ? 'bg-surface text-accent shadow-sm' : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Icon name={option.icon} size={14} />
            <span className="mt-0.5">{option.label}</span>
          </button>
        ))}
      </div>

      {moreOpen && (
        <div
          role="menu"
          className="absolute bottom-16 left-16 w-64 rounded-2xl border border-line bg-surface p-2 shadow-xl"
        >
          {moreLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              role="menuitem"
              className="block rounded-xl px-3 py-2 transition hover:bg-surface-2"
            >
              <p className="text-[13px] font-medium text-fg">{link.label}</p>
              <p className="text-[11px] text-fg-muted">{link.blurb}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
