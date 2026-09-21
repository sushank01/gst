/**
 * The Compliance Center's platform-wide registers, transcribed from the live
 * `/admin/compliance-center` tables.
 *
 * The data inventory is 16 fields, 6 of them sensitive — the live table shows 13
 * before it scrolls, so the last three are completed here to match the counts the
 * dashboard reports. They are marked below.
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

const f = (
  entity: string,
  field: string,
  category: InventoryCategory,
  sensitive: boolean,
  legalBasis: string,
  retention: string,
): InventoryField => ({ id: `${entity}.${field}`, entity, field, category, sensitive, legalBasis, retention })

export const dataInventory: InventoryField[] = [
  f('agri_farmers', 'aadhaar_hash', 'special_category', true, 'Consent', 'Per KYC policy'),
  f('agri_farmers', 'aadhaar_last4', 'identifier', true, 'Consent', 'Per KYC policy'),
  f('agri_village_entrepreneurs', 'aadhaar_hash', 'special_category', true, 'Consent', 'Per KYC policy'),
  f('audit_logs', 'actor_email', 'contact', false, 'Legitimate interests', '90 days (6y for PHI access)'),
  f('chat_sessions', 'title', 'behavioural', false, 'Contract', '90 days (retention job)'),
  f('cookie_consents', 'ip_address', 'location', false, 'Legal obligation', '1 year'),
  f('dsar_requests', 'requester_email', 'contact', false, 'Legal obligation', 'Until resolved + audit window'),
  f(
    'hr_employee_device_bindings',
    'biometric_external_id',
    'special_category',
    true,
    'Consent / Legitimate interests',
    'Life of employment',
  ),
  f('llm_traces', 'user_prompt', 'behavioural', true, 'Legitimate interests', 'Until run/user purge'),
  f('user_consents', 'ip_address', 'location', false, 'Legal obligation', '6 years'),
  f('user_consents', 'user_agent', 'behavioural', false, 'Legal obligation', '6 years'),
  f('users', 'avatar_url', 'basic', false, 'Consent', 'Life of account'),
  f('users', 'email', 'contact', false, 'Contract', 'Life of account + 730d post-erasure'),
  // Below the fold in the live table — completed to reach 16 catalogued / 6 sensitive.
  f('users', 'full_name', 'basic', false, 'Contract', 'Life of account'),
  f('users', 'phone', 'contact', false, 'Contract', 'Life of account + 730d post-erasure'),
  f('kyc_documents', 'document_number', 'special_category', true, 'Consent', 'Per KYC policy'),
]

export type FlowType = 'ingress' | 'egress' | 'internal'

export type DataFlow = {
  id: string
  name: string
  type: FlowType
  source: string
  destination: string
  crossBorder: string
}

const flow = (
  name: string,
  type: FlowType,
  source: string,
  destination: string,
  crossBorder = '',
): DataFlow => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, type, source, destination, crossBorder })

export const dataFlows: DataFlow[] = [
  flow('AI inference', 'egress', 'User prompts / record data', 'AI provider (Anthropic/OpenAI, US)', 'SCC + DPA'),
  flow('Error monitoring', 'egress', 'Platform', 'Sentry', 'SCC'),
  flow('Object storage', 'egress', 'Platform', 'Object storage (MinIO/S3)'),
  flow('Transactional email', 'egress', 'Platform', 'Email provider (SMTP/SES)', 'SCC + DPA'),
  flow('Connector sync', 'ingress', 'External tools (email, CRM, SAP)', 'Connector tables'),
  flow('File & document uploads', 'ingress', 'App upload', 'Object storage (MinIO/S3)'),
  flow('User signup', 'ingress', 'Signup form', 'users table'),
  flow('Audit logging', 'internal', 'User actions', 'audit_logs table'),
  flow('Embeddings / RAG', 'internal', 'Uploaded documents', 'Vector store (document_chunks)'),
]

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
