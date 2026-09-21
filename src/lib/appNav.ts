/**
 * The signed-in navigation tree, mirroring the live app's sidebar:
 * MY WORKSPACE · APPS (Enterprise Apps) · BUILD · RUN & REVIEW.
 */

/** `tone` is the icon's hue class (see `.nav-*` in index.css). */
export type NavLeaf = {
  label: string
  to: string
  icon: string
  tone?: string
  chevron?: boolean
  badge?: string
}
export type NavGroup = { id: string; label?: string; subLabel?: string; items: NavLeaf[]; collapsible?: boolean }

export const workspaceGroup: NavGroup = {
  id: 'workspace',
  label: 'My Workspace',
  collapsible: true,
  items: [
    { label: 'Overview', to: '/app', icon: 'grid', tone: 'sky', chevron: true },
    { label: 'My Stuff', to: '/app/me', icon: 'user', tone: 'violet', chevron: true },
    { label: 'Marketplace', to: '/app/marketplace', icon: 'bag', tone: 'amber' },
    { label: 'Inbox', to: '/app/inbox', icon: 'inbox', tone: 'blue' },
  ],
}

export const buildGroup: NavGroup = {
  id: 'build',
  label: 'Build',
  collapsible: true,
  items: [
    { label: 'Vibe Studio', to: '/app/build/vibe-studio', icon: 'sparkles', tone: 'fuchsia' },
    { label: 'Agent Studio', to: '/studio', icon: 'bot', tone: 'sky' },
    { label: 'Business Suite', to: '/app/business', icon: 'zap', tone: 'amber' },
  ],
}

export const runGroup: NavGroup = {
  id: 'run',
  label: 'Run & Review',
  collapsible: true,
  items: [
    { label: 'Agent Portal', to: '/app/agent-portal', icon: 'rocket', tone: 'orange' },
    { label: 'Approvals', to: '/app/approvals', icon: 'user-check', tone: 'emerald' },
    { label: 'Prompt Lab', to: '/app/prompt-lab', icon: 'terminal', tone: 'violet' },
    { label: 'Scheduled Jobs', to: '/app/scheduled-jobs', icon: 'calendar-clock', tone: 'blue' },
  ],
}

/** The Business Suite's most-reached-for tools, surfaced directly in the rail. */
export const toolsGroup: NavGroup = {
  id: 'tools',
  label: 'AI Tools',
  collapsible: true,
  items: [
    { label: 'Chat', to: '/app/business/chat', icon: 'message', tone: 'sky' },
    { label: 'Writing', to: '/app/business?category=writing', icon: 'pen', tone: 'amber' },
    { label: 'Image Gen', to: '/app/business?category=image', icon: 'palette', tone: 'pink' },
    { label: 'Code', to: '/app/business?category=development', icon: 'code', tone: 'violet' },
    { label: 'All Tools', to: '/app/business', icon: 'sparkles', tone: 'fuchsia' },
  ],
}

/** Tenant administration. Mirrors the live ADMINISTER group, NEW badges included. */
export const administerGroup: NavGroup = {
  id: 'administer',
  label: 'Administer',
  collapsible: true,
  items: [
    { label: 'Setup', to: '/app/setup', icon: 'settings', tone: 'slate', chevron: true },
    { label: 'Guardrails', to: '/app/guardrails', icon: 'shield-check', tone: 'emerald' },
    { label: 'Runners', to: '/app/runners', icon: 'rocket', tone: 'orange', badge: 'NEW' },
    { label: 'Integrations', to: '/app/integrations', icon: 'plug-zap', tone: 'cyan' },
    { label: 'Scheduled Jobs', to: '/app/admin/scheduled-jobs', icon: 'calendar-clock', tone: 'blue', badge: 'NEW' },
    { label: 'Client Portal', to: '/app/client-portal', icon: 'shield', tone: 'violet', badge: 'NEW' },
    { label: 'Compliance Center', to: '/app/compliance-center', icon: 'shield-alert', tone: 'rose', badge: 'NEW' },
  ],
}

