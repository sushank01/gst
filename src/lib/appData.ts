import { agentsByAppCode } from './agentCatalog'

/**
 * Catalogue data for the signed-in product surfaces.
 * Sourced from apragya.ai's own product pages (/business-suite, /vibe-studio,
 * /agent-studio, /enterprise-apps) so the shapes match what the platform documents.
 */

export type SuiteTool = { icon: string; name: string; blurb: string; cost: number }

export const suiteTools: SuiteTool[] = [
  { icon: '💬', name: 'AI Chat', blurb: 'Research, brainstorming, and quick answers.', cost: 2 },
  { icon: '✍️', name: 'Writing', blurb: 'Drafts, edits, translations, tone shifts.', cost: 3 },
  { icon: '🎨', name: 'Image Generation', blurb: 'Visual content from prompts.', cost: 12 },
  { icon: '💻', name: 'Code', blurb: 'Explanations, refactors, unit tests, scripts.', cost: 4 },
  { icon: '🎙', name: 'Transcription', blurb: 'Speaker labels and searchable timestamps.', cost: 8 },
  { icon: '🌍', name: 'Translation', blurb: '40+ languages with terminology memory.', cost: 3 },
  { icon: '📢', name: 'Marketing', blurb: 'Blog posts, social, press releases.', cost: 4 },
  { icon: '📊', name: 'Data & Analytics', blurb: 'Cleanup, summarisation, SQL drafting.', cost: 5 },
  { icon: '🎯', name: 'SEO', blurb: 'Keywords, meta descriptions, on-page fixes.', cost: 3 },
  { icon: '🎨', name: 'Design & UX', blurb: 'UX writing, alt text, accessibility rewrites.', cost: 3 },
  { icon: '🎓', name: 'Education', blurb: 'Outlines, lesson plans, quizzes.', cost: 3 },
  { icon: '⚖️', name: 'Legal', blurb: 'Contract summaries, clause extraction.', cost: 6 },
  { icon: '❤️', name: 'Health & Wellness', blurb: 'Wellness comms and HR briefs.', cost: 2 },
  { icon: '🌟', name: 'Personal', blurb: 'Resumes, cover letters, LinkedIn posts.', cost: 2 },
  { icon: '📞', name: 'Communication', blurb: 'Announcements, follow-ups, thread summaries.', cost: 2 },
  { icon: '🤖', name: 'AI Agents', blurb: 'Ready-to-use templates for common tasks.', cost: 5 },
]

export type VibeSkill = { icon: string; name: string; blurb: string; artifact: string }

export const vibeSkills: VibeSkill[] = [
  { icon: '🤖', name: 'AI Agents', blurb: 'Chatbots, invoice reviewers, contract summarisers.', artifact: 'Agent' },
  { icon: '🧩', name: 'Business Solution Apps', blurb: 'Entities, screens, workflows, bound agents.', artifact: 'App' },
  { icon: '🌐', name: 'Web App Builder', blurb: 'Websites and internal tools in the browser.', artifact: 'Web app' },
  { icon: '📱', name: 'Mobile App Builder', blurb: 'React Native (Expo) apps from a prompt.', artifact: 'Mobile app' },
  { icon: '🤝', name: 'Web RPA Bots', blurb: 'Browser automation for tools without APIs.', artifact: 'Bot' },
  { icon: '💬', name: 'Chat with Docs', blurb: 'RAG Q&A over your documents, with citations.', artifact: 'Knowledge bot' },
  { icon: '📝', name: 'Doc & PDF Builder', blurb: 'Runbooks, specs, formatted PDFs.', artifact: 'Document' },
  { icon: '📊', name: 'Spreadsheet Builder', blurb: 'Live tables with formulas, plus .xlsx.', artifact: 'Spreadsheet' },
  { icon: '🎯', name: 'Presentation Builder', blurb: 'Slide decks with a downloadable .pptx.', artifact: 'Deck' },
  { icon: '🚀', name: 'Website Builder', blurb: 'Static multi-page marketing sites.', artifact: 'Website' },
  { icon: '⚙️', name: 'ERP Customisation', blurb: 'Extend enterprise apps without leaving the browser.', artifact: 'Extension' },
  { icon: '📚', name: 'Knowledge Bots', blurb: 'Q&A grounded in your wiki, tickets, playbooks.', artifact: 'Knowledge bot' },
]

export type AppKind = 'Data App' | 'Hybrid' | 'AI-Native'
export type MarketApp = {
  code: string
  icon: string
  tone: string
  name: string
  kind: AppKind
  category: string
  blurb: string
  installs: number
  featured?: boolean
  /** Apps above the current plan offer Upgrade rather than Install. */
  gated?: boolean
  agents: string[]
}

