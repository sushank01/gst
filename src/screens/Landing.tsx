'use client'

import { useState } from 'react'
import { Link, useNavigate } from '../lib/router'
import { SiteLayout } from '../components/SiteLayout'
import { Button, Eyebrow, Pill } from '../components/ui'
import { CountUp } from '../components/CountUp'
import { WordReveal } from '../components/WordReveal'
import { Reveal } from '../components/Reveal'
import { ProductPreview } from '../components/ProductPreview'
import { marketApps, vibeSkills } from '../lib/appData'
import {
  agentStudioCapabilities,
  faqs,
  industries,
  integrationLogos,
  marketplacePicks,
  pipelines,
  plans,
  suggestionChips,
  suites,
  trustPillars,
  whyUs,
} from '../lib/landingData'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function Section({
  id,
  eyebrow,
  title,
  blurb,
  children,
  tinted,
}: {
  id?: string
  eyebrow: string
  title: React.ReactNode
  blurb?: string
  children: React.ReactNode
  tinted?: boolean
}) {
  return (
    <section id={id} className={`scroll-mt-16 py-20 ${tinted ? 'border-y border-line bg-surface' : ''}`}>
      <div className="mx-auto max-w-6xl px-5">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        {blurb && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{blurb}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  )
}

function Hero() {
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState('')

  /** The prompt is the top of the funnel: it is carried into signup. */
  const start = (value: string) => {
    const intent = value.trim()
    navigate(intent ? `/register?intent=${encodeURIComponent(intent)}` : '/register')
  }

  return (
    <section id="ask" className="relative isolate scroll-mt-16 overflow-hidden px-5 pt-14 pb-20">
      <div aria-hidden className="absolute inset-x-0 -top-40 -z-10 h-[46rem]">
        <div className="mesh absolute inset-0" />
        {/* Three slow blooms so the ground behind the headline is never static. */}
        <div className="aurora opacity-70">
          <i />
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3.5 py-1.5 text-[12px] font-medium text-accent">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent animate-ring" />
              {greeting()} — start free, no credit card
            </span>
          </Reveal>

          <Reveal delay={60}>
            <h1 className="mt-6 text-[2.6rem] leading-[1.05] font-extrabold tracking-tight sm:text-[3.4rem]">
              <WordReveal text="The AI operating system your business actually runs on" delay={120} accentFrom={5} />
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-fg-muted">
              Replace a dozen siloed tools with one platform: 100+ productivity tools, a no-code agent builder, and
              15+ ready-to-deploy apps across CRM, HR, Finance and Contracts — on one credit pool, one audit trail.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                start(prompt)
              }}
              className="mt-8 flex max-w-xl items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm focus-within:border-accent focus-within:glow"
            >
              <span aria-hidden className="pl-2 text-accent">
                ✦
              </span>
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                aria-label="Ask Apragya anything"
                placeholder="Ask Apragya anything — build an agent, automate a workflow…"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none"
              />
              <Button type="submit" variant="accent" className="!rounded-xl !px-4">
                Start free
              </Button>
            </form>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-4 flex max-w-xl flex-wrap gap-2">
              {suggestionChips.slice(0, 4).map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => start(chip.label)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-fg-2 transition hover:border-accent hover:text-fg"
                >
                  <span aria-hidden className="mr-1.5">
                    {chip.icon}
                  </span>
                  {chip.label}
                </button>
              ))}
            </div>
          </Reveal>

          <Reveal delay={300}>
            <dl className="mt-9 flex flex-wrap gap-x-9 gap-y-4 border-t border-line pt-6">
              {[
                { value: '15+', label: 'enterprise apps' },
                { value: '50+', label: 'pre-built agents' },
                { value: '60s', label: 'to a live workspace' },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="text-2xl font-bold brand-gradient-text">
                    <CountUp value={stat.value} />
                  </dd>
                  <p className="mt-0.5 text-[12px] text-fg-muted">{stat.label}</p>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal delay={160} className="animate-float">
          <ProductPreview />
        </Reveal>
      </div>
    </section>
  )
}

