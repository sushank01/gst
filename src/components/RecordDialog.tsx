'use client'

import { Dialog } from './Dialog'
import { useMemo, useState } from 'react'
// The field vocabulary was first written for HR's page specs; every generic
// create dialog in the app now shares it.
import type { HrField, HrModal } from '../lib/hrData'

const inputClass =
  'mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none'

const spanClass: Record<number, string> = {
  1: 'sm:col-span-1',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
}

function Label({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="text-[14px] text-fg-2">
      {label} {required && <span className="text-bad">*</span>}
    </span>
  )
}

/** Today, or today shifted by a field's offset, as a date input wants it. */
function dateFor(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

/** A field's starting value, so the form is controlled from the first render. */
function initialValue(field: HrField) {
  if (field.kind === 'checkbox') return field.checked ? 'Yes' : ''
  if (field.kind === 'select' || field.kind === 'number') return field.value
  if (field.kind === 'date') return dateFor(field.offsetDays)
  return ''
}

function Field({
  field,
  value,
  onChange,
}: {
  field: HrField
  value: string
  onChange: (next: string) => void
}) {
  if (field.kind === 'checkbox') {
    return (
      <label className="flex items-center gap-2.5 text-[14px] text-fg-2 sm:col-span-3">
        <input
          type="checkbox"
          checked={value === 'Yes'}
          onChange={(event) => onChange(event.target.checked ? 'Yes' : '')}
          className="h-4 w-4 rounded border-line accent-[#0d9488]"
        />
        {field.label}
      </label>
    )
  }

  // A nested list (dependants, allocations) — the entries are added after the
  // record exists, so the dialog only names the section.
  if (field.kind === 'entries') {
    return (
      <section className="rounded-xl border border-line p-5 sm:col-span-3">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-[15px] font-semibold">{field.label}</h3>
          <button
            type="button"
            disabled
            title="Add these once the record is saved"
            className="rounded-xl border border-line px-3.5 py-2 text-[13px] font-medium text-fg-2 disabled:opacity-50"
          >
            {field.action}
          </button>
        </div>
        <p className="mt-3 text-[14px] text-fg-muted">{field.empty}</p>
      </section>
    )
  }

  if (field.kind === 'textarea') {
    return (
      <label className="block sm:col-span-3">
        <Label label={field.label} required={field.required} />
        <textarea
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className={inputClass}
        />
      </label>
    )
  }

  if (field.kind === 'select') {
    return (
      <label className={`block ${spanClass[field.span ?? 1]}`}>
        <Label label={field.label} required={field.required} />
        <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
          {(field.options ?? [field.value]).map((option) => <option key={option}>{option}</option>)}
        </select>
        {field.hint && <span className="mt-1.5 block text-[12px] leading-snug text-fg-muted">{field.hint}</span>}
      </label>
    )
  }

  if (field.kind === 'date') {
    return (
      <label className={`block ${spanClass[field.span ?? 1]}`}>
        <Label label={field.label} required={field.required} />
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      </label>
    )
  }

  const isNumber = field.kind === 'number'
  return (
    <label className={`block ${spanClass[field.span ?? 1]}`}>
      <Label label={field.label} required={isNumber ? undefined : field.required} />
      <input
        type={isNumber ? 'number' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={isNumber ? undefined : field.placeholder}
        className={inputClass}
      />
    </label>
  )
}

/**
 * One dialog for every page that has a "+ Add" button.
 *
 * It collects the fields a page declares and hands them BACK to the caller.
 * It used to write them into a browser-local record store itself, which meant
 * every screen using it produced data that looked saved and was not. The
 * caller now owns the write, so the dialog cannot invent persistence: a screen
 * with no server endpoint behind it has to say so rather than quietly
 * succeeding.
 *
 * `onSubmit` may reject. The dialog stays open and shows the message, because
 * closing on a failed save is how somebody loses what they typed.
 */
export function RecordDialog({
  modal,
  onClose,
  onSubmit,
}: {
  modal: HrModal
  onClose: () => void
  /** Receives the filled fields and a suggested title. Throw to keep the dialog open. */
  onSubmit: (input: { title: string; fields: Record<string, string> }) => Promise<void> | void
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(modal.fields.map((field, index) => [`${field.label}-${index}`, initialValue(field)])),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const missing = useMemo(
    () =>
      modal.fields.some(
        (field, index) =>
          'required' in field && field.required && !values[`${field.label}-${index}`]?.trim(),
      ),
    [modal.fields, values],
  )

  const submit = async () => {
    // A guard, not just a disabled button: a double click fires both handlers
    // before React re-renders.
    if (saving) return
    setSaving(true)
    setError(null)

    const fields: Record<string, string> = {}
    modal.fields.forEach((field, index) => {
      const value = values[`${field.label}-${index}`]
      if (field.kind !== 'entries' && value?.trim()) fields[field.label] = value.trim()
    })
    // The first filled text field is what a list shows as the record's name.
    const title =
      modal.fields
        .map((field, index) => (field.kind === 'text' ? values[`${field.label}-${index}`]?.trim() : ''))
        .find(Boolean) ?? modal.title

    try {
      await onSubmit({ title, fields })
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title={modal.title} onClose={onClose} size="2xl" frame="record">
        <div className="grid gap-4 p-6 sm:grid-cols-3">
          {modal.fields.map((field, index) => (
            <Field
              key={`${field.label}-${index}`}
              field={field}
              value={values[`${field.label}-${index}`] ?? ''}
              onChange={(next) => setValues((prev) => ({ ...prev, [`${field.label}-${index}`]: next }))}
            />
          ))}
        </div>

        {error && (
          <p className="border-t border-line px-6 pt-4 text-[13px] text-bad" role="alert">
            {error}
          </p>
        )}

        <footer className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-[14px] font-medium text-fg-2 hover:bg-surface-2">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={missing || saving}
            title={missing ? 'Fill in the required fields' : undefined}
            className="rounded-xl bg-accent px-5 py-2 text-[14px] font-semibold text-white transition enabled:hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : modal.submit}
          </button>
        </footer>
    </Dialog>
  )
}
