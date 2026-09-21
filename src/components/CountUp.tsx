'use client'

import { useEffect, useRef, useState } from 'react'

/** Everything around the first number in a stat, so "~40 sec" keeps its ~ and its unit. */
function split(value: string) {
  const match = value.match(/-?[\d,]*\.?\d+/)
  if (!match) return null
  const raw = match[0].replace(/,/g, '')
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0
  return {
    prefix: value.slice(0, match.index),
    target: Number(raw),
    suffix: value.slice((match.index ?? 0) + match[0].length),
    decimals,
    grouped: match[0].includes(','),
  }
}

const easeOut = (t: number) => 1 - (1 - t) ** 3

/**
 * A statistic that counts up to its value.
 *
 * The number is parsed out of the string rather than passed separately, so a
 * stat stays one readable literal at the call site — "12 hrs", "~40 sec",
 * "₹3,333", "99.9%". Anything with no number in it ("Custom", "Same day"), and
 * anything at all for a reader who prefers reduced motion, renders as written.
 */
export function CountUp({
  value: raw,
  duration = 1100,
  className = '',
}: {
  /** A stat as it should read — a number is fine, so is "~40 sec" or "Custom". */
  value: string | number
  duration?: number
  className?: string
}) {
  const value = String(raw)
  const parts = split(value)
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(parts?.target ?? 0)
  const [done, setDone] = useState(!parts)

  useEffect(() => {
    if (!parts) return
    const node = ref.current
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // A hidden tab gets no animation frames, so a count started there would sit
    // at zero until the reader came back. Show the real figure instead.
    if (!node || still || document.hidden) {
      setDone(true)
      return
    }

    setShown(0)
    setDone(false)

    let frame = 0
    let started = false
    const run = () => {
      if (started) return
      started = true
      const begin = performance.now()
      const step = (now: number) => {
        // A frame's timestamp can precede the moment we asked for it, which
        // would otherwise render a negative number on the first tick.
        const progress = Math.min(Math.max((now - begin) / duration, 0), 1)
        setShown(parts.target * easeOut(progress))
        if (progress < 1) frame = requestAnimationFrame(step)
        else setDone(true)
      }
      frame = requestAnimationFrame(step)
    }

    /*
     * Two triggers, because one is not enough. A stat already on screen — on
     * load, or when its value changes under the reader, as the pricing switch
     * does — counts straight away; one below the fold waits for the observer.
     * Without the first check a number can sit at zero indefinitely wherever
     * the initial observation is never delivered.
     */
    const box = node.getBoundingClientRect()
    if (typeof IntersectionObserver === 'undefined' || (box.bottom > 0 && box.top < window.innerHeight)) {
      run()
      return () => cancelAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        run()
      },
      { threshold: 0.4 },
    )
    observer.observe(node)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
    // `value` is the whole input; `parts` is derived from it.
  }, [value, duration]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!parts) return <span className={className}>{value}</span>

  const number = done ? parts.target : shown
  const text = parts.grouped
    ? number.toLocaleString(undefined, {
        minimumFractionDigits: parts.decimals,
        maximumFractionDigits: parts.decimals,
      })
    : number.toFixed(parts.decimals)

  return (
    <span ref={ref} className={className}>
      {parts.prefix}
      {/* Tabular figures stop the line jittering as digits change width. */}
      <span className="tabular-nums">{text}</span>
      {parts.suffix}
    </span>
  )
}
