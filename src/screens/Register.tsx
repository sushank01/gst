'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from '../lib/router'
import { AuthLayout } from '../components/AuthLayout'
import { Button, Divider, Field, SsoButtons } from '../components/ui'
import { useAuth } from '../lib/auth'
import { trustPoints } from '../lib/content'
import {
  passwordRules,
  passwordScore,
  validateConfirm,
  validateEmail,
  validateFullName,
  validateOrganization,
  validatePassword,
} from '../lib/validation'

type Errors = Partial<Record<'fullName' | 'email' | 'organization' | 'password' | 'confirm' | 'terms' | 'form', string>>

export default function Register() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const intent = params.get('intent')
  const { signUp } = useAuth()

  const [values, setValues] = useState({
    fullName: '',
    email: '',
    organization: '',
    password: '',
    confirm: '',
    website: '', // honeypot
  })
  const [agreed, setAgreed] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }))

  const score = passwordScore(values.password)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()

    const next: Errors = {
      fullName: validateFullName(values.fullName) ?? undefined,
      email: validateEmail(values.email) ?? undefined,
      organization: validateOrganization(values.organization) ?? undefined,
      password: validatePassword(values.password) ?? undefined,
      confirm: validateConfirm(values.password, values.confirm) ?? undefined,
      terms: agreed ? undefined : 'Accept the Terms & Privacy Policy to continue.',
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return

    // Bots fill hidden fields; fail silently rather than telling them why.
    if (values.website) return

    setSubmitting(true)
    try {
      await signUp({
        fullName: values.fullName,
        email: values.email,
        organization: values.organization,
      })
      navigate(intent ? `/onboarding?intent=${encodeURIComponent(intent)}` : '/onboarding', { replace: true })
    } catch {
      setErrors({ form: 'We could not create your workspace. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function onSso(provider: 'google' | 'microsoft') {
    setSubmitting(true)
    await signUp({ fullName: 'New User', email: `you@${provider}.com`, provider })
    setSubmitting(false)
    navigate('/onboarding', { replace: true })
  }

  return (
    <AuthLayout
      eyebrow="Start free. No credit card."
      headline={
        <>
          Start building your <span className="brand-gradient-text">AI-native</span> workspace today.
        </>
      }
      blurb="Get every Apragya tool included from day one — productivity, the no-code agent builder, and the full suite of enterprise apps."
      points={trustPoints}
      stats={[
        { value: '15+', label: 'Apps included' },
        { value: '50+', label: 'Pre-built agents' },
        { value: '14d', label: 'Free trial' },
      ]}
    >
      <p className="text-[11px] font-semibold tracking-[0.18em] text-fg-muted uppercase">Get started</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight">Create your workspace.</h2>
      <p className="mt-2 text-[13px] text-fg-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </p>

      {intent && (
        <p className="mt-5 rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-2.5 text-[13px] text-fg-2">
          We'll pick up where you left off: <span className="font-semibold text-fg">“{intent}”</span>
        </p>
      )}

      <div className="mt-6">
        <SsoButtons onPick={onSso} disabled={submitting} />
      </div>

      <Divider>OR SIGN UP WITH EMAIL</Divider>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {/* Honeypot — hidden from people, visible to naive bots. */}
        <div aria-hidden className="absolute -left-[9999px]">
          <label htmlFor="website">Website (leave empty)</label>
          <input
            id="website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={set('website')}
          />
        </div>

        <Field
          label="Full name"
          placeholder="John Smith"
          autoComplete="name"
          value={values.fullName}
          onChange={set('fullName')}
          error={errors.fullName}
          hint="Letters and spaces only."
        />

        <Field
          label="Email"
          type="email"
          placeholder="you@email.com"
          autoComplete="email"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
        />

        <Field
          label="Organization name"
          optional
          placeholder="Your Company"
          autoComplete="organization"
          value={values.organization}
          onChange={set('organization')}
          error={errors.organization}
          hint="We'll create your organisation now and make you its admin. Skip if you'll set it up later."
        />

        <div>
          <Field
            label="Password"
            type="password"
            placeholder="Create a strong password"
            autoComplete="new-password"
            value={values.password}
            onChange={set('password')}
            error={errors.password}
          />
          {values.password && !errors.password && (
            <>
              <div className="mt-2 flex gap-1" aria-hidden>
                {passwordRules.map((_, index) => (
                  <span
                    key={index}
                    className={`h-1 flex-1 rounded-full ${
                      index < score ? (score >= 4 ? 'bg-accent' : 'bg-amber-400') : 'bg-line'
                    }`}
                  />
                ))}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {passwordRules.map((rule) => {
                  const met = rule.test(values.password)
                  return (
                    <li key={rule.label} className={`text-[11px] ${met ? 'text-accent' : 'text-fg-muted'}`}>
                      {met ? '✓' : '○'} {rule.label}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        <Field
          label="Confirm password"
          type="password"
          placeholder="Confirm your password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
        />

        <div>
          <label className="flex items-start gap-2.5 text-[13px] text-fg-2">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line accent-[#0d9488]"
            />
            <span>
              I agree to the{' '}
              <a href="/legal/terms" className="font-semibold text-accent hover:underline">
                Terms
              </a>{' '}
              &{' '}
              <a href="/legal/privacy" className="font-semibold text-accent hover:underline">
                Privacy Policy
              </a>
            </span>
          </label>
          {errors.terms && <p className="mt-1.5 text-xs text-red-600">{errors.terms}</p>}
        </div>

        {errors.form && (
          <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
            {errors.form}
          </p>
        )}

        <Button type="submit" loading={submitting} className="w-full !py-3">
          Create Account
        </Button>

        <p className="text-center text-xs text-fg-muted">Start free — no credit card needed.</p>
      </form>
    </AuthLayout>
  )
}
