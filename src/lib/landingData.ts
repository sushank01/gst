/** Content for the landing page sections, transcribed from apragya.ai. */

export const suggestionChips = [
  { icon: '✨', label: 'Build a CRM agent' },
  { icon: '📄', label: 'Process this invoice' },
  { icon: '📝', label: 'Draft a vendor contract' },
  { icon: '📊', label: 'Analyze customer data' },
  { icon: '👥', label: 'Automate hiring' },
]

export const industries = [
  'Real Estate',
  'Insurance',
  'Healthcare',
  'BFSI',
  'Manufacturing',
  'Retail & Ecomm',
  'Govt & Public Sector',
]

export const suites = [
  {
    icon: '⚡',
    name: 'Business Suite',
    to: '/business-suite',
    blurb: '100+ AI productivity tools across 16 categories every employee uses on day one.',
    tags: ['AI Chat', 'Writing', 'Image Generation', 'Code', 'Transcription', 'Translation', 'SEO', '+ more'],
  },
  {
    icon: '⊕',
    name: 'Solution Suite',
    to: '/vibe-studio',
    blurb: 'Two builders, one governed runtime. Prompt-driven or hand-tuned — your choice.',
    tags: ['Vibe Studio', 'Agent Studio', 'Prompt Lab', 'Agent Portal', 'Approvals (HITL)', 'Guardrails'],
  },
  {
    icon: '▢',
    name: 'Enterprise Suite',
    to: '/enterprise-apps',
    blurb: '15+ ready-to-deploy apps powered by AI agents. All tenant-configurable.',
    tags: ['CRM', 'HR & People', 'Finance', 'Contracts', 'Invoice & AP', 'Sales & POS', '+ more'],
  },
]

export const agentStudioCapabilities = [
  { n: '01', name: 'Visual Builder', line: 'No ML expertise needed.', detail: 'Drag-drop LLM nodes, agents, and conditions onto a live canvas. Watch your agent graph take shape in real time — zero coding, instant clarity.' },
  { n: '02', name: 'RAG Knowledge Base', line: 'Answers from YOUR data.', detail: 'Attach docs, wikis, and tickets. The canvas wires retrieval for you and keeps answers grounded in sources your team controls.' },
  { n: '03', name: 'Human-in-the-Loop', line: 'Full control + transparency.', detail: 'Pause any run at any node for review. Approve, reject, or amend before the agent continues — configurable per agent.' },
  { n: '04', name: 'Guardrails', line: 'Agents stay within boundaries.', detail: 'Approval caps, content filters, max-tool-calls, and run-duration limits, enforced inside the runtime rather than in the prompt.' },
  { n: '05', name: 'Test Suite', line: 'Regression testing before deploy.', detail: 'Golden tests and eval runs catch regressions before they ship. Tests run as part of the build gate.' },
  { n: '06', name: 'One-Click Deploy', line: 'Versioning + rollback built in.', detail: 'Publish an immutable snapshot. In-flight runs finish on the previous version; new runs pick up the new one.' },
]

export type PipelineNode = { stage: string; icon: string; name: string; branch?: string }

