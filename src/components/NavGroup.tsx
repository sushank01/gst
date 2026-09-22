'use client'

import { useState } from 'react'
import { Icon } from './Icon'

export function NavGroup({
  group,
  items,
  active,
  onSelect,
}: {
  group: string
  items: readonly { id: string; label: string; icon: string }[]
  active: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mt-4 first:mt-0">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2 pb-1.5 text-[11px] font-semibold tracking-[0.1em] text-accent uppercase"
      >
        <span aria-hidden className="text-[9px]">
          {open ? '⌄' : '›'}
        </span>
        {group}
      </button>
      {open && (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onSelect(item.id)}
                aria-current={active === item.id ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-left text-[13.5px] transition ${
                  active === item.id ? 'bg-accent-muted font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2'
                }`}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
