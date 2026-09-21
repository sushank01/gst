/** Support & Ticketing, transcribed from the live `/apps/support-ticketing` surface. */

export type SupportNavItem = { id: string; label: string; icon: string }

export const supportNav: { group: string; items: SupportNavItem[] }[] = [
  { group: 'Overview', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'grid' }] },
  { group: 'Tickets', items: [{ id: 'tickets', label: 'All tickets', icon: 'ticket' }] },
  { group: 'Knowledge', items: [{ id: 'knowledge_base', label: 'Articles', icon: 'book' }] },
  { group: 'My requests', items: [{ id: 'my_requests', label: 'My requests', icon: 'message' }] },
  {
    group: 'SLA',
    items: [
      { id: 'sla_policies', label: 'Policies', icon: 'shield' },
      { id: 'canned_responses', label: 'Canned replies', icon: 'message' },
    ],
  },
  { group: 'Automation', items: [{ id: 'routing_rules', label: 'Routing rules', icon: 'network' }] },
  { group: 'Insights', items: [{ id: 'reports', label: 'Reports', icon: 'chart' }] },
  { group: 'Admin', items: [{ id: 'settings', label: 'Settings', icon: 'settings' }] },
]

/**
 * Features the trial plan does not include. The live app shows a lock card for
 * these rather than an empty list.
 */
export const gatedSections: Record<string, string> = {
  sla_policies: 'SLA Policies',
  routing_rules: 'Routing Rules',
}

export const ticketQueues = ['All tickets', 'My tickets', 'Unassigned'] as const

export const ticketStatuses = [
  'All',
  'New',
  'Open',
  'In Progress',
  'Waiting on Customer',
  'Waiting on Third Party',
  'Resolved',
  'Closed',
] as const

export type TicketStatus = Exclude<(typeof ticketStatuses)[number], 'All'>

export const ticketSources = ['All sources', 'Email', 'Portal', 'Chat', 'Phone', 'API'] as const

export const ticketPriorities = ['Urgent', 'High', 'Medium', 'Low'] as const

export type TicketPriority = (typeof ticketPriorities)[number]

export const ticketCategories = ['Billing', 'Technical', 'Account', 'Feature request', 'How-to', 'Other']

export const articleStates = ['All', 'draft', 'published', 'archived'] as const

/** The sub-tabs across the Reports pane. */
export const supportReportTabs = [
  { id: 'sla', label: 'SLA Compliance', icon: 'activity' },
  { id: 'response', label: 'Response Times', icon: 'clock' },
  { id: 'reopen', label: 'Reopen Rate', icon: 'refresh' },
  { id: 'csat', label: 'CSAT', icon: 'smile' },
  { id: 'nps', label: 'NPS', icon: 'gauge' },
  { id: 'leaderboard', label: 'Agent Leaderboard', icon: 'trophy' },
  { id: 'heatmap', label: 'Volume Heatmap', icon: 'chart' },
] as const

export const reportRanges = ['Last 7 days', 'Last 30 days', 'Last 90 days', 'Last 12 months'] as const

/** The Settings tab strip, in the live order — it wraps onto a second row. */
export const supportSettingsTabs = [
  { id: 'ticket_fields', label: 'Ticket fields', icon: 'grid' },
  { id: 'web_widget', label: 'Web widget', icon: 'message' },
  { id: 'csat_survey', label: 'CSAT survey', icon: 'smile' },
  { id: 'escalation_rules', label: 'Escalation rules', icon: 'alert-triangle' },
  { id: 'inbox_accounts', label: 'Inbox accounts', icon: 'inbox' },
  { id: 'inbound_channels', label: 'Inbound channels', icon: 'message' },
  { id: 'parse_failures', label: 'Parse failures', icon: 'alert-triangle' },
  { id: 'business_hours', label: 'Business hours', icon: 'calendar-clock' },
  { id: 'auto_responses', label: 'Auto-responses', icon: 'inbox' },
  { id: 'shift_handoffs', label: 'Shift handoffs', icon: 'refresh' },
  { id: 'csat_review', label: 'CSAT review', icon: 'smile' },
  { id: 'report_exports', label: 'Report exports', icon: 'file-text' },
  { id: 'tiers_search', label: 'Tiers & search', icon: 'gauge' },
  { id: 'ai_agents', label: 'AI agents', icon: 'sparkles' },
] as const