export const pipelines: { name: string; nodes: PipelineNode[]; stats: { icon: string; value: string; label: string }[] }[] = [
  {
    name: 'Lead Qualification',
    nodes: [
      { stage: 'Trigger', icon: '⚡', name: 'Lead Intake' },
      { stage: 'AI Process', icon: '🧠', name: 'AI Scoring' },
      { stage: 'Condition', icon: '◇', name: 'Priority tier?', branch: 'Hot / Cold' },
      { stage: 'Action', icon: '👤', name: 'Agent Routing' },
      { stage: 'Action', icon: '✓', name: 'Deal Conversion' },
      { stage: 'Integrate', icon: '⟲', name: 'CRM Sync' },
    ],
    stats: [
      { icon: '⏱', value: '< 15 min', label: 'Setup time · vs. weeks of dev' },
      { icon: '⚡', value: '~2 sec', label: 'Lead response · fully automated' },
      { icon: '🎯', value: '94%', label: 'Qualification accuracy' },
    ],
  },
  {
    name: 'Invoice Processing',
    nodes: [
      { stage: 'Trigger', icon: '📥', name: 'Invoice Received' },
      { stage: 'AI Process', icon: '🔍', name: 'OCR + Extract' },
      { stage: 'Condition', icon: '◇', name: 'PO match?', branch: 'Matched / Exception' },
      { stage: 'Action', icon: '👥', name: 'Approval (HITL)' },
      { stage: 'Action', icon: '💳', name: 'Schedule Payment' },
      { stage: 'Integrate', icon: '⟲', name: 'Post to GL' },
    ],
    stats: [
      { icon: '⏱', value: '~40 sec', label: 'Capture to posting' },
      { icon: '📄', value: '98%', label: 'Line-item extraction accuracy' },
      { icon: '💰', value: '3-way', label: 'PO · GRN · invoice match' },
    ],
  },
  {
    name: 'KYC Onboarding',
    nodes: [
      { stage: 'Trigger', icon: '🪪', name: 'Document Upload' },
      { stage: 'AI Process', icon: '🧠', name: 'Classify + Extract' },
      { stage: 'Integrate', icon: '🔐', name: 'Bureau Check' },
      { stage: 'Condition', icon: '◇', name: 'Risk tier?', branch: 'Clear / Review' },
      { stage: 'Action', icon: '👥', name: 'Compliance Review' },
      { stage: 'Action', icon: '✓', name: 'Account Activated' },
    ],
    stats: [
      { icon: '⏱', value: '< 2 min', label: 'Straight-through onboarding' },
      { icon: '🔐', value: 'CIBIL · Idfy', label: 'Bureau + identity providers' },
      { icon: '📜', value: '100%', label: 'Decisions audit-logged' },
    ],
  },
  {
    name: 'Real Estate Property',
    nodes: [
      { stage: 'Trigger', icon: '🏠', name: 'Listing Created' },
      { stage: 'AI Process', icon: '✍️', name: 'Draft Listing Copy' },
      { stage: 'AI Process', icon: '🎯', name: 'Buyer Matching' },
      { stage: 'Action', icon: '📣', name: 'Outreach Sequence' },
      { stage: 'Condition', icon: '◇', name: 'Site visit booked?', branch: 'Yes / Nurture' },
      { stage: 'Integrate', icon: '⟲', name: 'CRM Sync' },
    ],
    stats: [
      { icon: '⏱', value: 'Same day', label: 'Listing to first outreach' },
      { icon: '🎯', value: '5×', label: 'Matched buyers per listing' },
      { icon: '📅', value: 'Auto', label: 'Site-visit scheduling' },
    ],
  },
  {
    name: 'Order Fulfillment',
    nodes: [
      { stage: 'Trigger', icon: '🛒', name: 'Order Placed' },
      { stage: 'Condition', icon: '◇', name: 'Stock available?', branch: 'In stock / Backorder' },
      { stage: 'Action', icon: '📦', name: 'Pick & Pack' },
      { stage: 'Integrate', icon: '🚚', name: 'Carrier Booking' },
      { stage: 'Action', icon: '📣', name: 'Customer Notify' },
      { stage: 'Integrate', icon: '⟲', name: 'Inventory Sync' },
    ],
    stats: [
      { icon: '⏱', value: 'Minutes', label: 'Order to dispatch note' },
      { icon: '📦', value: 'Live', label: 'Stock levels across warehouses' },
      { icon: '🚚', value: 'Multi', label: 'Carrier routing rules' },
    ],
  },
]

export const integrationLogos = [
  'Slack', 'MS Teams', 'Salesforce', 'HubSpot', 'Jira', 'Notion',
  'Google Workspace', 'Microsoft 365', 'QuickBooks', 'Xero', 'Workday', 'SAP',
]

