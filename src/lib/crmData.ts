/** CRM app data, transcribed from apragya.ai/apps/crm. */

export type Stage = { name: string; probability: number; tone: string }

/** The default Sales Pipeline, with each stage's win probability. */
export const pipelineStages: Stage[] = [
  { name: 'New', probability: 5, tone: 'bg-emerald-400' },
  { name: 'Qualification', probability: 15, tone: 'bg-teal-400' },
  { name: 'Discovery', probability: 25, tone: 'bg-teal-500' },
  { name: 'Demo', probability: 40, tone: 'bg-emerald-500' },
  { name: 'Proposal Sent', probability: 60, tone: 'bg-amber-400' },
  { name: 'Negotiation', probability: 75, tone: 'bg-amber-500' },
  { name: 'Management Approval', probability: 85, tone: 'bg-amber-600' },
  { name: 'Contract Review', probability: 90, tone: 'bg-yellow-700' },
  { name: 'Won', probability: 100, tone: 'bg-emerald-700' },
  { name: 'Lost', probability: 0, tone: 'bg-red-500' },
]

/** The dashboard's Pipeline flow lists every stage except Lost. */
export const flowStages = pipelineStages.filter((stage) => stage.name !== 'Lost')

export const crmTabs = [
  { id: 'dashboard', icon: '▥', label: 'Dashboard' },
  { id: 'leads', icon: '▦', label: 'Leads' },
  { id: 'contacts', icon: '👥', label: 'Contacts' },
  { id: 'companies', icon: '🏢', label: 'Companies' },
  { id: 'deals', icon: '⚡', label: 'Deals' },
  { id: 'calendar', icon: '▤', label: 'Calendar' },
  { id: 'activities', icon: '🗓', label: 'Follow-ups' },
  { id: 'sequences', icon: '▦', label: 'Sequences' },
  { id: 'reports', icon: '📄', label: 'Reports' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
] as const

export type CrmTabId = (typeof crmTabs)[number]['id']

export const leadStatuses = ['All', 'New', 'Contacted', 'Qualified', 'Converted', 'Unqualified']
export const contactTypes = ['All', 'Prospect', 'Client', 'Vendor', 'Supplier', 'Lead']

/** Settings navigation, with the counts the live app shows against each group. */
export const settingsGroups = [
  {
    id: 'pipeline',
    label: 'Pipeline & Data',
    count: 7,
    items: [
      { icon: '⇅', label: 'Pipelines & stages' },
      { icon: '▤', label: 'Custom fields' },
      { icon: '⧩', label: 'Lead sources' },
      { icon: '▤', label: 'Master taxonomies' },
      { icon: '▦', label: 'Appointment booking' },
      { icon: '⌫', label: 'Data cleansing' },
      { icon: '▤', label: 'Field layouts' },
    ],
  },
  {
    id: 'people',
    label: 'People & Work',
    count: 6,
    items: [
      { icon: '👤', label: 'Teams & territories' },
      { icon: '⚖', label: 'Assignment rules' },
      { icon: '🎯', label: 'Targets & quotas' },
      { icon: '☑', label: 'Task types' },
      { icon: '🏷', label: 'Activity outcomes' },
      { icon: '🔒', label: 'Record permissions' },
    ],
  },
  {
    id: 'inbound',
    label: 'Inbound',
    count: 4,
    items: [
      { icon: '⧩', label: 'Web forms' },
      { icon: '✉', label: 'Inbound email' },
      { icon: '✦', label: 'Lead scoring' },
      { icon: '⇄', label: 'Duplicate rules' },
    ],
  },
  {
    id: 'outbound',
    label: 'Outbound',
    count: 11,
    items: [
      { icon: '✉', label: 'Email templates' },
      { icon: '▦', label: 'Sequence steps' },
      { icon: '⏱', label: 'Send windows' },
      { icon: '🔁', label: 'Follow-up rules' },
      { icon: '🏷', label: 'Unsubscribe lists' },
      { icon: '📎', label: 'Attachments' },
      { icon: '✦', label: 'AI drafting tone' },
      { icon: '⚖', label: 'Sending limits' },
      { icon: '📊', label: 'Tracking' },
      { icon: '🔗', label: 'Link shortener' },
      { icon: '⚑', label: 'Bounce handling' },
    ],
  },
  {
    id: 'channels',
    label: 'Channels',
    count: 4,
    items: [
      { icon: '✉', label: 'Email accounts' },
      { icon: '💬', label: 'WhatsApp' },
      { icon: '📞', label: 'Telephony' },
      { icon: '🔗', label: 'Connected apps' },
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    count: 6,
    items: [
      { icon: '⚡', label: 'Workflows' },
      { icon: '🤖', label: 'Bound agents' },
      { icon: '🛡', label: 'Guardrails' },
      { icon: '👥', label: 'Approvals' },
      { icon: '⏱', label: 'SLA timers' },
      { icon: '🔔', label: 'Notifications' },
    ],
  },
  {
    id: 'branding',
    label: 'Branding',
    count: 1,
    items: [{ icon: '🎨', label: 'Logo & theme' }],
  },
]

/** Filter vocabularies for the CRM toolbars. */
export const leadSources = ['Website', 'Referral', 'Outbound', 'Event', 'Partner', 'Import']
export const scoreBands = ['Hot (80+)', 'Warm (50–79)', 'Cold (<50)', 'Unscored']
export const activityTypes = ['Call', 'Email', 'Meeting', 'Note', 'Task']
export const timeRanges = ['Today', 'This week', 'This month', 'This quarter']
