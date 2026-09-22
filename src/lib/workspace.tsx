'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { marketApps, sampleTrace } from './appData'
import type { CheckPoint, GuardrailAction, GuardrailType } from './guardrailData'
import { dataFlows, dataInventory, type DataFlow, type InventoryField } from './complianceData'
import {
  defaultCategories,
  defaultChannels,
  defaultPriorities,
  defaultStatuses,
  defaultTypes,
  type FieldRow,
} from './supportData'
import {
  defaultAssetTypes,
  defaultMakes,
  defaultModeOfPurchase,
  defaultRetirementReasons,
  defaultSupportReasons,
  type TaxonomyEntry,
} from './assetData'
import { brandDefaults } from './pitchData'
import type { RunStep } from './appData'

/**
 * Tenant runtime state for the signed-in product: installed apps, the shared
 * AI Credits pool, build artifacts, and run history.
 *
 * The platform's defining rule is that ONE credit pool funds everything —
 * suite tools, agent runs, Vibe builds, Vippy — so every action routes through
 * `spend()` rather than tracking its own balance.
 */

export type Artifact = {
  id: string
  name: string
  skill: string
  kind: string
  version: number
  status: 'draft' | 'published'
  createdAt: string
}

export type Notification = {
  id: string
  title: string
  body: string
  at: string
  read: boolean
}

export type Run = {
  id: string
  agent: string
  source: string
  status: 'success' | 'needs-review' | 'failed'
  startedAt: string
  credits: number
  ms: number
  trace: RunStep[]
}

const MONTHLY_CREDITS = 1000
const APP_QUOTA = 5
const TRIAL_DAYS = 13
const STORAGE_KEY = 'apragya.workspace'

/**
 * Bump when a change to the stored shape needs applying to workspaces that were
 * saved earlier. v2 introduced the default app set, so tenants created before it
 * must receive those apps rather than silently missing them.
 */
const STORAGE_VERSION = 2

type Persisted = {
  installed: string[]
  /** Installed apps whose agents are switched off. Disabling is not uninstalling. */
  disabledApps: string[]
  creditsUsed: number
  creditsAllocated: boolean
  invitedTeammate: boolean
  usedCopilot: boolean
  dismissedChecklist: boolean
  twoFactor: 'pending' | 'on' | 'snoozed'
  artifacts: Artifact[]
  runs: Run[]
  notifications: Notification[]
  /** Reviewer decisions on paused agent runs, keyed by approval id. */
  approvals: Record<string, ApprovalDecision>
  /** Agents, pipelines and bots running on a timer. Empty until one is scheduled. */
  schedules: Schedule[]
  /** Append-only history of tenant actions, newest first. */
  audit: AuditEvent[]
  /** Legal entities added on top of the tenant's own primary company. */
  companies: Company[]
  intercompanyPairs: IntercompanyPair[]
  /** Edits made to the derived primary entity, which otherwise follows the org name. */
  primaryOverride: Partial<Company> | null
  /** Guardrail policies that gate agent inputs and outputs. */
  policies: GuardrailPolicy[]
  /** Runners installed inside the tenant's network. */
  runners: Runner[]
  connections: Connection[]
  customConnectors: CustomConnector[]
  /** Portal tabs partner users can see. Every tab is on until an admin turns one off. */
  portalTabs: string[] | null
  portalRoles: PortalRole[]
  /** Compliance registers. The inventory and flows seed from the platform catalogue. */
  dataInventory: InventoryField[]
  dataFlows: DataFlow[]
  dpias: Dpia[]
  automatedDecisions: AutomatedDecision[]
  retentionPolicies: RetentionPolicy[]
  /** Travel & Expense records. A fresh tenant has none of any of them. */
  expenseReports: ExpenseReport[]
  travelRequests: TravelRequest[]
  cardTransactions: CardTransaction[]
  reimbursementRuns: ReimbursementRun[]
  teSettings: TeSettings
  /** Support & Ticketing records. A fresh tenant has none of them. */
  tickets: Ticket[]
  kbArticles: KbArticle[]
  kbCategories: string[]
  cannedResponses: CannedResponse[]
  supportSettings: SupportSettings
  /** Asset Management records. A fresh tenant owns nothing yet. */
  assets: Asset[]
  assetRequests: AssetRequest[]
  assetSettings: AssetSettings
  /** Pitch Pilot records. Sample data is opt-in, so a fresh tenant is empty. */
  rfps: Rfp[]
  kbDocs: KbDoc[]
  pitchTemplates: PitchTemplate[]
  brandKit: BrandKit
  customSchemas: CustomSchema[]
  pitchSampleLoaded: boolean
  /** Sales & POS records. */
  posCustomers: PosCustomer[]
  posDocs: PosDoc[]
  posShifts: PosShift[]
  matchSettings: MatchSettings
  posSettings: PosSettings
  /**
   * Records created from the generic app dialogs (CRM, HR), keyed by surface —
   * "crm.leads", "hr.employees". These surfaces have no bespoke schema in the
   * rebuild, so their create buttons write here rather than being inert.
   */
  appRecords: Record<string, AppRecord[]>
  /** Schema version of the persisted blob; absent on pre-v2 workspaces. */
  version?: number
}

export type ApprovalDecision = 'approved' | 'modified' | 'rejected'

/**
 * One row of the tenant-scoped audit trail. `user: 'owner'` renders as the signed-in
 * org admin's email — the tenant's own identity is not duplicated into storage.
 */
export type AuditEvent = {
  id: string
  at: string
  user: 'owner' | ''
  role: string
  action: string
  status: 'Success' | 'Failed'
  resource: string
  resourceId: string
  ip: string
}

export function auditEvent(
  partial: Omit<Partial<AuditEvent>, 'id' | 'at'> & Pick<AuditEvent, 'action' | 'resource'>,
): AuditEvent {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    user: 'owner',
    role: 'Org_admin',
    status: 'Success',
    resourceId: crypto.randomUUID(),
    ip: '',
    ...partial,
  }
}

/**
 * A configured link to an external system. Secrets are never persisted — only a
 * hint (the last four characters) so the row is recognisable.
 */
export type Connection = {
  id: string
  connectorId: string
  name: string
  account: string
  secretHint: string
  createdAt: string
}

/** A REST API the tenant registered itself, with no platform work involved. */
export type CustomConnector = {
  id: string
  name: string
  baseUrl: string
  auth: string
  operations: number
  source: 'manual' | 'openapi'
}

/**
 * A runner paired into the tenant's own network. A runner is created in
 * `pending` and only reports `online` once the installed agent calls home,
 * which is why a fresh one shows its pairing token rather than a heartbeat.
 */
export type Runner = {
  id: string
  name: string
  description: string
  status: 'pending' | 'online' | 'offline'
  token: string
  pairedAt: string
}

/** A trading partner in the Sales & POS master directory. */
export type PosCustomer = {
  id: string
  name: string
  email: string
  taxId: string
  active: boolean
  createdAt: string
}

/** One order-to-cash document. The `kind` decides which list it appears in. */
export type PosDoc = {
  id: string
  kind: 'quotation' | 'order' | 'delivery' | 'invoice' | 'return' | 'credit' | 'refund' | 'contract' | 'subscription'
  reference: string
  customer: string
  status: string
  total: number
  source: string
  payment: string
  reason: string
  dueDate: string
  createdAt: string
}

/** A POS till session. Closing it records the counted cash and its variance. */
export type PosShift = {
  id: string
  cashier: string
  openingFloat: number
  currency: string
  warehouse: string
  notes: string
  openedAt: string
  closedAt?: string
  cashTaken: number
  cardTaken: number
  countedCash?: number
}

export type MatchSettings = {
  priceTolerance: number
  priceAction: string
  quantityTolerance: number
  quantityAction: string
  requireOrder: boolean
  requireDelivery: boolean
}

/** A named tax slab. Items point at one instead of carrying a loose percentage. */
export type PosTaxCategory = {
  id: string
  name: string
  rate: number
  withinState: string
  interState: string
}

export type PosCustomerGroup = { id: string; name: string }

/** Points accrue on net subtotal and are spent at the till as a bill discount. */
export type PosLoyaltyProgramme = {
  id: string
  name: string
  pointsPer: number
  pointValue: number
  tiers: { name: string; threshold: number }[]
}

/** Where a drawer count stops being silent, and where the manager board colours. */
export type PosCashVariance = {
  reasonAbove: number
  amberWorst: number
  redWorst: number
  amberAverage: number
  redAverage: number
}

export type PosCustomField = { id: string; label: string; type: string }

/** One entry in the app's Change History, which is what makes a change undoable. */
export type PosChange = { id: string; at: string; by: string; summary: string; reverted: boolean }