export const marketplacePicks = [
  { icon: '📑', name: 'Contract Analyzer', meta: 'Legal · by Apragya', blurb: 'Extracts clauses, flags risk, suggests redlines. Runs on every uploaded contract.', rating: '4.9', installs: '2.4k' },
  { icon: '🧾', name: 'Invoice Capture', meta: 'Finance · by Apragya', blurb: 'OCR + LLM. Captures line items, matches POs, posts to GL with one click.', rating: '4.8', installs: '3.1k' },
  { icon: '🎯', name: 'Lead Qualifier', meta: 'CRM · by Apragya', blurb: 'Scores inbound leads on fit, intent, and urgency. Routes to the right rep.', rating: '4.7', installs: '1.8k' },
]

export const trustPillars = [
  { icon: '✦', name: 'Vippy', blurb: 'AI assistant on every page — answers questions, takes actions, learns your context.' },
  { icon: '🔑', name: 'SSO / SAML / OIDC', blurb: 'Okta, Azure AD, Google Workspace, or any SAML 2.0 / OIDC provider.' },
  { icon: '🔐', name: 'RBAC', blurb: 'Matrix roles down to sub-features. Custom roles per tenant.' },
  { icon: '👥', name: 'Approvals (HITL)', blurb: 'Pause any agent run for human review before consequential actions.' },
  { icon: '🛡', name: 'Guardrails', blurb: 'Approval caps, content filters, max-tool-calls — enforced in the runtime.' },
  { icon: '📜', name: 'Audit Trail', blurb: 'Every state-changing action logged. SIEM export ready.' },
  { icon: '🏢', name: 'Runners', blurb: 'Self-hosted execution for firewalled data, inside your network.' },
  { icon: '🌐', name: 'Multi-Company Mode', blurb: 'Run subsidiaries from one tenant with per-company scoping.' },
]

export const whyUs = [
  { stat: '50+', statLabel: 'AI Agents', icon: '⌗', name: 'One Unified Workspace', blurb: "Every AI agent you'll ever need — writers, coders, designers, image generators, translators — under a single roof.", tags: ['Content', 'Code', 'Design', 'Data'] },
  { stat: '12hrs', statLabel: 'Saved / week', icon: '⏱', name: 'Production-Ready in Seconds', blurb: 'Our pipeline is optimized for real-time output. Idea to deployable result faster than a cup of coffee.', tags: ['Instant output', 'No editing'] },
  { stat: '5+', statLabel: 'Top AI Models', icon: '🧠', name: 'Always the Best Model', blurb: 'Claude, GPT-4o, Gemini Pro, Llama 3 and more — each task routed to the model best suited for it.', tags: ['Claude', 'GPT-4o', 'Gemini'] },
  { stat: '99.9%', statLabel: 'Uptime SLA', icon: '🛡', name: 'Enterprise-Grade Security', blurb: 'SOC 2 Type II controls in place (certification in progress), GDPR-aligned, AES-256 encrypted. Never used to train models.', tags: ['SOC 2', 'GDPR', 'Encrypted'] },
  { stat: '$0', statLabel: 'To get started', icon: '💎', name: 'One Fair, Flat Price', blurb: 'Start free. Upgrade for unlimited access to all 50+ agents — no per-agent fees, no usage caps.', tags: ['Free plan', 'No cap', 'Unlimited'] },
  { stat: '100%', statLabel: 'Human Oversight', icon: '✓', name: 'Human-in-the-Loop Ready', blurb: 'Every critical AI decision can route through human review, with full audit trails.', tags: ['Approvals', 'Audit trail', 'Compliance'] },
]

