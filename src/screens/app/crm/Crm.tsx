'use client'

import { AppChrome } from '../../../components/AppChrome'
import { crmTabs } from '../../../lib/crmData'
import { useWorkspace } from '../../../lib/workspace'
import {
  CrmActivities,
  CrmCalendar,
  CrmCompanies,
  CrmContacts,
  CrmDashboard,
  CrmDeals,
  CrmLeads,
  CrmReports,
  CrmSequences,
  CrmSettings,
} from './panels'

const panels: Record<string, () => React.ReactElement> = {
  dashboard: CrmDashboard,
  leads: CrmLeads,
  contacts: CrmContacts,
  companies: CrmCompanies,
  deals: CrmDeals,
  calendar: CrmCalendar,
  activities: CrmActivities,
  sequences: CrmSequences,
  reports: CrmReports,
  settings: CrmSettings,
}

export default function Crm() {
  const { trialDaysLeft } = useWorkspace()

  return (
    <AppChrome
      icon="💼"
      tone="bg-blue-500"
      name="CRM"
      blurb="Manage your sales pipeline, track deals, and close more revenue"
      trialDaysLeft={trialDaysLeft + 1}
      tabs={crmTabs}
    >
      {(tab) => {
        const Panel = panels[tab] ?? CrmDashboard
        return <Panel />
      }}
    </AppChrome>
  )
}
