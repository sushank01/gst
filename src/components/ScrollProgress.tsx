'use client'

import { useEffect, useState } from 'react'

/** How far down the page you are, as a hairline across the top. */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      setProgress(scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div
      aria-hidden
      className="scroll-progress w-full"
      style={{ transform: `scaleX(${progress})`, opacity: progress > 0.002 ? 1 : 0 }}
    />
  )
}
