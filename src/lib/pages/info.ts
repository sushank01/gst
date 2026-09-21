import type { PageSpec } from './types'
import { moreLinksContent } from './moreContent'

const startFree = { label: 'Start Free', to: '/register' } as const
const talkToSales = { label: 'Talk to sales', to: '/contact-sales', variant: 'secondary' } as const

/** Company, resource, and legal pages behind the rail's "More" flyout. */
export const infoPages: PageSpec[] = [
  {
    slug: 'about',
    eyebrow: 'About',
    title: 'Built in Chennai, for the agent era.',
    blurb:
      'Apragya AI is a product of Fronseye Tech Private Limited, a DPIIT and StartupTN-recognised Indian deep-tech startup building the first horizontal AI-native ERP platform.',
    ctas: [talkToSales, startFree],
    sections: [
      {
        kind: 'prose',
        eyebrow: 'Our thesis',
        title: 'ERP was built for forms. Work moved to agents.',
        paragraphs: [
          'Traditional ERP assumes a human fills in the form. The record is the point, and software exists to store it. That assumption held for thirty years and it no longer does: the interesting work is now reading the invoice, judging the clause, scoring the lead — the parts that used to sit around the form.',
          'Apragya is built the other way around. Agents are first-class, the apps exist to give them records to act on, and the governance layer exists so a business can let them act at all.',
          'We are a small team, shipping weekly, with customers in real estate, BFSI, healthcare, and manufacturing.',
        ],
      },
      {
        kind: 'cards',
        eyebrow: 'Recognition',
        title: 'Where we stand.',
        cols: 3,
        cards: [
          { icon: '🏛', name: 'DPIIT recognised', blurb: 'Recognised by the Department for Promotion of Industry and Internal Trade.' },
          { icon: '🚀', name: 'StartupTN', blurb: "Part of Tamil Nadu's startup ecosystem programme." },
          { icon: '📰', name: 'In the press', blurb: 'Launch covered as India’s first horizontal AI-native ERP platform.' },
        ],
      },
    ],
    final: {
      eyebrow: 'Work with us',
      title: 'Talk to the team.',
      blurb: 'Whether you are evaluating, partnering, or hiring us — start a conversation.',
      ctas: [{ label: 'Contact Sales', to: '/contact-sales' }, startFree],
    },
  },

  {
    slug: 'partners',
    eyebrow: 'Partners',
    title: 'Build with us, sell with us.',
    blurb:
      'Consulting firms, system integrators, and independent developers building customer-specific solutions on top of the Apragya platform.',
    ctas: [{ label: 'Become a partner', to: '/contact-sales' }, startFree],
    sections: [
      {
        kind: 'cards',
        eyebrow: 'Programmes',
        title: 'Three ways to partner.',
        cols: 3,
        cards: [
          { icon: '🤝', name: 'Solution partners', blurb: 'Deliver Apragya to your clients, with tenant provisioning and partner pricing.' },
          { icon: '🧩', name: 'Build partners', blurb: 'Publish agents and apps to the marketplace and earn on installs.' },
          { icon: '🎓', name: 'Certified developers', blurb: 'Get certified on Vibe Studio and Agent Studio, and get referred work.' },
        ],
      },
      {
        kind: 'prose',
        eyebrow: 'What you get',
        title: 'A platform to build on, not around.',
        paragraphs: [
          'Partners build on the same surfaces customers use — Vibe Studio, Agent Studio, the custom adapter — so what you ship is maintainable by the customer after you hand it over.',
          'Marketplace listings carry your name, your support channel, and your install count. Certified partners get early access to new skills and connectors.',
        ],
      },
    ],
    final: {
      eyebrow: 'Interested?',
      title: 'Start a partner conversation.',
      blurb: 'Tell us what you build and who you build it for.',
      ctas: [{ label: 'Contact Sales', to: '/contact-sales' }, startFree],
    },
  },

  {
    slug: 'docs',
    eyebrow: 'Docs',
    title: 'Setup, guides, how-tos.',
    blurb: 'Everything from provisioning your first tenant to wiring a custom adapter and shipping an agent to production.',
    ctas: [startFree, { label: 'Help Center', to: '/help-center', variant: 'secondary' }],
    sections: [
      {
        kind: 'list',
        eyebrow: 'Start here',
        title: 'The first hour.',
        blurb: 'The path most new tenants take on day one.',
        items: [
          { name: 'Create your workspace', blurb: 'Sign up, name your tenant, invite your first teammates.', to: '/register' },
          { name: 'Install your first apps', blurb: 'Pick from the marketplace; install takes 10–20 seconds with optional sample data.', to: '/marketplace' },
          { name: 'Run a pre-built agent', blurb: 'Drop a record into an installed app and watch its bound agents fire.', to: '/enterprise-apps' },
          { name: 'Build something from a prompt', blurb: 'Describe an agent, app, or bot in Vibe Studio and publish it.', to: '/vibe-studio' },
        ],
      },
      {
        kind: 'list',
        eyebrow: 'Guides',
        title: 'Go deeper.',
        items: [
          { name: 'Agent Studio: nodes, guardrails, tests', blurb: 'Author an agent by hand and gate it behind golden tests.', to: '/agent-studio' },
          { name: 'Connectors and the custom adapter', blurb: 'Connect any REST or GraphQL API without writing code.', to: '/integrations' },
          { name: 'Tenant runners', blurb: 'Run connectors and RPA bots inside your own network.', to: '/integrations' },
          { name: 'RBAC, approvals, and the audit trail', blurb: 'How the governance layer is configured and enforced.', to: '/trust' },
        ],
      },
    ],
  },

  {
    slug: 'blog',
    eyebrow: 'Blog',
    title: 'Engineering and product notes.',
    blurb: 'How we build the platform, what we are learning from customers, and what shipped this month.',
    sections: [
      {
        kind: 'list',
        eyebrow: 'Latest',
        title: 'From the newsroom.',
        items: [
          {
            name: 'Chennai-based Fronseye Tech launches Apragya AI',
            blurb: "India's first horizontal AI-native ERP platform for modern teams, with 50 ready-to-deploy agents across CRM, HR, Finance, and Procurement.",
          },
          { name: 'Why governance belongs in the runtime', blurb: 'The architectural case for refusing to make guardrails an optional module.', to: '/trust' },
          { name: 'Two builders, one runtime', blurb: 'When to reach for Vibe Studio and when to open the Agent Studio canvas.', to: '/agent-studio' },
        ],
      },
      { kind: 'notice', text: 'More posts are on the way. Check back soon.' },
    ],
  },

  {
    slug: 'help-center',
    eyebrow: 'Help Center',
    title: 'How-to articles + answers.',
    blurb: 'Short answers to the questions that come up most, organised the way new tenants actually hit them.',
    ctas: [{ label: 'Open a ticket', to: '/contact-support' }, { label: 'Docs', to: '/docs', variant: 'secondary' }],
    sections: [
      {
        kind: 'list',
        eyebrow: 'Popular',
        title: 'Common questions.',
        items: [
          { name: 'How do AI Credits work?', blurb: 'One monthly pool funds suite tools, agent runs, Vibe builds, and Vippy. Admins can set per-user allocations.', to: '/business-suite' },
          { name: 'How do I invite my team?', blurb: 'Admins invite from the workspace settings; five seats are free during trial.' },
          { name: 'Can I run agents on data behind our firewall?', blurb: 'Yes — deploy a tenant runner and execution stays inside your network.', to: '/integrations' },
          { name: 'What happens when a guardrail trips?', blurb: 'The run pauses for human review, and the decision is recorded in the audit trail.', to: '/trust' },
          { name: 'Can I roll back a published agent?', blurb: 'Every publish is an immutable snapshot; rollback is one click.', to: '/agent-studio' },
        ],
      },
    ],
  },

  {
    slug: 'contact-sales',
    eyebrow: 'Contact Sales',
    title: 'Talk to a person.',
    blurb:
      'Tell us what you are trying to automate and we will show you the shortest path — including whether the free plan already covers it.',
    sections: [
      {
        kind: 'cards',
        eyebrow: 'What to expect',
        title: 'A conversation, not a funnel.',
        cols: 3,
        cards: [
          { icon: '📞', name: 'A 30-minute call', blurb: 'We walk your use case and say plainly whether we fit it.' },
          { icon: '🔐', name: 'Security review', blurb: 'We walk questionnaires with IT, legal, and infosec leads regularly.' },
          { icon: '🧭', name: 'A guided pilot', blurb: 'If it fits, we scope a pilot with success criteria you set.' },
        ],
      },
      { kind: 'notice', text: 'The live site collects this through a form. This rebuild shows the flow without submitting anything anywhere.' },
    ],
    final: {
      eyebrow: 'Prefer to try first?',
      title: 'Start free, talk later.',
      blurb: 'The free plan needs no credit card and no conversation with us.',
      ctas: [startFree, { label: 'See pricing', to: '/#pricing', variant: 'secondary' }],
    },
  },

  {
    slug: 'contact-support',
    eyebrow: 'Support',
    title: 'Open a ticket — SLA-tracked.',
    blurb: 'Existing customers get SLA-tracked support. Starter is standard, Pro is priority, Enterprise is 24/7 with a dedicated CSM.',
    sections: [
      {
        kind: 'cards',
        eyebrow: 'Response targets',
        title: 'What each plan gets.',
        cols: 3,
        cards: [
          { icon: '📨', name: 'Starter · Standard', blurb: 'Email support, next-business-day first response.' },
          { icon: '⚡', name: 'Pro · Priority', blurb: 'Priority queue with same-business-day first response.' },
          { icon: '🛰', name: 'Enterprise · 24/7', blurb: 'Custom SLA, dedicated CSM, and an escalation path.' },
        ],
      },
      { kind: 'notice', text: 'Ticket submission is stubbed in this rebuild — nothing is sent.' },
    ],
  },

  {
    slug: 'solutions',
    eyebrow: 'Solutions',
    title: 'Solutions',
    blurb: 'Landing pages for a use case or capability, one per campaign keyword cluster.',
    sections: [{ kind: 'notice', text: 'Pages are on the way. Check back soon.' }],
  },

  {
    slug: 'compare',
    eyebrow: 'Compare',
    title: 'Compare',
    blurb: 'Honest comparisons with a named alternative (Zoho, Tally, Odoo…).',
    sections: [{ kind: 'notice', text: 'Pages are on the way. Check back soon.' }],
  },

  {
    slug: 'free',
    eyebrow: 'Free plan',
    title: 'Free forever for up to 3 users.',
    blurb: 'Start with a 14-day trial of everything, then stay free for up to three users. No credit card, cancel anytime.',
    ctas: [startFree, { label: 'See pricing', to: '/#pricing', variant: 'secondary' }],
    sections: [
      {
        kind: 'cards',
        eyebrow: "What's included",
        title: 'More than a demo.',
        cols: 3,
        cards: [
          { icon: '⚡', name: 'Business Suite', blurb: 'The full 100+ tool catalog from your first login.' },
          { icon: '✦', name: 'Vibe Studio', blurb: 'Build agents, apps, bots, and documents from a prompt.' },
          { icon: '▢', name: 'Enterprise apps', blurb: 'Install apps and run their bound agents on real records.' },
        ],
      },
    ],
    final: {
      eyebrow: 'Start building for free',
      title: 'Create your workspace.',
      blurb: 'Workspace ready in under 60 seconds.',
      ctas: [startFree],
    },
  },

  ...moreLinksContent,
]