/** One record captured by a generic create dialog. */
export type AppRecord = { id: string; createdAt: string; title: string; fields: Record<string, string> }

export type PosSettings = {
  taxCategories: PosTaxCategory[]
  customerGroups: PosCustomerGroup[]
  loyalty: PosLoyaltyProgramme[]
  cashVariance: PosCashVariance
  customFields: PosCustomField[]
  agents: { pauseAll: boolean; autoRunOnNew: boolean; autoPauseAt: string; disabled: string[] }
  changes: PosChange[]
}

/** An inbound RFP on its way to becoming a deck. */
export type Rfp = {
  id: string
  prospect: string
  summary: string
  stage: string
  vertical: string
  estimate: number
  schema: string
  deadline: string
  createdAt: string
}

export type KbDoc = { id: string; title: string; category: string; addedAt: string }

export type PitchTemplate = { id: string; name: string; isDefault: boolean; addedAt: string }

export type BrandKit = {
  firmName: string
  logoUrl: string
  primary: string
  accent: string
  dark: string
  contactName: string
  contactTitle: string
  contactEmail: string
  contactPhone: string
}

export type CustomSchema = { id: string; name: string; fields: string[] }

/** One individually tagged unit in the asset register. */
export type Asset = {
  id: string
  name: string
  tagNo: string
  type: string
  stage: string
  project: string
  purchase: string
  assignedTo: string | null
  warrantyEnd: string
  acquiredAt: string
}

export type AssetRequest = {
  id: string
  reference: string
  type: string
  status: string
  raisedBy: string
  approvedBy: string | null
  detail: string
  createdAt: string
}

export type ApprovalLevel = { id: string; level: number; type: string; approvers: string[] }

export type AssetSettings = {
  approvalLevels: ApprovalLevel[]
  customFields: { id: string; label: string; type: string }[]
  taxonomies: Record<string, TaxonomyEntry[]>
  agents: {
    pauseAll: boolean
    autoRunOnNew: boolean
    autoPauseAt: string
    disabled: string[]
  }
}

/** A rule-shaped record in Support settings — escalations, inboxes, channels, handoffs. */
export type SupportRule = { id: string; name: string; detail: string; enabled: boolean }

/** Everything the Support & Ticketing settings tab edits. */
export type SupportSettings = {
  statuses: FieldRow[]
  categories: FieldRow[]
  priorities: FieldRow[]
  types: FieldRow[]
  channels: FieldRow[]
  widget: {
    enabled: boolean
    panelTitle: string
    launcherText: string
    subtitle: string
    confirmation: string
    accent: string
    position: string
    showHelpTab: boolean
    requireEmail: boolean
  }
  csat: {
    sendOnResolve: boolean
    waitHours: number
    skipOlderDays: number
    lowScore: number
    slaWarnPercent: number
    portalUrl: string
  }
  escalationRules: SupportRule[]
  inboxAccounts: SupportRule[]
  inboundChannels: SupportRule[]
  businessHours: SupportRule[]
  autoResponses: SupportRule[]
  shiftHandoffs: SupportRule[]
  reportSchedules: SupportRule[]
  /** Tier → SLA policy name. Empty means the tier falls back to the default. */
  tierPolicies: Record<string, string>
  indexedArticles: string[]
}

/** One support ticket. */
export type Ticket = {
  id: string
  reference: string
  subject: string
  requester: string
  status: string
  priority: string
  category: string
  source: string
  tags: string[]
  assignee: string | null
  createdAt: string
  resolvedAt?: string
  slaBreached: boolean
  csat: number | null
}

export type KbArticle = {
  id: string
  title: string
  category: string
  state: 'draft' | 'published' | 'archived'
  body: string
  updatedAt: string
}

export type CannedResponse = { id: string; title: string; body: string }

/** Travel & Expense configuration, edited on that app's Settings tab. */
export type TeSettings = {
  enforcement: 'warn' | 'block'
  receiptRequiredAbove: string
  flagDuplicates: boolean
  categoryLimits: Record<string, string>
  receiptEmail: { enabled: boolean; address: string }
  travel: { advancePercent: number; approvalAbove: string; perDiem: string }
  travelNotifications: Record<string, boolean>
  approvalLevels: { id: string; label: string; threshold: string }[]
  slaDays: number
  glAccounts: Record<string, string>
  customFields: { id: string; label: string; type: string; required: boolean }[]
  segmentFields: Record<string, string[]>
}

/** One expense report — a trip's worth of expenses, submitted and reimbursed once. */
export type ExpenseReport = {
  id: string
  title: string
  currency: string
  status: 'Draft' | 'Submitted' | 'Approved' | 'Reimbursed'
  total: number
  createdAt: string
  /** Set when the report is reimbursed, so turnaround is measured rather than guessed. */
  reimbursedAt?: string
}

export type TravelRequest = {
  id: string
  purpose: string
  start: string
  end: string
  type: 'domestic' | 'international'
  estimatedCost: number
  project: string
  budgetHead: string
  status: 'Active' | 'Closed'
}

/** A row imported from a corporate card statement. */
export type CardTransaction = {
  id: string
  date: string
  merchant: string
  amount: number
  matchedTo: string | null
}

export type ReimbursementRun = {
  id: string
  stage: string
  reportIds: string[]
  total: number
  createdAt: string
}

/** A Data Protection Impact Assessment (GDPR Art. 35). */
export type Dpia = {
  id: string
  title: string
  activity: string
  risk: 'Low' | 'Medium' | 'High'
  status: 'Draft' | 'In review' | 'Approved'
}

/** An automated decision or profiling activity (GDPR Art. 22). */
export type AutomatedDecision = {
  id: string
  name: string
  profiling: boolean
  humanReview: boolean
  status: 'Registered' | 'Needs review'
}

/** How long data pulled through a connector is kept before purge. */
export type RetentionPolicy = {
  id: string
  connectorId: string
  keepForDays: number
  enabled: boolean
  lastRun: string
}

/** A role a portal user is assigned, deciding which tabs and fields they see. */
export type PortalPermission = { read: boolean; comment: boolean; download: boolean; hidden: string[] }

export type PortalRole = {
  id: string
  name: string
  description: string
  isDefault: boolean
  scope: string
  permissions: Record<string, PortalPermission>
}

/** One guardrail policy. Scope is 'Global' or an installed app's code. */
export type GuardrailPolicy = {
  id: string
  name: string
  type: GuardrailType
  action: GuardrailAction
  checkPoint: CheckPoint
  scope: string
  active: boolean
}

/**
 * The policies a tenant starts with. They are the ones the rest of the app already
 * refers to — the approval queue's two paused runs name the first two by hand, and
 * the sample trace's policy check is the fourth.
 */
const defaultPolicies: GuardrailPolicy[] = ([
  { name: 'Approval cap — ₹50,000', type: 'Spend Cap', action: 'hitl', checkPoint: 'Output', scope: 'Global' },
  { name: 'Content filter — legal text', type: 'Content Filter', action: 'hitl', checkPoint: 'Output', scope: 'Global' },
  { name: 'PII redaction', type: 'PII Redaction', action: 'redact', checkPoint: 'Both', scope: 'Global' },
  { name: 'Max tool calls 8/12', type: 'Rate Limit', action: 'block', checkPoint: 'Input', scope: 'Global' },
  { name: 'Profanity keyword block', type: 'Keyword Block', action: 'warn', checkPoint: 'Both', scope: 'Global' },
] as Omit<GuardrailPolicy, 'id' | 'active'>[]).map((policy) => ({
  ...policy,
  id: crypto.randomUUID(),
  active: true,
}))

/**
 * A legal entity under the tenant. The primary company is derived from the
 * session (the org named at signup), so only entities the admin adds are stored.
 */
export type Company = {
  id: string
  name: string
  code: string
  currency: string
  country: string
  parentId: string | null
  status: 'ACTIVE' | 'INACTIVE'
}

/** Two entities that transact internally, and the account their postings net into. */
export type IntercompanyPair = {
  id: string
  fromId: string
  toId: string
  eliminationAccount: string
}

export type ScheduleKind = 'Agent' | 'Pipeline' | 'Bot' | 'Canvas Workflow'

export type Schedule = {
  id: string
  name: string
  kind: ScheduleKind
  target: string
  cadence: string
  nextRun: string
  active: boolean
}

export type ChecklistTask = {
  id: string
  icon: string
  name: string
  blurb: string
  done: boolean
  to?: string
  action?: 'allocate' | 'invite'
}

