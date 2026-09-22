'use client'

import { useState } from 'react'
import { Link } from '../../../lib/router'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { useWorkspace } from '../../../lib/workspace'

const swatches = [
  { key: 'primary' as const, label: 'Primary', hint: 'Cover background, headers' },
  { key: 'accent' as const, label: 'Accent', hint: 'CTAs, highlights' },
  { key: 'dark' as const, label: 'Dark', hint: 'Footer bars, dark text' },
]

export default function BrandKitPane() {
  const { brandKit, updateBrandKit } = useWorkspace()
  const [draft, setDraft] = useState(brandKit)
  const dirty = JSON.stringify(draft) !== JSON.stringify(brandKit)

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const field =
    'mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] placeholder:text-fg-muted focus:border-accent focus:outline-none'
  const caption = 'text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase'

  return (
    <div>
      <Link to="/app/pitch-pilot" className="text-[13px] text-fg-2 transition hover:text-accent">
        ← Dashboard
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Brand Kit</h1>
          {/*
            * "All saved" used to appear in the ok colour whenever the draft
            * matched local state — which is true on mount, before anything has
            * been saved anywhere. Nothing here reaches a server.
            */}
          <p className="mt-2 text-[14px] text-fg-muted">
            Firm name, palette and contact strip. Kept in this browser only: no deck rendering exists yet, so
            nothing reads these values.
          </p>
        </div>
        <Button variant="accent" disabled={!dirty} onClick={() => updateBrandKit(draft)}>
          <Icon name="file-text" size={15} /> Save
        </Button>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_20rem]">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="flex items-center gap-2.5 text-[16px] font-semibold">
            <Icon name="user" size={17} className="text-accent" />
            Firm identity
          </h2>

          <div className="mt-5">
            <p className={caption}>Firm name</p>
            <input
              value={draft.firmName}
              onChange={(event) => set('firmName', event.target.value)}
              placeholder="Bright Path Digital"
              aria-label="Firm name"
              className={field}
            />
            <p className="mt-2 text-[12px] text-fg-muted">Used on cover, footer, and CTA slides.</p>
          </div>

          <div className="mt-5">
            <p className={caption}>Logo</p>
            <div className="mt-2 flex flex-wrap items-start gap-4">
              <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-2">
                {draft.logoUrl ? (
                  <img src={draft.logoUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Icon name="image" size={22} className="text-fg-muted" />
                )}
              </span>
              <div className="min-w-[16rem] flex-1">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2">
                  <Icon name="download" size={15} className="rotate-180" /> Upload logo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (!file) return
                      // Held as a data URL so the preview survives a reload.
                      const reader = new FileReader()
                      reader.onload = () => set('logoUrl', (typeof reader.result === 'string' ? reader.result : ''))
                      reader.readAsDataURL(file)
                    }}
                  />
                </label>
                <input
                  value={draft.logoUrl.startsWith('data:') ? '' : draft.logoUrl}
                  onChange={(event) => set('logoUrl', event.target.value)}
                  placeholder="…or paste an https:// URL"
                  aria-label="Logo URL"
                  className={`${field} font-mono text-[13px]`}
                />
                {/* The 4 MB limit was advertised and never enforced: the file
                    was read into a data URL and written to localStorage, where
                    a large one can exceed the quota and lose the whole store. */}
                <p className="mt-2 text-[12px] text-fg-muted">
                  PNG, JPEG, GIF or WebP. Kept in this browser, so keep it small — nothing renders a deck yet.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="h-fit rounded-2xl border border-line bg-surface p-5">
          <p className={caption}>Cover preview</p>
          <div className="mt-3 rounded-xl px-5 py-8" style={{ background: draft.primary }}>
            <p className="text-[10px] font-semibold tracking-[0.1em] uppercase" style={{ color: draft.accent }}>
              A proposal for
            </p>
            <p className="mt-1.5 text-[19px] font-bold text-white">{'{{client_name}}'}</p>
            <p
              className="mt-6 text-[10px] font-semibold tracking-[0.1em] uppercase"
              style={{ color: draft.accent }}
            >
              Prepared by
            </p>
            <p className="mt-1.5 text-[15px] font-semibold text-white">{draft.firmName || '{{Firm Name}}'}</p>
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[20rem_1fr]">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="flex items-center gap-2.5 text-[16px] font-semibold">
            <Icon name="palette" size={17} className="text-accent" />
            Color palette
          </h2>
          <ul className="mt-5 space-y-4">
            {swatches.map((swatch) => (
              <li key={swatch.key} className="flex items-center gap-4">
                <input
                  type="color"
                  aria-label={`${swatch.label} colour`}
                  value={draft[swatch.key]}
                  onChange={(event) => set(swatch.key, event.target.value)}
                  className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-line"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">{swatch.label}</span>
                  <span className="mt-0.5 block text-[12px] text-fg-muted">{swatch.hint}</span>
                </span>
                <input
                  value={draft[swatch.key]}
                  onChange={(event) => set(swatch.key, event.target.value)}
                  aria-label={`${swatch.label} hex`}
                  className="w-24 rounded-lg border border-line bg-bg px-2.5 py-1.5 font-mono text-[12px] focus:border-accent focus:outline-none"
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[16px] font-semibold">Contact strip</h2>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Goes on the CTA slide — your principal&apos;s name + how the client reaches you after the pitch.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label>
              <span className={caption}>Contact name</span>
              <input
                value={draft.contactName}
                onChange={(event) => set('contactName', event.target.value)}
                placeholder="Mira Kapoor"
                className={field}
              />
            </label>
            <label>
              <span className={caption}>Title</span>
              <input
                value={draft.contactTitle}
                onChange={(event) => set('contactTitle', event.target.value)}
                placeholder="Agency Principal"
                className={field}
              />
            </label>
            <label>
              <span className={caption}>Email</span>
              <input
                value={draft.contactEmail}
                onChange={(event) => set('contactEmail', event.target.value)}
                placeholder="e.g. mira@brightpath.in"
                className={field}
              />
            </label>
            <label>
              <span className={caption}>Phone</span>
              <input
                value={draft.contactPhone}
                onChange={(event) => set('contactPhone', event.target.value)}
                placeholder="e.g. +91 98..."
                className={field}
              />
            </label>
          </div>
        </section>
      </div>

      {/*
        * The sample-data section is gone with `loadPitchSample`. It wrote four
        * invented RFPs — named prospects with dollar values — into the
        * workspace, and the banner above then called them yours.
        */}
    </div>
  )
}
