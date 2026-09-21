'use client'

import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'
import { relativeTime } from '../../lib/relativeTime'
import { useWorkspace, type Runner } from '../../lib/workspace'

const statusLabel: Record<Runner['status'], { label: string; tone: string }> = {
  pending: { label: 'Pending pairing', tone: 'bg-warn-muted text-warn' },
  online: { label: 'Online', tone: 'bg-ok-muted text-ok' },
  offline: { label: 'Offline', tone: 'bg-surface-2 text-fg-muted' },
}

/**
 * The pairing dialog. The live product hands back a token once the form is
 * submitted; the token and the install command below it are this rebuild's own,
 * since that step was not screenshotted.
 */
function PairDialog({ onClose }: { onClose: () => void }) {
  const { pairRunner } = useWorkspace()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [issued, setIssued] = useState<Runner | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[18px] font-semibold">Pair new runner</h2>
          <button onClick={onClose} aria-label="Close" className="text-fg-muted transition hover:text-fg">
            ✕
          </button>
        </div>

        {issued ? (
          <>
            <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
              <span className="font-medium text-fg">{issued.name}</span> is registered and waiting. Run the command
              below on a host inside your network — the runner dials out, so no inbound rule is needed. The token is
              shown once.
            </p>

            <div className="mt-4 rounded-xl border border-line bg-bg p-4">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Pairing token</p>
              <div className="mt-2 flex items-center gap-3">
                <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{issued.token}</code>
                <button
                  onClick={() => copy('token', issued.token)}
                  className="shrink-0 text-[12px] font-medium text-accent hover:underline"
                >
                  {copied === 'token' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-line bg-bg p-4">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Install command</p>
              <div className="mt-2 flex items-center gap-3">
                <code className="min-w-0 flex-1 truncate font-mono text-[13px]">
                  apragya runner install --token {issued.token}
                </code>
                <button
                  onClick={() => copy('command', `apragya runner install --token ${issued.token}`)}
                  className="shrink-0 text-[12px] font-medium text-accent hover:underline"
                >
                  {copied === 'command' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button variant="accent" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 grid gap-4">
              <label className="text-[13px] font-medium text-fg-2">
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="corp-network-prod"
                  className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
                />
              </label>
              <label className="text-[13px] font-medium text-fg-2">
                Description (optional)
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Runs in our datacenter VPC, reaches SAP Gateway"
                  className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] font-normal text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="accent"
                disabled={!name.trim()}
                onClick={() => setIssued(pairRunner({ name: name.trim(), description: description.trim() }))}
              >
                Generate pairing token
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function Runners() {
  const { runners, removeRunner } = useWorkspace()
  const [open, setOpen] = useState(false)

  return (
    <div className="pt-2">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="flex items-center gap-3 text-[28px] font-bold tracking-tight">
            <Icon name="server" size={26} className="text-accent" />
            Tenant Runners
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
            Install a runner inside your network so Apragya can reach firewalled on-prem systems (SAP Gateway, Oracle
            EBS, in-house apps) without opening inbound firewall rules.
          </p>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>
          + Pair new runner
        </Button>
      </header>

      {runners.length ? (
        <ul className="mt-6 space-y-3">
          {runners.map((runner) => (
            <li
              key={runner.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4"
            >
              <div className="min-w-[16rem] flex-1">
                <p className="text-[14px] font-medium">{runner.name}</p>
                <p className="mt-0.5 text-[12px] text-fg-muted">
                  {runner.description || 'No description'} · paired {relativeTime(runner.pairedAt)}
                </p>
              </div>
              <span
                className={`rounded-lg px-2.5 py-1 text-[12px] font-medium ${statusLabel[runner.status].tone}`}
              >
                {statusLabel[runner.status].label}
              </span>
              <Button variant="secondary" className="!py-2 !text-[13px]" onClick={() => removeRunner(runner.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed border-line px-6 py-16 text-center text-[15px] text-fg-muted">
          No runners yet. Click <em>Pair new runner</em> to get started.
        </p>
      )}

      {open && <PairDialog onClose={() => setOpen(false)} />}
    </div>
  )
}
