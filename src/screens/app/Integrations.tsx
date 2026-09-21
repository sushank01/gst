'use client'

import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Link } from '../../lib/router'
import { Button } from '../../components/ui'
import { connectorById, connectors, oauthConnectors, type Connector } from '../../lib/connectorData'
import { useWorkspace } from '../../lib/workspace'

/** Auth type is the first thing an admin checks, so it carries its own hue. */
const authTone: Record<Connector['auth'], string> = {
  basic: 'tone-slate',
  oauth2: 'tone-violet',
  api_key: 'tone-sky',
  none: 'tone-emerald',
}

function AuthChip({ auth }: { auth: Connector['auth'] }) {
  return (
    <span className={`shrink-0 rounded-md px-2 py-1 font-mono text-[11px] ${authTone[auth]}`}>{auth}</span>
  )
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-fg-muted transition hover:text-fg">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Create a connection against one registered connector. */
function ConnectionDialog({ preset, onClose }: { preset?: string; onClose: () => void }) {
  const { addConnection } = useWorkspace()
  const [connectorId, setConnectorId] = useState(preset ?? connectors[0].id)
  const [name, setName] = useState('')
  const [account, setAccount] = useState('')
  const [secret, setSecret] = useState('')
  const connector = connectorById[connectorId]

  const needsSecret = connector.auth === 'api_key' || connector.auth === 'basic'

  return (
    <Dialog title="Add connection" onClose={onClose}>
      <p className="mt-1.5 text-[13px] text-fg-muted">Connections are private to your tenant.</p>

      <div className="mt-5 grid gap-4">
        <label className="text-[13px] font-medium">
          Connector
          <select
            value={connectorId}
            onChange={(event) => setConnectorId(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
          >
            {connectors.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[13px] font-medium">
          Connection name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Finance Slack workspace"
            className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
          />
        </label>
        <label className="text-[13px] font-medium">
          Account / endpoint
          <input
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            placeholder="host, workspace or account this connection points at"
            className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
          />
        </label>

        {connector.auth === 'oauth2' ? (
          <p className="rounded-xl border border-line bg-bg px-4 py-3 text-[13px] leading-relaxed text-fg-muted">
            {connector.name.split(' (')[0]} authorises in its own consent screen. This rebuild has no OAuth client
            registered, so the connection is saved unauthorised — a real tenant would finish the handshake here.
          </p>
        ) : needsSecret ? (
          <label className="text-[13px] font-medium">
            API key / password
            <input
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
            />
            <span className="mt-1.5 block text-[12px] font-normal text-fg-muted">
              Never persisted. Only the last four characters are kept, so the row stays recognisable.
            </span>
          </label>
        ) : (
          <p className="rounded-xl border border-line bg-bg px-4 py-3 text-[13px] text-fg-muted">
            This connector needs no credentials.
          </p>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="accent"
          disabled={!name.trim()}
          onClick={() => {
            addConnection({
              connectorId,
              name: name.trim(),
              account: account.trim(),
              secretHint: secret ? `••••${secret.slice(-4)}` : '',
            })
            onClose()
          }}
        >
          Save connection
        </Button>
      </div>
    </Dialog>
  )
}

function OAuthAppsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="OAuth Apps" onClose={onClose}>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
        Connectors that authorise through OAuth 2.0 need a client registered with the provider before anyone in the
        tenant can connect. None are registered here — this rebuild holds no client ids or secrets.
      </p>
      <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
        {oauthConnectors.map((connector) => (
          <li key={connector.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="min-w-0 flex-1 truncate text-[13px]">{connector.name.split(' (')[0]}</span>
            <span className="shrink-0 rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-muted">
              Not registered
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  )
}

function CustomConnectorDialog({ mode, onClose }: { mode: 'manual' | 'openapi'; onClose: () => void }) {
  const { addCustomConnector } = useWorkspace()
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [auth, setAuth] = useState('api_key')
  const [spec, setSpec] = useState('')
  const [error, setError] = useState<string | null>(null)

  /** Pull the name, server and operation count straight out of a pasted spec. */
  function importSpec() {
    try {
      const parsed = JSON.parse(spec) as {
        info?: { title?: string }
        servers?: { url?: string }[]
        paths?: Record<string, Record<string, unknown>>
      }
      const operations = Object.values(parsed.paths ?? {}).reduce(
        (sum, methods) => sum + Object.keys(methods ?? {}).length,
        0,
      )
      if (!parsed.info?.title) {
        setError('That spec has no info.title — is it an OpenAPI document?')
        return
      }
      addCustomConnector({
        name: parsed.info.title,
        baseUrl: parsed.servers?.[0]?.url ?? '',
        auth: 'from spec',
        operations,
        source: 'openapi',
      })
      onClose()
    } catch {
      setError('That is not valid JSON. Paste the spec itself, not a link to it.')
    }
  }

  return (
    <Dialog title={mode === 'openapi' ? 'Import OpenAPI' : 'New connector'} onClose={onClose}>
      {mode === 'openapi' ? (
        <>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Paste an OpenAPI 3 document. The name, server and operation count are read from the spec.
          </p>
          <textarea
            value={spec}
            onChange={(event) => {
              setSpec(event.target.value)
              setError(null)
            }}
            rows={10}
            placeholder={'{\n  "openapi": "3.0.0",\n  "info": { "title": "Internal ERP" },\n  "servers": [...]\n}'}
            className="mt-4 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 font-mono text-[12px] focus:border-accent focus:outline-none"
          />
          {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="accent" disabled={!spec.trim()} onClick={importSpec}>
              Import
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-5 grid gap-4">
            <label className="text-[13px] font-medium">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Internal ERP"
                className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
              />
            </label>
            <label className="text-[13px] font-medium">
              Base URL
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://erp.internal/api/v1"
                className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
              />
            </label>
            <label className="text-[13px] font-medium">
              Auth
              <select
                value={auth}
                onChange={(event) => setAuth(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal focus:border-accent focus:outline-none"
              >
                {['api_key', 'basic', 'oauth2', 'none'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!name.trim()}
              onClick={() => {
                addCustomConnector({
                  name: name.trim(),
                  baseUrl: baseUrl.trim(),
                  auth,
                  operations: 0,
                  source: 'manual',
                })
                onClose()
              }}
            >
              Create connector
            </Button>
          </div>
        </>
      )}
    </Dialog>
  )
}

export default function Integrations() {
  const { connections, customConnectors, removeConnection, removeCustomConnector } = useWorkspace()
  const [connectionFor, setConnectionFor] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [oauthOpen, setOauthOpen] = useState(false)
  const [custom, setCustom] = useState<'manual' | 'openapi' | null>(null)

  return (
    <div className="pt-2">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="flex items-center gap-3 text-[28px] font-bold tracking-tight">
            <Icon name="plug-zap" size={26} className="text-accent" />
            Integrations
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
            Connect Apragya to external systems — Slack, SharePoint, FTP, CRMs and more. Connections are private to
            your tenant.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/app/setup"
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] text-fg-2 transition hover:text-accent"
          >
            <span aria-hidden>←</span> Back to Admin
          </Link>
          <button
            onClick={() => setOauthOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
          >
            <Icon name="key" size={15} /> OAuth Apps
          </button>
          <Button variant="accent" onClick={() => setAdding(true)}>
            + Add connection
          </Button>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
          <Icon name="plug" size={17} className="text-fg-muted" />
          Your connections
          <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-normal text-fg-muted">
            {connections.length} total
          </span>
        </h2>

        {connections.length ? (
          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {connections.map((connection) => (
              <li key={connection.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                <div className="min-w-[14rem] flex-1">
                  <p className="text-[14px] font-medium">{connection.name}</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">
                    {connectorById[connection.connectorId]?.name ?? connection.connectorId}
                    {connection.account ? ` · ${connection.account}` : ''}
                    {connection.secretHint ? ` · ${connection.secretHint}` : ''}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="!py-2 !text-[13px]"
                  onClick={() => removeConnection(connection.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-line px-6 py-14 text-center">
            <Icon name="plug" size={26} className="mx-auto text-fg-muted" />
            <p className="mt-3 text-[16px] font-medium">No connections yet</p>
            <p className="mt-1.5 text-[13px] text-fg-muted">
              Click “Add connection” to link an external system.
            </p>
            <Button variant="accent" className="mt-5" onClick={() => setAdding(true)}>
              + Add connection
            </Button>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-[15px] font-semibold">Available connectors</h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          Connectors registered on this platform. Install one to create a connection.
        </p>

        <ul className="mt-5 grid gap-4 lg:grid-cols-2">
          {connectors.map((connector) => (
            <li key={connector.id}>
              <button
                onClick={() => setConnectionFor(connector.id)}
                className="h-full w-full rounded-xl border border-line bg-surface-2/60 p-4 text-left transition hover:border-accent"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[15px] font-semibold">{connector.name}</span>
                  <AuthChip auth={connector.auth} />
                </span>
                {connector.blurb && (
                  <span className="mt-1.5 block text-[13px] leading-relaxed text-fg-muted">{connector.blurb}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
              <Icon name="plug" size={17} className="text-fg-muted" />
              Custom Connectors
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
              Connect this tenant’s in-house ERP, SaaS, or any REST API without platform engineering. Shows up in the
              Workflow Canvas alongside platform connectors.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setCustom('openapi')}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-2 transition hover:bg-surface-2"
            >
              <span aria-hidden>⎘</span> Import OpenAPI
            </button>
            <Button variant="accent" onClick={() => setCustom('manual')}>
              + New connector
            </Button>
          </div>
        </div>

        {customConnectors.length ? (
          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {customConnectors.map((connector) => (
              <li key={connector.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                <div className="min-w-[14rem] flex-1">
                  <p className="text-[14px] font-medium">{connector.name}</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">
                    {connector.baseUrl || 'No base URL'} · {connector.auth}
                    {connector.source === 'openapi' ? ` · ${connector.operations} operations from spec` : ''}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="!py-2 !text-[13px]"
                  onClick={() => removeCustomConnector(connector.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 py-10 text-center text-[14px] text-fg-muted">
            No custom connectors yet. Click <em>New connector</em> or paste an OpenAPI spec to get started.
          </p>
        )}
      </section>

      {(adding || connectionFor) && (
        <ConnectionDialog
          preset={connectionFor ?? undefined}
          onClose={() => {
            setAdding(false)
            setConnectionFor(null)
          }}
        />
      )}
      {oauthOpen && <OAuthAppsDialog onClose={() => setOauthOpen(false)} />}
      {custom && <CustomConnectorDialog mode={custom} onClose={() => setCustom(null)} />}
    </div>
  )
}
