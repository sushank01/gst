/** Mirrors the field rules the live apragya.ai register form enforces. */

const NAME_RE = /^[A-Za-z ]+$/
const ORG_RE = /^[A-Za-z0-9 ]+$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const passwordRules = [
  { label: '8+ characters', test: (v: string) => v.length >= 8 },
  { label: 'An uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'A lowercase letter', test: (v: string) => /[a-z]/.test(v) },
  { label: 'A digit', test: (v: string) => /\d/.test(v) },
  { label: 'A special character', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
]

export function passwordScore(value: string) {
  return passwordRules.filter((rule) => rule.test(value)).length
}

export function validateFullName(value: string) {
  if (!value.trim()) return 'Full name is required.'
  if (!NAME_RE.test(value.trim())) return 'Letters and spaces only.'
  return null
}

export function validateEmail(value: string) {
  if (!value.trim()) return 'Email is required.'
  if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address.'
  return null
}

export function validateOrganization(value: string) {
  if (!value.trim()) return null // optional
  if (!ORG_RE.test(value.trim())) return 'Letters, numbers, and spaces only.'
  return null
}

export function validatePassword(value: string) {
  if (!value) return 'Password is required.'
  if (passwordScore(value) < passwordRules.length)
    return 'Use 8+ characters with an uppercase letter, a lowercase letter, a digit and a special character.'
  return null
}

export function validateConfirm(password: string, confirm: string) {
  if (!confirm) return 'Confirm your password.'
  if (password !== confirm) return 'Passwords do not match.'
  return null
}