type WorkspaceValue = Persisted & {
  creditsTotal: number
  creditsLeft: number
  appQuota: number
  trialDaysLeft: number
  checklist: ChecklistTask[]
  checklistDone: number
  setFlag: (flag: 'creditsAllocated' | 'invitedTeammate' | 'usedCopilot' | 'dismissedChecklist', value?: boolean) => void
  setTwoFactor: (value: Persisted['twoFactor']) => void
  unreadCount: number
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  notify: (title: string, body: string) => void
  decideApproval: (id: string, decision: ApprovalDecision, agent: string) => void
  logAudit: (event: AuditEvent) => void
  addCompany: (company: Omit<Company, 'id' | 'status'>) => void
  addIntercompanyPair: (pair: Omit<IntercompanyPair, 'id'>) => void
  updateCompany: (id: string, patch: Partial<Company>) => void
  addPolicy: (policy: Omit<GuardrailPolicy, 'id'>) => void
  updatePolicy: (id: string, patch: Partial<GuardrailPolicy>) => void
  deletePolicy: (id: string) => void
  pairRunner: (input: { name: string; description: string }) => Runner
  removeRunner: (id: string) => void
  addConnection: (input: Omit<Connection, 'id' | 'createdAt'>) => void
  removeConnection: (id: string) => void
  addCustomConnector: (input: Omit<CustomConnector, 'id'>) => void
  setPortalTabs: (tabs: string[]) => void
  addPortalRole: (role: Omit<PortalRole, 'id'>) => void
  removePortalRole: (id: string) => void
  addInventoryField: (field: Omit<InventoryField, 'id'>) => void
  updateInventoryField: (id: string, patch: Partial<InventoryField>) => void
  removeInventoryField: (id: string) => void
  addDataFlow: (flow: Omit<DataFlow, 'id'>) => void
  addDpia: (dpia: Omit<Dpia, 'id'>) => void
  addAutomatedDecision: (entry: Omit<AutomatedDecision, 'id'>) => void
  addRetentionPolicy: (policy: Omit<RetentionPolicy, 'id'>) => void
  removeRetentionPolicy: (id: string) => void
  addExpenseReport: (report: Omit<ExpenseReport, 'id' | 'createdAt'>) => void
  advanceExpenseReport: (id: string) => void
  addTravelRequest: (request: Omit<TravelRequest, 'id' | 'status'>) => void
  closeTravelRequest: (id: string) => void
  importCardTransactions: (rows: Omit<CardTransaction, 'id'>[]) => void
  autoMatchCards: () => number
  createReimbursementRun: (reportIds: string[]) => void
  advanceReimbursementRun: (id: string) => void
  updateTeSettings: (patch: Partial<TeSettings>) => void
  addTicket: (ticket: Omit<Ticket, 'id' | 'reference' | 'createdAt' | 'slaBreached' | 'csat'>) => void
  updateTicket: (id: string, patch: Partial<Ticket>) => void
  addKbArticle: (article: Omit<KbArticle, 'id' | 'updatedAt'>) => void
  removeKbArticle: (id: string) => void
  addKbCategory: (name: string) => void
  addCannedResponse: (response: Omit<CannedResponse, 'id'>) => void
  removeCannedResponse: (id: string) => void
  updateSupportSettings: (patch: Partial<SupportSettings>) => void
  addAsset: (asset: Omit<Asset, 'id' | 'tagNo' | 'acquiredAt'>) => void
  updateAsset: (id: string, patch: Partial<Asset>) => void
  removeAsset: (id: string) => void
  addAssetRequest: (request: Omit<AssetRequest, 'id' | 'reference' | 'createdAt' | 'approvedBy'>) => void
  decideAssetRequest: (id: string, status: string, approver: string) => void
  updateAssetSettings: (patch: Partial<AssetSettings>) => void
  resetAssetSettings: () => void
  addRfp: (rfp: Omit<Rfp, 'id' | 'createdAt'>) => void
  updateRfp: (id: string, patch: Partial<Rfp>) => void
  addKbDoc: (doc: Omit<KbDoc, 'id' | 'addedAt'>) => void
  removeKbDoc: (id: string) => void
  addPitchTemplate: (name: string) => void
  setDefaultTemplate: (id: string) => void
  removePitchTemplate: (id: string) => void
  updateBrandKit: (patch: Partial<BrandKit>) => void
  addCustomSchema: (schema: Omit<CustomSchema, 'id'>) => void
  updateCustomSchema: (id: string, patch: Partial<CustomSchema>) => void
  loadPitchSample: () => void
  clearPitchSample: () => void
  addPosCustomer: (customer: Omit<PosCustomer, 'id' | 'createdAt'>) => void
  addPosDoc: (doc: Omit<PosDoc, 'id' | 'reference' | 'createdAt'>) => void
  updatePosDoc: (id: string, patch: Partial<PosDoc>) => void
  removePosDoc: (id: string) => void
  openPosShift: (shift: Omit<PosShift, 'id' | 'openedAt' | 'cashTaken' | 'cardTaken'>) => void
  closePosShift: (id: string, countedCash: number) => void
  updateMatchSettings: (patch: Partial<MatchSettings>) => void
  updatePosSettings: (patch: Partial<PosSettings>, summary: string) => void
  addAppRecord: (key: string, title: string, fields: Record<string, string>) => void
  removeAppRecord: (key: string, id: string) => void
  removeCustomConnector: (id: string) => void
  toggleSchedule: (id: string) => void
  addSchedule: (schedule: Omit<Schedule, 'id'>) => void
  removeSchedule: (id: string) => void
  install: (code: string) => void
  uninstall: (code: string) => void
  reload: () => void
  toggleAppDisabled: (code: string) => void
  spend: (credits: number) => boolean
  addArtifact: (input: { name: string; skill: string; kind: string }) => Artifact
  publishArtifact: (id: string) => void
  recordRun: (input: { agent: string; source: string }) => Run
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

/** A fresh tenant ships with CRM and HR & People Ops, as the live product does. */
const defaultInstalled = ['CRM', 'HR']

const empty: Persisted = {
  installed: defaultInstalled,
  disabledApps: [],
  creditsUsed: 0,
  creditsAllocated: false,
  invitedTeammate: false,
  usedCopilot: false,
  dismissedChecklist: false,
  twoFactor: 'pending',
  artifacts: [],
  runs: [],
  notifications: [],
  approvals: {},
  schedules: [],
  companies: [],
  intercompanyPairs: [],
  primaryOverride: null,
  policies: defaultPolicies,
  runners: [],
  connections: [],
  customConnectors: [],
  portalTabs: null,
  portalRoles: [],
  dataInventory,
  dataFlows,
  dpias: [],
  automatedDecisions: [],
  retentionPolicies: [],
  expenseReports: [],
  travelRequests: [],
  cardTransactions: [],
  reimbursementRuns: [],
  teSettings: {
    enforcement: 'warn',
    receiptRequiredAbove: '',
    flagDuplicates: true,
    categoryLimits: {},
    receiptEmail: { enabled: false, address: 'expenses@apragya-tenant.mail' },
    travel: { advancePercent: 80, approvalAbove: '', perDiem: '' },
    travelNotifications: { submitted: true, approved: true, rejected: true, advance: false, settle: false },
    approvalLevels: [
      { id: 'l1', label: 'Reporting manager', threshold: '' },
      { id: 'l2', label: 'Finance', threshold: '1000' },
    ],
    slaDays: 21,
    glAccounts: {},
    customFields: [],
    segmentFields: {},
  },
  tickets: [],
  kbArticles: [],
  kbCategories: ['Getting started', 'Billing', 'Troubleshooting'],
  cannedResponses: [],
  supportSettings: {
    statuses: defaultStatuses,
    categories: defaultCategories,
    priorities: defaultPriorities,
    types: defaultTypes,
    channels: defaultChannels,
    widget: {
      enabled: false,
      panelTitle: 'How can we help?',
      launcherText: 'Support',
      subtitle: 'We usually reply within a few hours.',
      confirmation: "Thanks — we've got your message and emailed you a copy.",
      accent: '#0f766e',
      position: 'Bottom right',
      showHelpTab: true,
      requireEmail: true,
    },
    csat: {
      sendOnResolve: true,
      waitHours: 1,
      skipOlderDays: 14,
      lowScore: 3,
      slaWarnPercent: 75,
      portalUrl: '',
    },
    escalationRules: [],
    inboxAccounts: [],
    inboundChannels: [],
    businessHours: [],
    autoResponses: [],
    shiftHandoffs: [],
    reportSchedules: [],
    tierPolicies: {},
    indexedArticles: [],
  },
  assets: [],
  assetRequests: [],
  assetSettings: {
    approvalLevels: [{ id: 'l1', level: 1, type: 'By Role', approvers: ['Manager (unknown)'] }],
    customFields: [],
    taxonomies: {
      asset_types: defaultAssetTypes,
      makes: defaultMakes,
      models: [],
      mode_of_purchase: defaultModeOfPurchase,
      retirement_reasons: defaultRetirementReasons,
      warranty: [],
      numbering: [],
      reasons: defaultSupportReasons,
      notification: [],
    },
    agents: { pauseAll: false, autoRunOnNew: true, autoPauseAt: '', disabled: [] },
  },
  rfps: [],
  kbDocs: [],
  pitchTemplates: [],
  brandKit: brandDefaults,
  customSchemas: [],
  pitchSampleLoaded: false,
  posCustomers: [],
  posDocs: [],
  posShifts: [],
  matchSettings: {
    priceTolerance: 5,
    priceAction: 'Warn — flag it, allow the post',
    quantityTolerance: 2,
    quantityAction: 'Warn — flag it, allow the post',
    requireOrder: false,
    requireDelivery: false,
  },
  posSettings: {
    taxCategories: [],
    customerGroups: [],
    loyalty: [],
    // The live tenant's shipped tolerances, in the till's own currency.
    cashVariance: { reasonAbove: 1, amberWorst: 1, redWorst: 5, amberAverage: 0.5, redAverage: 2 },
    customFields: [],
    agents: { pauseAll: false, autoRunOnNew: true, autoPauseAt: '', disabled: [] },
    changes: [],
  },
  appRecords: {},
  // A fresh tenant already has history: the org was created and its trial began.
  audit: [
    auditEvent({ action: 'trial.started', resource: 'subscription', user: '' }),
    auditEvent({ action: 'trial.started', resource: 'subscription', user: '' }),
    auditEvent({ action: 'org.created', resource: 'tenant', role: '' }),
  ],
  version: STORAGE_VERSION,
}

/**
 * App codes changed as the catalogue was rebuilt against the live marketplace.
 * Without this, a workspace saved before that change keeps codes nothing matches,
 * and the sidebar silently shows no apps at all.
 */
const renamedCodes: Record<string, string> = {
  CR: 'CRM',
  CM: 'CTR',
  IA: 'P2P',
  AP: 'P2P',
  PR: 'P2P',
  SL: 'POS',
  IN: 'INV',
  PY: 'PAY',
}

function reconcileInstalled(codes: unknown): string[] {
  if (!Array.isArray(codes)) return []
  const known = new Set(marketApps.map((app) => app.code))

  const mapped = codes
    .filter((code): code is string => typeof code === 'string')
    .map((code) => (known.has(code) ? code : (renamedCodes[code] ?? null)))
    .filter((code): code is string => code !== null && known.has(code))

  return [...new Set(mapped)]
}

function migrate(stored: Partial<Persisted>): Persisted {
  const installed = reconcileInstalled(stored.installed)

  // v1 workspaces predate the default app set — add it without dropping their own picks.
  const withDefaults =
    (stored.version ?? 1) < 2 ? [...new Set([...defaultInstalled, ...installed])] : installed

  return { ...empty, ...stored, installed: withDefaults, version: STORAGE_VERSION }
}

function read(): Persisted {
  if (typeof window === 'undefined') return empty
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty

    const stored = JSON.parse(raw) as Partial<Persisted>
    const migrated = migrate(stored)

    // Persist immediately so the migration runs once, not on every mount.
    if ((stored.version ?? 1) !== STORAGE_VERSION) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      } catch {
        /* storage unavailable — the in-memory value is still correct */
      }
    }

    return migrated
  } catch {
    return empty
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(empty)
  useEffect(() => { setState(read()) }, [])

  const update = useCallback((next: Persisted | ((prev: Persisted) => Persisted)) => {
    setState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        /* storage unavailable — state stays in memory for this session */
      }
      return value
    })
  }, [])

  /** Re-reads the persisted workspace, so a refresh control picks up another tab's writes. */
  const reload = useCallback(() => setState(read()), [])

  const notify = useCallback(
    (title: string, body: string) =>
      update((prev) => ({
        ...prev,
        notifications: [
          { id: crypto.randomUUID(), title, body, at: new Date().toISOString(), read: false },
          ...prev.notifications,
        ].slice(0, 50),
      })),
    [update],
  )

  const install = useCallback(
    (code: string) =>
      update((prev) => {
        if (prev.installed.includes(code)) return prev
        const app = marketApps.find((item) => item.code === code)
        const name = app?.name ?? code
        return {
          ...prev,
          installed: [...prev.installed, code],
          audit: [auditEvent({ action: 'app.installed', resource: 'app', resourceId: code }), ...prev.audit],
          notifications: [
            {
              id: crypto.randomUUID(),
              title: `${name} Installed`,
              body: `${name} has been installed successfully. You can access it from the Enterprise sidebar.`,
              at: new Date().toISOString(),
              read: false,
            },
            ...prev.notifications,
          ].slice(0, 50),
        }
      }),
    [update],
  )

  const uninstall = useCallback(
    (code: string) =>
      update((prev) => ({
        ...prev,
        installed: prev.installed.filter((item) => item !== code),
        audit: [auditEvent({ action: 'app.uninstalled', resource: 'app', resourceId: code }), ...prev.audit],
      })),
    [update],
  )

  const toggleAppDisabled = useCallback(
    (code: string) =>
      update((prev) => {
        const off = prev.disabledApps.includes(code)
        return {
          ...prev,
          disabledApps: off ? prev.disabledApps.filter((item) => item !== code) : [...prev.disabledApps, code],
          audit: [
            auditEvent({ action: off ? 'app.enabled' : 'app.disabled', resource: 'app', resourceId: code }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const creditsLeft = MONTHLY_CREDITS - state.creditsUsed

  const spend = useCallback(
    (credits: number) => {
      if (creditsLeft < credits) return false
      update((prev) => ({ ...prev, creditsUsed: prev.creditsUsed + credits }))
      return true
    },
    [creditsLeft, update],
  )

  const addArtifact = useCallback(
    ({ name, skill, kind }: { name: string; skill: string; kind: string }) => {
      const artifact: Artifact = {
        id: crypto.randomUUID(),
        name,
        skill,
        kind,
        version: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
      }
      update((prev) => ({ ...prev, artifacts: [artifact, ...prev.artifacts] }))
      return artifact
    },
    [update],
  )

  const publishArtifact = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        artifacts: prev.artifacts.map((artifact) =>
          artifact.id === id
            ? { ...artifact, status: 'published', version: artifact.version + 1 }
            : artifact,
        ),
      })),
    [update],
  )

  const recordRun = useCallback(
    ({ agent, source }: { agent: string; source: string }) => {
      const trace = sampleTrace
      const run: Run = {
        id: `run_${Math.random().toString(36).slice(2, 8)}`,
        agent,
        source,
        status: 'success',
        startedAt: new Date().toISOString(),
        credits: trace.reduce((sum, step) => sum + step.credits, 0),
        ms: trace.reduce((sum, step) => sum + step.ms, 0),
        trace,
      }
      update((prev) => ({
        ...prev,
        runs: [run, ...prev.runs].slice(0, 25),
        creditsUsed: prev.creditsUsed + run.credits,
        audit: [
          auditEvent({ action: 'agent.run', resource: 'run', resourceId: run.id, status: 'Success' }),
          ...prev.audit,
        ],
      }))
      return run
    },
    [update],
  )

  const setFlag = useCallback(
    (flag: 'creditsAllocated' | 'invitedTeammate' | 'usedCopilot' | 'dismissedChecklist', value = true) =>
      update((prev) => ({ ...prev, [flag]: value })),
    [update],
  )

  const setTwoFactor = useCallback(
    (value: Persisted['twoFactor']) => update((prev) => ({ ...prev, twoFactor: value })),
    [update],
  )

  const markNotificationRead = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        notifications: prev.notifications.map((item) => (item.id === id ? { ...item, read: true } : item)),
      })),
    [update],
  )

  /* A decision resumes the paused run and is written to the audit trail. */
  const decideApproval = useCallback(
    (id: string, decision: ApprovalDecision, agent: string) =>
      update((prev) => ({
        ...prev,
        approvals: { ...prev.approvals, [id]: decision },
        audit: [auditEvent({ action: `approval.${decision}`, resource: 'approval', resourceId: id }), ...prev.audit],
        notifications: [
          {
            id: crypto.randomUUID(),
            title: `${agent} ${decision}`,
            body: `You ${decision} a paused run. The decision is recorded in the audit trail with actor and timestamp.`,
            at: new Date().toISOString(),
            read: false,
          },
          ...prev.notifications,
        ].slice(0, 50),
      })),
    [update],
  )

  const logAudit = useCallback(
    (event: AuditEvent) => update((prev) => ({ ...prev, audit: [event, ...prev.audit].slice(0, 500) })),
    [update],
  )

  const addCompany = useCallback(
    (company: Omit<Company, 'id' | 'status'>) =>
      update((prev) => {
        const entity: Company = { ...company, id: crypto.randomUUID(), status: 'ACTIVE' }
        return {
          ...prev,
          companies: [...prev.companies, entity],
          audit: [
            auditEvent({ action: 'company.created', resource: 'company', resourceId: entity.id }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const updateCompany = useCallback(
    (id: string, patch: Partial<Company>) =>
      update((prev) => ({
        ...prev,
        primaryOverride: id === 'primary' ? { ...prev.primaryOverride, ...patch } : prev.primaryOverride,
        companies:
          id === 'primary'
            ? prev.companies
            : prev.companies.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        audit: [auditEvent({ action: 'company.updated', resource: 'company', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  const addPolicy = useCallback(
    (policy: Omit<GuardrailPolicy, 'id'>) =>
      update((prev) => {
        const entry: GuardrailPolicy = { ...policy, id: crypto.randomUUID() }
        return {
          ...prev,
          policies: [entry, ...prev.policies],
          audit: [
            auditEvent({ action: 'policy.created', resource: 'guardrail', resourceId: entry.id }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const updatePolicy = useCallback(
    (id: string, patch: Partial<GuardrailPolicy>) =>
      update((prev) => ({
        ...prev,
        policies: prev.policies.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        audit: [auditEvent({ action: 'policy.updated', resource: 'guardrail', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  const deletePolicy = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        policies: prev.policies.filter((item) => item.id !== id),
        audit: [auditEvent({ action: 'policy.deleted', resource: 'guardrail', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  const pairRunner = useCallback(
    ({ name, description }: { name: string; description: string }) => {
      const runner: Runner = {
        id: crypto.randomUUID(),
        name,
        description,
        status: 'pending',
        // A pairing token is a one-time secret; this one is generated locally.
        token: `apr_rnr_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
        pairedAt: new Date().toISOString(),
      }
      update((prev) => ({
        ...prev,
        runners: [runner, ...prev.runners],
        audit: [
          auditEvent({ action: 'runner.paired', resource: 'runner', resourceId: runner.id }),
          ...prev.audit,
        ],
      }))
      return runner
    },
    [update],
  )

  const addConnection = useCallback(
    (input: Omit<Connection, 'id' | 'createdAt'>) =>
      update((prev) => {
        const entry: Connection = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
        return {
          ...prev,
          connections: [entry, ...prev.connections],
          audit: [
            auditEvent({ action: 'connection.created', resource: 'connection', resourceId: entry.id }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const removeConnection = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        connections: prev.connections.filter((item) => item.id !== id),
        audit: [
          auditEvent({ action: 'connection.removed', resource: 'connection', resourceId: id }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const addCustomConnector = useCallback(
    (input: Omit<CustomConnector, 'id'>) =>
      update((prev) => {
        const entry: CustomConnector = { ...input, id: crypto.randomUUID() }
        return {
          ...prev,
          customConnectors: [entry, ...prev.customConnectors],
          audit: [
            auditEvent({ action: 'connector.registered', resource: 'connector', resourceId: entry.id }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const removeCustomConnector = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        customConnectors: prev.customConnectors.filter((item) => item.id !== id),
        audit: [
          auditEvent({ action: 'connector.removed', resource: 'connector', resourceId: id }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const setPortalTabs = useCallback(
    (tabs: string[]) =>
      update((prev) => ({
        ...prev,
        portalTabs: tabs,
        audit: [auditEvent({ action: 'portal.tabs_updated', resource: 'portal', resourceId: 'tabs' }), ...prev.audit],
      })),
    [update],
  )

  const addPortalRole = useCallback(
    (role: Omit<PortalRole, 'id'>) =>
      update((prev) => {
        const entry: PortalRole = { ...role, id: crypto.randomUUID() }
        return {
          ...prev,
          // Only one role can be the tenant default.
          portalRoles: [
            ...prev.portalRoles.map((item) => (entry.isDefault ? { ...item, isDefault: false } : item)),
            entry,
          ],
          audit: [
            auditEvent({ action: 'portal.role_created', resource: 'portal', resourceId: entry.id }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const removePortalRole = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        portalRoles: prev.portalRoles.filter((item) => item.id !== id),
        audit: [
          auditEvent({ action: 'portal.role_removed', resource: 'portal', resourceId: id }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const addInventoryField = useCallback(
    (field: Omit<InventoryField, 'id'>) =>
      update((prev) => ({
        ...prev,
        dataInventory: [...prev.dataInventory, { ...field, id: `${field.entity}.${field.field}` }],
        audit: [
          auditEvent({ action: 'inventory.field_added', resource: 'compliance', resourceId: field.field }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const updateInventoryField = useCallback(
    (id: string, patch: Partial<InventoryField>) =>
      update((prev) => ({
        ...prev,
        dataInventory: prev.dataInventory.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        audit: [
          auditEvent({ action: 'inventory.field_updated', resource: 'compliance', resourceId: id }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const removeInventoryField = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        dataInventory: prev.dataInventory.filter((item) => item.id !== id),
        audit: [
          auditEvent({ action: 'inventory.field_removed', resource: 'compliance', resourceId: id }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const addDataFlow = useCallback(
    (flow: Omit<DataFlow, 'id'>) =>
      update((prev) => ({
        ...prev,
        dataFlows: [...prev.dataFlows, { ...flow, id: crypto.randomUUID() }],
        audit: [auditEvent({ action: 'flow.mapped', resource: 'compliance', resourceId: flow.name }), ...prev.audit],
      })),
    [update],
  )

  const addDpia = useCallback(
    (dpia: Omit<Dpia, 'id'>) =>
      update((prev) => ({
        ...prev,
        dpias: [{ ...dpia, id: crypto.randomUUID() }, ...prev.dpias],
        audit: [auditEvent({ action: 'dpia.created', resource: 'compliance', resourceId: dpia.title }), ...prev.audit],
      })),
    [update],
  )

  const addAutomatedDecision = useCallback(
    (entry: Omit<AutomatedDecision, 'id'>) =>
      update((prev) => ({
        ...prev,
        automatedDecisions: [{ ...entry, id: crypto.randomUUID() }, ...prev.automatedDecisions],
        audit: [
          auditEvent({ action: 'decision.registered', resource: 'compliance', resourceId: entry.name }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const addRetentionPolicy = useCallback(
    (policy: Omit<RetentionPolicy, 'id'>) =>
      update((prev) => ({
        ...prev,
        retentionPolicies: [...prev.retentionPolicies, { ...policy, id: crypto.randomUUID() }],
        audit: [
          auditEvent({ action: 'retention.policy_set', resource: 'compliance', resourceId: policy.connectorId }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const removeRetentionPolicy = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        retentionPolicies: prev.retentionPolicies.filter((item) => item.id !== id),
        audit: [
          auditEvent({ action: 'retention.policy_removed', resource: 'compliance', resourceId: id }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const addExpenseReport = useCallback(
    (report: Omit<ExpenseReport, 'id' | 'createdAt'>) =>
      update((prev) => {
        const entry: ExpenseReport = { ...report, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
        return {
          ...prev,
          expenseReports: [entry, ...prev.expenseReports],
          audit: [
            auditEvent({ action: 'expense.report_created', resource: 'expense_report', resourceId: entry.id }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  /** Draft → Submitted → Approved → Reimbursed, one step per call. */
  const advanceExpenseReport = useCallback(
    (id: string) =>
      update((prev) => {
        const order: ExpenseReport['status'][] = ['Draft', 'Submitted', 'Approved', 'Reimbursed']
        return {
          ...prev,
          expenseReports: prev.expenseReports.map((item) => {
            if (item.id !== id) return item
            const next = order[Math.min(order.indexOf(item.status) + 1, order.length - 1)]
            return {
              ...item,
              status: next,
              reimbursedAt: next === 'Reimbursed' ? new Date().toISOString() : item.reimbursedAt,
            }
          }),
          audit: [
            auditEvent({ action: 'expense.report_advanced', resource: 'expense_report', resourceId: id }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const addTravelRequest = useCallback(
    (request: Omit<TravelRequest, 'id' | 'status'>) =>
      update((prev) => {
        const entry: TravelRequest = { ...request, id: crypto.randomUUID(), status: 'Active' }
        return {
          ...prev,
          travelRequests: [entry, ...prev.travelRequests],
          audit: [
            auditEvent({ action: 'travel.request_created', resource: 'travel_request', resourceId: entry.id }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const closeTravelRequest = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        travelRequests: prev.travelRequests.map((item) =>
          item.id === id ? { ...item, status: 'Closed' as const } : item,
        ),
        audit: [
          auditEvent({ action: 'travel.request_closed', resource: 'travel_request', resourceId: id }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const importCardTransactions = useCallback(
    (rows: Omit<CardTransaction, 'id'>[]) =>
      update((prev) => {
        // The live importer skips duplicate rows; same date, merchant and amount is a duplicate.
        const seen = new Set(prev.cardTransactions.map((item) => `${item.date}|${item.merchant}|${item.amount}`))
        const fresh = rows
          .filter((row) => !seen.has(`${row.date}|${row.merchant}|${row.amount}`))
          .map((row) => ({ ...row, id: crypto.randomUUID() }))
        return {
          ...prev,
          cardTransactions: [...prev.cardTransactions, ...fresh],
          audit: [
            auditEvent({ action: 'card.statement_imported', resource: 'card', resourceId: `${fresh.length} rows` }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  /** Matches unmatched charges to reports of the same amount. Returns how many matched. */
  const autoMatchCards = useCallback(() => {
    let matched = 0
    update((prev) => {
      const next = prev.cardTransactions.map((txn) => {
        if (txn.matchedTo) return txn
        const report = prev.expenseReports.find((item) => Math.abs(item.total - txn.amount) < 0.005)
        if (!report) return txn
        matched += 1
        return { ...txn, matchedTo: report.id }
      })
      return { ...prev, cardTransactions: next }
    })
    return matched
  }, [update])

  const createReimbursementRun = useCallback(
    (reportIds: string[]) =>
      update((prev) => {
        const total = prev.expenseReports
          .filter((item) => reportIds.includes(item.id))
          .reduce((sum, item) => sum + item.total, 0)
        const run: ReimbursementRun = {
          id: crypto.randomUUID(),
          stage: 'Request Processed',
          reportIds,
          total,
          createdAt: new Date().toISOString(),
        }
        return {
          ...prev,
          reimbursementRuns: [run, ...prev.reimbursementRuns],
          audit: [
            auditEvent({ action: 'reimbursement.run_created', resource: 'reimbursement', resourceId: run.id }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const advanceReimbursementRun = useCallback(
    (id: string) =>
      update((prev) => {
        const stages = ['Request Processed', 'Moved to Accounts', 'Batch Generation', 'Disbursed']
        const run = prev.reimbursementRuns.find((item) => item.id === id)
        const nextStage = run ? stages[Math.min(stages.indexOf(run.stage) + 1, stages.length - 1)] : ''
        const disbursing = nextStage === 'Disbursed'
        return {
          ...prev,
          reimbursementRuns: prev.reimbursementRuns.map((item) =>
            item.id === id ? { ...item, stage: nextStage } : item,
          ),
          // Disbursing a run is what actually reimburses the reports inside it.
          expenseReports: prev.expenseReports.map((item) =>
            disbursing && run?.reportIds.includes(item.id)
              ? { ...item, status: 'Reimbursed' as const, reimbursedAt: new Date().toISOString() }
              : item,
          ),
          audit: [
            auditEvent({ action: 'reimbursement.run_advanced', resource: 'reimbursement', resourceId: id }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const updateTeSettings = useCallback(
    (patch: Partial<TeSettings>) =>
      update((prev) => ({
        ...prev,
        teSettings: { ...prev.teSettings, ...patch },
        audit: [
          auditEvent({ action: 'travel_expense.settings_updated', resource: 'app', resourceId: 'TE' }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const addTicket = useCallback(
    (ticket: Omit<Ticket, 'id' | 'reference' | 'createdAt' | 'slaBreached' | 'csat'>) =>
      update((prev) => {
        const entry: Ticket = {
          ...ticket,
          id: crypto.randomUUID(),
          // References run in tenant order, so the first ticket is #1 rather than a uuid.
          reference: `SUP-${String(prev.tickets.length + 1).padStart(4, '0')}`,
          createdAt: new Date().toISOString(),
          slaBreached: false,
          csat: null,
        }
        return {
          ...prev,
          tickets: [entry, ...prev.tickets],
          audit: [
            auditEvent({ action: 'support.ticket_created', resource: 'ticket', resourceId: entry.reference }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const updateTicket = useCallback(
    (id: string, patch: Partial<Ticket>) =>
      update((prev) => ({
        ...prev,
        tickets: prev.tickets.map((item) =>
          item.id === id
            ? {
                ...item,
                ...patch,
                resolvedAt:
                  patch.status === 'Resolved' || patch.status === 'Closed'
                    ? (item.resolvedAt ?? new Date().toISOString())
                    : item.resolvedAt,
              }
            : item,
        ),
        audit: [auditEvent({ action: 'support.ticket_updated', resource: 'ticket', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  const addKbArticle = useCallback(
    (article: Omit<KbArticle, 'id' | 'updatedAt'>) =>
      update((prev) => {
        const entry: KbArticle = { ...article, id: crypto.randomUUID(), updatedAt: new Date().toISOString() }
        return {
          ...prev,
          kbArticles: [entry, ...prev.kbArticles],
          audit: [
            auditEvent({ action: 'support.article_created', resource: 'article', resourceId: entry.title }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const removeKbArticle = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        kbArticles: prev.kbArticles.filter((item) => item.id !== id),
        audit: [auditEvent({ action: 'support.article_removed', resource: 'article', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  const addKbCategory = useCallback(
    (name: string) =>
      update((prev) =>
        prev.kbCategories.includes(name) ? prev : { ...prev, kbCategories: [...prev.kbCategories, name] },
      ),
    [update],
  )

  const addCannedResponse = useCallback(
    (response: Omit<CannedResponse, 'id'>) =>
      update((prev) => ({
        ...prev,
        cannedResponses: [{ ...response, id: crypto.randomUUID() }, ...prev.cannedResponses],
        audit: [
          auditEvent({ action: 'support.canned_created', resource: 'canned_response', resourceId: response.title }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const removeCannedResponse = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        cannedResponses: prev.cannedResponses.filter((item) => item.id !== id),
        audit: [
          auditEvent({ action: 'support.canned_removed', resource: 'canned_response', resourceId: id }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const updateSupportSettings = useCallback(
    (patch: Partial<SupportSettings>) =>
      update((prev) => ({
        ...prev,
        supportSettings: { ...prev.supportSettings, ...patch },
        audit: [
          auditEvent({ action: 'support.settings_updated', resource: 'app', resourceId: 'SUP' }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const addAsset = useCallback(
    (asset: Omit<Asset, 'id' | 'tagNo' | 'acquiredAt'>) =>
      update((prev) => {
        // The tag prefix comes from the asset type's taxonomy entry, as the live app does.
        const type = prev.assetSettings.taxonomies.asset_types?.find((item) => item.value === asset.type)
        const seq = prev.assets.filter((item) => item.type === asset.type).length + 1
        const entry: Asset = {
          ...asset,
          id: crypto.randomUUID(),
          tagNo: `${type?.tagPrefix ?? 'AST-'}${String(seq).padStart(4, '0')}`,
          acquiredAt: new Date().toISOString(),
        }
        return {
          ...prev,
          assets: [entry, ...prev.assets],
          audit: [
            auditEvent({ action: 'asset.created', resource: 'asset', resourceId: entry.tagNo }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const updateAsset = useCallback(
    (id: string, patch: Partial<Asset>) =>
      update((prev) => ({
        ...prev,
        assets: prev.assets.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        audit: [auditEvent({ action: 'asset.updated', resource: 'asset', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  const removeAsset = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        assets: prev.assets.filter((item) => item.id !== id),
        audit: [auditEvent({ action: 'asset.removed', resource: 'asset', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  const addAssetRequest = useCallback(
    (request: Omit<AssetRequest, 'id' | 'reference' | 'createdAt' | 'approvedBy'>) =>
      update((prev) => {
        const entry: AssetRequest = {
          ...request,
          id: crypto.randomUUID(),
          reference: `REQ-${String(prev.assetRequests.length + 1).padStart(4, '0')}`,
          approvedBy: null,
          createdAt: new Date().toISOString(),
        }
        return {
          ...prev,
          assetRequests: [entry, ...prev.assetRequests],
          audit: [
            auditEvent({ action: 'asset.request_raised', resource: 'asset_request', resourceId: entry.reference }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const decideAssetRequest = useCallback(
    (id: string, status: string, approver: string) =>
      update((prev) => ({
        ...prev,
        assetRequests: prev.assetRequests.map((item) =>
          item.id === id ? { ...item, status, approvedBy: approver } : item,
        ),
        audit: [
          auditEvent({ action: `asset.request_${status.toLowerCase()}`, resource: 'asset_request', resourceId: id }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  const updateAssetSettings = useCallback(
    (patch: Partial<AssetSettings>) =>
      update((prev) => ({
        ...prev,
        assetSettings: { ...prev.assetSettings, ...patch },
        audit: [
          auditEvent({ action: 'asset.settings_updated', resource: 'app', resourceId: 'ITAM' }),
          ...prev.audit,
        ],
      })),
    [update],
  )

  /** Puts the ITAM app back on the platform default its Change History names. */
  const resetAssetSettings = useCallback(
    () =>
      update((prev) => ({
        ...prev,
        assetSettings: empty.assetSettings,
        audit: [auditEvent({ action: 'asset.settings_reset', resource: 'app', resourceId: 'ITAM' }), ...prev.audit],
      })),
    [update],
  )

  const addRfp = useCallback(
    (rfp: Omit<Rfp, 'id' | 'createdAt'>) =>
      update((prev) => ({
        ...prev,
        rfps: [{ ...rfp, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...prev.rfps],
        audit: [auditEvent({ action: 'pitch.rfp_added', resource: 'rfp', resourceId: rfp.prospect }), ...prev.audit],
      })),
    [update],
  )

  const updateRfp = useCallback(
    (id: string, patch: Partial<Rfp>) =>
      update((prev) => ({
        ...prev,
        rfps: prev.rfps.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        audit: [auditEvent({ action: 'pitch.rfp_updated', resource: 'rfp', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  const addKbDoc = useCallback(
    (doc: Omit<KbDoc, 'id' | 'addedAt'>) =>
      update((prev) => ({
        ...prev,
        kbDocs: [{ ...doc, id: crypto.randomUUID(), addedAt: new Date().toISOString() }, ...prev.kbDocs],
        audit: [auditEvent({ action: 'pitch.kb_added', resource: 'kb_doc', resourceId: doc.title }), ...prev.audit],
      })),
    [update],
  )

  const removeKbDoc = useCallback(
    (id: string) => update((prev) => ({ ...prev, kbDocs: prev.kbDocs.filter((item) => item.id !== id) })),
    [update],
  )

  const addPitchTemplate = useCallback(
    (name: string) =>
      update((prev) => ({
        ...prev,
        pitchTemplates: [
          ...prev.pitchTemplates,
          // The first template uploaded becomes the active one.
          { id: crypto.randomUUID(), name, isDefault: prev.pitchTemplates.length === 0, addedAt: new Date().toISOString() },
        ],
        audit: [auditEvent({ action: 'pitch.template_added', resource: 'template', resourceId: name }), ...prev.audit],
      })),
    [update],
  )

  const setDefaultTemplate = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        pitchTemplates: prev.pitchTemplates.map((item) => ({ ...item, isDefault: item.id === id })),
      })),
    [update],
  )

  const removePitchTemplate = useCallback(
    (id: string) =>
      update((prev) => ({ ...prev, pitchTemplates: prev.pitchTemplates.filter((item) => item.id !== id) })),
    [update],
  )

  const updateBrandKit = useCallback(
    (patch: Partial<BrandKit>) =>
      update((prev) => ({
        ...prev,
        brandKit: { ...prev.brandKit, ...patch },
        audit: [auditEvent({ action: 'pitch.brand_updated', resource: 'brand_kit', resourceId: 'PP' }), ...prev.audit],
      })),
    [update],
  )

  const addCustomSchema = useCallback(
    (schema: Omit<CustomSchema, 'id'>) =>
      update((prev) => ({ ...prev, customSchemas: [...prev.customSchemas, { ...schema, id: crypto.randomUUID() }] })),
    [update],
  )

  const updateCustomSchema = useCallback(
    (id: string, patch: Partial<CustomSchema>) =>
      update((prev) => ({
        ...prev,
        customSchemas: prev.customSchemas.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      })),
    [update],
  )

  const loadPitchSample = useCallback(
    () =>
      update((prev) => ({
        ...prev,
        pitchSampleLoaded: true,
        rfps: [
          {
            id: crypto.randomUUID(),
            prospect: 'City of Hidden Hills',
            summary: 'Municipal website redesign and accessibility audit',
            stage: 'Your turn',
            vertical: 'Government / Municipal',
            estimate: 180000,
            schema: 'Government / Municipal',
            deadline: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            prospect: 'Meridian Health',
            summary: 'Patient portal rebuild with HL7 integration',
            stage: 'Drafting',
            vertical: 'Healthcare',
            estimate: 320000,
            schema: 'Software Development',
            deadline: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            prospect: 'Northwind Retail',
            summary: 'Brand refresh across 40 stores',
            stage: 'Out for client',
            vertical: 'Retail',
            estimate: 95000,
            schema: 'Design & Development',
            deadline: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            prospect: 'Adler Foundation',
            summary: 'Grants management consulting engagement',
            stage: 'Extracting',
            vertical: 'Non-profit',
            estimate: 60000,
            schema: 'Services & Consulting',
            deadline: '',
            createdAt: new Date().toISOString(),
          },
        ],
      })),
    [update],
  )

  const clearPitchSample = useCallback(
    () => update((prev) => ({ ...prev, pitchSampleLoaded: false, rfps: [], kbDocs: [], pitchTemplates: [] })),
    [update],
  )

  const addPosCustomer = useCallback(
    (customer: Omit<PosCustomer, 'id' | 'createdAt'>) =>
      update((prev) => ({
        ...prev,
        posCustomers: [
          { ...customer, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
          ...prev.posCustomers,
        ],
        audit: [auditEvent({ action: 'pos.customer_created', resource: 'customer', resourceId: customer.name }), ...prev.audit],
      })),
    [update],
  )

  /** Document references run per kind, so quotations and invoices number separately. */
  const addPosDoc = useCallback(
    (doc: Omit<PosDoc, 'id' | 'reference' | 'createdAt'>) =>
      update((prev) => {
        const prefixes: Record<PosDoc['kind'], string> = {
          quotation: 'QT',
          order: 'SO',
          delivery: 'DN',
          invoice: 'INV',
          return: 'RMA',
          credit: 'CN',
          refund: 'RF',
          contract: 'RC',
          subscription: 'SUB',
        }
        const seq = prev.posDocs.filter((item) => item.kind === doc.kind).length + 1
        const entry: PosDoc = {
          ...doc,
          id: crypto.randomUUID(),
          reference: `${prefixes[doc.kind]}-${String(seq).padStart(4, '0')}`,
          createdAt: new Date().toISOString(),
        }
        return {
          ...prev,
          posDocs: [entry, ...prev.posDocs],
          audit: [
            auditEvent({ action: `pos.${doc.kind}_created`, resource: 'sales_doc', resourceId: entry.reference }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const updatePosDoc = useCallback(
    (id: string, patch: Partial<PosDoc>) =>
      update((prev) => ({
        ...prev,
        posDocs: prev.posDocs.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        audit: [auditEvent({ action: 'pos.doc_updated', resource: 'sales_doc', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  const removePosDoc = useCallback(
    (id: string) => update((prev) => ({ ...prev, posDocs: prev.posDocs.filter((item) => item.id !== id) })),
    [update],
  )

  const openPosShift = useCallback(
    (shift: Omit<PosShift, 'id' | 'openedAt' | 'cashTaken' | 'cardTaken'>) =>
      update((prev) => ({
        ...prev,
        posShifts: [
          { ...shift, id: crypto.randomUUID(), openedAt: new Date().toISOString(), cashTaken: 0, cardTaken: 0 },
          ...prev.posShifts,
        ],
        audit: [auditEvent({ action: 'pos.shift_opened', resource: 'shift', resourceId: shift.cashier }), ...prev.audit],
      })),
    [update],
  )

  const closePosShift = useCallback(
    (id: string, countedCash: number) =>
      update((prev) => ({
        ...prev,
        posShifts: prev.posShifts.map((item) =>
          item.id === id ? { ...item, closedAt: new Date().toISOString(), countedCash } : item,
        ),
        audit: [auditEvent({ action: 'pos.shift_closed', resource: 'shift', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  const updateMatchSettings = useCallback(
    (patch: Partial<MatchSettings>) =>
      update((prev) => ({
        ...prev,
        matchSettings: { ...prev.matchSettings, ...patch },
        audit: [auditEvent({ action: 'pos.match_settings_updated', resource: 'app', resourceId: 'POS' }), ...prev.audit],
      })),
    [update],
  )

  const addAppRecord = useCallback(
    (key: string, title: string, fields: Record<string, string>) =>
      update((prev) => ({
        ...prev,
        appRecords: {
          ...prev.appRecords,
          [key]: [
            { id: crypto.randomUUID(), createdAt: new Date().toISOString(), title, fields },
            ...(prev.appRecords[key] ?? []),
          ],
        },
        audit: [auditEvent({ action: `${key}.created`, resource: 'record', resourceId: title }), ...prev.audit],
      })),
    [update],
  )

  const removeAppRecord = useCallback(
    (key: string, id: string) =>
      update((prev) => ({
        ...prev,
        appRecords: { ...prev.appRecords, [key]: (prev.appRecords[key] ?? []).filter((item) => item.id !== id) },
        audit: [auditEvent({ action: `${key}.deleted`, resource: 'record', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  /**
   * Every settings edit carries the one-line summary the app's Change History
   * shows, so "0 change(s) made so far" stays true until something really moves.
   */
  const updatePosSettings = useCallback(
    (patch: Partial<PosSettings>, summary: string) =>
      update((prev) => ({
        ...prev,
        posSettings: {
          ...prev.posSettings,
          ...patch,
          changes: [
            { id: crypto.randomUUID(), at: new Date().toISOString(), by: 'owner', summary, reverted: false },
            ...prev.posSettings.changes,
          ],
        },
        audit: [auditEvent({ action: 'pos.settings_updated', resource: 'app', resourceId: 'POS' }), ...prev.audit],
      })),
    [update],
  )

  const removeRunner = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        runners: prev.runners.filter((item) => item.id !== id),
        audit: [auditEvent({ action: 'runner.removed', resource: 'runner', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  const addIntercompanyPair = useCallback(
    (pair: Omit<IntercompanyPair, 'id'>) =>
      update((prev) => {
        const entry: IntercompanyPair = { ...pair, id: crypto.randomUUID() }
        return {
          ...prev,
          intercompanyPairs: [...prev.intercompanyPairs, entry],
          audit: [
            auditEvent({ action: 'intercompany.paired', resource: 'company', resourceId: entry.id }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const addSchedule = useCallback(
    (schedule: Omit<Schedule, 'id'>) =>
      update((prev) => {
        const entry: Schedule = { ...schedule, id: crypto.randomUUID() }
        return {
          ...prev,
          schedules: [entry, ...prev.schedules],
          audit: [
            auditEvent({ action: 'schedule.created', resource: 'schedule', resourceId: entry.id }),
            ...prev.audit,
          ],
        }
      }),
    [update],
  )

  const removeSchedule = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        schedules: prev.schedules.filter((item) => item.id !== id),
        audit: [auditEvent({ action: 'schedule.removed', resource: 'schedule', resourceId: id }), ...prev.audit],
      })),
    [update],
  )

  const toggleSchedule = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        schedules: prev.schedules.map((item) => (item.id === id ? { ...item, active: !item.active } : item)),
      })),
    [update],
  )

  const markAllNotificationsRead = useCallback(
    () =>
      update((prev) => ({
        ...prev,
        notifications: prev.notifications.map((item) => ({ ...item, read: true })),
      })),
    [update],
  )

  /* "Tasks tick off automatically as you go" — derive each from real tenant state. */
  const checklist: ChecklistTask[] = useMemo(
    () => [
      {
        id: 'agent',
        icon: '🤖',
        name: 'Create your first agent',
        blurb: 'Build a custom AI agent from scratch or a template.',
        done: state.artifacts.length > 0,
        to: '/app/build/vibe-studio',
      },
      {
        id: 'app',
        icon: '🗂',
        name: 'Install an enterprise app',
        blurb: 'CRM, HR, Invoicing — pre-built apps you can launch in minutes.',
        done: state.installed.length > 0,
        to: '/app/marketplace',
      },
      {
        id: 'credits',
        icon: '🪙',
        name: 'Allocate credits to yourself',
        blurb: 'Give your account tokens before running an AI tool.',
        done: state.creditsAllocated,
        action: 'allocate',
      },
      {
        id: 'invite',
        icon: '👤',
        name: 'Invite a teammate',
        blurb: "Send an invite — they'll join your workspace in one click.",
        done: state.invitedTeammate,
        action: 'invite',
      },
      {
        id: 'copilot',
        icon: '✨',
        name: 'Try the AI Copilot',
        blurb: 'Ask questions or take actions in plain English.',
        done: state.usedCopilot,
      },
    ],
    [state.artifacts.length, state.installed.length, state.creditsAllocated, state.invitedTeammate, state.usedCopilot],
  )

  const value = useMemo(
    () => ({
      ...state,
      creditsTotal: MONTHLY_CREDITS,
      creditsLeft,
      appQuota: APP_QUOTA,
      trialDaysLeft: TRIAL_DAYS,
      checklist,
      checklistDone: checklist.filter((task) => task.done).length,
      setFlag,
      setTwoFactor,
      unreadCount: state.notifications.filter((item) => !item.read).length,
      markNotificationRead,
      markAllNotificationsRead,
      notify,
      decideApproval,
      logAudit,
      addCompany,
      addIntercompanyPair,
      updateCompany,
      addPolicy,
      updatePolicy,
      deletePolicy,
      pairRunner,
      removeRunner,
      addConnection,
      removeConnection,
      addCustomConnector,
      removeCustomConnector,
      setPortalTabs,
      addPortalRole,
      removePortalRole,
      addInventoryField,
      updateInventoryField,
      removeInventoryField,
      addDataFlow,
      addDpia,
      addAutomatedDecision,
      addRetentionPolicy,
      removeRetentionPolicy,
      addExpenseReport,
      advanceExpenseReport,
      addTravelRequest,
      closeTravelRequest,
      importCardTransactions,
      autoMatchCards,
      createReimbursementRun,
      advanceReimbursementRun,
      updateTeSettings,
      addTicket,
      updateTicket,
      addKbArticle,
      removeKbArticle,
      addKbCategory,
      addCannedResponse,
      removeCannedResponse,
      updateSupportSettings,
      addAsset,
      updateAsset,
      removeAsset,
      addAssetRequest,
      decideAssetRequest,
      updateAssetSettings,
      resetAssetSettings,
      addRfp,
      updateRfp,
      addKbDoc,
      removeKbDoc,
      addPitchTemplate,
      setDefaultTemplate,
      removePitchTemplate,
      updateBrandKit,
      addCustomSchema,
      updateCustomSchema,
      loadPitchSample,
      clearPitchSample,
      addPosCustomer,
      addPosDoc,
      updatePosDoc,
      removePosDoc,
      openPosShift,
      closePosShift,
      updateMatchSettings,
      updatePosSettings,
      addAppRecord,
      removeAppRecord,
      toggleSchedule,
      addSchedule,
      removeSchedule,
      install,
      uninstall,
      reload,
      toggleAppDisabled,
      spend,
      addArtifact,
      publishArtifact,
      recordRun,
    }),
    [
      state,
      creditsLeft,
      checklist,
      setFlag,
      setTwoFactor,
      markNotificationRead,
      markAllNotificationsRead,
      notify,
      decideApproval,
      logAudit,
      addCompany,
      addIntercompanyPair,
      updateCompany,
      addPolicy,
      updatePolicy,
      deletePolicy,
      pairRunner,
      removeRunner,
      addConnection,
      removeConnection,
      addCustomConnector,
      removeCustomConnector,
      setPortalTabs,
      addPortalRole,
      removePortalRole,
      addInventoryField,
      updateInventoryField,
      removeInventoryField,
      addDataFlow,
      addDpia,
      addAutomatedDecision,
      addRetentionPolicy,
      removeRetentionPolicy,
      addExpenseReport,
      advanceExpenseReport,
      addTravelRequest,
      closeTravelRequest,
      importCardTransactions,
      autoMatchCards,
      createReimbursementRun,
      advanceReimbursementRun,
      updateTeSettings,
      addTicket,
      updateTicket,
      addKbArticle,
      removeKbArticle,
      addKbCategory,
      addCannedResponse,
      removeCannedResponse,
      updateSupportSettings,
      addAsset,
      updateAsset,
      removeAsset,
      addAssetRequest,
      decideAssetRequest,
      updateAssetSettings,
      resetAssetSettings,
      addRfp,
      updateRfp,
      addKbDoc,
      removeKbDoc,
      addPitchTemplate,
      setDefaultTemplate,
      removePitchTemplate,
      updateBrandKit,
      addCustomSchema,
      updateCustomSchema,
      loadPitchSample,
      clearPitchSample,
      addPosCustomer,
      addPosDoc,
      updatePosDoc,
      removePosDoc,
      openPosShift,
      closePosShift,
      updateMatchSettings,
      updatePosSettings,
      addAppRecord,
      removeAppRecord,
      toggleSchedule,
      addSchedule,
      removeSchedule,
      install,
      uninstall,
      reload,
      toggleAppDisabled,
      spend,
      addArtifact,
      publishArtifact,
      recordRun,
    ],
  )

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}
