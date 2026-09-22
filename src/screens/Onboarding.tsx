'use client'

import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from '../lib/router'
import { Button, Field, Logo } from '../components/ui'
import { useAuth } from '../lib/auth'
import { ApiClientError, api } from '../lib/api'
import { industries, teamSizes } from '../lib/content'
import { marketApps } from '../lib/appData'

const steps = ['Workspace', 'Industry', 'Apps'] as const

export default function Onboarding() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const intent = params.get('intent')
  const { session, completeOnboarding } = useAuth()

  const [step, setStep] = useState(0)
  const [workspaceName, setWorkspaceName] = useState(session?.user.organization ?? '')
  const [teamSize, setTeamSize] = useState(teamSizes[1])
  const [industry, setIndustry] = useState('')
  /* The two apps a new Apragya tenant starts with, pre-selected but changeable. */
  const [apps, setApps] = useState<string[]>(['CRM', 'HR'])
  const [error, setError] = useState<string | null>(null)
  /*
   * Distinct from `error`: the workspace WAS created, and something about the
   * app selection needs saying. Reporting it as an error would tell the user
   * their sign-up failed when it did not.
   */
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const toggleApp = (name: string) =>
    setApps((prev) => (prev.includes(name) ? prev.filter((app) => app !== name) : [...prev, name]))

  async function next() {
    if (step === 0 && !workspaceName.trim()) {
      setError('Give your workspace a name.')
      return
    }
    if (step === 1 && !industry) {
      setError('Pick the industry closest to your business.')
      return
    }
    setError(null)

    if (step < steps.length - 1) {
      setStep(step + 1)
      return
    }

    // Creating the workspace is a server transaction; only navigate once it
    // has actually committed, so a failure cannot leave a half-made tenant
    // behind a wizard that says it finished.
    setSubmitting(true)
    try {
      await completeOnboarding({
        workspaceName: workspaceName.trim(),
        industry,
        teamSize,
        apps: marketApps.filter((app) => apps.includes(app.code)).map((app) => app.name),
      })
      /*
       * Installing the chosen apps is a second server call, reconciling rather
       * than appending: an app the user unticked is genuinely uninstalled.
       * It runs AFTER the workspace commits because it needs the session to
       * be bound to the new tenant, and a failure here must not lose the
       * workspace that was just created — so it reports rather than throws.
       */
      const result = await api.put<{ refused: { appCode: string; reason: string }[] }>('/apps', { apps })
      if (result.refused.length) {
        /*
         * Something the user ticked could not be installed. Stay here and say
         * so: navigating away with a message nobody has time to read is the
         * same as not telling them. The workspace itself is already created,
         * so the button below just goes to it.
         */
        setNotice(
          `Your workspace is ready. ${result.refused.map((entry) => entry.reason).join(' ')} You can install the rest from the marketplace later.`,
        )
        setSubmitting(false)
        return
      }
      navigate('/app', { replace: true })
    } catch (error) {
      setError(error instanceof ApiClientError ? error.message : 'We could not create your workspace. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link to="/">
            <Logo />
          </Link>
          <span className="text-[13px] text-fg-muted">
            Step {step + 1} of {steps.length}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <ol className="flex items-center gap-3">
          {steps.map((label, index) => (
            <li key={label} className="flex flex-1 items-center gap-3">
              <div className="flex-1">
                <div
                  className={`h-1 rounded-full ${index <= step ? 'bg-gradient-to-r from-accent to-accent' : 'bg-line'}`}
                />
                <p className={`mt-2 text-xs ${index <= step ? 'font-semibold text-fg' : 'text-fg-muted'}`}>
                  {label}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-7">
          {step === 0 && (
            <>
              <h1 className="text-2xl font-bold tracking-tight">
                Welcome{session?.user.fullName ? `, ${session.user.fullName.split(' ')[0]}` : ''}.
              </h1>
              <p className="mt-2 text-sm text-fg-muted">
                Name your tenant. Everything you build — agents, apps, credits — lives inside it.
              </p>

              <Field
                className="mt-6"
                label="Workspace name"
                placeholder="Acme Operations"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                error={error}
              />

              <fieldset className="mt-6">
                <legend className="mb-2 text-[13px] font-medium text-fg-2">How big is your team?</legend>
                <div className="flex flex-wrap gap-2">
                  {teamSizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setTeamSize(size)}
                      aria-pressed={teamSize === size}
                      className={`rounded-xl border px-3.5 py-2 text-[13px] transition ${
                        teamSize === size
                          ? 'border-accent bg-accent/10 font-semibold text-fg'
                          : 'border-line text-fg-2 hover:border-fg-muted'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-2xl font-bold tracking-tight">What does your business run on?</h1>
              <p className="mt-2 text-sm text-fg-muted">
                We preload the agent pipeline built for your industry — triggers, decisions, and integrations included.
              </p>

              <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {industries.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setIndustry(option)}
                    aria-pressed={industry === option}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                      industry === option
                        ? 'border-accent bg-accent/10 font-semibold'
                        : 'border-line hover:border-fg-muted'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-2xl font-bold tracking-tight">Pick the apps to install first.</h1>
              <p className="mt-2 text-sm text-fg-muted">
                Install now or later — every app is tenant-configurable and can be added from the marketplace anytime.
              </p>

              <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
                {marketApps.map((app) => {
                  const selected = apps.includes(app.code)
                  return (
                    <button
                      key={app.code}
                      type="button"
                      onClick={() => toggleApp(app.code)}
                      aria-pressed={selected}
                      className={`rounded-xl border p-3.5 text-left transition ${
                        selected ? 'border-accent bg-accent/10' : 'border-line hover:border-fg-muted'
                      }`}
                    >
                      <span aria-hidden className="text-base">{app.icon}</span>
                      <p className="mt-1.5 text-sm font-semibold">{app.name}</p>
                      <p className="text-xs text-fg-muted">{app.blurb}</p>
                    </button>
                  )
                })}
              </div>

              {intent && (
                <p className="mt-6 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[13px] text-fg-2">
                  Queued for your first run: <span className="font-semibold text-fg">“{intent}”</span>
                </p>
              )}
            </>
          )}

          {step === steps.length - 1 && error && <p className="mt-4 text-[13px] text-bad">{error}</p>}
          {notice && (
            <p className="mt-4 rounded-xl border border-warn/30 bg-warn-muted/40 px-3.5 py-2.5 text-[13px] text-fg-2">
              {notice}
            </p>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button
              variant="ghost"
              type="button"
              onClick={() => (step === 0 ? navigate('/') : setStep(step - 1))}
            >
              ← Back
            </Button>
            <Button
              type="button"
              onClick={notice ? () => navigate('/app', { replace: true }) : next}
              loading={submitting}
              disabled={submitting}
            >
              {step === steps.length - 1 ? 'Open my workspace' : 'Continue'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
