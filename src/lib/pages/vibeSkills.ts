import type { Card, PageSpec } from './types'

/**
 * Vibe Studio's per-skill landing pages. They all follow the same shape on the
 * live site (hero → "what teams build" → "how it fits" → CTA), so the page is
 * generated from a compact table rather than nine near-identical objects.
 */

type SkillSpec = {
  slug: string
  name: string
  title: string
  blurb: string
  builds: Card[]
  fit: string[]
}

const skills: SkillSpec[] = [
  {
    slug: 'web-app-builder',
    name: 'Web App Builder',
    title: 'Describe the app. Ship it in the browser.',
    blurb:
      'Real web applications: React + TypeScript under the hood, deployed straight into your tenant, wired into your data and identity. No local dev environment, no build pipelines.',
    builds: [
      { icon: '📊', name: 'Internal tools', blurb: 'Approval queues, KPI dashboards, ops consoles, team-specific data views inside your tenant.' },
      { icon: '🎯', name: 'Customer portals', blurb: 'Branded self-service portals — track orders, download invoices, submit tickets.' },
      { icon: '🚀', name: 'Product marketing pages', blurb: "Fully custom landing pages when the website builder doesn't give you enough control." },
    ],
    fit: [
      "Every web app you ship inherits your tenant's identity, RBAC, audit trail, and AI Credits pool. Users sign in with the same SSO they already use for the rest of Apragya, and every action is logged with the same audit trail as everything else in the platform.",
      'Change your mind mid-build? Vibe regenerates just the parts that need to change. Publish snapshots to an immutable version so you can roll back in one click if something regresses.',
    ],
  },
  {
    slug: 'mobile-app-builder',
    name: 'Mobile App Builder',
    title: 'Describe the app. Ship it to phones.',
    blurb:
      'React Native (Expo) mobile apps from a prompt. Field teams, approvals on the go, and capture flows that need a camera — without standing up a mobile team.',
    builds: [
      { icon: '📷', name: 'Field capture apps', blurb: 'Photo, barcode, and signature capture that posts straight into your enterprise apps.' },
      { icon: '✅', name: 'Approval companions', blurb: 'Approve invoices, leave requests, and agent HITL pauses from a phone.' },
      { icon: '📍', name: 'Field-service tools', blurb: 'Route lists, job checklists, and offline-tolerant status updates.' },
    ],
    fit: [
      'Builds target Expo, so your team can preview on a device in seconds and distribute through the stores or an internal channel when ready.',
      'The app talks to the same tenant APIs as the web surfaces, under the same RBAC. Nothing bypasses the governance layer because it happens to be on a phone.',
    ],
  },
  {
    slug: 'web-rpa',
    name: 'Web RPA Bots',
    title: 'Automate the tools that have no API.',
    blurb:
      'Browser automation for the systems your team still clicks through by hand. Run them in the cloud, or on a runner inside your own network.',
    builds: [
      { icon: '🔁', name: 'Data entry loops', blurb: 'Re-key records between an internal portal and your systems of record — without the re-keying.' },
      { icon: '📥', name: 'Portal downloads', blurb: 'Log into supplier and government portals on a schedule and file what they return.' },
      { icon: '🧾', name: 'Legacy ERP steps', blurb: 'Drive an on-prem ERP screen-by-screen where no integration exists.' },
    ],
    fit: [
      'Bots are recorded and edited as steps, not brittle scripts. When a page changes, you fix one step rather than rewriting the automation.',
      'Pair a bot with a tenant runner and it executes inside your network: your credentials and data never leave, and no inbound ports open.',
    ],
  },
  {
    slug: 'business-solution-agents',
    name: 'Business Solution Apps',
    title: 'Full data apps, from a description.',
    blurb:
      'Entities, screens, workflows, and bound agents — the whole shape of a business app, scaffolded from a prompt and editable by hand.',
    builds: [
      { icon: '🗂', name: 'Custom registers', blurb: 'Asset registers, grant trackers, inspection logs — the apps no vendor sells.' },
      { icon: '🔄', name: 'Workflow apps', blurb: 'Multi-stage approvals with states, owners, SLAs, and an agent at each hop.' },
      { icon: '🧠', name: 'Agent-bound data apps', blurb: 'Records that summarise, classify, and route themselves as they arrive.' },
    ],
    fit: [
      'The Studio proposes an entity model first. Accept it, rename fields, add states — then let it wire screens and workflows around the model you agreed.',
      'Bound agents are ordinary platform agents: inspectable in Agent Studio, governed by the same guardrails, observable in the same Runs view.',
    ],
  },
  {
    slug: 'chat-with-docs',
    name: 'Chat with Docs',
    title: 'Ask your documents, get cited answers.',
    blurb:
      "RAG-powered Q&A over your team's documents. Every answer carries citations back to the source passage, so nobody has to take the model's word for it.",
    builds: [
      { icon: '📚', name: 'Policy assistants', blurb: 'HR handbooks, expense policies, and SOPs that answer in plain language.' },
      { icon: '⚖️', name: 'Contract Q&A', blurb: 'Ask across an executed-contract archive and get the clause, not a paraphrase.' },
      { icon: '🔧', name: 'Support knowledge', blurb: 'Product manuals and runbooks your agents and humans both query.' },
    ],
    fit: [
      'Ingestion respects your permissions: a user only retrieves from documents they could already open. Retrieval is filtered by RBAC before the model ever sees a passage.',
      'Answers cite the source document and passage. When the corpus changes, re-indexing is incremental rather than a full rebuild.',
    ],
  },
  {
    slug: 'document-builder',
    name: 'Doc & PDF Builder',
    title: 'Runbooks, specs, and PDFs that format themselves.',
    blurb: 'Structured documents with a live preview and a one-click download. Generated from a prompt, your data, or both.',
    builds: [
      { icon: '📘', name: 'Runbooks & SOPs', blurb: 'Operational documents that stay consistent across teams and revisions.' },
      { icon: '📄', name: 'Client deliverables', blurb: 'Proposals and reports assembled from tenant data, branded to your template.' },
      { icon: '🧾', name: 'Statements & notices', blurb: 'Formatted PDFs generated per record, in bulk, on a schedule.' },
    ],
    fit: [
      'Live preview while you refine the prompt, then download a formatted PDF — or keep the document inside the tenant where it stays versioned.',
      'Documents can pull live values from your enterprise apps, so a regenerated statement reflects the record as it stands today.',
    ],
  },
  {
    slug: 'spreadsheet-builder',
    name: 'Spreadsheet Builder',
    title: 'Live tables with formulas, plus an .xlsx.',
    blurb: 'Working spreadsheets built from a description — formulas intact, downloadable, and connected to your tenant data.',
    builds: [
      { icon: '📈', name: 'Models & forecasts', blurb: 'Budget, headcount, and pipeline models with the formulas already written.' },
      { icon: '🧮', name: 'Reconciliations', blurb: 'Compare two sources and surface the deltas, refreshed on demand.' },
      { icon: '📊', name: 'Operational trackers', blurb: 'Shared tables your team edits, with calculations that hold.' },
    ],
    fit: [
      'The sheet is live in the browser and exports to .xlsx, so the people who prefer Excel are not cut out of the loop.',
      'Where the data comes from your enterprise apps, the sheet refreshes against the source rather than going stale the moment it is built.',
    ],
  },
  {
    slug: 'presentation-builder',
    name: 'Presentation Builder',
    title: 'Decks, from a prompt to a .pptx.',
    blurb: 'Slide decks with a web preview and a downloadable PowerPoint — built from your outline, your data, or a document you already have.',
    builds: [
      { icon: '📊', name: 'Business reviews', blurb: 'MBRs and QBRs assembled from live metrics instead of copy-paste.' },
      { icon: '🎤', name: 'Pitch decks', blurb: 'Narrative decks you refine in conversation rather than in a slide editor.' },
      { icon: '🎓', name: 'Training decks', blurb: 'Enablement material generated from the runbook it should match.' },
    ],
    fit: [
      'Preview in the browser, then download a .pptx that opens cleanly in PowerPoint and Google Slides.',
      'Regenerate a single slide rather than the deck when the underlying number changes.',
    ],
  },
  {
    slug: 'website-builder',
    name: 'Website Builder',
    title: 'Multi-page marketing sites, generated.',
    blurb: 'Static multi-page sites in HTML + Tailwind — fast, hostable anywhere, and editable by hand when you want to.',
    builds: [
      { icon: '🚀', name: 'Campaign sites', blurb: 'Launch a landing page per campaign without a queue in front of the web team.' },
      { icon: '🏢', name: 'Company sites', blurb: 'Standard marketing sites with the pages every business needs.' },
      { icon: '📰', name: 'Microsites', blurb: 'Event, product, and recruiting sites that only need to live for a season.' },
    ],
    fit: [
      'Output is plain HTML and Tailwind — no proprietary format, no lock-in. Take the files and host them wherever you like.',
      'For anything that needs auth, data, or workflow, reach for the Web App Builder instead; this skill is for sites that stay static.',
    ],
  },
]

