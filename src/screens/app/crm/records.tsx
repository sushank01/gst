'use client'

import { RecordList } from '../../../components/RecordList'
import { parseCsv, recordsCsv, downloadCsv } from '../../../lib/csv'
import { leadStatuses, leadSources, contactTypes, pipelineStages, activityTypes } from '../../../lib/crmData'
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
      { kind: 'select', label: 'Source', value: 'Website', options: leadSources, span: 1 },
      { kind: 'select', label: 'Status', value: 'New', options: leadStatuses.filter((item) => item !== 'All'), span: 1 },
      { kind: 'number', label: 'Score', value: '0', span: 1 },
      { kind: 'textarea', label: 'Notes' },
    ],
  },
  'crm.contacts': {
    title: 'Add contact',
    submit: 'Add contact',
    fields: [
      { kind: 'text', label: 'Name', required: true, span: 2 },
      { kind: 'select', label: 'Type', value: 'Prospect', options: contactTypes.filter((item) => item !== 'All'), span: 1 },
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
      { kind: 'select', label: 'Stage', value: 'New', options: pipelineStages.map((stage) => stage.name), span: 1 },
      { kind: 'date', label: 'Close date', span: 1 },
      { kind: 'textarea', label: 'Notes' },
    ],
  },
  'crm.activities': {
    title: 'Log Activity',
    submit: 'Log Activity',
    fields: [
      { kind: 'text', label: 'Subject', required: true, span: 2 },
      { kind: 'select', label: 'Type', value: 'Call', options: activityTypes, span: 1 },
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


/**
 * Everything a CRM panel needs to make its buttons real: the records it holds,
 * a create dialog, CSV in and out, and a list to render instead of the empty
 * state once something exists.
 */
export function useRecords(key: string) {
  const { appRecords, addAppRecord, removeAppRecord } = useWorkspace()
  const [open, setOpen] = useState<HrModal | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [importError, setImportError] = useState('')
  const allRecords = appRecords[key] ?? []
  const records = allRecords.filter((record) => [record.title, ...Object.values(record.fields)].join(' ').toLowerCase().includes(query.trim().toLowerCase()))

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
        }),
    )

  const exportCsv = (filename = key) => {
    downloadCsv(filename, recordsCsv(records))
  }

  /** A header row plus one record per line — the shape exportCsv writes. */
  const importCsv = () => fileInput.current?.click()

  const readCsv = async (file: File) => {
    try {
      const [columns, ...rows] = parseCsv(await file.text())
      if (!columns?.length || columns.some((column) => !column.trim())) throw new Error('CSV needs a non-empty header.')
      if (new Set(columns).size !== columns.length) throw new Error('CSV headers must be unique.')
      if (rows.some((cells) => !cells[0].trim())) throw new Error('Every record needs a name in its first column.')
      rows.forEach((cells) => {
        const fields = Object.fromEntries(columns.slice(1).map((column, index) => [column, cells[index + 1]]))
        addAppRecord(key, cells[0], fields)
      })
      setImportError('')
    } catch (error) { setImportError(error instanceof Error ? error.message : 'Unable to import CSV.') }
  }

  const dialog = (
    <>
      {importError && <p role="alert" className="text-sm text-bad">{importError}</p>}
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

  const list = (sortBy?: (a: { fields: Record<string, string> }, b: { fields: Record<string, string> }) => number, visible = records) => (
    <RecordList records={[...visible].sort(sortBy ?? (() => 0))} onDelete={(id) => removeAppRecord(key, id)} />
  )

  return { records, query, setQuery, create, dialog, list, exportCsv, importCsv }
}
