/**
 * The client portal's surface area, transcribed from the live `New portal role`
 * dialog: every tab it lists, its internal code, and the fields that tab can mask.
 */

export type PortalTab = {
  id: string
  label: string
  maskable: string[]
}

export const portalTabs: PortalTab[] = [
  { id: 'deals', label: 'Deals', maskable: ['value', 'probability'] },
  { id: 'projects', label: 'Projects', maskable: ['progress', 'milestone_count'] },
  { id: 'activities', label: 'Activities', maskable: [] },
  { id: 'quotes', label: 'Quotes', maskable: ['total_amount'] },
  { id: 'invoices', label: 'Invoices', maskable: ['total_amount', 'outstanding_amount', 'paid_amount'] },
  { id: 'contracts', label: 'Contracts', maskable: ['risk_level'] },
  { id: 'tickets', label: 'Support tickets', maskable: [] },
  { id: 'purchase_orders', label: 'Purchase orders', maskable: ['total_amount'] },
  { id: 'purchase_invoices', label: 'Purchase invoices', maskable: ['total_amount', 'outstanding_amount'] },
  { id: 'help', label: 'Help / KB', maskable: [] },
  { id: 'travel_requests', label: 'Travel requests', maskable: [] },
  { id: 'travel_invoices', label: 'Travel invoices', maskable: ['amount'] },
]

/** A role's scope. Universal is the default the live dialog opens on. */
export const portalScopes = [
  'Universal - can be assigned to any partner type',
  'Customer - can only be assigned to customer partners',
  'Vendor - can only be assigned to vendor partners',
  'Reseller - can only be assigned to reseller partners',
] as const

export const scopeHelp: Record<string, string> = {
  'Universal - can be assigned to any partner type':
    'Every known tab is editable. This role can be assigned to any portal user regardless of partner type.',
  'Customer - can only be assigned to customer partners':
    'Sales-side tabs are editable. This role can only be assigned to portal users on customer records.',
  'Vendor - can only be assigned to vendor partners':
    'Purchase-side tabs are editable. This role can only be assigned to portal users on vendor records.',
  'Reseller - can only be assigned to reseller partners':
    'Deal and quote tabs are editable. This role can only be assigned to portal users on reseller records.',
}
