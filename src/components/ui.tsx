'use client'

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { useId } from 'react'

export function Logo({ tone = 'auto' }: { tone?: 'auto' | 'light' }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-emerald-400 text-sm font-bold text-white">
        A
      </span>
      <span className={`text-[15px] font-semibold tracking-tight ${tone === 'light' ? 'text-white' : 'text-fg'}`}>
        Apragya AI
      </span>
    </span>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent'
  loading?: boolean
}

const buttonStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'shine bg-fg text-bg hover:opacity-90 focus-visible:outline-fg disabled:opacity-50',
  accent:
    'shine btn-accent bg-gradient-to-r from-accent to-emerald-500 text-white hover:opacity-95 focus-visible:outline-accent disabled:opacity-50',
  secondary:
    'border border-line bg-surface text-fg hover:border-fg-muted hover:bg-surface-2 focus-visible:outline-accent',
  ghost: 'text-fg-2 hover:bg-surface-2 focus-visible:outline-accent',
}

export function Button({ variant = 'primary', loading, children, className = '', ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${buttonStyles[variant]} ${className}`}
    >
      {loading && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: ReactNode
  error?: string | null
  optional?: boolean
}

export function Field({ label, hint, error, optional, className = '', ...rest }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] font-medium text-fg-2">
          {label}
        </label>
        {optional && <span className="text-[11px] tracking-wide text-fg-muted uppercase">optional</span>}
      </div>
      <input
        {...rest}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={hint || error ? hintId : undefined}
        className={`w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:outline-2 focus:outline-offset-0 ${
          error ? 'border-bad focus:outline-bad' : 'border-line focus:border-accent focus:outline-accent/40'
        }`}
      />
      {(error || hint) && (
        <p id={hintId} className={`mt-1.5 text-xs ${error ? 'text-bad' : 'text-fg-muted'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

export function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#4285F4" d="M23 12.25c0-.83-.07-1.62-.21-2.39H12v4.52h6.17a5.3 5.3 0 0 1-2.29 3.48v2.9h3.71C21.76 18.76 23 15.77 23 12.25Z" />
      <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1.03 7.59-2.79l-3.71-2.89c-1.03.69-2.35 1.1-3.88 1.1-2.98 0-5.5-2.01-6.4-4.72H1.77v2.98A11.5 11.5 0 0 0 12 23.5Z" />
      <path fill="#FBBC05" d="M5.6 14.2a6.9 6.9 0 0 1 0-4.4V6.82H1.77a11.5 11.5 0 0 0 0 10.36L5.6 14.2Z" />
      <path fill="#EA4335" d="M12 5.08c1.69 0 3.2.58 4.39 1.72l3.29-3.29C17.69 1.6 15.1.5 12 .5A11.5 11.5 0 0 0 1.77 6.82L5.6 9.8c.9-2.71 3.42-4.72 6.4-4.72Z" />
    </svg>
  )
}

export function MicrosoftMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  )
}

/**
 * Single sign-on entry points.
 *
 * `available` is false until a real OAuth client is registered (decision D3).
 * A disabled button with a reason is honest; a button that manufactures an
 * identity from `you@google.com` — which is what this used to do — is not.
 */
export function SsoButtons({
  onPick,
  disabled,
  available = false,
}: {
  onPick: (p: 'google' | 'microsoft') => void
  disabled?: boolean
  available?: boolean
}) {
  const reason = available ? undefined : 'Single sign-on is not configured on this deployment yet.'
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          variant="secondary"
          disabled={disabled || !available}
          title={reason}
          onClick={() => onPick('google')}
          type="button"
        >
          <GoogleMark /> Continue with Google
        </Button>
        <Button
          variant="secondary"
          disabled={disabled || !available}
          title={reason}
          onClick={() => onPick('microsoft')}
          type="button"
        >
          <MicrosoftMark /> Continue with Microsoft
        </Button>
      </div>
      {reason && <p className="mt-2 text-center text-[12px] text-fg-muted">{reason}</p>}
    </div>
  )
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-5">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[11px] font-semibold tracking-[0.12em] text-fg-muted">{children}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold tracking-[0.18em] text-accent uppercase">{children}</p>
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[12px] text-fg-2">{children}</span>
  )
}
