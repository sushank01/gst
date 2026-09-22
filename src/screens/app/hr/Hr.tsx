'use client'

import { AppSideChrome } from '../../../components/AppSideChrome'
import { hrGroups, hrPageById } from '../../../lib/hrData'
import { useInstallations } from '../../../lib/useInstallations'
import { HrDashboard, HrPagePanel, HrSettings } from './panels'

export default function Hr() {
  const { entitlement } = useInstallations()

  /*
   * The trial length used to be a constant in browser state, so the badge read
   * "13 days left" forever — wrong from the second day of any trial, and shown
   * to workspaces that never had one. This is the subscription's own figure,
   * computed from trial_ends_at.
   *
   * KNOWN LIE, not yet fixed here. The server answers null when there is no
   * trial, but AppSideChrome types the prop as `number` and renders the badge
   * unconditionally, so every workspace that is not on a trial — every paying
   * one — reads "Trial · 0 days left", and so does every workspace for the
   * moment before /apps answers. Nothing in this file can suppress it.
   *
   * The remaining half of the fix is one change in
   * src/components/AppSideChrome.tsx: widen the prop to `number | null` and
   * render the badge only when it is a number, the way AppSidebar, Overview,
   * workspace.tsx and SalesPos already do. That component has exactly one
   * consumer — this screen — so it is not shared with CRM, which uses the
   * separate AppChrome; it is simply outside this pass's ownership.
   */
  const trialDaysLeft = entitlement?.trialDaysLeft ?? 0

  return (
    <AppSideChrome
      icon="👥"
      tone="bg-violet-500"
      name="HR & People Ops"
      blurb="Employee management, leave tracking, attendance, departments, and company announcements."
      // Nothing in the product tracks an HR application version, so the shell's
      // default "v1.0.0" is a claim with nothing behind it.
      version=""
      trialDaysLeft={trialDaysLeft}
      groups={hrGroups}
      defaultPage="dashboard"
    >
      {(pageId) => {
        if (pageId === 'dashboard') return <HrDashboard />
        if (pageId === 'settings') return <HrSettings />

        const page = hrPageById.get(pageId)
        return page ? <HrPagePanel key={page.id} page={page} /> : <HrDashboard />
      }}
    </AppSideChrome>
  )
}
