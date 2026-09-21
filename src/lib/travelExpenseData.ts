/** Travel & Expense, transcribed from the live `/apps/travel-expense` surface. */

export const teTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: 'chart' },
  { id: 'expense_reports', label: 'Expense reports', icon: 'grid' },
  { id: 'cards', label: 'Cards', icon: 'grid' },
  { id: 'reimbursements', label: 'Reimbursements', icon: 'grid' },
  { id: 'travel', label: 'Travel', icon: 'grid' },
  { id: 'agency_review', label: 'Agency review', icon: 'grid' },
  { id: 'approval_inbox', label: 'Approval inbox', icon: 'grid' },
  { id: 'reports', label: 'Reports', icon: 'file-text' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
] as const

export type TeTabId = (typeof teTabs)[number]['id']

export const currencies = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'Pound Sterling' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
]

/** The report views in the left column of the Reports tab. */
export const reportViews = [
  { id: 'spend', label: 'Spend Overview', icon: 'activity' },
  { id: 'top', label: 'Top spenders / projects / agencies', icon: 'users' },
  { id: 'sla', label: 'Approval SLA & Queue', icon: 'user-check' },
  { id: 'pipeline', label: 'Reimbursement Pipeline', icon: 'file-text' },
  { id: 'agency', label: 'Agency Billing Pipeline', icon: 'building' },
] as const

export type SettingsItem = { id: string; label: string; icon: string }

/** The Settings left column, grouped as the live page groups it. */
export const settingsNav: { group: string; items: SettingsItem[] }[] = [
  {
    group: 'Expense',
    items: [
      { id: 'expense_policy', label: 'Expense policy', icon: 'shield-check' },
      { id: 'receipt_email', label: 'Receipt email-in', icon: 'inbox' },
    ],
  },
  {
    group: 'Travel',
    items: [
      { id: 'travel_policy', label: 'Travel policy', icon: 'link' },
      { id: 'travel_segments', label: 'Travel segment fields', icon: 'network' },
      { id: 'travel_notifications', label: 'Travel notifications', icon: 'inbox' },
    ],
  },
  {
    group: 'Reimbursement',
    items: [
      { id: 'approval_levels', label: 'Approval Levels', icon: 'user-check' },
      { id: 'sla', label: 'Reimbursement SLA', icon: 'clock' },
      { id: 'gl_accounts', label: 'Reimbursement GL accounts', icon: 'scale' },
    ],
  },
  {
    group: 'General',
    items: [
      { id: 'custom_fields', label: 'Custom Fields', icon: 'settings' },
      { id: 'ai_agents', label: 'AI Agents', icon: 'bot' },
      { id: 'schedules', label: 'Schedules', icon: 'calendar-clock' },
      { id: 'change_history', label: 'Change History', icon: 'clock' },
      { id: 'appearance', label: 'Appearance', icon: 'palette' },
    ],
  },
]

/**
 * Per-line spend-limit categories, in the order the live grid fills them —
 * left column then right, row by row.
 */
export const policyCategories = [
  'general',
  'travel',
  'per diem',
  'per km',
  'hotel',
  'meals',
  'lodging',
  'transport',
  'office supplies',
  'client entertainment',
  'training',
  'other',
]

/** Per-leg segment modes a travel request can carry. */
export const segmentModes = [
  { id: 'flight', label: 'Flight', fields: ['Carrier', 'Flight number', 'Cabin', 'Baggage'] },
  { id: 'train', label: 'Train', fields: ['Operator', 'Train number', 'Class', 'Berth'] },
  { id: 'bus', label: 'Bus', fields: ['Operator', 'Service', 'Seat'] },
  { id: 'hotel', label: 'Hotel', fields: ['Property', 'Room type', 'Nights', 'Meal plan'] },
]

export const travelNotificationEvents = [
  { id: 'submitted', label: 'Request submitted' },
  { id: 'approved', label: 'Request approved' },
  { id: 'rejected', label: 'Request rejected' },
  { id: 'advance', label: 'Advance disbursed' },
  { id: 'settle', label: 'Actuals due for settlement' },
]

export const expenseCategories = [
  'Airfare',
  'Hotel',
  'Ground transport',
  'Meals',
  'Per-diem',
  'Conference',
  'Client entertainment',
  'Other',
]

/** Reimbursement stages, in the order a run advances through them. */
export const runStages = ['Request Processed', 'Moved to Accounts', 'Batch Generation', 'Disbursed'] as const

export type RunStage = (typeof runStages)[number]

/** Days the tenant has to reimburse an approved report. */
export const reimbursementSlaDays = 21

export function currencySymbol(code: string) {
  return currencies.find((item) => item.code === code)?.symbol ?? ''
}

export function money(amount: number) {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
