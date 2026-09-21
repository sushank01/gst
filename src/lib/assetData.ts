/** Asset Management, transcribed from the live `/apps/it-assets` surface. */

export const assetTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: 'chart' },
  { id: 'assets', label: 'Asset Register', icon: 'grid' },
  { id: 'my_equipment', label: 'My Asset', icon: 'grid' },
  { id: 'requests', label: 'Requests', icon: 'grid' },
  { id: 'reports', label: 'Reports', icon: 'file-text' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
] as const

/** Master Taxonomies opens as its own top-level tab rather than inside Settings. */
export const mastersTab = { id: 'masters', label: 'Master Taxonomies', icon: 'grid' }

/** The lifecycle a tagged unit moves through. */
export const assetStages = ['In Stock', 'Allocated', 'Issued', 'Awaiting check', 'In Repair', 'Retired'] as const

export type AssetStage = (typeof assetStages)[number]

export const assetReportTabs = [
  'Stock summary',
  'Asset ledger',
  'Department usage',
  'Warranty',
  'Support notes',
  'Audit log',
] as const

export const assetSettingsNav = [
  { id: 'approval_levels', label: 'Approval Levels', icon: 'user-check' },
  { id: 'masters', label: 'Master Taxonomies', icon: 'network', external: true },
  { id: 'custom_fields', label: 'Custom Fields', icon: 'settings' },
  { id: 'ai_agents', label: 'AI Agents', icon: 'bot' },
  { id: 'schedules', label: 'Schedules', icon: 'clock' },
  { id: 'change_history', label: 'Change History', icon: 'refresh' },
]

export type TaxonomyEntry = { value: string; label: string; tagPrefix?: string; hasConfig?: boolean; configCount?: number }

/** The taxonomy list in the Master Taxonomies left column. */
export const taxonomyGroups = [
  {
    group: 'General',
    items: [
      { id: 'asset_types', label: 'Asset Types' },
      { id: 'makes', label: 'Makes (suggestions)' },
      { id: 'models', label: 'Models (suggestions)' },
      { id: 'mode_of_purchase', label: 'Mode of Purchase' },
      { id: 'retirement_reasons', label: 'Retirement Reasons' },
      { id: 'warranty', label: 'Warranty' },
      { id: 'numbering', label: 'Numbering & Naming' },
    ],
  },
  {
    group: 'Support',
    items: [
      { id: 'reasons', label: 'Reasons' },
      { id: 'notification', label: 'Notification' },
    ],
  },
]

export const defaultAssetTypes: TaxonomyEntry[] = [
  { value: 'laptop', label: 'Laptop', tagPrefix: 'LAP-', hasConfig: true, configCount: 3 },
  { value: 'desktop', label: 'Desktop', tagPrefix: 'DES-', hasConfig: true, configCount: 3 },
  { value: 'monitor', label: 'Monitor', tagPrefix: 'MON-' },
  { value: 'tv_display', label: 'TV Display', tagPrefix: 'TVD-' },
  { value: 'webcam', label: 'Web Camera', tagPrefix: 'WEB-' },
  { value: 'headphone', label: 'Headphone', tagPrefix: 'HEA-' },
  { value: 'mouse', label: 'Mouse', tagPrefix: 'MOU-' },
  { value: 'speaker', label: 'Speaker', tagPrefix: 'SPE-' },
  { value: 'earphone', label: 'Earphone', tagPrefix: 'EAR-' },
]

export const defaultMakes: TaxonomyEntry[] = [
  'Dell',
  'HP',
  'Lenovo',
  'Apple',
  'Asus',
  'Acer',
  'Samsung',
  'LG',
  'Logitech',
  'Microsoft',
].map((label) => ({ value: label.toLowerCase(), label }))

export const defaultModeOfPurchase: TaxonomyEntry[] = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'lease', label: 'Lease' },
  { value: 'rental', label: 'Rental' },
]

export const defaultRetirementReasons: TaxonomyEntry[] = [
  { value: 'end_of_life', label: 'End of life' },
  { value: 'damaged', label: 'Damaged beyond repair' },
  { value: 'lost', label: 'Lost' },
  { value: 'stolen', label: 'Stolen' },
  { value: 'sold', label: 'Sold' },
  { value: 'donated', label: 'Donated' },
]

export const defaultSupportReasons: TaxonomyEntry[] = [
  { value: 'hardware_fault', label: 'Hardware fault' },
  { value: 'software_issue', label: 'Software issue' },
  { value: 'accessory_missing', label: 'Accessory missing' },
  { value: 'upgrade', label: 'Upgrade request' },
  { value: 'other', label: 'Other' },
]

export const requestTypes = ['New asset', 'Replacement', 'Upgrade', 'Return', 'Repair']
export const requestStatuses = ['Pending', 'Approved', 'Rejected', 'Issued']

export const approvalTypes = ['By Role', 'By Person', 'By Department head']
export const approverRoles = ['Manager (unknown)', 'IT Admin', 'Finance', 'Department head']

/** How long before expiry a warranty counts as "expiring". */
export const warrantyAlertDays = 60
