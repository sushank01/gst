'use client'

import type { AppRecord } from '../lib/workspace'

export function RecordList({ records, onDelete, grid = false }: {
  records: readonly AppRecord[]; onDelete: (id: string) => void; grid?: boolean
}) {
  return <ul className={grid ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface'}>
    {records.map((record) => <li key={record.id} className={`flex flex-wrap items-center gap-4 px-6 py-3.5 text-[14px] ${grid ? 'rounded-2xl border border-line bg-surface' : ''}`}>
      <span className="min-w-[10rem] flex-1 font-medium">{record.title}</span>
      <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
        {Object.entries(record.fields).filter(([label]) => label !== 'Name').map(([label, value]) => `${label}: ${value}`).join(' · ')}
      </span>
      <button onClick={() => onDelete(record.id)} aria-label={`Delete ${record.title}`} className="text-[13px] text-fg-muted transition hover:text-bad">Delete</button>
    </li>)}
  </ul>
}