/** Observability over what the tenant's agents actually did. */
export const analyzeGroup: NavGroup = {
  id: 'analyze',
  label: 'Analyze',
  collapsible: true,
  items: [{ label: 'Audit Trail', to: '/app/governance?tab=audit', icon: 'file-text', tone: 'indigo' }],
}

/** Second-column navigation for an installed app, keyed by app code. */
export type AppPortal = {
  code: string
  slug: string
  icon: string
  name: string
  subtitle: string
  accent: string
  items: NavLeaf[]
}

export const appPortals: AppPortal[] = [
  {
    code: 'ME',
    slug: 'me',
    icon: '🕐',
    name: 'My Workspace',
    subtitle: 'Self-service portal',
    accent: 'from-violet-500 to-fuchsia-500',
    items: [
      { label: 'Overview', to: '/app/me', icon: '▦' },
      { label: 'My Profile', to: '/app/me/profile', icon: '👤' },
      { label: 'My Attendance', to: '/app/me/attendance', icon: '📅' },
      { label: 'My Leaves', to: '/app/me/leaves', icon: '🗓' },
      { label: 'My Payslips', to: '/app/me/payslips', icon: '💲' },
      { label: 'My Timesheets', to: '/app/me/timesheets', icon: '📄' },
      { label: 'My Documents', to: '/app/me/documents', icon: '📁' },
      { label: 'My Onboarding', to: '/app/me/onboarding', icon: '📋' },
      { label: 'Announcements', to: '/app/me/announcements', icon: '📣' },
      { label: 'Team Approvals', to: '/app/me/team-approvals', icon: '👥' },
    ],
  },
  {
    code: 'CRM',
    slug: 'crm',
    icon: '🏢',
    name: 'CRM',
    subtitle: 'Sales pipeline',
    accent: 'from-sky-500 to-blue-600',
    items: [
      { label: 'Overview', to: '/app/crm', icon: '▦' },
      { label: 'Leads', to: '/app/crm/leads', icon: '🎯' },
      { label: 'Deals', to: '/app/crm/deals', icon: '💼' },
      { label: 'Accounts', to: '/app/crm/accounts', icon: '🏢' },
      { label: 'Contacts', to: '/app/crm/contacts', icon: '👤' },
      { label: 'Activities', to: '/app/crm/activities', icon: '📅' },
      { label: 'Agents', to: '/app/crm/agents', icon: '🤖' },
    ],
  },
  {
    code: 'HR',
    slug: 'hr',
    icon: '👥',
    name: 'HR & People Ops',
    subtitle: 'Lifecycle + payroll',
    accent: 'from-violet-500 to-purple-600',
    items: [
      { label: 'Overview', to: '/app/hr', icon: '▦' },
      { label: 'Employees', to: '/app/hr/employees', icon: '👤' },
      { label: 'Org Chart', to: '/app/hr/org-chart', icon: '🌳' },
      { label: 'Onboarding', to: '/app/hr/onboarding', icon: '📋' },
      { label: 'Attendance', to: '/app/hr/attendance', icon: '📅' },
      { label: 'Leaves', to: '/app/hr/leaves', icon: '🗓' },
      { label: 'Timesheets', to: '/app/hr/timesheets', icon: '📄' },
      { label: 'Payroll', to: '/app/hr/payroll', icon: '💲' },
      { label: 'Agents', to: '/app/hr/agents', icon: '🤖' },
    ],
  },
]

export const portalBySlug = new Map(appPortals.map((portal) => [portal.slug, portal]))

/** Every routed leaf, so the sidebar can let the most specific match win. */
export const allNavLeaves: NavLeaf[] = [
  workspaceGroup,
  buildGroup,
  runGroup,
  toolsGroup,
  analyzeGroup,
  administerGroup,
].flatMap((group) => group.items)
