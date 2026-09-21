/** Agent Studio, transcribed from agent-studio.apragya.ai/workspace/<id>/home. */

export type StudioNavItem = { label: string; icon: string; badge?: string }
export type StudioNavGroup = { id: string; label: string; items: StudioNavItem[] }

export const studioPrimary: StudioNavItem[] = [
  { label: 'Build', icon: '⌂' },
  { label: 'Search', icon: '⌕' },
]

export const studioGroups: StudioNavGroup[] = [
  {
    id: 'library',
    label: 'Library',
    items: [
      { label: 'Agents', icon: '👤', badge: '1' },
      { label: 'Activity', icon: '◷' },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    items: [
      { label: 'Knowledge', icon: '🗄' },
      { label: 'Tables', icon: '▦' },
      { label: 'Files', icon: '📄' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { label: 'Schedules', icon: '▤' },
      { label: 'Logs', icon: '📋' },
    ],
  },
]

export type Workflow = { name: string; tone: string; icon: string }
export type TemplateCategory = { id: string; icon: string; name: string; count: number; workflows: Workflow[] }

export const templateCategories: TemplateCategory[] = [
  {
    id: 'popular',
    icon: '✦',
    name: 'Popular',
    count: 6,
    workflows: [
      { name: 'Self-populating CRM', icon: '▦', tone: 'bg-sky-500/20 text-sky-300' },
      { name: 'Meeting prep agent', icon: '▥', tone: 'bg-blue-500/20 text-blue-300' },
      { name: 'Resolve todo list', icon: '☑', tone: 'bg-slate-500/20 text-slate-300' },
      { name: 'Research assistant', icon: '⌕', tone: 'bg-indigo-500/20 text-indigo-300' },
      { name: 'Auto-reply agent', icon: '✉', tone: 'bg-red-500/20 text-red-300' },
      { name: 'Expense tracker', icon: '▦', tone: 'bg-emerald-500/20 text-emerald-300' },
    ],
  },
  {
    id: 'sales',
    icon: '👥',
    name: 'Sales & CRM',
    count: 12,
    workflows: [
      { name: 'Lead qualifier', icon: '🎯', tone: 'bg-emerald-500/20 text-emerald-300' },
      { name: 'Deal scorer', icon: '▦', tone: 'bg-sky-500/20 text-sky-300' },
      { name: 'Follow-up drafter', icon: '✉', tone: 'bg-blue-500/20 text-blue-300' },
      { name: 'Pipeline digest', icon: '▥', tone: 'bg-indigo-500/20 text-indigo-300' },
    ],
  },
  {
    id: 'support',
    icon: '💬',
    name: 'Support',
    count: 8,
    workflows: [
      { name: 'Ticket triager', icon: '☑', tone: 'bg-amber-500/20 text-amber-300' },
      { name: 'Reply suggester', icon: '✉', tone: 'bg-sky-500/20 text-sky-300' },
      { name: 'Escalation predictor', icon: '⚑', tone: 'bg-red-500/20 text-red-300' },
    ],
  },
  {
    id: 'engineering',
    icon: '</>',
    name: 'Engineering',
    count: 11,
    workflows: [
      { name: 'PR reviewer', icon: '</>', tone: 'bg-indigo-500/20 text-indigo-300' },
      { name: 'Incident summariser', icon: '⚑', tone: 'bg-red-500/20 text-red-300' },
      { name: 'Release notes drafter', icon: '📄', tone: 'bg-slate-500/20 text-slate-300' },
    ],
  },
  {
    id: 'marketing',
    icon: '✎',
    name: 'Marketing & Content',
    count: 10,
    workflows: [
      { name: 'Campaign brief writer', icon: '✎', tone: 'bg-pink-500/20 text-pink-300' },
      { name: 'SEO auditor', icon: '⌕', tone: 'bg-emerald-500/20 text-emerald-300' },
      { name: 'Social scheduler', icon: '▤', tone: 'bg-sky-500/20 text-sky-300' },
    ],
  },
  {
    id: 'productivity',
    icon: '☑',
    name: 'Productivity',
    count: 19,
    workflows: [
      { name: 'Inbox summariser', icon: '✉', tone: 'bg-blue-500/20 text-blue-300' },
      { name: 'Note taker', icon: '📄', tone: 'bg-slate-500/20 text-slate-300' },
      { name: 'Weekly digest', icon: '▥', tone: 'bg-indigo-500/20 text-indigo-300' },
    ],
  },
  {
    id: 'operations',
    icon: '⚙',
    name: 'Operations',
    count: 16,
    workflows: [
      { name: 'Invoice auditor', icon: '▦', tone: 'bg-emerald-500/20 text-emerald-300' },
      { name: 'Vendor risk analyzer', icon: '⚑', tone: 'bg-amber-500/20 text-amber-300' },
      { name: 'Stock reorder advisor', icon: '📦', tone: 'bg-orange-500/20 text-orange-300' },
    ],
  },
]

export const studioPromptPlaceholder = 'Ask Apragya to find and track leads...'
export const studioModel = 'claude-sonnet-4-6'
