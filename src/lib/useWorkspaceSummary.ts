'use client'

import { api } from './api.ts'
import { useResource } from './useResource.ts'

/**
 * The workspace overview and entitlement, from the server.
 *
 * Every figure here is computed by the server from the rows the module itself
 * reads, so the dashboard cannot drift from the screen it summarises. The
 * prototype's dashboard read a browser object and rendered zeroes for anything
 * it had not loaded, which is indistinguishable from a real zero.
 */

export type Overview = {
  generatedAt: string
  people: { headcount: number; onProbation: number; joinersThisMonth: number; leaversThisMonth: number; onLeaveToday: number }
  support: { open: number; breached: number; unassigned: number; medianFirstResponseMinutes: number | null }
  sales: { postedThisMonth: string; outstanding: string; currency: string | null; overdueInvoices: number }
  expenses: { awaitingApproval: number; awaitingPayment: string; currency: string | null }
  assets: { registered: number; issued: number; inService: number; warrantyExpiring: number }
  credits: { granted: number; used: number; available: number }
  /** Figures the server could not compute, and why. Rendered, never hidden. */
  unavailable: { metric: string; reason: string }[]
}

export type Entitlement = {
  planCode: string | null
  planName: string | null
  status: string | null
  appQuota: number | null
  used: number
  remaining: number | null
  trialEndsAt: string | null
  trialDaysLeft: number | null
  monthlyCredits: number | null
}

export type CatalogEntry = { code: string; name: string; releasable: boolean; status: string | null }

export function useOverview() {
  return useResource<Overview>('overview', (signal) => api.get<Overview>('/reports/overview', undefined, signal))
}

export type AppsResponse = { apps: CatalogEntry[]; entitlement: Entitlement }

export function useApps() {
  return useResource<AppsResponse>('apps', (signal) => api.get<AppsResponse>('/apps', undefined, signal))
}

/** Formats a decimal-string amount for display without going through a float. */
export function formatAmount(amount: string, currency: string | null): string {
  const [whole, fraction = ''] = amount.split('.')
  const grouped = Number(whole).toLocaleString()
  const decimals = fraction.replace(/0+$/, '').slice(0, 2)
  return `${currency ? `${currency} ` : ''}${grouped}${decimals ? `.${decimals.padEnd(2, '0')}` : ''}`
}