function SocialProof() {
  return (
    <section className="border-y border-line bg-surface py-7">
      <div className="mx-auto max-w-6xl px-5">
        <p className="text-center text-[12px] text-fg-muted">
          Trusted by teams in real estate, BFSI, healthcare and manufacturing
        </p>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
          {integrationLogos.slice(0, 7).map((logo) => (
            <li key={logo} className="text-[15px] font-semibold tracking-tight text-fg-2">
              {logo}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Outcomes() {
  const outcomes = [
    {
      stat: '12 hrs',
      label: 'saved per person each week',
      body: 'Agents handle the reading, scoring and drafting that used to sit around every form.',
    },
    {
      stat: '~40 sec',
      label: 'invoice capture to GL posting',
      body: 'Three-way matched, exceptions routed for review, every decision written to the audit trail.',
    },
    {
      stat: '1 bill',
      label: 'instead of a dozen subscriptions',
      body: 'Productivity, builders and enterprise apps draw from a single AI Credits pool.',
    },
  ]

  return (
    <Section
      eyebrow="Why teams switch"
      title="Outcomes, not another dashboard."
      blurb="The point is not that there is AI in the product. It is what stops landing on your team's desk."
    >
      <ul className="grid gap-5 md:grid-cols-3">
        {outcomes.map((item, index) => (
          <li key={item.stat}>
            <Reveal delay={index * 80}>
              <div className="edge lift spotlight h-full rounded-2xl p-6">
                <p className="text-3xl font-bold brand-gradient-text">
                  <CountUp value={item.stat} />
                </p>
                <p className="mt-1 text-[13px] font-medium text-fg-2">{item.label}</p>
                <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">{item.body}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>

      <figure className="edge mt-6 rounded-2xl p-7">
        <blockquote className="text-[17px] leading-relaxed text-fg-2">
          “We replaced four tools in the first month. The part that sold our compliance lead was that every agent
          action is logged with who, what and before-and-after — nothing runs silently.”
        </blockquote>
        <figcaption className="mt-5 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/15 text-[12px] font-semibold text-accent">
            RM
          </span>
          <span className="text-[13px]">
            <span className="block font-semibold">Operations lead</span>
            <span className="block text-fg-muted">BFSI · 180 employees</span>
          </span>
        </figcaption>
      </figure>
    </Section>
  )
}

function IndustryMarquee() {
  const track = [...industries, ...industries]
  return (
    <section className="border-y border-line bg-surface py-6">
      <p className="mb-4 text-center text-[11px] font-semibold tracking-[0.18em] text-fg-muted uppercase">
        Automate workflows for any industry
      </p>
      <div className="overflow-hidden" aria-hidden>
        <div className="flex w-max animate-marquee gap-3">
          {track.map((industry, index) => (
            <span
              key={`${industry}-${index}`}
              className="rounded-full border border-line px-4 py-1.5 text-[13px] whitespace-nowrap text-fg-2"
            >
              {industry}
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">{industries.join(', ')}</p>
    </section>
  )
}

function Suites() {
  return (
    <Section
      id="suites"
      eyebrow="The Apragya platform"
      title="Three suites. One operating system."
      blurb="Productivity for everyone. A builder for your teams. Real apps for your operations. All on one platform, one credit pool, one source of truth."
    >
      <div className="grid gap-5 md:grid-cols-3">
        {suites.map((suite) => (
          <Link
            key={suite.name}
            to={suite.to}
            className="card lift spotlight block p-6 hover:border-accent/50"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-fg text-bg">{suite.icon}</span>
            <h3 className="mt-5 text-lg font-semibold">{suite.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{suite.blurb}</p>
            <ul className="mt-5 flex flex-wrap gap-1.5">
              {suite.tags.map((tag) => (
                <li key={tag}>
                  <Pill>{tag}</Pill>
                </li>
              ))}
            </ul>
          </Link>
        ))}
      </div>
    </Section>
  )
}

function VibeSection() {
  return (
    <Section
      tinted
      eyebrow="Vibe Studio"
      title="Things you can build. All from a prompt."
      blurb="Describe what you want in plain English. Vibe Studio scaffolds the shape, wires the tools, and ships it inside your tenant — agents, apps, bots, documents, decks, and more."
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {vibeSkills.map((skill) => (
          <li key={skill.name} className="card spotlight lift p-5">
            <span aria-hidden className="text-xl">
              {skill.icon}
            </span>
            <h3 className="mt-3 text-sm font-semibold">{skill.name}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{skill.blurb}</p>
          </li>
        ))}
      </ul>
      <p className="mt-8 max-w-3xl text-[13px] leading-relaxed text-fg-muted">
        Every build is versioned, every run is audited, and everything you ship inherits your tenant's identity,
        permissions, and AI Credits pool.{' '}
        <Link to="/vibe-studio" className="font-semibold text-accent hover:underline">
          Explore Vibe Studio →
        </Link>
      </p>
    </Section>
  )
}

function AgentSection() {
  const [active, setActive] = useState(0)
  const capability = agentStudioCapabilities[active]

  return (
    <Section
      eyebrow="Agent Studio"
      title="Hand-tune every step. See it run."
      blurb="Agent Studio is the visual canvas for authoring, testing, and shipping AI agents. Every node, tool call, and guardrail is inspectable."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agentStudioCapabilities.map((item, index) => (
          <button
            key={item.n}
            onClick={() => setActive(index)}
            aria-pressed={active === index}
            className={`card spotlight lift p-5 text-left transition ${
              active === index ? 'border-accent ring-2 ring-accent/20' : 'hover:border-fg-muted'
            }`}
          >
            <span className="text-[11px] font-bold text-accent">{item.n}</span>
            <h3 className="mt-2 text-sm font-semibold">{item.name}</h3>
            <p className="mt-1 text-xs text-fg-muted">{item.line}</p>
          </button>
        ))}
      </div>

      <div className="card mt-5 p-6">
        <span className="text-[11px] font-bold text-accent">{capability.n}</span>
        <h3 className="mt-2 text-lg font-semibold">{capability.name}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">{capability.detail}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {['LLM', 'Tool', 'Agent', 'Output'].map((node) => (
            <span key={node} className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-fg-2">
              {node}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-6 text-[13px] text-fg-muted">
        120+ AI agent opportunities across 15 enterprise apps ·{' '}
        <Link to="/agent-studio" className="font-semibold text-accent hover:underline">
          Explore Agent Studio →
        </Link>
      </p>
    </Section>
  )
}

function AppsSection() {
  return (
    <Section
      id="apps"
      tinted
      eyebrow="Enterprise apps"
      title="15+ apps. All AI-native."
      blurb="Every app comes with pre-built agents, audit trails, role-based access, and tenant-level configuration. Replace siloed SaaS with one platform."
    >
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {marketApps.map((app) => (
          <li key={app.code} className="card lift spotlight p-4 hover:border-accent/50">
            <span className="text-[11px] font-bold tracking-wide text-accent">{app.code}</span>
            <p className="mt-2 text-sm font-semibold">{app.name}</p>
            <p className="mt-0.5 text-xs text-fg-muted">{app.blurb}</p>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-[13px]">
        <Link to="/enterprise-apps" className="font-semibold text-accent hover:underline">
          See the full catalog →
        </Link>
      </p>
    </Section>
  )
}

function PipelineSection() {
  const [active, setActive] = useState(0)
  const pipeline = pipelines[active]

  return (
    <Section
      eyebrow="AI pipeline builder"
      title="Visualize the workflow your industry runs on."
      blurb="Each industry comes with a pre-built pipeline of AI agents — triggers, decisions, integrations, and outputs. Tap a tab to see the layout that powers it."
    >
      <div className="flex flex-wrap gap-2">
        {pipelines.map((item, index) => (
          <button
            key={item.name}
            onClick={() => setActive(index)}
            aria-pressed={active === index}
            className={`rounded-xl border px-3.5 py-2 text-[13px] transition ${
              active === index
                ? 'border-accent bg-accent/10 font-semibold text-fg'
                : 'border-line text-fg-2 hover:border-fg-muted'
            }`}
          >
            {item.name}
          </button>
        ))}
      </div>

      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pipeline.nodes.map((node, index) => (
          <li key={`${pipeline.name}-${node.name}`} className="card spotlight lift p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.12em] text-fg-muted uppercase">{node.stage}</span>
              <span className="text-[10px] text-fg-muted">{String(index + 1).padStart(2, '0')}</span>
            </div>
            <p className="mt-2.5 flex items-center gap-2 text-sm font-semibold">
              <span aria-hidden>{node.icon}</span>
              {node.name}
            </p>
            {node.branch && <p className="mt-1 text-[11px] text-accent">{node.branch}</p>}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {pipeline.stats.map((stat) => (
          <div key={stat.label} className="card spotlight lift p-5">
            <span aria-hidden className="text-base">
              {stat.icon}
            </span>
            <p className="mt-2 text-xl font-bold">
              <CountUp value={stat.value} />
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">{stat.label}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

function IntegrationsSection() {
  return (
    <Section
      tinted
      eyebrow="Integrations"
      title="100+ integrations. Lives where your work lives."
      blurb="Cloud collaboration, data platforms, finance and identity providers. Two-way sync where it makes sense."
    >
      <ul className="flex flex-wrap gap-2">
        {integrationLogos.map((logo) => (
          <li key={logo} className="rounded-xl border border-line bg-bg px-4 py-2 text-[13px] text-fg-2">
            {logo}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[13px] text-fg-muted">
        + 90 more across CRM, finance, HR, support and dev tools —{' '}
        <Link to="/integrations" className="font-semibold text-accent hover:underline">
          browse the full catalog ↗
        </Link>
      </p>
    </Section>
  )
}

function MarketplaceSection() {
  return (
    <Section
      id="marketplace"
      eyebrow="Marketplace"
      title="50+ agents and apps. Plug and play."
      blurb="Browse a curated marketplace of agents and apps built by Apragya, partners, and certified developers. Install in one click, customize for your tenant."
    >
      <ul className="grid gap-4 md:grid-cols-3">
        {marketplacePicks.map((pick) => (
          <li key={pick.name} className="card spotlight lift p-6">
            <span aria-hidden className="text-xl">
              {pick.icon}
            </span>
            <h3 className="mt-3 text-sm font-semibold">{pick.name}</h3>
            <p className="text-[11px] text-fg-muted">{pick.meta}</p>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">{pick.blurb}</p>
            <p className="mt-4 text-[12px] text-fg-muted">
              <span className="text-warn">★ {pick.rating}</span> · {pick.installs} installs
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[13px]">
        <Link to="/marketplace" className="font-semibold text-accent hover:underline">
          Browse the marketplace →
        </Link>
      </p>
    </Section>
  )
}

function TrustSection() {
  return (
    <Section
      tinted
      eyebrow="Trust & governance"
      title="Enterprise controls, built in."
      blurb="Every AI action on Apragya is observable, reversible, and gated by your policies. Governance is not an add-on module — it's how the runtime is designed."
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {trustPillars.map((pillar) => (
          <li key={pillar.name} className="card spotlight lift p-5">
            <span aria-hidden className="text-lg">
              {pillar.icon}
            </span>
            <h3 className="mt-3 text-sm font-semibold">{pillar.name}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{pillar.blurb}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[13px]">
        <Link to="/trust" className="font-semibold text-accent hover:underline">
          Read the governance model →
        </Link>
      </p>
    </Section>
  )
}

function WhyUsSection() {
  return (
    <Section
      id="why-us"
      eyebrow="Why choose us"
      title="Built different. Built for you."
      blurb="Thousands of creators, developers, and teams choose Apragya AI every day — not just for the agents, but for the real advantage it gives them."
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {whyUs.map((item) => (
          <li key={item.name} className="card spotlight lift p-6">
            <p className="text-2xl font-bold brand-gradient-text">
              <CountUp value={item.stat} />
            </p>
            <p className="text-xs text-fg-muted">{item.statLabel}</p>
            <h3 className="mt-4 flex items-center gap-2 text-sm font-semibold">
              <span aria-hidden>{item.icon}</span>
              {item.name}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{item.blurb}</p>
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <li key={tag}>
                  <Pill>{tag}</Pill>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function NewsSection() {
  return (
    <Section tinted eyebrow="Featured release" title="Latest from our newsroom.">
      <article className="card spotlight lift p-7">
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="rounded-lg bg-accent/10 px-2.5 py-1 font-semibold text-accent">🚀 PRODUCT LAUNCH</span>
          <span className="text-fg-muted">June 8, 2026</span>
        </div>
        <h3 className="mt-4 max-w-3xl text-lg leading-snug font-semibold">
          Chennai-Based Fronseye Tech Launches Apragya AI — India's First Horizontal AI-Native ERP Platform for Modern
          Teams
        </h3>
        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-fg-muted">
          Fronseye Tech Private Limited, a DPIIT and StartupTN-recognized Indian deep-tech startup, unveils Apragya AI —
          the first horizontal AI-native ERP platform purpose-built for the agent era, with 50 ready-to-deploy agents
          across CRM, HR, Finance, and Procurement.
        </p>
        <p className="mt-5 text-[12px] text-fg-muted">Apragya AI Newsroom · Press release · 5 min read</p>
      </article>
    </Section>
  )
}

function PricingSection() {
  const [annual, setAnnual] = useState(true)

  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Start with a 14-day free trial, then free forever for up to 3 users."
      blurb="No credit card required. Pick the plan that fits your team and scale at your pace. Cancel anytime, no questions asked."
    >
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-xl border border-line bg-surface p-1">
          {(['Monthly', 'Annual'] as const).map((label) => {
            const isAnnual = label === 'Annual'
            return (
              <button
                key={label}
                onClick={() => setAnnual(isAnnual)}
                aria-pressed={annual === isAnnual}
                className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition ${
                  annual === isAnnual ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        {annual && (
          <span className="rounded-lg bg-ok-muted px-2.5 py-1 text-[11px] font-semibold text-ok">2 MONTHS FREE</span>
        )}
      </div>

      <p className="mt-4 text-[13px] text-fg-muted">Founding offer: annual billing gets 2 months free.</p>

      <ul className="mt-10 grid items-start gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <li
            key={plan.name}
            className={`card relative flex flex-col p-6 lift ${
              plan.featured ? 'border-accent glow lg:-my-3 lg:p-8' : ''
            }`}
          >
            {plan.featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-accent to-emerald-500 px-3.5 py-1 text-[11px] font-semibold whitespace-nowrap text-white">
                Most teams start here
              </span>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold tracking-[0.16em] text-fg-muted uppercase">{plan.name}</h3>
              {annual && plan.monthly !== 'Custom' && (
                <span className="rounded-lg bg-ok-muted px-2 py-0.5 text-[10px] font-semibold text-ok">Save 17%</span>
              )}
            </div>

            <p className="mt-4 text-2xl font-bold">
              {/* Re-counts when the monthly/annual switch moves, not just on scroll. */}
              <CountUp value={annual ? plan.annual : plan.monthly} duration={600} />
              {plan.monthly !== 'Custom' && (
                <span className="text-[13px] font-normal text-fg-muted">
                  {' '}
                  / mo{annual ? ', billed annually' : ''}
                </span>
              )}
            </p>
            {annual && plan.annualTotal && (
              <p className="mt-1 text-xs text-fg-muted">
                <CountUp value={plan.annualTotal} duration={600} />
              </p>
            )}
            <p className="mt-3 text-[13px] text-fg-muted">{plan.blurb}</p>

            <ul className="mt-5 flex-1 space-y-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2.5 text-[13px] text-fg-2">
                  <span aria-hidden className="text-accent">
                    ✓
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <Link to={plan.cta.to} className="mt-6">
              <Button variant={plan.featured ? 'accent' : 'secondary'} className="w-full !py-3">
                {plan.cta.label}
              </Button>
            </Link>
            {plan.monthly !== 'Custom' && (
              <p className="mt-3 text-center text-[11px] text-fg-muted">14-day trial · no card · cancel anytime</p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function FaqSection() {
  const [group, setGroup] = useState(0)
  const [open, setOpen] = useState<string | null>(faqs[0].items[0].q)

  return (
    <Section id="faq" tinted eyebrow="💬 FAQ" title="Got questions? We've got answers." blurb="Everything you need to know about Apragya AI.">
      <div className="flex flex-wrap gap-2">
        {faqs.map((item, index) => (
          <button
            key={item.group}
            onClick={() => setGroup(index)}
            aria-pressed={group === index}
            className={`rounded-xl border px-3.5 py-2 text-[13px] transition ${
              group === index
                ? 'border-accent bg-accent/10 font-semibold text-fg'
                : 'border-line text-fg-2 hover:border-fg-muted'
            }`}
          >
            {item.group}
          </button>
        ))}
      </div>

      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-bg">
        {faqs[group].items.map((item) => {
          const isOpen = open === item.q
          return (
            <li key={item.q}>
              <button
                onClick={() => setOpen(isOpen ? null : item.q)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="text-[14px] font-medium">{item.q}</span>
                <span aria-hidden className="text-fg-muted">
                  {isOpen ? '−' : '+'}
                </span>
              </button>
              {isOpen && <p className="px-5 pb-5 text-[13px] leading-relaxed text-fg-muted">{item.a}</p>}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function FinalCta() {
  return (
    <section className="px-5 py-20">
      <div className="relative isolate mx-auto max-w-5xl overflow-hidden rounded-3xl border border-line bg-surface px-8 py-16 text-center">
        <div
          aria-hidden
          className="absolute -top-24 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl"
        />
        <Eyebrow>Start building for free</Eyebrow>
        <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-[2.6rem]">
          Your workspace is <span className="brand-gradient-text">60 seconds away</span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[15px] text-fg-muted">
          Install the apps you need, put agents on your records, and keep every action audited — without a migration
          project.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/register">
            <Button variant="accent" className="!px-7 !py-3.5 !text-[15px]">
              Create your workspace →
            </Button>
          </Link>
          <Link to="/contact-sales">
            <Button variant="secondary" className="!px-7 !py-3.5 !text-[15px]">
              Talk to sales
            </Button>
          </Link>
        </div>

        <ul className="mt-7 flex flex-wrap justify-center gap-x-7 gap-y-2 text-[13px] text-fg-muted">
          {['Free forever for up to 3 users', 'No credit card', 'Your data exports cleanly'].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span aria-hidden className="text-accent">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default function Landing() {
  return (
    <SiteLayout>
      <Hero />
      <SocialProof />
      <Outcomes />
      <IndustryMarquee />
      <Suites />
      <VibeSection />
      <AgentSection />
      <AppsSection />
      <PipelineSection />
      <IntegrationsSection />
      <MarketplaceSection />
      <TrustSection />
      <WhyUsSection />
      <NewsSection />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </SiteLayout>
  )
}
