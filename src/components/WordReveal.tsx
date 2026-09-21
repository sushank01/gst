'use client'

import type { ReactNode } from 'react'

/**
 * A headline whose words arrive one after another.
 *
 * Splitting on whitespace keeps each word a single inline-block, so the line
 * still wraps normally and the animation is per word rather than per letter —
 * legible at display sizes, where letter-by-letter reads as a gimmick.
 */
export function WordReveal({
  text,
  delay = 0,
  step = 55,
  className = '',
  accentFrom,
}: {
  text: string
  /** Milliseconds before the first word. */
  delay?: number
  /** Milliseconds between words. */
  step?: number
  className?: string
  /** Word index from which the brand gradient takes over. */
  accentFrom?: number
}) {
  const words = text.split(' ')

  return (
    <span className={`word-in ${className}`}>
      {words.map((word, index) => {
        const accent = accentFrom !== undefined && index >= accentFrom
        return (
          <span key={`${word}-${index}`} style={{ animationDelay: `${delay + index * step}ms` }}>
            <span className={accent ? 'brand-gradient-text' : undefined}>{word}</span>
            {index < words.length - 1 ? ' ' : null}
          </span>
        )
      })}
    </span>
  )
}

/** Wraps arbitrary children so they inherit the same staggered entrance. */
export function Stagger({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`word-in ${className}`}>{children}</span>
}
