'use client'

import { Link } from '../../lib/router'
import { ThemeSwitch } from '../../components/ThemeSwitch'
import { Button } from '../../components/ui'
import { PanelHeader } from './PortalPanel'
import { relativeTime } from '../../lib/relativeTime'
import { useAuth } from '../../lib/auth'
import { useWorkspace } from '../../lib/workspace'
import { pendingApprovals } from '../../lib/appData'
import { CountUp } from '../../components/CountUp'

export function Inbox() {
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead, approvals } = useWorkspace()
  const pending = pendingApprovals.filter((item) => !approvals[item.id])

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
          Everything that needs your attention today — approvals, mentions, system alerts.
        </p>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Pending approvals', value: pending.length, sub: 'HITL queue', tone: 'text-warn' },
          { label: 'Unread notifications', value: unreadCount, sub: 'Mentions + alerts', tone: 'text-accent' },
          { label: 'Total today', value: pending.length + unreadCount, sub: 'Combined activity', tone: 'text-fg' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">{stat.label}</p>
            <p className={`mt-2.5 text-3xl font-bold ${stat.tone}`}>
              <CountUp value={stat.value} />
            </p>
            <p className="mt-1.5 text-[12px] text-fg-muted">{stat.sub}</p>
          </div>
        ))}
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface">
        <header className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
            <span aria-hidden className="text-warn">
              👤
            </span>
            Pending Approvals
          </h2>
          <Link to="/app/approvals" className="text-[13px] font-medium text-accent hover:underline">
            Open Approvals queue →
          </Link>
        </header>

        <div className="border-t border-line">
          {pending.length ? (
            <ul className="divide-y divide-line">
              {pending.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-[16rem] flex-1">
                    <p className="text-[14px] font-medium">{item.agent}</p>
                    <p className="mt-0.5 text-[13px] text-fg-muted">{item.summary}</p>
                  </div>
                  <Link to="/app/approvals" className="text-[13px] font-medium text-accent hover:underline">
                    Review →
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-[14px] text-fg-muted">Nothing waiting on you right now. ✨</p>
          )}
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface">
        <header className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
            <span aria-hidden className="text-accent">
              🔔
            </span>
            Notifications & @Mentions
          </h2>
          {unreadCount > 0 ? (
            <button onClick={markAllNotificationsRead} className="text-[13px] font-medium text-accent hover:underline">
              Mark all read
            </button>
          ) : (
            <span className="text-[13px] text-fg-muted">Full notifications →</span>
          )}
        </header>

        <div className="border-t border-line">
          {notifications.length ? (
            <ul className="divide-y divide-line">
              {notifications.map((item) => (
                <li key={item.id} className={item.read ? '' : 'bg-ok-muted/30'}>
                  <button
                    onClick={() => markNotificationRead(item.id)}
                    className="flex w-full items-start gap-3 px-5 py-4 text-left"
                  >
                    <span aria-hidden className="mt-0.5 text-accent">
                      🕐
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{item.title}</span>
                      <span className="mt-0.5 block text-[13px] text-fg-muted">{item.body}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-fg-muted">{relativeTime(item.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-[14px] text-fg-muted">No notifications yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}

export function Account() {
  const { session, signOut } = useAuth()
  const { creditsUsed, creditsTotal, installed, appQuota, trialDaysLeft, twoFactor } = useWorkspace()

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
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">Role</dt>
            <dd className="font-medium">Org Admin</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">Two-factor auth</dt>
            <dd className={`font-medium ${twoFactor === 'on' ? 'text-ok' : 'text-warn'}`}>
              {twoFactor === 'on' ? 'Enabled' : 'Not enabled'}
            </dd>
          </div>
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
            <dd className="font-medium">Trial — {trialDaysLeft} days left</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">AI Credits</dt>
            <dd className="font-medium">
              {creditsUsed.toLocaleString()} / {creditsTotal.toLocaleString()} used
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">Apps</dt>
            <dd className="font-medium">
              {installed.length} / {appQuota} installed
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
