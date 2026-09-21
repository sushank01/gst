'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/** What the reader asked for. `system` follows the OS and keeps following it. */
export type ThemePreference = 'light' | 'dark' | 'system'
/** What is actually painted. `system` resolves to one of these. */
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'apragya.theme'

type ThemeValue = {
  /** The resolved theme, for anything that needs to know what is on screen. */
  theme: Theme
  /** The stored choice, for the controls that offer all three. */
  preference: ThemePreference
  setPreference: (next: ThemePreference) => void
  /** Flips between light and dark, leaving `system` behind. */
  toggle: () => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

function storedPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    /* storage unavailable */
  }
  return 'system'
}

/**
 * Runs before paint, from the document head, so a dark reader never sees a
 * white flash. It only sets the class; React picks the same value up on mount
 * and takes over from there.
 */
export const themeBootScript = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var d=s==='dark'||(s!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

export function ThemeProvider({ children }: { children: ReactNode }) {
  /*
   * Only two things are stored: what the reader asked for, and what the OS
   * currently says. The painted theme is *derived* from the pair.
   *
   * It used to be its own piece of state, kept in step by effects — and that
   * was a bug: on the first commit the preference still read `system`, so the
   * media-query effect overwrote a stored `light` with the OS's dark before the
   * stored value had landed. Deriving it removes the ordering hazard rather
   * than sequencing around it.
   */
  const [preference, setStored] = useState<ThemePreference>('system')
  const [system, setSystem] = useState<Theme>('light')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setStored(storedPreference())
    setReady(true)
  }, [])

  /*
   * Watched always, because `system` is the input the preference selects from —
   * and following the system means following it afterwards, not just at load.
   *
   * Re-read on focus as well as on `change`: the common case is someone
   * switching their OS theme while this tab is in the background, and there are
   * environments (embedded webviews, emulated colour schemes) where `matches`
   * flips without the event ever being dispatched.
   */
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return

    const sync = () => setSystem(query.matches ? 'dark' : 'light')
    const syncIfVisible = () => {
      if (!document.hidden) sync()
    }

    sync()
    query.addEventListener('change', sync)
    document.addEventListener('visibilitychange', syncIfVisible)
    window.addEventListener('focus', sync)
    return () => {
      query.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', syncIfVisible)
      window.removeEventListener('focus', sync)
    }
  }, [])

  /*
   * Light until the stored value has been read — the server cannot know the
   * reader's choice, and a first client render that disagreed with the HTML
   * would throw the whole tree away. The boot script has already painted the
   * right colours by then, so nothing flashes.
   */
  const theme: Theme = ready ? (preference === 'system' ? system : preference) : 'light'

  useEffect(() => {
    if (!ready) return
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme, ready])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      /* storage unavailable */
    }
  }, [preference, ready])

  const setPreference = useCallback((next: ThemePreference) => setStored(next), [])

  const toggle = useCallback(
    () => setStored(theme === 'dark' ? 'light' : 'dark'),
    [theme],
  )

  return <ThemeContext value={{ theme, preference, setPreference, toggle }}>{children}</ThemeContext>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
