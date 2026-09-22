'use client'

import { Link } from '../../lib/router'
import { ThemeSwitch } from '../../components/ThemeSwitch'
import { Button } from '../../components/ui'
import { PanelHeader } from './PortalPanel'
import { relativeTime } from '../../lib/relativeTime'
import { useAuth } from '../../lib/auth'
import { useNotifications } from '../../lib/useNotifications'
import { useInstallations } from '../../lib/useInstallations'
import { useOverview } from '../../lib/useWorkspaceSummary'

/**
 * The inbox.
 *
 * Notifications are this person's own, from the server. The "Pending
 * approvals" tiles and list that used to head this page read
 * `pendingApprovals` from a client constant — the same three fabricated items
 * for every workspace — and the "Total today" tile added that constant to an
 * unread count, so the headline figure was part real and part invented.
 * Approvals are now a real cross-domain queue with its own screen, so this
 * page links to it rather than counting it twice.
 */
export function Inbox() {
  const { notifications, unread, loading, error, canRetry, refetch, markRead, markAllRead } = useNotifications()

  return (
    <div className="mx-auto max-w-5xl pt-2">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          <span aria-hidden className="text-accent">
            ✉
          </span>
          Inbox
        </h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          Notifications addressed to you. {unread === undefined ? '' : `${unread} unread.`}
        </p>
      </header>

      <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
        <header className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
            <span aria-hidden className="text-accent">
              🔔
            </span>
            Notifications
          </h2>
          <div className="flex items-center gap-4">
            <Link to="/app/approvals" className="text-[13px] font-medium text-accent hover:underline">
              Approvals queue →
            </Link>
            {unread !== undefined && unread > 0 && (
              <button onClick={() => void markAllRead()} className="text-[13px] font-medium text-accent hover:underline">
                Mark all read
              </button>
            )}
          </div>
        </header>

        <div className="border-t border-line">
          {loading ? (
            <p className="py-10 text-center text-[14px] text-fg-muted">Loading…</p>
          ) : error ? (
            /* Not an empty list: "nothing is waiting" and "we could not ask"
               are different answers, and only one of them is reassuring. */
            <div className="px-5 py-10 text-center">
              <p className="text-[14px] text-fg-2">{error.message}</p>
              {canRetry && (
                <button onClick={refetch} className="mt-3 text-[13px] font-medium text-accent hover:underline">
                  Try again
                </button>
              )}
            </div>
          ) : notifications.length ? (
            <ul className="divide-y divide-line">
              {notifications.map((item) => (
                <li key={item.id} className={item.readAt ? '' : 'bg-ok-muted/30'}>
                  <button
                    onClick={() => void markRead(item.id)}
                    className="flex w-full items-start gap-3 px-5 py-4 text-left"
                  >
                    <span aria-hidden className="mt-0.5 text-accent">
                      🕐
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{item.title}</span>
                      {item.body && <span className="mt-0.5 block text-[13px] text-fg-muted">{item.body}</span>}
                    </span>
                    <span className="shrink-0 text-[12px] text-fg-muted">{relativeTime(item.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-[14px] text-fg-muted">Nothing waiting on you right now.</p>
          )}
        </div>
      </section>
    </div>
  )
}

export function Account() {
  const { session, signOut } = useAuth()
  const { apps, entitlement } = useInstallations()
  const overview = useOverview()

  const installed = apps.filter((app) => app.status && app.status !== 'uninstalled').length
  const credits = overview.data?.credits

  return (
    <div className="mx-auto max-w-3xl pt-2">
      <PanelHeader title="Account & plan" blurb="Your profile, your tenant's plan, and what it currently uses." />

      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-sm font-semibold">Profile</h2>
        <dl className="mt-4 space-y-3 text-[13px]">
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">Name</dt>
            <dd className="font-medium">{session?.user.fullName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">Email</dt>
            <dd className="font-medium">{session?.user.email}</dd>
          </div>
          {/* "Role: Org Admin" was a literal shown to everybody, including
              viewers. It is gone rather than guessed; the members screen shows
              real roles. Two-factor is gone with it: it could only ever say
              "Not enabled", because nothing can enable it. */}
        </dl>
      </section>

      <section className="mt-5 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <p className="mt-1.5 text-[13px] text-fg-muted">
          Light, dark, or whatever this device is set to. Saved on this browser.
        </p>
        <div className="mt-4">
          <ThemeSwitch />
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-sm font-semibold">Plan</h2>
        <dl className="mt-4 space-y-3 text-[13px]">
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">Current plan</dt>
            <dd className="font-medium">
              {entitlement?.planName ?? 'No plan'}
              {entitlement?.trialDaysLeft !== null && entitlement?.trialDaysLeft !== undefined
                ? entitlement.trialDaysLeft === 0
                  ? ' — trial ended'
                  : ` — ${entitlement.trialDaysLeft} day${entitlement.trialDaysLeft === 1 ? '' : 's'} left`
                : ''}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">AI Credits</dt>
            <dd className="font-medium">
              {credits ? `${credits.used.toLocaleString()} / ${credits.granted.toLocaleString()} used` : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">Apps</dt>
            <dd className="font-medium">
              {installed}
              {entitlement?.appQuota === null || entitlement === undefined ? ' installed' : ` / ${entitlement.appQuota} installed`}
            </dd>
          </div>
        </dl>
        <Link to="/#pricing" className="mt-5 inline-block text-[13px] font-medium text-accent hover:underline">
          Compare plans →
        </Link>
      </section>

      <div className="mt-6">
        <Button variant="secondary" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