export const ticketFieldTabs = ['Statuses', 'Categories', 'Priorities', 'Types', 'Channels'] as const

export type FieldRow = { id: string; label: string; slug: string; color?: string; behaviour?: string; slaHours?: number }

/** Status colours as the live list dots them. */
export const statusDot: Record<string, string> = {
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  slate: 'bg-slate-400',
  rose: 'bg-rose-500',
  orange: 'bg-orange-500',
}

export const behaviourLabel: Record<string, string> = {
  active: 'Active',
  waiting: 'Waiting — SLA paused',
  closed: 'Closed state',
}

export const defaultStatuses: FieldRow[] = [
  { id: 'new', label: 'New', slug: 'new', color: 'sky', behaviour: 'active' },
  { id: 'open', label: 'Open', slug: 'open', color: 'sky', behaviour: 'active' },
  { id: 'in_progress', label: 'In Progress', slug: 'in_progress', color: 'violet', behaviour: 'active' },
  { id: 'waiting_on_customer', label: 'Waiting on Customer', slug: 'waiting_on_customer', color: 'amber', behaviour: 'waiting' },
  { id: 'waiting_on_third_party', label: 'Waiting on Third Party', slug: 'waiting_on_third_party', color: 'amber', behaviour: 'waiting' },
  { id: 'resolved', label: 'Resolved', slug: 'resolved', color: 'emerald', behaviour: 'closed' },
  { id: 'closed', label: 'Closed', slug: 'closed', color: 'slate', behaviour: 'closed' },
]

export const defaultCategories: FieldRow[] = [
  { id: 'general', label: 'General Inquiry', slug: 'general' },
  { id: 'billing', label: 'Billing & Payments', slug: 'billing' },
  { id: 'technical', label: 'Technical Support', slug: 'technical' },
  { id: 'feature_request', label: 'Feature Request', slug: 'feature_request' },
  { id: 'bug', label: 'Bug Report', slug: 'bug' },
  { id: 'account', label: 'Account Management', slug: 'account' },
  { id: 'onboarding', label: 'Onboarding', slug: 'onboarding' },
]

export const defaultPriorities: FieldRow[] = [
  { id: 'urgent', label: 'Urgent', slug: 'urgent', color: 'rose', slaHours: 4 },
  { id: 'high', label: 'High', slug: 'high', color: 'orange', slaHours: 8 },
  { id: 'medium', label: 'Medium', slug: 'medium', color: 'amber', slaHours: 24 },
  { id: 'low', label: 'Low', slug: 'low', color: 'slate', slaHours: 72 },
]

export const defaultTypes: FieldRow[] = [
  { id: 'question', label: 'Question', slug: 'question' },
  { id: 'problem', label: 'Problem', slug: 'problem' },
  { id: 'incident', label: 'Incident', slug: 'incident' },
  { id: 'task', label: 'Task', slug: 'task' },
  { id: 'type_feature_request', label: 'Feature Request', slug: 'feature_request' },
]

export const defaultChannels: FieldRow[] = [
  { id: 'web', label: 'Web Portal', slug: 'web' },
  { id: 'web_widget', label: 'Web Widget', slug: 'web_widget' },
  { id: 'email', label: 'Email', slug: 'email' },
  { id: 'portal', label: 'Partner Portal', slug: 'portal' },
  { id: 'phone', label: 'Phone', slug: 'phone' },
  { id: 'chat', label: 'Live Chat', slug: 'chat' },
]

export const serviceTiers = ['Bronze', 'Silver', 'Gold', 'Platinum'] as const

export const exportReports = ['Ticket summary', 'SLA compliance', 'CSAT detail', 'Agent activity', 'Volume by channel']
export const exportFormats = ['CSV', 'Excel']

export const widgetPositions = ['Bottom right', 'Bottom left', 'Top right', 'Top left']

/** Statuses that count as still open on the dashboard. */
export const openStatuses: TicketStatus[] = [
  'New',
  'Open',
  'In Progress',
  'Waiting on Customer',
  'Waiting on Third Party',
]
