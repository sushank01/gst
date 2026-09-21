import type { PageSpec } from './types'
import { productPages } from './product'
import { vibeSkillPages } from './vibeSkills'
import { infoPages } from './info'

/** Every data-driven marketing route, keyed by slug. */
export const allPages: PageSpec[] = [...productPages, ...vibeSkillPages, ...infoPages]

export const pageBySlug = new Map(allPages.map((page) => [page.slug, page]))
