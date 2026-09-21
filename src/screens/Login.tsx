'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from '../lib/router'
import { AuthLayout } from '../components/AuthLayout'
import { Button, Divider, Field, SsoButtons } from '../components/ui'
import { useAuth } from '../lib/auth'
import { signInPoints } from '../lib/content'
import { validateEmail } from '../lib/validation'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = location.state?.from ?? '/app'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next = {
      email: validateEmail(email) ?? undefined,
      password: password ? undefined : 'Password is required.',
    }
    setErrors(next)
    if (next.email || next.password) return

    setSubmitting(true)
    try {
      const session = await signIn({ email })
      navigate(session.onboarding ? redirectTo : '/onboarding', { replace: true })
    } catch {
      setErrors({ form: 'That email and password combination did not work.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function onSso(provider: 'google' | 'microsoft') {
    setSubmitting(true)
    const session = await signIn({ email: `you@${provider}.com`, provider })
    setSubmitting(false)
    navigate(session.onboarding ? redirectTo : '/onboarding', { replace: true })
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      headline={
        <>
          Run your business on <span className="brand-gradient-text">AI agents</span> that actually ship.
        </>
      }
      blurb="One platform combining productivity tools, a no-code agent builder, and 15+ ready-to-deploy apps across CRM, HR, Finance and more."
      points={signInPoints}
    >
      <p className="text-[11px] font-semibold tracking-[0.18em] text-fg-muted uppercase">Sign in</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight">Welcome back.</h2>
      <p className="mt-2 text-[13px] text-fg-muted">
        New to Apragya AI?{' '}
        <Link to="/register" className="font-semibold text-accent hover:underline">
          Create your workspace
        </Link>
      </p>

      <div className="mt-6">
        <SsoButtons onPick={onSso} disabled={submitting} />
      </div>

      <Divider>OR SIGN IN WITH EMAIL</Divider>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="Work email"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />

        <div>
          <Field
            label="Password"
            type="password"
            placeholder="Your password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
          />
          <div className="mt-1.5 text-right">
            <a href="/forgot-password" className="text-xs font-medium text-accent hover:underline">
              Forgot password?
            </a>
          </div>
        </div>

        {errors.form && (
          <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
            {errors.form}
          </p>
        )}

        <Button type="submit" loading={submitting} className="w-full !py-3">
          Sign in
        </Button>
      </form>

      <p className="mt-8 text-center text-[11px] text-fg-muted">
        Protected by enterprise SSO • Audit-logged sessions
      </p>
    </AuthLayout>
  )
}
