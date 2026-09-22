'use client'

import { AppChrome } from '../../../components/AppChrome'
import { crmTabs } from '../../../lib/crmData'
import { useInstallations } from '../../../lib/useInstallations'
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
  /*
   * The trial figure is the subscription's, computed by `entitlement()` from
   * `subscriptions.trial_ends_at`. It used to be the constant TRIAL_DAYS = 13,
   * so every workspace claimed thirteen days forever — including ones whose
   * trial had ended and ones that never had one. Reading it from the shared
   * installations context means this tab and the sidebar cannot disagree.
   */
  const { entitlement } = useInstallations()

  return (
    <AppChrome
      icon="💼"
      tone="bg-blue-500"
      name="CRM"
      blurb="Manage your sales pipeline, track deals, and close more revenue"
      trialDaysLeft={entitlement?.trialDaysLeft ?? 0}
      tabs={crmTabs}
    >
      {(tab) => {
        const Panel = panels[tab] ?? CrmDashboard
        return <Panel />
      }}
    </AppChrome>
  )
}
