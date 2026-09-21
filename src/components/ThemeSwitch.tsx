'use client'

import { Icon } from './Icon'
import { useTheme, type ThemePreference } from '../lib/theme'

const options: { id: ThemePreference; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' },
]

/**
 * The appearance control, in two sizes.
 *
 * `compact` is the segmented pair that lives in the workspace top bar; the full
 * version adds System and its labels, for the places where someone is looking
 * for the setting rather than reaching for it.
 */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { preference, theme, setPreference } = useTheme()
  const shown = compact ? options.filter((option) => option.id !== 'system') : options

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={`flex items-center rounded-full border border-line bg-surface-2/60 ${compact ? 'gap-0 p-0.5' : 'gap-1 p-1'}`}
    >
      {shown.map((option) => {
        // Compact has no System button, so it marks whichever theme is painted.
        const active = compact ? theme === option.id : preference === option.id
        return (
          <button
            key={option.id}
            role="radio"
            aria-checked={active}
            aria-label={compact ? `${option.label} theme` : undefined}
            title={compact ? `${option.label} theme` : undefined}
            onClick={() => setPreference(option.id)}
            className={`flex items-center gap-1.5 rounded-full transition ${
              compact ? 'h-7 w-7 justify-center' : 'px-3 py-1.5 text-[13px]'
            } ${active ? 'bg-surface text-accent shadow-sm' : 'text-fg-muted hover:text-fg'}`}
          >
            <Icon name={option.icon} size={compact ? 14 : 15} />
            {!compact && option.label}
          </button>
        )
      })}
    </div>
  )
}
