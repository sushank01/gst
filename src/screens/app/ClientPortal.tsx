'use client'

import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Link, useSearchParams } from '../../lib/router'
import { Button } from '../../components/ui'
import { portalScopes, portalTabs, scopeHelp } from '../../lib/portalData'
import { relativeTime } from '../../lib/relativeTime'
import { useWorkspace, type PortalPermission, type PortalRole } from '../../lib/workspace'

const tabs = ['Tabs', 'Roles', 'Users', 'Audit'] as const
type Tab = (typeof tabs)[number]

const allTabIds = portalTabs.map((tab) => tab.id)

/** Which portal tabs are on. `null` means untouched, i.e. everything. */
function useEnabledTabs() {
  const { portalTabs: stored } = useWorkspace()
  return stored ?? allTabIds
}

function TabsPane() {
  const { setPortalTabs } = useWorkspace()
  const saved = useEnabledTabs()
  const [draft, setDraft] = useState<string[]>(saved)

  const dirty = draft.length !== saved.length || draft.some((id) => !saved.includes(id))
  const summary =
    draft.length === allTabIds.length
      ? 'All tabs enabled - partner users see the full portal.'
      : `${draft.length} of ${allTabIds.length} tabs enabled - the rest are hidden from partner users.`

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="p-6">
        <h2 className="text-[17px] font-semibold">Tabs visible to partner users</h2>
        <p className="mt-1.5 text-[14px] text-fg-muted">{summary}</p>

        <ul className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {portalTabs.map((tab) => (
            <li key={tab.id}>
              <label className="flex items-center gap-3 rounded-xl border border-line px-4 py-2.5 text-[14px]">
                <input
                  type="checkbox"
                  checked={draft.includes(tab.id)}
                  onChange={(event) =>
                    setDraft((prev) =>
                      event.target.checked ? [...prev, tab.id] : prev.filter((id) => id !== tab.id),
                    )
                  }
                  className="h-4 w-4 accent-accent"
                />
                <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                <span className="shrink-0 font-mono text-[11px] text-fg-muted">{tab.id}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-6 py-4">
        <p className="flex items-center gap-2 text-[13px] text-fg-muted">
          <Icon name="alert-triangle" size={15} className="text-warn" />
          Overview + login pages stay always-on.
        </p>
        <Button variant="accent" disabled={!dirty} onClick={() => setPortalTabs(draft)}>
          Save changes
        </Button>
      </div>
    </section>
  )
}

const fullAccess = (): Record<string, PortalPermission> =>
  Object.fromEntries(portalTabs.map((tab) => [tab.id, { read: true, comment: true, download: true, hidden: [] }]))

function NewRoleDialog({ onClose }: { onClose: () => void }) {
  const { addPortalRole } = useWorkspace()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [scope, setScope] = useState<string>(portalScopes[0])
  const [permissions, setPermissions] = useState<Record<string, PortalPermission>>(fullAccess)

  function toggle(tabId: string, key: 'read' | 'comment' | 'download') {
    setPermissions((prev) => ({ ...prev, [tabId]: { ...prev[tabId], [key]: !prev[tabId][key] } }))
  }

  function toggleHidden(tabId: string, field: string) {
    setPermissions((prev) => {
      const hidden = prev[tabId].hidden
      return {
        ...prev,
        [tabId]: {
          ...prev[tabId],
          hidden: hidden.includes(field) ? hidden.filter((item) => item !== field) : [...hidden, field],
        },
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="max-h-[88dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-surface p-7">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[20px] font-semibold">New portal role</h2>
          <span aria-hidden className="text-fg-muted">
            ◈
          </span>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="text-[13px] text-fg-2">
            Name *
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. portal_viewer"
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
          </label>
          <label className="text-[13px] text-fg-2">
            Description
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short label admins see"
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        <label className="mt-5 flex items-center gap-3 text-[13px] text-fg-2">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(event) => setIsDefault(event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Default role for this tenant (used when a portal user has no explicit assignment).
        </label>

        <div className="mt-5 rounded-xl border border-line bg-surface-2/60 p-4">
          <p className="text-[13px] text-fg-2">Scope</p>
          <select
            aria-label="Scope"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] focus:border-accent focus:outline-none"
          >
            {portalScopes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <p className="mt-2.5 text-[12px] text-fg-muted">{scopeHelp[scope]}</p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[42rem] border-collapse text-[13px]">
            <thead className="border-b border-line text-[12px] text-fg-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Tab
                </th>
                {['Read', 'Comment', 'Download'].map((column) => (
                  <th key={column} scope="col" className="px-4 py-3 text-left font-medium">
                    {column}
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Hidden fields
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {portalTabs.map((tab) => (
                <tr key={tab.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{tab.label}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-fg-muted">{tab.id}</p>
                  </td>
                  {(['read', 'comment', 'download'] as const).map((key) => (
                    <td key={key} className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`${key} ${tab.label}`}
                        checked={permissions[tab.id][key]}
                        onChange={() => toggle(tab.id, key)}
                        className="h-4 w-4 accent-accent"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    {tab.maskable.length ? (
                      <span className="flex flex-wrap gap-2">
                        {tab.maskable.map((field) => {
                          const hidden = permissions[tab.id].hidden.includes(field)
                          return (
                            <button
                              key={field}
                              onClick={() => toggleHidden(tab.id, field)}
                              aria-pressed={hidden}
                              className={`rounded-lg px-2.5 py-1 font-mono text-[11px] transition ${
                                hidden ? 'bg-accent text-white' : 'bg-surface-2 text-fg-2 hover:bg-surface'
                              }`}
                            >
                              {field}
                            </button>
                          )
                        })}
                      </span>
                    ) : (
                      <span className="text-[12px] text-fg-muted italic">no maskable fields</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!name.trim()}
            onClick={() => {
              addPortalRole({ name: name.trim(), description: description.trim(), isDefault, scope, permissions })
              onClose()
            }}
          >
            ⎘ Create role
          </Button>
        </div>
      </div>
    </div>
  )
}

function RolesPane() {
  const { portalRoles, removePortalRole } = useWorkspace()
  const [open, setOpen] = useState(false)

  const summarise = (role: PortalRole) => {
    const readable = Object.values(role.permissions).filter((item) => item.read).length
    const masked = Object.values(role.permissions).reduce((sum, item) => sum + item.hidden.length, 0)
    return `${readable} of ${portalTabs.length} tabs readable · ${masked} field${masked === 1 ? '' : 's'} masked`
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-[17px] font-semibold">Portal roles</h2>
        <Button variant="accent" onClick={() => setOpen(true)}>
          + New role
        </Button>
      </div>
      <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-fg-muted">
        Each portal user is assigned one role; missing role falls back to the default (star). System roles cannot be
        deleted but their permissions are editable.
      </p>

      {portalRoles.length ? (
        <ul className="mt-6 divide-y divide-line rounded-xl border border-line">
          {portalRoles.map((role) => (
            <li key={role.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
              <div className="min-w-[16rem] flex-1">
                <p className="flex items-center gap-2 text-[14px] font-medium">
                  {role.isDefault && (
                    <span aria-label="Tenant default" className="text-accent">
                      ★
                    </span>
                  )}
                  {role.name}
                </p>
                <p className="mt-0.5 text-[12px] text-fg-muted">
                  {role.description ? `${role.description} · ` : ''}
                  {role.scope.split(' - ')[0]} · {summarise(role)}
                </p>
              </div>
              <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => removePortalRole(role.id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 pb-4 text-center text-[14px] text-fg-muted italic">No portal roles defined.</p>
      )}

      {open && <NewRoleDialog onClose={() => setOpen(false)} />}
    </section>
  )
}

function UsersPane() {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="flex items-center gap-2.5 text-[17px] font-semibold">
        <Icon name="users" size={18} className="text-fg-muted" />
        Portal users
      </h2>
      <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-fg-muted">
        Assign a role per portal user. &quot;-&quot; means the tenant default role applies. Also editable from{' '}
        <Link to="/app/crm/contacts" className="text-accent hover:underline">
          Organization → Partners
        </Link>
        .
      </p>
      <p className="mt-8 pb-4 text-center text-[14px] text-fg-muted italic">
        No portal users yet. Invite one from a Contact&apos;s detail page.
      </p>
    </section>
  )
}

/** Portal-scoped slice of the tenant's own audit trail. */
function AuditPane() {
  const { audit } = useWorkspace()
  const entries = useMemo(() => audit.filter((event) => event.action.startsWith('portal.')), [audit])

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-[17px] font-semibold">Portal access changes</h2>
      <p className="mt-2 text-[14px] text-fg-muted">
        Every change to portal tabs, roles and assignments, newest first. The same entries appear in the tenant audit
        trail.
      </p>

      {entries.length ? (
        <ul className="mt-6 divide-y divide-line rounded-xl border border-line">
          {entries.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <span className="min-w-[12rem] flex-1 font-mono text-[12px]">{event.action}</span>
              <span className="text-[12px] text-fg-muted">{event.resourceId}</span>
              <span className="text-[12px] text-fg-muted">{relativeTime(event.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 pb-4 text-center text-[14px] text-fg-muted italic">No portal access changes recorded.</p>
      )}
    </section>
  )
}

export default function ClientPortal() {
  const [params, setParams] = useSearchParams()
  const active = (tabs.find((item) => item.toLowerCase() === params.get('tab')) ?? 'Tabs') as Tab

  return (
    <div className="mx-auto max-w-4xl pt-2">
      <header>
        <h1 className="flex items-center gap-3 text-[24px] font-bold tracking-tight">
          <Icon name="shield" size={24} className="text-accent" />
          Client Portal RBAC
        </h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          Control what customers see when they log into the portal. Changes apply on the next portal request.
        </p>
      </header>

      <div className="mt-6 flex items-start gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
        <Icon name="key" size={18} className="mt-0.5 text-warn" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Managing employee / role permissions?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
            Internal RBAC is a separate surface for org members - module-level add/view/edit/delete/run controls,
            tenant v3-flag cutover.
          </p>
        </div>
        <Link to="/app/setup" aria-label="Open internal RBAC" className="shrink-0 text-fg-muted hover:text-accent">
          ↗
        </Link>
      </div>

      <nav className="mt-6 flex gap-1 rounded-xl border border-line bg-surface p-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setParams({ tab: tab.toLowerCase() })}
            aria-current={active === tab ? 'page' : undefined}
            className={`rounded-lg px-4 py-1.5 text-[14px] transition ${
              active === tab ? 'bg-accent font-medium text-white' : 'text-fg-2 hover:bg-surface-2'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {active === 'Tabs' && <TabsPane />}
        {active === 'Roles' && <RolesPane />}
        {active === 'Users' && <UsersPane />}
        {active === 'Audit' && <AuditPane />}
      </div>
    </div>
  )
}