/** The 15 Enterprise Apps, transcribed from the live Marketplace. */
const apps: Omit<MarketApp, 'agents'>[] = [
  { code: 'TE', icon: '🧾', tone: 'bg-teal-600', name: 'Travel & Expense', kind: 'Data App', category: 'operations', blurb: 'Expense reports with receipt capture, travel requests, per-diems, and policy checks.', installs: 2 },
  { code: 'ITAM', icon: '💻', tone: 'bg-emerald-600', name: 'Asset Management', kind: 'Data App', category: 'operations', blurb: 'Track assets as individually tagged units through their full lifecycle.', installs: 4 },
  { code: 'MFG', icon: '📈', tone: 'bg-sky-500', name: 'Manufacturing', kind: 'Data App', category: 'operations', blurb: 'Bill of Materials, Work Orders, Job Cards, Production Planning, and downtime tracking.', installs: 11, gated: true },
  { code: 'PP', icon: '🖥', tone: 'bg-violet-600', name: 'Pitch Pilot', kind: 'Hybrid', category: 'sales', blurb: 'Turn every inbound RFP into a branded pitch deck. AI extracts requirements and drafts.', installs: 13, featured: true },
  { code: 'POS', icon: '🛍', tone: 'bg-emerald-500', name: 'Sales & POS', kind: 'Hybrid', category: 'finance', blurb: 'Order-to-cash for retail and B2B: customers, sales orders, deliveries, and POS shifts.', installs: 25, featured: true },
  { code: 'IDP', icon: '📄', tone: 'bg-sky-400', name: 'Intelligent Document Processing', kind: 'AI-Native', category: 'operations', blurb: 'AI-powered document intake, classification, field extraction, and validation.', installs: 19, featured: true, gated: true },
  { code: 'PAY', icon: '💵', tone: 'bg-emerald-600', name: 'Payroll', kind: 'Hybrid', category: 'hr', blurb: 'Complete payroll processing — salary structures, monthly runs, payslips, and statutory filings.', installs: 20, featured: true, gated: true },
  { code: 'INV', icon: '📦', tone: 'bg-orange-500', name: 'Inventory & Warehousing', kind: 'Data App', category: 'operations', blurb: 'Warehouse management, stock tracking, POS sales, and demand planning.', installs: 42, featured: true },
  { code: 'HR', icon: '👥', tone: 'bg-violet-500', name: 'HR & People Ops', kind: 'Data App', category: 'hr', blurb: 'Employee management, leave tracking, attendance, onboarding, and the org chart.', installs: 76, featured: true },
  { code: 'SUP', icon: '🎧', tone: 'bg-pink-500', name: 'Support & Ticketing', kind: 'Data App', category: 'operations', blurb: 'Enterprise helpdesk with SLA management, ticket routing, and a knowledge base.', installs: 49, featured: true },
  { code: 'PM', icon: '📋', tone: 'bg-sky-500', name: 'Project Management', kind: 'Data App', category: 'operations', blurb: 'Plan, track, and deliver projects with tasks, sprints, milestones, and time logs.', installs: 40, featured: true },
  { code: 'P2P', icon: '💰', tone: 'bg-emerald-600', name: 'Purchase & Payables', kind: 'Hybrid', category: 'finance', blurb: 'End-to-end procure-to-pay: material requests, RFQs, purchase orders, and three-way match.', installs: 99, featured: true },
  { code: 'CTR', icon: '📑', tone: 'bg-indigo-500', name: 'Contract Management', kind: 'Hybrid', category: 'legal', blurb: 'End-to-end contract lifecycle management — upload contracts, extract clauses, track renewals.', installs: 62, featured: true },
  { code: 'PPTX', icon: '🖼', tone: 'bg-orange-500', name: 'PPTX Generator', kind: 'AI-Native', category: 'general', blurb: 'AI-powered presentation generator with beautiful themes and a downloadable .pptx.', installs: 33 },
  { code: 'CRM', icon: '🏢', tone: 'bg-blue-500', name: 'CRM', kind: 'Data App', category: 'crm', blurb: 'Manage your sales pipeline, track deals, and close more revenue.', installs: 169, featured: true },
]

/** Bundled agents come from the agent catalogue, so the two can never drift. */
export const marketApps: MarketApp[] = apps.map((app) => ({
  ...app,
  agents: (agentsByAppCode.get(app.code) ?? []).map((agent) => agent.name),
}))

export type SmallApp = { code: string; icon: string; tone: string; name: string; kind: AppKind; category: string; blurb: string; installs: number; gated?: boolean }

export const webApps: SmallApp[] = [
  { code: 'EVT', icon: 'E', tone: 'bg-violet-600', name: 'Event Registration', kind: 'Data App', category: 'general', blurb: 'An event registration app: a public form (name, email, sessions) that writes to your tenant.', installs: 7, gated: true },
  { code: 'RQA', icon: 'R', tone: 'bg-violet-600', name: 'Request & Approval Tool', kind: 'Data App', category: 'general', blurb: 'An internal request-and-approval tool (capex/access/leave) with routing and an audit trail.', installs: 2, gated: true },
]

