'use client'

import { Link, useSearchParams } from '../../../lib/router'
import { useAuth } from '../../../lib/auth'
import { categoryById, featuredTools, quickAccess, suiteCategories } from '../../../lib/businessData'
import { Icon } from '../../../components/Icon'
import { toneFor } from '../../../lib/tones'
import { BackLink, SuiteBanner, ToolCard } from './shared'

/** `/app/business?category=writing` — one category's tools. */
function CategoryView({ id }: { id: string }) {
  const category = categoryById[id]

  if (!category) {
    return (
      <div className="mx-auto max-w-6xl pt-2">
        <BackLink to="/app/business" label="Back to previous" />
        <p className="mt-10 text-center text-[14px] text-fg-muted">That category no longer exists.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl pt-2">
      <BackLink to="/app/business" label="Back to previous" />

      <div className="mt-4">
        <SuiteBanner>
          <div className="flex items-center gap-4">
            <span className={`grid h-12 w-12 place-items-center rounded-2xl ${toneFor(category.id)}`}>
              <Icon name={category.icon} size={24} />
            </span>
            <div>
              <h1 className="text-[34px] leading-none font-bold tracking-tight">{category.name}</h1>
              <p className="mt-2 text-[15px] text-fg-2">{category.tools.length} tools available</p>
            </div>
          </div>
        </SuiteBanner>
      </div>

      <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {category.tools.map((tool) => (
          <li key={tool.name}>
            <ToolCard tool={tool} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** `/app/business` — the suite home the AI Tools group opens into. */
export default function BusinessSuite() {
  const [params] = useSearchParams()
  const { session } = useAuth()
  const category = params.get('category')

  if (category) return <CategoryView id={category} />

  const firstName = session?.user.fullName.split(' ')[0] ?? 'there'

  return (
    <div className="mx-auto max-w-6xl pt-2">
      <SuiteBanner>
        <h1 className="text-[34px] leading-tight font-bold tracking-tight">Welcome back, {firstName}</h1>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-fg-2">
          Access 100+ AI-powered tools to boost your productivity. Write content, generate code, create marketing
          copy, and more.
        </p>
      </SuiteBanner>

      <h2 className="mt-8 text-[20px] font-bold tracking-tight">Quick access</h2>
      <ul className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {quickAccess.map((item) => (
          <li key={item.name}>
            <Link
              to={item.to}
              className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 transition hover:border-accent hover:bg-surface-2"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-white">
                <Icon name={item.icon} size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{item.name}</span>
                <span className="mt-0.5 block text-[13px] text-fg-muted">{item.blurb}</span>
              </span>
              <span aria-hidden className="text-fg-muted">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex items-end justify-between gap-4">
        <h2 className="text-[20px] font-bold tracking-tight">Featured tools</h2>
        <Link to="/app/business?category=writing" className="text-[13px] font-medium text-accent hover:underline">
          View all →
        </Link>
      </div>
      <ul className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {featuredTools.map((tool) => (
          <li key={tool.name}>
            <ToolCard tool={tool} />
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-[20px] font-bold tracking-tight">Browse by category</h2>
      <ul className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {suiteCategories.map((item) => (
          <li key={item.id}>
            <Link
              to={`/app/business?category=${item.id}`}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-5 transition hover:border-accent hover:bg-surface-2"
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${toneFor(item.id)}`}>
                <Icon name={item.icon} size={17} />
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-semibold">{item.name}</span>
              <span className="shrink-0 text-[12px] text-fg-muted">{item.tools.length}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
