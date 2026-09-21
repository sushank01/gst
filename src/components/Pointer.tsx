'use client'

import { useEffect } from 'react'

/**
 * One pointer listener for the whole page.
 *
 * `.spotlight` and `.tilt` both want to know where the cursor is inside them.
 * Thirty cards each with their own handler would be thirty listeners and thirty
 * layout reads a frame; this reads the one element under the pointer, once per
 * frame, and writes `--mx` / `--my` onto it.
 */
export function Pointer() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    // Coarse pointers have no hover, so there is nothing to track.
    if (window.matchMedia?.('(pointer: coarse)').matches) return

    let frame = 0
    let last: HTMLElement | null = null

    const onMove = (event: PointerEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const target =
          (event.target as Element | null)?.closest<HTMLElement>('.spotlight, .tilt') ?? null
        if (last && last !== target) {
          last.style.removeProperty('--mx')
          last.style.removeProperty('--my')
        }
        last = target
        if (!target) return
        const box = target.getBoundingClientRect()
        target.style.setProperty('--mx', `${((event.clientX - box.left) / box.width) * 100}%`)
        target.style.setProperty('--my', `${((event.clientY - box.top) / box.height) * 100}%`)
      })
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