export const plans = [
  {
    name: 'Starter',
    monthly: '₹3,999',
    annual: '₹3,333',
    annualTotal: '₹39,990 billed yearly',
    blurb: 'For small teams getting started with AI.',
    features: ['Install up to 3 enterprise apps', 'Up to 10 users', '2,000 AI Credits/month', 'Pre-built AI agents', 'Standard support', 'Max Web Apps — 3', 'Max Mobile Apps — 2', 'Max RPA Bots — 3'],
    cta: { label: 'Get Started', to: '/register' },
  },
  {
    name: 'Pro',
    monthly: '₹7,999',
    annual: '₹6,666',
    annualTotal: '₹79,990 billed yearly',
    blurb: 'For growing teams replacing siloed SaaS.',
    features: ['All enterprise apps', 'Up to 25 users', '5,000 AI Credits/month + add-ons', 'No-code agent builder + marketplace', 'SSO + audit logs + RBAC', 'Priority support', 'Max Web Apps — 5', 'Max Mobile Apps — 3', 'Max RPA Bots — 5'],
    featured: true,
    cta: { label: 'Get Started', to: '/register' },
  },
  {
    name: 'Enterprise',
    monthly: 'Custom',
    annual: 'Custom',
    annualTotal: '',
    blurb: 'For regulated industries and global teams.',
    features: ['Everything in Pro', 'VPC / on-prem option', 'HIPAA / region pinning', 'Dedicated CSM + onboarding', 'Custom SLA + 24/7 support', 'Volume discounts'],
    cta: { label: 'Contact Sales team', to: '/contact-sales' },
  },
]

export const faqs: { group: string; items: { q: string; a: string }[] }[] = [
  {
    group: 'Getting Started',
    items: [
      { q: 'What is Apragya AI and how does it work?', a: 'Apragya AI is an all-in-one productivity platform that gives you access to 50+ AI-powered agents in a single dashboard. Sign up, choose any agent — content writer, code generator, image creator, SEO analyzer — and start generating results instantly. No technical knowledge required.' },
      { q: 'Do I need any AI or coding experience to use the platform?', a: 'Not at all. Apragya AI is built for everyone — from complete beginners to seasoned developers. Our intuitive interface guides you step by step, and each agent includes helpful prompts and examples to get you started in seconds.' },
      { q: 'Can I try it before committing to a paid plan?', a: 'Yes. The free plan gives you access to AI agents with a monthly generation allowance, no credit card required. Upgrade whenever you are ready and cancel anytime.' },
    ],
  },
  {
    group: 'Agents & Features',
    items: [
      { q: 'What is the difference between Vibe Studio and Agent Studio?', a: 'Vibe Studio is prompt-driven: describe the outcome and it proposes the smallest shape that gets you there. Agent Studio is the visual canvas for when you know the shape and every node needs care. Most teams use both.' },
      { q: 'Can agents act on my enterprise app records?', a: 'Yes. Every enterprise app ships with bound agents that fire on records as they arrive, and you can build unlimited custom agents that bind natively to those apps.' },
      { q: 'What happens when an agent gets something wrong?', a: 'Open the run in the Runs view and walk the trace to the failing node. Copy the input into the Tests tab, iterate on the prompt, and publish a new version. Rollback to any earlier version is one click.' },
    ],
  },
  {
    group: 'Billing & Plans',
    items: [
      { q: 'How do AI Credits work?', a: 'Every plan includes a monthly AI Credits allowance. Business Suite tools, agent runs, Vibe Studio builds, and Vippy conversations all draw from the same pool, so you get one bill rather than separate productivity and automation spend.' },
      { q: 'What happens if we run out of credits?', a: 'Admins can top up or set per-user allocations, and usage alerts fire before the pool runs dry. Usage is visible in the admin dashboard in near-real-time.' },
      { q: 'Can I cancel anytime?', a: 'Yes — cancel anytime, no questions asked, and your data exports cleanly.' },
    ],
  },
  {
    group: 'Security & Privacy',
    items: [
      { q: 'Is my data used to train models?', a: 'No. Your data is never used to train models. SOC 2 Type II controls are in place with certification in progress, and the platform is GDPR-aligned with AES-256 encryption.' },
      { q: 'Can we keep execution inside our own network?', a: 'Yes. Tenant runners are small containers you deploy inside your network. They make one outbound TLS connection, and connector and RPA execution happens on your side of the firewall.' },
      { q: 'How is access controlled?', a: 'RBAC with matrix roles down to sub-features, custom roles per tenant, SSO via SAML 2.0 / OIDC with JIT provisioning, and an audit trail recording actor, action, timestamp, before, and after.' },
    ],
  },
]
