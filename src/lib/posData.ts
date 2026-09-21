/** Sales & POS, transcribed from the live `/apps/sales-pos` surface. */

export type PosNavItem = { id: string; label: string; icon: string }

export const posNav: { group: string; items: PosNavItem[] }[] = [
  { group: 'Overview', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'grid' }] },
  { group: 'Customers', items: [{ id: 'customers', label: 'Customers', icon: 'users' }] },
  {
    group: 'Order to invoice',
    items: [
      { id: 'rate_contracts', label: 'Rate contracts', icon: 'file-text' },
      { id: 'quotations', label: 'Quotations', icon: 'file-text' },
      { id: 'sales_orders', label: 'Sales orders', icon: 'bag' },
      { id: 'delivery_notes', label: 'Delivery notes', icon: 'briefcase' },
      { id: 'sales_invoices', label: 'Sales invoices', icon: 'file-text' },
    ],
  },
  {
    group: 'Point of sale',
    items: [
      { id: 'pos', label: 'POS till', icon: 'bag' },
      { id: 'shift_dashboard', label: 'Shifts', icon: 'activity' },
    ],
  },
  {
    group: 'Returns',
    items: [
      { id: 'sales_returns', label: 'Sales returns', icon: 'refresh' },
      { id: 'credit_notes', label: 'Credit notes', icon: 'file-text' },
      { id: 'refunds', label: 'Refunds', icon: 'refresh' },
    ],
  },
  {
    group: 'Receivables & reports',
    items: [
      { id: 'ar_aging', label: 'AR aging', icon: 'users' },
      { id: 'reports', label: 'Reports', icon: 'chart' },
    ],
  },
  { group: 'Recurring', items: [{ id: 'subscriptions', label: 'Subscriptions', icon: 'refresh' }] },
  {
    group: 'Admin',
    items: [
      { id: 'match_settings', label: 'Match settings', icon: 'user-check' },
      { id: 'settings', label: 'Settings', icon: 'settings' },
    ],
  },
]

export const quoteStatuses = [
  'All',
  'Draft',
  'Sent',
  'Accepted',
  'Rejected',
  'Expired',
  'Ordered',
  'Cancelled',
  'Superseded',
] as const

export const orderStatuses = ['All statuses', 'Draft', 'Confirmed', 'Partially delivered', 'Delivered', 'Closed']
export const deliveryStatuses = ['All statuses', 'Draft', 'Dispatched', 'Delivered', 'Invoiced']
export const invoiceStatuses = ['All statuses', 'Draft', 'Posted', 'Part paid', 'Paid', 'Overdue', 'Cancelled']
export const paymentFilters = ['All payment', 'Unpaid', 'Part paid', 'Paid']
export const sourceFilters = ['All sources', 'Manual', 'POS', 'Subscription', 'Order']

/** The order-to-cash stages the dashboard counts documents at. */
export const orderToCashStages = [
  { id: 'quotations_open', label: 'Quotations open' },
  { id: 'orders_to_fulfil', label: 'Orders to fulfil' },
  { id: 'delivered_not_invoiced', label: 'Delivered, not invoiced' },
  { id: 'invoices_draft', label: 'Invoices in draft' },
  { id: 'invoices_posted', label: 'Invoices posted' },
]

export const agingBuckets = [
  { id: 'current', label: 'Current', hint: 'Not yet due' },
  { id: '1_30', label: '1 – 30 days', hint: 'Overdue' },
  { id: '31_60', label: '31 – 60 days', hint: 'Past due' },
  { id: '61_90', label: '61 – 90 days', hint: 'Aged' },
  { id: '90_plus', label: '90+ days', hint: 'Likely write-off' },
]

export const paymentDueBands = ['Overdue', 'Due today', 'Due in 7 days', 'Due in 8 – 30 days', 'Due later']

export const posReportTabs = [
  { id: 'tracker', label: 'Sales Tracker', icon: 'briefcase' },
  { id: 'customer', label: 'Customer Performance', icon: 'users' },
  { id: 'cohort', label: 'Cohort Retention', icon: 'refresh' },
  { id: 'margin', label: 'Margin by Category', icon: 'activity' },
  { id: 'daily', label: 'Daily Sales', icon: 'calendar-clock' },
  { id: 'zreport', label: 'Day Sheet / Z-report', icon: 'file-text' },
  { id: 'item', label: 'Item Sales', icon: 'bag' },
  { id: 'cashier', label: 'Cashier Performance', icon: 'briefcase' },
  { id: 'cashflow', label: 'Cashflow Forecast', icon: 'chart' },
  { id: 'ai', label: 'AI Assist', icon: 'sparkles' },
]

export const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const toleranceActions = [
  'Warn — flag it, allow the post',
  'Block — refuse the post',
  'Ignore — no check',
]


export const money = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The nine panes of the Sales & POS settings surface, in their live order. */
export const posSettingsTabs = [
  { id: 'tax', label: 'Tax categories', icon: 'percent' },
  { id: 'groups', label: 'Customer groups', icon: 'users' },
  { id: 'loyalty', label: 'Loyalty & tiers', icon: 'award' },
  { id: 'variance', label: 'Cash variance tolerance', icon: 'scale' },
  { id: 'fields', label: 'Custom Fields', icon: 'settings' },
  { id: 'agents', label: 'AI Agents', icon: 'bot' },
  { id: 'schedules', label: 'Schedules', icon: 'clock' },
  { id: 'history', label: 'Change History', icon: 'history' },
  { id: 'appearance', label: 'Appearance', icon: 'layers' },
] as const

/**
 * The GST ladder the "Add standard GST slabs" button seeds. A slab splits in
 * half within a state and travels whole across one, which is why the two
 * columns are stored rather than derived at render time.
 */
export const standardGstSlabs = [0, 5, 12, 18, 28].map((rate) => ({
  name: `GST ${rate}%`,
  rate,
  withinState: rate === 0 ? 'Exempt' : `CGST ${rate / 2}% + SGST ${rate / 2}%`,
  interState: rate === 0 ? 'Exempt' : `IGST ${rate}%`,
}))

/** What the one-click button on an empty Customer groups pane creates. */
export const standardCustomerGroups = ['Walk-in', 'Regulars', 'Wholesale']

export const customFieldTypes = ['Text', 'Number', 'Date', 'Dropdown', 'Checkbox'] as const
