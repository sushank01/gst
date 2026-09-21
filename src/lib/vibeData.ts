/** Vibe Studio, transcribed from apragya.ai/admin/vibe-studio. */

export type Capability = { id: string; icon: string; name: string; blurb: string }

export const vibeTopNav = [
  { id: 'progress', icon: '▤', label: 'Progress' },
  { id: 'playbooks', icon: '✦', label: 'My Playbooks' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
]

/** Runtime selectors in the top-right: credit balance, key source, and model. */
export const vibeControls = [
  { id: 'aiu', label: '0 AIU', tone: 'bg-emerald-500' },
  { id: 'key', label: 'Claude · SaaS Key', tone: 'bg-sky-500' },
]

export const vibeModel = 'Default · claude-sonnet-4-6'

/** What the model picker offers beyond the default. */
export const vibeModels = [vibeModel, 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5']

export const vibePromptPlaceholder = 'Design an investor pitch deck for a fintech'

export const capabilities: Capability[] = [
  {
    id: 'agent',
    icon: '⚙',
    name: 'Agent',
    blurb: 'Create an AI agent — system prompt, tools, objective — scoped to your tenant.',
  },
  {
    id: 'business-solution-agents',
    icon: '⚛',
    name: 'Business Solution Agents',
    blurb: 'Custom business solution wired with Agent Studio.',
  },
  {
    id: 'web-app',
    icon: '</>',
    name: 'Web app',
    blurb: 'Develops websites and customized applications using chat.',
  },
  {
    id: 'erp-custom-agents',
    icon: '✦',
    name: 'ERP Custom Agents',
    blurb:
      "Add or replace an AI agent inside one of your enterprise apps — by chat. Runs on Agent Studio and shows on the app's records.",
  },
  {
    id: 'mobile-app',
    icon: '▯',
    name: 'Mobile App',
    blurb: 'A React Native mobile app (Android) — TypeScript + React Navigation.',
  },
  {
    id: 'web-rpa-bot',
    icon: '🤖',
    name: 'Web RPA Bot',
    blurb:
      'Chat → a web automation bot (scrape, log in, download) that runs headless on the platform or your runner.',
  },
]
