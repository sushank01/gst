/**
 * Vocabularies for the Compliance Center.
 *
 * This file used to ship two seeded REGISTERS as well: a data inventory of
 * sixteen fields and a data-flow map of nine flows. Both are gone, and it is
 * worth recording why, because they looked like the most authoritative content
 * in the product.
 *
 * The inventory named tables that do not exist in this database
 * (`agri_farmers`, `agri_village_entrepreneurs`, `hr_employee_device_bindings`
 * and others), and its own header admitted three rows were "completed here to
 * match the counts the dashboard reports" — the register was written backwards
 * from a number somebody wanted to show.
 *
 * The flow map was worse. It asserted live personal-data egress to an AI
 * provider, Sentry, S3 and an email provider, and stamped four of those
 * "SCC + DPA" — standard contractual clauses and a data processing agreement.
 * Those are legal instruments. This deployment has no AI provider connected,
 * no error monitoring, and no email transport; there are no such agreements,
 * and a register that claims them is not a compliance artefact but a
 * liability. Nothing here may assert a legal position nobody has established.
 *
 * What remains is vocabulary: the category and legal-basis lists a tenant
 * chooses from when recording their OWN register. The register itself has no
 * storage on this deployment and the screen says so.
 */

export type InventoryCategory = 'basic' | 'contact' | 'identifier' | 'location' | 'behavioural' | 'special_category'

export type InventoryField = {
  id: string
  entity: string
  field: string
  category: InventoryCategory
  sensitive: boolean
  legalBasis: string
  retention: string
}

export type FlowType = 'ingress' | 'egress' | 'internal'

export type DataFlow = {
  id: string
  name: string
  type: FlowType
  source: string
  destination: string
  crossBorder: string
}

export const flowTone: Record<FlowType, string> = {
  ingress: 'bg-accent-muted text-accent',
  egress: 'bg-warn-muted text-warn',
  internal: 'bg-surface-2 text-fg-2',
}

export const legalBases = [
  'Consent',
  'Contract',
  'Legal obligation',
  'Legitimate interests',
  'Vital interests',
  'Public task',
]

export const inventoryCategories: InventoryCategory[] = [
  'basic',
  'contact',
  'identifier',
  'location',
  'behavioural',
  'special_category',
]
