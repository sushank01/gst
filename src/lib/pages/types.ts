export type Card = { icon: string; name: string; blurb: string }

export type Section =
  | { kind: 'cards'; eyebrow: string; title: string; blurb?: string; cols?: 2 | 3 | 4; cards: Card[] }
  | { kind: 'prose'; eyebrow: string; title: string; paragraphs: string[] }
  | { kind: 'steps'; eyebrow: string; title: string; blurb?: string; steps: Card[] }
  | { kind: 'split'; eyebrow: string; title: string; blurb?: string; columns: { title: string; lead: string; items: string[] }[] }
  | { kind: 'list'; eyebrow: string; title: string; blurb?: string; items: { name: string; blurb: string; to?: string }[] }
  | { kind: 'notice'; text: string }

export type Cta = { label: string; to: string; variant?: 'primary' | 'secondary' | 'accent' }

export type PageSpec = {
  slug: string
  eyebrow: string
  title: string
  blurb: string
  ctas?: Cta[]
  sections: Section[]
  final?: { eyebrow: string; title: string; blurb: string; ctas: Cta[] }
}
