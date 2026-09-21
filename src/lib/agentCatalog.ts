/**
 * The 60 Enterprise Agents, grouped by the app that bundles them —
 * transcribed from the live Marketplace's "Enterprise Agents" tab.
 * Agents authored in Agent Studio are marked `custom`.
 */

export type CatalogAgent = { name: string; blurb: string; custom?: boolean }
export type AgentGroup = { code: string; name: string; agents: CatalogAgent[] }

export const agentGroups: AgentGroup[] = [
  {
    code: 'SUP',
    name: 'Support & Ticketing',
    agents: [
      { name: 'ST Ticket Auto-Triage', blurb: 'Automatically classifies incoming tickets by category, priority, and suggests routing.' },
      { name: 'ST Response Suggester', blurb: 'Suggests contextual reply drafts based on ticket content, history, and knowledge base.' },
      { name: 'ST Escalation Predictor', blurb: 'Predicts which tickets are likely to escalate based on sentiment, response time, and history.' },
      { name: 'ST KB Article Suggester', blurb: 'On ticket creation, suggests 3 relevant KB articles the agent can attach to a reply.' },
      { name: 'ST Thread Summarizer', blurb: 'Compresses a long ticket thread (subject + many replies) into a one-paragraph summary.' },
      { name: 'ST Sentiment Tracker', blurb: 'Tracks customer sentiment across the latest replies on a ticket. Flags angry threads.' },
      { name: 'ST CSAT Predictor', blurb: 'Predicts likely CSAT score from the resolution text + thread summary.' },
      { name: 'ST Duplicate Detector', blurb: 'Compares an incoming ticket against recent open tickets and flags likely duplicates.' },
      { name: 'ST Resolution Drafter', blurb: "Given a ticket + the agent's resolution notes, drafts the closing customer-facing reply." },
    ],
  },
  {
    code: 'IDP',
    name: 'Intelligent Document Processing',
    agents: [
      { name: 'IDP Vision OCR', blurb: 'Extracts text from scanned documents and images using Claude Vision.' },
      { name: 'IDP Document Classifier', blurb: 'Identifies document type (invoice, receipt, contract, ID, bank statement, etc.).' },
      { name: 'IDP Schema Extractor', blurb: 'Extracts structured data from documents using a predefined JSON Schema.' },
      { name: 'IDP Smart Extractor', blurb: 'Templateless extraction — discovers and extracts all structured information from a document.' },
      { name: 'IDP Confidence Assessor', blurb: 'Evaluates extraction quality by scoring each field 0.0–1.0 for confidence.' },
      { name: 'IDP Rule Validator', blurb: 'Validates extracted data against configurable business rules — field by field.' },
      { name: 'IDP Summarizer', blurb: 'Generates concise document summaries highlighting key information and dates.' },
      { name: 'IDP Document Q&A', blurb: 'Answers questions about a specific document using RAG over the document.' },
      { name: 'IDP Error Analyzer', blurb: 'Diagnoses why a document failed processing — identifies root causes and fixes.' },
    ],
  },
  {
    code: 'PM',
    name: 'Project Management',
    agents: [
      { name: 'PM Task Prioritizer', blurb: 'Recommends task priority based on deadlines, dependencies, and workload.' },
      { name: 'PM Sprint Planner', blurb: 'Suggests task allocation for upcoming sprints based on team velocity and capacity.' },
      { name: 'PM Risk Assessor', blurb: 'Identifies project risks from timeline, budget, task completion trends, and team signals.' },
      { name: 'PM Auto-Assigner', blurb: 'Suggests the best assignee for a new task based on HR Skills, current load, and history.' },
      { name: 'PM Status Report Drafter', blurb: "Drafts a weekly client-facing status report from the past week's task deltas and time logs." },
      { name: 'PM Estimate Accuracy Learner', blurb: 'Predicts realistic duration for a new task by comparing against historical estimates.' },
      { name: 'Project Risk Sniffer', blurb: "Rewrites auto-detected risk descriptions and mitigation plans in the project's own voice." },
    ],
  },
  {
    code: 'TE',
    name: 'Travel & Expense',
    agents: [
      { name: 'Receipt OCR Extractor', blurb: 'Reads an uploaded receipt image or PDF and returns merchant, amount, and currency.' },
      { name: 'Travel Policy Checker', blurb: "Reviews a new travel request against the tenant's band-based travel policy." },
      { name: 'Trip Approval Summariser', blurb: 'Summarises a travel request for approvers — three lines that spell out the decision.' },
      { name: 'Agency Invoice Reconciler', blurb: "Cross-checks a submitted agency invoice against the trip's booked segments." },
      { name: 'Expense Categoriser & Fraud Flagger', blurb: "Suggests a category for each expense line from the tenant's policy, and flags anomalies." },
    ],
  },
  {
    code: 'CRM',
    name: 'CRM',
    agents: [
      { name: 'CRM Deal Scorer', blurb: 'Automatically scores deals by win probability based on deal value, stage, and activity.' },
      { name: 'CRM Lead Qualifier', blurb: 'Qualifies inbound leads using BANT framework — Budget, Authority, Need, Timeline.' },
      { name: 'CRM Email Drafter', blurb: 'Drafts personalized follow-up emails for deals and leads based on deal context.' },
      { name: 'Lead Qualify & Route', blurb: 'Score each inbound lead 0–100 by fit and intent, segment it (hot/warm/cold), route it.', custom: true },
    ],
  },
  {
    code: 'HR',
    name: 'HR & People Ops',
    agents: [
      { name: 'HR Leave Analyzer', blurb: 'Analyzes leave patterns, detects burnout risk, and flags unusual absence patterns.' },
      { name: 'HR Onboarding Assistant', blurb: 'Generates personalized onboarding checklists and welcome materials for new joiners.' },
      { name: 'HR Policy Q&A', blurb: 'Answers employee questions about company policies, benefits, and HR processes.' },
      { name: 'Resume Screening', blurb: 'Score each applicant against the job description and shortlist the best fits.', custom: true },
    ],
  },
  {
    code: 'FIN',
    name: 'Finance & Accounting',
    agents: [
      { name: 'FN Transaction Classifier', blurb: 'Auto-classifies journal entries to the most appropriate GL accounts.' },
      { name: 'FN Anomaly Detector', blurb: 'Flags unusual journal entries — large amounts, unusual account combinations.' },
      { name: 'FN Period Close Assistant', blurb: 'Validates fiscal period readiness for close — checks for draft entries and unbalanced books.' },
    ],
  },
  {
    code: 'INV',
    name: 'Inventory & Warehousing',
    agents: [
      { name: 'INV Demand Forecaster', blurb: 'Predicts product demand based on sales trends, seasonality, and stock movement.' },
      { name: 'INV Stock Optimizer', blurb: 'Recommends optimal reorder quantities, safety stock levels, and warehouse placement.' },
      { name: 'INV Sales Analyzer', blurb: 'Analyzes POS sales data for trends, top products, peak hours, and customer patterns.' },
    ],
  },
  {
    code: 'P2P',
    name: 'Purchase & Payables',
    agents: [
      { name: 'Invoice Auditor', blurb: 'Automatically audits extracted invoice data for math errors, anomalies, and missing fields.' },
      { name: 'Payment Optimizer', blurb: 'Analyzes payment terms, early payment discounts, and cash flow impact.' },
      { name: 'Vendor Risk Analyzer', blurb: 'Evaluates vendor risk based on invoice history, payment patterns, and anomalies.' },
    ],
  },
  {
    code: 'PAY',
    name: 'Payroll',
    agents: [
      { name: 'Payroll Anomaly Detector', blurb: 'Detects anomalies in payroll data — salary spikes, duplicate payments.' },
      { name: 'Payroll Compliance Checker', blurb: 'Validates statutory calculations against current PF/ESI/PT rates and thresholds.' },
      { name: 'Payroll Cost Forecaster', blurb: "Projects next month's payroll cost based on current salary data and upcoming changes." },
    ],
  },
  {
    code: 'MFG',
    name: 'Manufacturing',
    agents: [
      { name: 'Demand Planner', blurb: 'Analyzes SO backlog + safety-stock triggers + Inventory Demand Forecaster output.' },
      { name: 'Bottleneck Detector', blurb: 'Reads Job Card time logs + Downtime Entries for the trailing 30 days.' },
      { name: 'Yield Optimizer', blurb: 'On Work Order completion, compares expected RM consumption (from BOM) against actual.' },
    ],
  },
  {
    code: 'CTR',
    name: 'Contract Management',
    agents: [
      { name: 'Contract Clause Analyzer', blurb: 'Extracts and categorizes all clauses from uploaded contracts, identifying clause types.' },
      { name: 'Contract Risk Scorer', blurb: 'Scores risk for contract clauses based on legal exposure, ambiguity, and missing terms.' },
      { name: 'Contract Compliance Checker', blurb: 'Checks contract clauses against corporate playbook positions and flags deviations.' },
    ],
  },
  {
    code: 'ITAM',
    name: 'Asset Management',
    agents: [
      { name: 'ITAM Warranty & AMC Advisor', blurb: 'Reviews assets with expiring warranty or AMC cover and recommends renew / replace.' },
      { name: 'ITAM Offboarding Recovery', blurb: 'When an employee resigns or is terminated, drafts the recovery plan for their assets.' },
      { name: 'ITAM Idle Asset Detector', blurb: 'Reviews long-idle stock and suggests redeploy, retire or hold, so capital is not stranded.' },
    ],
  },
  {
    code: 'POS',
    name: 'Sales & POS',
    agents: [
      { name: 'Quote Quality Reviewer', blurb: "Reviews new quotations before they're sent — flags policy violations and low margins." },
    ],
  },
]

export const totalEnterpriseAgents = agentGroups.reduce((sum, group) => sum + group.agents.length, 0)

export const agentsByAppCode = new Map(agentGroups.map((group) => [group.code, group.agents]))

/** Letter-avatar colour per bundling app, including the groups with no installable app. */
export const groupTones: Record<string, string> = {
  SUP: 'bg-pink-500',
  IDP: 'bg-sky-400',
  PM: 'bg-sky-500',
  TE: 'bg-teal-600',
  CRM: 'bg-blue-500',
  HR: 'bg-violet-500',
  FIN: 'bg-emerald-600',
  INV: 'bg-orange-500',
  P2P: 'bg-emerald-600',
  PAY: 'bg-emerald-600',
  MFG: 'bg-teal-600',
  CTR: 'bg-indigo-500',
  ITAM: 'bg-teal-600',
  POS: 'bg-emerald-500',
}
