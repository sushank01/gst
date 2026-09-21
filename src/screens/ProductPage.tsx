'use client'

import { Link } from '../lib/router'
import { SiteLayout } from '../components/SiteLayout'
import { Button, Eyebrow } from '../components/ui'
import type { Cta, PageSpec, Section } from '../lib/pages/types'

const colClass: Record<2 | 3 | 4, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
}

function CtaRow({ ctas }: { ctas: Cta[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {ctas.map((cta) => (
        <Link key={`${cta.label}-${cta.to}`} to={cta.to}>
          <Button variant={cta.variant ?? 'accent'}>{cta.label}</Button>
        </Link>
      ))}
    </div>
  )
}

function SectionBlock({ section }: { section: Section }) {
  if (section.kind === 'notice') {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-fg-muted">
        {section.text}
      </p>
    )
  }

  return (
    <section>
      <Eyebrow>{section.eyebrow}</Eyebrow>
      <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{section.title}</h2>
      {'blurb' in section && section.blurb && (
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{section.blurb}</p>
      )}

      {section.kind === 'cards' && (
        <ul className={`mt-8 grid gap-4 ${colClass[section.cols ?? 3]}`}>
          {section.cards.map((card) => (
            <li
              key={card.name}
              className="card spotlight lift p-5 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg"
            >
              <span aria-hidden className="text-xl">
                {card.icon}
              </span>
              <h3 className="mt-3 text-sm font-semibold">{card.name}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{card.blurb}</p>
            </li>
          ))}
        </ul>
      )}

      {section.kind === 'steps' && (
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {section.steps.map((step) => (
            <li key={step.name} className="card spotlight lift p-5">
              <span aria-hidden className="text-xl">
                {step.icon}
              </span>
              <h3 className="mt-3 text-sm font-semibold">{step.name}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{step.blurb}</p>
            </li>
          ))}
        </ol>
      )}

      {section.kind === 'prose' && (
        <div className="mt-6 max-w-3xl space-y-4">
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="text-[15px] leading-relaxed text-fg-2">
              {paragraph}
            </p>
          ))}
        </div>
      )}

      {section.kind === 'split' && (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {section.columns.map((column) => (
            <div key={column.title} className="card spotlight lift p-6">
              <h3 className="text-sm font-semibold">{column.title}</h3>
              <p className="mt-1.5 text-[13px] font-medium text-accent">{column.lead}</p>
              <ul className="mt-4 space-y-2.5">
                {column.items.map((item) => (
                  <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-fg-2">
                    <span aria-hidden className="text-accent">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {section.kind === 'list' && (
        <ul className="mt-8 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {section.items.map((item) => {
            const body = (
              <>
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{item.blurb}</p>
              </>
            )
            return (
              <li key={item.name}>
                {item.to ? (
                  <Link to={item.to} className="block px-5 py-4 transition hover:bg-surface-2">
                    {body}
                  </Link>
                ) : (
                  <div className="px-5 py-4">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function ProductPage({ page }: { page: PageSpec }) {
  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-5">
        <header className="relative isolate py-16 sm:py-20">
          <div
            aria-hidden
            className="absolute inset-x-0 -top-14 -z-10 h-72 bg-[radial-gradient(55%_100%_at_25%_0%,rgb(var(--accent)/0.14),transparent)]"
          />
          <Eyebrow>{page.eyebrow}</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-3xl leading-[1.12] font-extrabold tracking-tight sm:text-5xl">
            {page.title}
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{page.blurb}</p>
          {page.ctas && (
            <div className="mt-8">
              <CtaRow ctas={page.ctas} />
            </div>
          )}
        </header>

        <div className="space-y-16 pb-20">
          {page.sections.map((section, index) => (
            <SectionBlock key={index} section={section} />
          ))}

          {page.final && (
            <section className="relative isolate overflow-hidden rounded-3xl border border-line bg-surface px-8 py-14 text-center">
              <div
                aria-hidden
                className="absolute -top-20 left-1/2 -z-10 h-56 w-56 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl"
              />
              <Eyebrow>{page.final.eyebrow}</Eyebrow>
              <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{page.final.title}</h2>
              <p className="mx-auto mt-3 max-w-xl text-[15px] text-fg-muted">{page.final.blurb}</p>
              <div className="mt-7 flex justify-center">
                <CtaRow ctas={page.final.ctas} />
              </div>
            </section>
          )}
        </div>
      </div>
    </SiteLayout>
  )
}
