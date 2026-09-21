'use client'

import { useRef, useState } from 'react'
import { RecordDialog } from '../../../components/RecordDialog'
import type { HrModal } from '../../../lib/hrData'
import { useWorkspace } from '../../../lib/workspace'

/**
 * The field specs behind CRM's create buttons. CRM was never transcribed field
 * by field, so these stay deliberately small — enough to name the thing and
 * hang the numbers the dashboard counts off it.
 */
export const crmModals: Record<string, HrModal> = {
  'crm.leads': {
    title: 'New lead',
    submit: 'Create lead',
    fields: [
      { kind: 'text', label: 'Name', required: true, span: 2 },
      { kind: 'text', label: 'Company', span: 1 },
      { kind: 'text', label: 'Email', span: 2 },
      { kind: 'text', label: 'Phone', span: 1 },
      { kind: 'select', label: 'Source', value: 'Website', span: 1 },
      { kind: 'select', label: 'Status', value: 'New', span: 1 },
      { kind: 'number', label: 'Score', value: '0', span: 1 },
      { kind: 'textarea', label: 'Notes' },
    ],
  },
  'crm.contacts': {
    title: 'Add contact',
    submit: 'Add contact',
    fields: [
      { kind: 'text', label: 'Name', required: true, span: 2 },
      { kind: 'select', label: 'Type', value: 'Prospect', span: 1 },
      { kind: 'text', label: 'Email', span: 2 },
      { kind: 'text', label: 'Phone', span: 1 },
      { kind: 'text', label: 'Company', span: 3 },
    ],
  },
  'crm.companies': {
    title: 'Add Company',
    submit: 'Add Company',
    fields: [
      { kind: 'text', label: 'Name', required: true, span: 2 },
      { kind: 'text', label: 'Industry', span: 1 },
      { kind: 'text', label: 'Website', span: 2 },
      { kind: 'number', label: 'Employees', value: '0', span: 1 },
    ],
  },
  'crm.deals': {
    title: 'New deal',
    submit: 'Create deal',
    fields: [
      { kind: 'text', label: 'Name', required: true, span: 2 },
      { kind: 'text', label: 'Company', span: 1 },
      { kind: 'number', label: 'Value', value: '0', span: 1 },
      { kind: 'select', label: 'Stage', value: 'New', span: 1 },
      { kind: 'date', label: 'Close date', span: 1 },
      { kind: 'textarea', label: 'Notes' },
    ],
  },
  'crm.activities': {
    title: 'Log Activity',
    submit: 'Log Activity',
    fields: [
      { kind: 'text', label: 'Subject', required: true, span: 2 },
      { kind: 'select', label: 'Type', value: 'Call', span: 1 },
      { kind: 'date', label: 'When', span: 1 },
      { kind: 'text', label: 'With', span: 2 },
      { kind: 'textarea', label: 'Outcome' },
    ],
  },
  'crm.events': {
    title: 'New Event',
    submit: 'Create Event',
    fields: [
      { kind: 'text', label: 'Title', required: true, span: 2 },
      { kind: 'date', label: 'Date', span: 1 },
      { kind: 'text', label: 'Attendees', span: 3 },
      { kind: 'textarea', label: 'Agenda' },
    ],
  },
  'crm.sequences': {
    title: 'New sequence',
    submit: 'Create sequence',
    fields: [
      { kind: 'text', label: 'Name', required: true, span: 2 },
      { kind: 'number', label: 'Steps', value: '3', span: 1 },
      { kind: 'textarea', label: 'Purpose' },
    ],
  },
  'crm.pipelines': {
    title: 'New pipeline',
    submit: 'Create pipeline',
    fields: [
      { kind: 'text', label: 'Name', required: true, span: 2 },
      { kind: 'textarea', label: 'Description' },
    ],
  },
  'crm.tasks': {
    title: 'New task',
    submit: 'Create task',
    fields: [
      { kind: 'text', label: 'Task', required: true, span: 2 },
      { kind: 'date', label: 'Due', span: 1 },
      { kind: 'textarea', label: 'Notes' },
    ],
  },
}

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`

/**
 * Everything a CRM panel needs to make its buttons real: the records it holds,
 * a create dialog, CSV in and out, and a list to render instead of the empty
 * state once something exists.
 */
export function useRecords(key: string) {
  const { appRecords, addAppRecord, removeAppRecord } = useWorkspace()
  const [open, setOpen] = useState<HrModal | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const records = appRecords[key] ?? []

  /** Opens the entity's own dialog, or one named after the button that asked. */
  const create = (label?: string) =>
    setOpen(
      crmModals[key] ??
        ({
          title: label ?? 'New record',
          submit: label ?? 'Create',
          fields: [
            { kind: 'text', label: 'Name', required: true, span: 2 },
            { kind: 'textarea', label: 'Notes' },
          ],
        } as HrModal),
    )

  const exportCsv = (filename = key) => {
    const columns = Array.from(new Set(records.flatMap((item) => Object.keys(item.fields))))
    const csv = [
      ['Name', ...columns].map(csvEscape).join(','),
      ...records.map((item) =>
        [item.title, ...columns.map((column) => item.fields[column] ?? '')].map(csvEscape).join(','),
      ),
    ].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  /** A header row plus one record per line — the shape exportCsv writes. */
  const importCsv = () => fileInput.current?.click()

  const readCsv = async (file: File) => {
    const [head, ...lines] = (await file.text()).split(/\r?\n/).filter((line) => line.trim())
    const columns = head.split(',').map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"'))
    lines.forEach((line) => {
      const cells = line.split(',').map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"'))
      const fields: Record<string, string> = {}
      columns.slice(1).forEach((column, index) => {
        if (cells[index + 1]) fields[column] = cells[index + 1]
      })
      if (cells[0]) addAppRecord(key, cells[0], fields)
    })
  }

  const dialog = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void readCsv(file)
          event.target.value = ''
        }}
      />
      {open && <RecordDialog modal={open} recordKey={key} onClose={() => setOpen(null)} />}
    </>
  )

  const list = (sortBy?: (a: { fields: Record<string, string> }, b: { fields: Record<string, string> }) => number) => (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {[...records].sort(sortBy ?? (() => 0)).map((record) => (
        <li key={record.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5 text-[14px]">
          <span className="min-w-[10rem] flex-1 font-medium">{record.title}</span>
          <span className="min-w-0 flex-[2] truncate text-[13px] text-fg-muted">
            {Object.entries(record.fields)
              .filter(([label]) => label !== 'Name')
              .map(([label, value]) => `${label}: ${value}`)
              .join(' · ')}
          </span>
          <button
            onClick={() => removeAppRecord(key, record.id)}
            className="text-[13px] text-fg-muted transition hover:text-bad"
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  )

  return { records, create, dialog, list, exportCsv, importCsv }
}