export const mobileApps: SmallApp[] = [
  { code: 'POD', icon: 'P', tone: 'bg-violet-600', name: 'Proof of Delivery', kind: 'Data App', category: 'general', blurb: 'Create a simple Android mobile app that allows delivery drivers to capture proof of delivery.', installs: 2, gated: true },
]

/** A published agent's run trace — the shape the Runs tab documents. */
export type RunStep = {
  node: string
  kind: 'llm' | 'tool' | 'guardrail' | 'hitl' | 'output'
  detail: string
  ms: number
  credits: number
}

export const sampleTrace: RunStep[] = [
  { node: 'Intake', kind: 'tool', detail: 'Fetched record from CRM · lead #4821', ms: 180, credits: 0 },
  { node: 'Enrich', kind: 'tool', detail: 'Company lookup · 3 fields added', ms: 640, credits: 1 },
  { node: 'Score', kind: 'llm', detail: 'claude · 1,204 prompt / 318 completion tokens', ms: 2100, credits: 4 },
  { node: 'Policy check', kind: 'guardrail', detail: 'Max tool calls 8/12 · content filter passed', ms: 20, credits: 0 },
  { node: 'Approval', kind: 'hitl', detail: 'Auto-approved — score 0.91 below review threshold', ms: 10, credits: 0 },
  { node: 'Route', kind: 'output', detail: 'Assigned to Priya S. · CRM updated', ms: 310, credits: 1 },
]

/**
 * Agent runs paused at a human-in-the-loop node. Each carries the data the node
 * extracted, which is what the reviewer actually approves, modifies or rejects.
 */
export type Approval = {
  id: string
  agent: string
  app: string
  summary: string
  node: string
  guardrail: string
  raisedAt: string
  fields: { label: string; value: string; flagged?: boolean }[]
}

/** Raised relative to load, so the queue reads sensibly in any timezone. */
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

export const pendingApprovals: Approval[] = [
  {
    id: 'a1',
    agent: 'Invoice Capture',
    app: 'Purchase & Payables',
    summary: 'Post invoice #4821 to GL — ₹84,200 exceeds the ₹50,000 cap',
    node: 'Approval · post to GL',
    guardrail: 'Approval cap — ₹50,000',
    raisedAt: minutesAgo(48),
    fields: [
      { label: 'Supplier', value: 'Meridian Components Pvt Ltd' },
      { label: 'Invoice number', value: '#4821' },
      { label: 'Invoice total', value: '₹84,200', flagged: true },
      { label: 'PO match', value: '3-way matched · PO-2261' },
      { label: 'GL account', value: '5020 · Raw materials' },
      { label: 'Due date', value: '04 Oct 2026' },
    ],
  },
  {
    id: 'a2',
    agent: 'Contract Analyzer',
    app: 'Contract Management',
    summary: 'Apply suggested redlines to the Acme MSA renewal',
    node: 'Approval · apply redlines',
    guardrail: 'Content filter — legal text',
    raisedAt: minutesAgo(155),
    fields: [
      { label: 'Contract', value: 'Acme MSA — renewal 2026' },
      { label: 'Clauses changed', value: '4 of 37' },
      { label: 'Liability cap', value: 'Raised to 2× fees', flagged: true },
      { label: 'Termination notice', value: '60 days → 90 days' },
      { label: 'Playbook deviation', value: 'Indemnity — needs legal sign-off', flagged: true },
      { label: 'Renewal date', value: '01 Dec 2026' },
    ],
  },
]

export const builderTiles = [
  { icon: '✦', name: 'Vibe Studio', blurb: 'Visual canvas for workflows', to: '/app/build/vibe-studio' },
  { icon: '🤖', name: 'Agent Studio', blurb: 'Build your first AI agent', to: '/studio' },
  { icon: '🌐', name: 'Web App Builder', blurb: 'Generate internal tools', to: '/app/build/vibe-studio' },
  { icon: '📱', name: 'Mobile App Builder', blurb: 'Ship native iOS / Android', to: '/app/build/vibe-studio' },
]

export const quickTools = [
  { icon: '💬', name: 'Chat', to: '/app/business/chat' },
  { icon: '✍️', name: 'Writing', to: '/app/business?category=writing' },
  { icon: '🎨', name: 'Image Gen', to: '/app/business?category=image' },
  { icon: '💻', name: 'Code', to: '/app/business?category=development' },
  { icon: '📊', name: 'Analyze', to: '/app/business?category=data' },
  { icon: '✨', name: 'Browse all', to: '/app/business' },
]

export const jumpCards = [
  { icon: '👥', name: 'Contacts', blurb: 'Shared across apps', to: '/app/crm/contacts' },
  { icon: '🏢', name: 'Accounts', blurb: 'Customers, vendors, partners', to: '/app/crm/accounts' },
  { icon: '🎯', name: 'Leads', blurb: 'CRM pipeline', to: '/app/crm/leads' },
  { icon: '🛍', name: 'Marketplace', blurb: 'Discover more apps', to: '/app/marketplace' },
]
