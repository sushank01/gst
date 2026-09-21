'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Fades content in the first time it scrolls into view.
 *
 * Two triggers, not one: anything already on screen shows immediately, and only
 * content below the fold waits for the observer. Leaning on the observer alone
 * means content stays invisible forever anywhere its first observation is never
 * delivered — which is too high a price for an entrance animation. The CSS
 * disables the motion entirely under prefers-reduced-motion.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }

    const box = node.getBoundingClientRect()
    if (box.bottom > 0 && box.top < window.innerHeight) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      data-shown={shown}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal ${className}`}
    >
      {children}
    </div>
  )
}
