import type { PageSpec } from './types'
import { suiteTools, vibeSkills, marketApps } from '../appData'

const startFree = { label: 'Start Free', to: '/register' } as const
const talkToSales = { label: 'Talk to sales', to: '/contact-sales', variant: 'secondary' } as const

/** Product pages, transcribed from the live apragya.ai equivalents. */
export const productPages: PageSpec[] = [
  {
    slug: 'vibe-studio',
    eyebrow: 'Vibe Studio',
    title: 'Describe your idea. Ship it in the browser.',
    blurb:
      "Apragya's canvas for AI-native building. Prompt-driven, browser-only, and wrapped in the platform's governance from the first line.",
    ctas: [startFree, talkToSales],
    sections: [
      {
        kind: 'cards',
        eyebrow: 'What you can build',
        title: '12 things, one Studio.',
        blurb:
          'Each skill produces a real, versioned, governed artifact inside your tenant — not a demo download.',
        cols: 4,
        cards: vibeSkills.map((skill) => ({ icon: skill.icon, name: skill.name, blurb: skill.blurb })),
      },
      {
        kind: 'prose',
        eyebrow: 'How it feels',
        title: 'Prompt-driven, not code-driven.',
        paragraphs: [
          'Most builders show you a canvas and expect you to know what to draw. Vibe Studio inverts that: you describe the outcome you want, and the Studio proposes the smallest possible shape that gets you there.',
          'Accept the proposal, refine it in conversation, or drop into the canvas and edit anything by hand — the Studio never locks you out of the underlying graph. Change your mind mid-build and Vibe regenerates just the parts that need to change, not the whole artifact.',
          'Every build snapshots to an immutable version. You can roll back to any earlier version in one click. Every run records the AI Credits consumed, the tools it called, and the guardrails it hit.',
        ],
      },
      {
        kind: 'prose',
        eyebrow: 'Governance built in',
        title: 'Not a sandbox. Production-ready.',
        paragraphs: [
          "Publishing an artifact from Vibe Studio requires the tenant's app-publish permission, so business users can prototype freely while shipping stays admin-gated. Sensitive outputs pause for human-in-the-loop review whenever your guardrails say a human needs to look first.",
          'Everything you build inherits your tenant’s identity, RBAC matrix, AI Credits budget, and audit trail automatically. There is no "Vibe Studio permission model" to learn — it is the platform permission model, applied.',
        ],
      },
      {
        kind: 'cards',
        eyebrow: "Who it's for",
        title: 'Three personas. One Studio.',
        cols: 3,
        cards: [
          { icon: '🧑‍💼', name: 'Business builders', blurb: "Ops managers, revenue leaders, and department heads who know what they need but can't wait on eng." },
          { icon: '🧑‍🔧', name: 'Systems teams', blurb: 'IT and platform teams standardising how AI ships without policing every prompt.' },
          { icon: '🧑‍💻', name: 'Solution partners', blurb: 'Consulting shops and integrators building customer-specific solutions on the platform.' },
        ],
      },
    ],
    final: {
      eyebrow: 'Ready to build?',
      title: 'Try Vibe Studio free.',
      blurb: 'No credit card. Everything below the Enterprise plan is included in trial.',
      ctas: [startFree, talkToSales],
    },
  },

  {
    slug: 'agent-studio',
    eyebrow: 'Agent Studio',
    title: 'Hand-tune every step. See it run.',
    blurb:
      'The visual canvas for authoring, testing, and shipping AI agents. Reach for it when you want fine control over how your agent thinks — every node, tool call, and guardrail is inspectable.',
    ctas: [startFree, talkToSales],
    sections: [
      {
        kind: 'cards',
        eyebrow: 'What you get',
        title: 'Six capabilities, one canvas.',
        blurb: 'Everything an enterprise-ready agent needs, in one visual environment.',
        cols: 3,
        cards: [
          { icon: '🎨', name: 'Visual Builder', blurb: "Drag, drop, and connect nodes. Every step of the agent's thinking is a shape you can inspect and change." },
          { icon: '📚', name: 'RAG Knowledge Bases', blurb: 'Attach your docs, wiki, tickets. The canvas wires retrieval for you.' },
          { icon: '👥', name: 'Human-in-the-Loop', blurb: 'Pause any run at any node for review. Approve, reject, or amend before the agent continues.' },
          { icon: '🛡', name: 'Guardrails', blurb: 'Approval caps, content filters, max-tool-calls — configurable per agent, enforced inside the runtime.' },
          { icon: '🧪', name: 'Test Suite', blurb: 'Golden tests and eval runs. Catch regressions before they ship, as part of the build gate.' },
          { icon: '🚀', name: 'One-Click Deploy', blurb: 'Publish snapshots to an immutable version. In-flight runs finish on the previous one.' },
        ],
      },
      {
        kind: 'prose',
        eyebrow: 'Every step, observable',
        title: 'Nothing runs silently.',
        paragraphs: [
          'The Runs tab shows every execution the agent has ever done. Click any run to walk the trace: which nodes fired, which tools were called, what the model returned, which guardrails checked in, and how many AI Credits it cost.',
          'When something goes wrong — and eventually it will — you can go from "the CFO says the invoice reviewer is misbehaving" to the exact failing node in under 30 seconds. Copy the input, drop it into the Tests tab, iterate on the prompt, publish a new version. That’s the loop.',
          'All of it, per run: cost, latency, tools, guardrails, HITL decisions, LLM prompts. Auditable to compliance the same way your existing systems of record are.',
        ],
      },
      {
        kind: 'split',
        eyebrow: 'When to reach for Agent Studio',
        title: 'Two builders, two personas.',
        blurb: 'Vibe Studio and Agent Studio are complementary, not competitive. Most teams end up using both.',
        columns: [
          {
            title: 'Reach for Vibe Studio when…',
            lead: 'You know the outcome, not the shape.',
            items: [
              'You want to describe the idea in one sentence and see it',
              "You're prototyping fast to validate the shape",
              'You’re building the standard patterns (chatbot, summariser, extractor)',
              "You don't want to think about the node graph, at all",
            ],
          },
          {
            title: 'Reach for Agent Studio when…',
            lead: 'You know the shape, and every node needs care.',
            items: [
              "The agent branches on subtle logic the prompt can't hold",
              'You want fine control over which tool fires when',
              'You need per-node guardrails, not just per-agent ones',
              "You're operationalising something that's been running for months",
            ],
          },
        ],
      },
    ],
    final: {
      eyebrow: 'Ready to canvas?',
      title: 'Try Agent Studio free.',
      blurb: 'No credit card. Full access to the canvas, guardrails, tests, and deploy.',
      ctas: [startFree, { label: 'Compare with Vibe Studio', to: '/vibe-studio', variant: 'secondary' }],
    },
  },

  {
    slug: 'business-suite',
    eyebrow: 'Business Suite',
    title: '100+ AI tools. One tenant. One credit pool.',
    blurb:
      'Everyday productivity tools every employee can reach for on day one. Same tenant, same identity, same AI Credits budget as the rest of Apragya. Nothing to install.',
    ctas: [startFree, talkToSales],
    sections: [
      {
        kind: 'cards',
        eyebrow: '16 categories',
        title: 'Something for every team.',
        blurb:
          "From the copywriter drafting a launch email to the analyst prepping a board deck — the Business Suite covers the shape of most people's day.",
        cols: 4,
        cards: suiteTools.map((tool) => ({ icon: tool.icon, name: tool.name, blurb: tool.blurb })),
      },
      {
        kind: 'prose',
        eyebrow: 'How usage works',
        title: 'One pool. One bill.',
        paragraphs: [
          'Every plan comes with a monthly AI Credits allowance. Business Suite tools draw from the same pool that agents, document processing, and Vippy conversations use — so admins get one bill to reason about instead of a separate spend for productivity vs automation.',
          'Admins can carve out per-user allocations for teams that lean heavy, and set alerts before the pool runs dry. Everyone’s usage is visible in the admin dashboard in near-real-time.',
          "Every artifact — chat sessions, images, transcripts, code snippets — is soft-tagged to the user's active company under Multi-Company Mode. Users can freely re-tag or untag; the tagging is a UX convenience, not enforcement.",
        ],
      },
    ],
    final: {
      eyebrow: 'Ready to try it?',
      title: 'Every plan includes Business Suite.',
      blurb: 'Start free, no credit card. The full 100+ tool catalog is available from your first login.',
      ctas: [startFree, { label: 'See pricing', to: '/#pricing', variant: 'secondary' }],
    },
  },

  {
    slug: 'enterprise-apps',
    eyebrow: 'Enterprise Apps',
    title: '15+ apps. Every one AI-native.',
    blurb:
      'Ready-to-deploy business applications for the operations that make your company run. Every app is tenant-configurable, includes AI agents by default, and shares the same identity, permissions, and AI Credits pool.',
    ctas: [startFree, { label: 'Browse marketplace', to: '/marketplace', variant: 'secondary' }],
    sections: [
      {
        kind: 'cards',
        eyebrow: 'The catalog',
        title: 'The apps your business runs on.',
        blurb: 'One codebase, many shapes. Turn on the apps you need; turn off the ones you don’t.',
        cols: 3,
        cards: marketApps.map((app) => ({ icon: app.icon, name: app.name, blurb: app.blurb })),
      },
      {
        kind: 'steps',
        eyebrow: 'How enterprise apps work',
        title: 'Install. Configure. Run.',
        blurb: 'Every app follows the same pattern — so a team learning one app already knows how the next one works.',
        steps: [
          { icon: '1️⃣', name: 'Install', blurb: 'One-click install from Marketplace. Sample data optional. Takes 10–20 seconds.' },
          { icon: '2️⃣', name: 'Configure', blurb: 'Every dropdown, status, and label is tenant-configurable. No developer required.' },
          { icon: '3️⃣', name: 'AI agents fire', blurb: 'Every app ships with bound agents. Drop a record in and watch them run.' },
        ],
      },
    ],
    final: {
      eyebrow: 'Ready to deploy?',
      title: 'All apps ship with a free plan.',
      blurb: 'Install what you need on day one. Extend or customise later with Vibe Studio.',
      ctas: [startFree, { label: 'See pricing', to: '/#pricing', variant: 'secondary' }],
    },
  },

  {
    slug: 'prompt-lab',
    eyebrow: 'Prompt Lab',
    title: 'Iterate on prompts. Ship the ones that work.',
    blurb:
      'The scratchpad where your team refines prompts before committing them to an agent, a workflow, or a Vibe Studio skill. Test fast, compare models, keep what works.',
    ctas: [startFree, talkToSales],
    sections: [
      {
        kind: 'cards',
        eyebrow: 'What Prompt Lab does',
        title: 'Try it fast. Ship it clean.',
        cols: 3,
        cards: [
          { icon: '🔬', name: 'Side-by-side comparison', blurb: 'Run the same prompt against multiple models. Compare quality, latency, and credits in one view.' },
          { icon: '🧵', name: 'Variants and threads', blurb: 'Fork any conversation to experiment. Every attempt persists so you can go back to what worked.' },
          { icon: '💾', name: 'Save to library', blurb: "Great prompts become shared building blocks your team's Vibe and Agent Studio builds reach for." },
        ],
      },
      {
        kind: 'prose',
        eyebrow: "Who it's for",
        title: 'Anyone shipping real agents.',
        paragraphs: [
          "Prompts drive everything on Apragya — your agents' system prompts, your workflow branches, your Vibe Studio scaffolding. When a prompt is slightly wrong, a hundred downstream runs are slightly wrong.",
          'Prompt Lab is where your team gets the prompts right before that happens. It costs the same AI Credits per call as any other model use, but iterating in a lab before committing saves your production spend and your team’s confidence.',
        ],
      },
    ],
    final: {
      eyebrow: 'Ready to iterate?',
      title: 'Prompt Lab is included with every plan.',
      blurb: 'Start free, no credit card. Every seat gets access.',
      ctas: [startFree, { label: 'See pricing', to: '/#pricing', variant: 'secondary' }],
    },
  },

  {
    slug: 'trust',
    eyebrow: 'Trust & Governance',
    title: 'Enterprise controls, built in.',
    blurb:
      "Every AI action on Apragya is observable, reversible, and gated by your policies. Governance is not an add-on module — it's how the runtime is designed.",
    ctas: [talkToSales, startFree],
    sections: [
      {
        kind: 'cards',
        eyebrow: 'Eight pillars',
        title: 'Control plane. Runtime. Audit.',
        blurb:
          'Row 1 is the control plane your admins configure. Row 2 is what the runtime enforces once your users are inside.',
        cols: 4,
        cards: [
          { icon: '✦', name: 'Vippy', blurb: "AI assistant on every page — answers questions, takes actions, learns your tenant's context." },
          { icon: '🔑', name: 'SSO / SAML / OIDC', blurb: 'Okta, Azure AD, Google Workspace, or any SAML 2.0 / OIDC provider. JIT provisioning and group-to-role mapping.' },
          { icon: '🔐', name: 'RBAC', blurb: 'Matrix roles down to sub-features. Custom roles per tenant. Admin bypass never leaks paid capabilities.' },
          { icon: '👥', name: 'Approvals (HITL)', blurb: 'Pause any agent run for human review before consequential actions. Configurable per agent.' },
          { icon: '🛡', name: 'Guardrails', blurb: 'Approval caps, content filters, max-tool-calls, run-duration limits — enforced inside the runtime.' },
          { icon: '📜', name: 'Audit Trail', blurb: 'Every state-changing action logged — who, what, when, before, after. SIEM export ready.' },
          { icon: '🏢', name: 'Runners', blurb: 'Self-hosted execution for firewalled data. Your RPA bots and connectors run inside your network.' },
          { icon: '🌐', name: 'Multi-Company Mode', blurb: 'Run subsidiaries from one tenant. Per-company scoping, consolidated reporting, per-role access.' },
        ],
      },
      {
        kind: 'prose',
        eyebrow: 'Governance-first architecture',
        title: 'Not an add-on. The runtime.',
        paragraphs: [
          'Most AI platforms bolt governance on. Guardrails are a module you enable. Audit is a plugin. RBAC ships in month six. Apragya is built the other way around: every AI action runs through the governance layer, and the runtime refuses to skip it.',
          'The result is a platform your compliance team can approve on day one, not on month twelve. Approvals pause consequential actions before they happen. Guardrails clamp costs and content. Audit records everything with actor, before, and after.',
          'For the truly sensitive workloads — RPA bots reaching into internal tools, connectors touching firewalled data — tenant runners let you keep execution inside your own network. Same code, same governance, your data never leaves.',
        ],
      },
    ],
    final: {
      eyebrow: 'Ready to review?',
      title: 'Talk to sales about your compliance requirements.',
      blurb: 'Our team walks security reviews with IT, legal, and infosec leads regularly. We know the shape of your questionnaire.',
      ctas: [talkToSales, startFree],
    },
  },

  {
    slug: 'integrations',
    eyebrow: 'Integrations',
    title: '100+ connectors. Lives where your work lives.',
    blurb:
      'Connect Apragya to the systems your teams already use. Cloud collaboration, data platforms, identity providers, industry-specific APIs, and a custom adapter for everything else.',
    ctas: [startFree, { label: 'Request an integration', to: '/contact-sales', variant: 'secondary' }],
    sections: [
      {
        kind: 'cards',
        eyebrow: 'Categories',
        title: 'Eight families of connectors.',
        blurb: 'Every category is production-ready and governed by the same RBAC + audit stack that gates your data.',
        cols: 4,
        cards: [
          { icon: '☁️', name: 'Cloud Collaboration', blurb: 'Slack, Teams, Google Workspace, Microsoft 365, SharePoint. Two-way messaging, file sync, channel routing.' },
          { icon: '🗄', name: 'Data Platforms', blurb: 'PostgreSQL, Amazon S3, SAP OData, FTP/SFTP. Read, write, sync, and stream.' },
          { icon: '💰', name: 'Finance & Credit', blurb: 'CIBIL, Experian. QuickBooks, Xero via partners. Payment processors and ledger sync.' },
          { icon: '🔐', name: 'Identity & KYC', blurb: 'Hyperverge, Idfy for document verification. Face-match, PAN, Aadhaar — regionally compliant.' },
          { icon: '🏥', name: 'Healthcare (FHIR)', blurb: 'Epic, HAPI FHIR. Patient records, encounters, observations. FHIR R4 compliant.' },
          { icon: '🎯', name: 'CRM & Marketing', blurb: 'Salesforce, HubSpot, Jira, Zapier. Two-way sync with your systems of record.' },
          { icon: '🤝', name: 'Custom Adapter', blurb: 'Any REST or GraphQL API. Configure without writing code and Vibe wires it in.' },
          { icon: '🖥', name: 'Web RPA', blurb: 'For tools with no API at all. Your bot drives the browser like a human would.' },
        ],
      },
      {
        kind: 'prose',
        eyebrow: 'Behind the firewall',
        title: 'Reach your internal systems.',
        paragraphs: [
          "Some of your most important data lives inside your network — SAP Gateway, Oracle EBS, an internal payroll ERP that doesn't publish an external API. Tenant runners let you reach it without punching holes in your firewall.",
          'A runner is a small container you deploy inside your network. It makes one outbound TLS WebSocket to Apragya Cloud, and the platform tunnels connector requests back through it. Your data never leaves, and you don’t open any inbound ports.',
          'Pair a runner with a Vibe Studio Web RPA bot and you can automate the internal tools your team clicks through every day.',
        ],
      },
    ],
    final: {
      eyebrow: 'Missing a connector?',
      title: 'Tell us what you need.',
      blurb: 'We ship new connectors monthly, and priority is driven by real customer requests.',
      ctas: [{ label: 'Request an integration', to: '/contact-sales' }, startFree],
    },
  },
]
