export type User = {
  id: string
  fullName: string
  email: string
  organization: string | null
  provider: 'password' | 'google' | 'microsoft'
}

export type OnboardingProfile = {
  workspaceName: string
  industry: string
  teamSize: string
  apps: string[]
  completedAt: string
}

export type Session = {
  user: User
  onboarding: OnboardingProfile | null
}