export const vibeSkillPages: PageSpec[] = skills.map((skill) => ({
  slug: `vibe-studio/${skill.slug}`,
  eyebrow: `Vibe Studio · ${skill.name}`,
  title: skill.title,
  blurb: skill.blurb,
  ctas: [
    { label: 'Start Free', to: '/register' },
    { label: 'See all Vibe Studio skills', to: '/vibe-studio', variant: 'secondary' },
  ],
  sections: [
    {
      kind: 'cards',
      eyebrow: 'What teams build',
      title: 'Three shapes we see all the time.',
      cols: 3,
      cards: skill.builds,
    },
    {
      kind: 'prose',
      eyebrow: 'How it fits',
      title: 'Inside your tenant. Governed like everything else.',
      paragraphs: skill.fit,
    },
  ],
  final: {
    eyebrow: 'Ready to build?',
    title: 'Try Vibe Studio free.',
    blurb: `No credit card. Full access to the ${skill.name} and every other Vibe Studio skill.`,
    ctas: [
      { label: 'Start Free', to: '/register' },
      { label: 'Compare skills', to: '/vibe-studio', variant: 'secondary' },
    ],
  },
}))

export const vibeSkillIndex = skills.map((skill) => ({
  name: skill.name,
  to: `/vibe-studio/${skill.slug}`,
  blurb: skill.blurb,
}))
