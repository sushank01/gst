'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

/** Native modal supplies focus containment, Escape, inert background and focus restoration. */
export function Dialog({ title, onClose, children, size = 'md', frame = 'standard' }: {
  title: string; onClose: () => void; children: ReactNode; size?: 'md' | 'lg' | 'xl' | '2xl'; frame?: 'standard' | 'record'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  const sizes = { md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl' }
  return <dialog ref={ref} aria-labelledby={titleId}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return
      const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0)
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}
    onCancel={(event) => { event.preventDefault(); close.current() }}
    className={`fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border border-line bg-surface text-fg shadow-2xl backdrop:bg-black/40 ${sizes[size]} ${frame === 'record' ? 'p-0' : 'p-6'}`}>
    <div className={`flex items-start justify-between gap-4 ${frame === 'record' ? 'border-b border-line px-6 py-5' : ''}`}>
      <h2 id={titleId} className="text-[18px] font-semibold">{title}</h2>
      <button type="button" onClick={onClose} aria-label="Close" className="text-fg-muted transition hover:text-fg">✕</button>
    </div>
    {children}
  </dialog>
}
