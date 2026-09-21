/**
 * Hues for categorical chips and icon tiles. Six is enough to tell categories
 * apart at a glance and few enough that the app still reads as one product; the
 * classes themselves are defined in `src/index.css` so both themes are covered.
 */
export const tones = [
  'tone-teal',
  'tone-violet',
  'tone-sky',
  'tone-amber',
  'tone-emerald',
  'tone-rose',
] as const

/** Stable hue for a name — the same category keeps its colour between renders. */
export function toneFor(key: string) {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0
  return tones[hash % tones.length]
}
