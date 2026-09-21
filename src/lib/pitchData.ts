/** Pitch Pilot, transcribed from the live `/app/pitch-pilot` surface. */

export const pitchNav = [
  {
    group: 'Work',
    items: [
      { id: '', label: 'Dashboard', icon: 'chart' },
      { id: 'inbox', label: 'RFP Inbox', icon: 'inbox', badge: true },
      { id: 'new', label: 'New RFP', icon: 'plus' },
    ],
  },
  {
    group: 'Library',
    items: [
      { id: 'kb', label: 'Knowledge Base', icon: 'book' },
      { id: 'templates', label: 'Templates', icon: 'file-text' },
    ],
  },
  {
    group: 'Settings',
    items: [
      { id: 'schema', label: 'Extraction Schema', icon: 'sparkles' },
      { id: 'brand', label: 'Brand Kit', icon: 'palette' },
    ],
  },
  { group: 'Insights', items: [{ id: 'analytics', label: 'Analytics', icon: 'activity' }] },
]

/** Where an RFP sits between arriving and being decided. */
export const rfpStages = ['Extracting', 'Your turn', 'Drafting', 'Out for client', 'Won', 'Lost'] as const

export type RfpStage = (typeof rfpStages)[number]

/** Stages that still count as in the funnel. */
export const inFlightStages: RfpStage[] = ['Extracting', 'Your turn', 'Drafting', 'Out for client']

export const verticals = [
  'Government / Municipal',
  'Healthcare',
  'Financial services',
  'Retail',
  'Education',
  'Technology',
  'Non-profit',
]

export const kbCategories = [
  { id: 'case_studies', label: 'Case studies', icon: '📊' },
  { id: 'team_bios', label: 'Team bios', icon: '👤' },
  { id: 'methodology', label: 'Methodology', icon: '🔧' },
  { id: 'pricing', label: 'Pricing', icon: '💰' },
  { id: 'references', label: 'References', icon: '📞' },
  { id: 'other', label: 'Other', icon: '📄' },
]

/** The four schemas that ship with the app, and the fields each one pulls. */
export const stockSchemas = [
  {
    id: 'design',
    name: 'Design & Development',
    fields: ['Client name', 'Scope of work', 'Deliverables', 'Timeline', 'Budget range', 'Brand guidelines'],
  },
  {
    id: 'software',
    name: 'Software Development',
    fields: ['Client name', 'Platforms', 'Integrations', 'Team size', 'Milestones', 'Security requirements'],
  },
  {
    id: 'services',
    name: 'Services & Consulting',
    fields: ['Client name', 'Engagement type', 'Duration', 'Day rate', 'Named staff', 'Outcomes'],
  },
  {
    id: 'government',
    name: 'Government / Municipal',
    fields: ['Issuing authority', 'Solicitation number', 'Submission deadline', 'Compliance matrix', 'Bond', 'Evaluation criteria'],
  },
]

/** Brand Kit defaults — the navy/amber look decks fall back to. */
export const brandDefaults = {
  firmName: '',
  logoUrl: '',
  primary: '#1E3A8A',
  accent: '#F59E0B',
  dark: '#0F172A',
  contactName: '',
  contactTitle: '',
  contactEmail: '',
  contactPhone: '',
}

export const monthlyAiBudget = 1000
