'use client'

import { AppSideChrome } from '../../../components/AppSideChrome'
import { hrGroups, hrPageById } from '../../../lib/hrData'
import { useWorkspace } from '../../../lib/workspace'
import { HrDashboard, HrPagePanel, HrSettings } from './panels'

export default function Hr() {
  const { trialDaysLeft } = useWorkspace()

  return (
    <AppSideChrome
      icon="👥"
      tone="bg-violet-500"
      name="HR & People Ops"
      blurb="Employee management, leave tracking, attendance, departments, and company announcements."
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
