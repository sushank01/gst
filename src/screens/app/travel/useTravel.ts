'use client'

import { useCallback, useMemo, useState } from 'react'
import { ApiClientError, api, apiRequest } from '../../../lib/api.ts'
import { useMutation, useResource } from '../../../lib/useResource.ts'

/**
 * Travel & Expense, from the server.
 *
 * Everything this screen used to read came out of one browser object, which
 * meant a count was the length of an array somebody had pushed onto, a total
 * added rupees to dollars, and a failed request was indistinguishable from an
 * empty workspace. Each hook here is one request: filters and ranges are
 * applied in SQL so the figure beside a list is the figure for the filter,
 * money stays a decimal string with the currency it is in, and every write
 * sends the version it read so a stale save is a conflict somebody is told
 * about rather than an overwrite nobody notices.
 */

export type ServerReport = {
  id: string
  reference: string
  employeeId: string
  title: string
  currency: string
  status: string
  currentLevel: number
  approvalRound: number
  totalAmount: string
  approvedAmount: string | null
  policyFlags: { code: string; message: string }[]
  submittedAt: string | null
  reimbursedAt: string | null
  createdAt: string
  version: number
}

export type ServerExpense = {
  id: string
  employeeId: string
  reportId: string | null
  categoryId: string | null
  spentOn: string
  merchant: string | null
  description: string | null
  amount: string
  currency: string
  baseAmount: string
  baseCurrency: string
  reimbursable: boolean
  policyFlags: { code: string; message: string }[]
}

export type ServerCardTransaction = {
  id: string
  postedOn: string
  merchant: string
  amount: string
  currency: string
  cardLast4: string | null
  matchedExpenseId: string | null
}

export type ServerRun = {
  id: string
  reference: string
  status: string
  currency: string
  totalAmount: string
  paidAt: string | null
  reports: number
}

export type ServerTrip = {
  id: string
  reference: string
  employeeId: string
  purpose: string
  tripKind: string
  origin: string | null
  destination: string
  departsOn: string
  returnsOn: string
  estimatedCost: string | null
  currency: string | null
  status: string
  version: number
}

export type ServerCategory = {
  id: string
  name: string
  code: string
  glAccount: string | null
  limitAmount: string | null
  limitCurrency: string | null
  receiptRequiredAbove: string | null
}

export type ServerApprovalLevel = { level: number; label: string; threshold: string; approverRole: string | null }

export type ServerSummary = {
  byStatus: { status: string; currency: string; reports: number; total: string }[]
  byCategory: { categoryId: string | null; name: string | null; currency: string; total: string }[]
  byEmployee: { employeeId: string; name: string; currency: string; reports: number; total: string }[]
  turnaround: { days: string; reports: number } | null
  cards: { unmatched: number }
}

export type ServerEmployee = { id: string; fullName: string; employeeNo: string; status: string }

export type SettingsDoc = { section: string; value: Record<string, unknown>; version: number; updatedAt: string | null }

export type SettingsChange = {
  id: string
  version: number
  summary: string
  changedByName: string | null
  changedAt: string
  reverted: boolean
}

/** The fetch states every list on this screen has to be able to render. */
export type Fetching = {
  loading: boolean
  refreshing: boolean
  error: ApiClientError | null
  denied: boolean
  canRetry: boolean
  refetch: () => void
}

function fetching<T>(resource: ReturnType<typeof useResource<T>>): Fetching {
  return {
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    denied: resource.denied,
    canRetry: resource.canRetry,
    refetch: resource.refetch,
  }
}

/* --------------------------------- claims --------------------------------- */

export type ReportFilters = { status?: string; from?: string; to?: string; limit: number; offset: number }

export function useExpenseReports(filters: ReportFilters) {
  const key = `reports:${JSON.stringify(filters)}`
  const resource = useResource<{ reports: ServerReport[]; total: number }>(
    key,
    useCallback(
      (signal) =>
        api.get<{ reports: ServerReport[]; total: number }>(
          '/expenses/reports',
          { status: filters.status, from: filters.from, to: filters.to, limit: filters.limit, offset: filters.offset },
          signal,
        ),
      [filters.status, filters.from, filters.to, filters.limit, filters.offset],
    ),
  )
  const { refetch } = resource

  const [openReport, opening] = useMutation(
    async (input: { employeeId: string; title: string; currency: string }) => {
      const created = await api.post<{ report: ServerReport }>('/expenses/reports', input)
      refetch()
      return created.report
    },
  )

  const [submit, submitting] = useMutation(async (report: ServerReport) => {
    const sent = await api.post<{ report: ServerReport }>(`/expenses/reports/${report.id}/submit`, {
      version: report.version,
    })
    refetch()
    return sent.report
  })

  const [decide, deciding] = useMutation(async (report: ServerReport, decision: 'approved' | 'rejected') => {
    const decided = await api.post<{ report: ServerReport }>(`/expenses/reports/${report.id}/decision`, {
      decision,
      version: report.version,
    })
    refetch()
    return decided.report
  })

  return useMemo(
    () => ({
      reports: resource.data?.reports ?? [],
      /** The server's count for this filter, never the length of the page. */
      total: resource.data?.total ?? 0,
      ...fetching(resource),
      openReport,
      submit,
      decide,
      writing: opening.pending || submitting.pending || deciding.pending,
      writeError: opening.error ?? submitting.error ?? deciding.error,
      fieldErrors: opening.fieldErrors,
    }),
    [resource, openReport, submit, decide, opening, submitting, deciding],
  )
}

/**
 * How many unfiled expenses one request asks for.
 *
 * This endpoint answers with rows and no count, so a full page is the only
 * signal that there are more. The pickers say so rather than letting somebody
 * conclude from a capped list that the expense they are looking for was never
 * recorded.
 */
export const UNFILED_PAGE = 100

/** Expenses not yet filed onto a claim — the pool both pickers choose from. */
export function useUnfiledExpenses(employeeId: string | null) {
  const resource = useResource<{ expenses: ServerExpense[] }>(
    `unfiled:${employeeId ?? 'none'}`,
    useCallback(
      (signal) =>
        api.get<{ expenses: ServerExpense[] }>(
          '/expenses',
          { employeeId: employeeId ?? undefined, unfiled: true, limit: UNFILED_PAGE },
          signal,
        ),
      [employeeId],
    ),
  )
  return useMemo(
    () => ({
      expenses: resource.data?.expenses ?? [],
      /** True when the page came back full: there may be older ones behind it. */
      capped: (resource.data?.expenses.length ?? 0) >= UNFILED_PAGE,
      ...fetching(resource),
    }),
    [resource],
  )
}

/**
 * Filing an expense.
 *
 * Quick expense is three calls in this order, because a claim is a header over
 * lines rather than a number somebody typed: record the expense, open the
 * claim, then file the one onto the other. Skipping the first produces a claim
 * the server will refuse to submit, which is the honest answer to a total that
 * nothing adds up to.
 */
export function useExpenseWriting(onChanged: () => void) {
  const [recordExpense, recording] = useMutation(
    async (input: {
      employeeId: string
      spentOn: string
      amount: string
      currency: string
      categoryId?: string
      merchant?: string
      description?: string
    }) => {
      const created = await api.post<{ expense: ServerExpense }>('/expenses', {
        ...input,
        // One currency throughout, so no rate has to be invented to convert it.
        baseCurrency: input.currency,
      })
      onChanged()
      return created.expense
    },
  )

  const [fileExpense, filing] = useMutation(async (reportId: string, expenseId: string) => {
    const updated = await api.post<{ report: ServerReport }>(`/expenses/reports/${reportId}/expenses`, { expenseId })
    onChanged()
    return updated.report
  })

  const [quickExpense, quick] = useMutation(
    async (input: {
      employeeId: string
      title: string
      spentOn: string
      amount: string
      currency: string
      categoryId?: string
    }) => {
      const { expense } = await api.post<{ expense: ServerExpense }>('/expenses', {
        employeeId: input.employeeId,
        spentOn: input.spentOn,
        amount: input.amount,
        currency: input.currency,
        baseCurrency: input.currency,
        categoryId: input.categoryId,
        merchant: input.title,
      })
      const { report } = await api.post<{ report: ServerReport }>('/expenses/reports', {
        employeeId: input.employeeId,
        title: input.title,
        currency: input.currency,
      })
      await api.post(`/expenses/reports/${report.id}/expenses`, { expenseId: expense.id })
      onChanged()
      return report
    },
  )

  return {
    recordExpense,
    fileExpense,
    quickExpense,
    writing: recording.pending || filing.pending || quick.pending,
    writeError: recording.error ?? filing.error ?? quick.error,
    fieldErrors: { ...quick.fieldErrors, ...recording.fieldErrors },
  }
}

/* --------------------------------- figures -------------------------------- */

export function useExpenseSummary(range: { from?: string; to?: string } = {}) {
  const resource = useResource<{ summary: ServerSummary }>(
    `te-summary:${range.from ?? ''}:${range.to ?? ''}`,
    useCallback(
      (signal) => api.get<{ summary: ServerSummary }>('/expenses/summary', { from: range.from, to: range.to }, signal),
      [range.from, range.to],
    ),
  )
  return useMemo(() => ({ summary: resource.data?.summary, ...fetching(resource) }), [resource])
}

/* ----------------------------------- cards -------------------------------- */

export type CardFilter = 'All' | 'Matched' | 'Unmatched'

/** One page of card lines. `total` counts every line the filter matches. */
export const CARD_PAGE = 100

export function useCardTransactions(filter: CardFilter) {
  const matched = filter === 'All' ? undefined : filter === 'Matched'
  const resource = useResource<{ transactions: ServerCardTransaction[]; total: number }>(
    `cards:${filter}`,
    useCallback(
      (signal) =>
        api.get<{ transactions: ServerCardTransaction[]; total: number }>(
          '/expenses/cards',
          { matched: matched === undefined ? undefined : String(matched), limit: CARD_PAGE },
          signal,
        ),
      [matched],
    ),
  )
  const { refetch } = resource

  const [importLines, importing] = useMutation(
    async (
      lines: { externalRef: string; postedOn: string; merchant: string; amount: string; currency: string }[],
    ) => {
      // The server answers with what it stored and what it recognised as a
      // repeat; counting the parsed rows instead calls a duplicate an import.
      const result = await api.post<{ imported: number; duplicates: number }>('/expenses/cards', { lines })
      refetch()
      return result
    },
  )

  const [matchTo, matching] = useMutation(async (transactionId: string, expenseId: string) => {
    await api.post('/expenses/cards/match', { transactionId, expenseId })
    refetch()
  })

  return useMemo(
    () => ({
      transactions: resource.data?.transactions ?? [],
      total: resource.data?.total ?? 0,
      ...fetching(resource),
      importLines,
      matchTo,
      writing: importing.pending || matching.pending,
      writeError: importing.error ?? matching.error,
    }),
    [resource, importLines, matchTo, importing, matching],
  )
}

/* ------------------------------ reimbursement ----------------------------- */

/** One page of payout runs. `total` counts every run in the range. */
export const RUN_PAGE = 50

export function useReimbursementRuns({ from, to }: { from?: string; to?: string } = {}) {
  const resource = useResource<{ runs: ServerRun[]; total: number }>(
    `reimbursement-runs:${from ?? ''}:${to ?? ''}`,
    useCallback(
      (signal) =>
        api.get<{ runs: ServerRun[]; total: number }>('/expenses/reimbursements', { from, to, limit: RUN_PAGE }, signal),
      [from, to],
    ),
  )
  const { refetch } = resource

  const [payRun, paying] = useMutation(async (currency: string, reportIds: string[]) => {
    const summary = await api.post<{ runId: string; reference: string; paid: number; skipped: number; total: string }>(
      '/expenses/reimbursements',
      { currency, reportIds: reportIds.length ? reportIds : undefined },
    )
    refetch()
    return summary
  })

  return useMemo(
    () => ({
      runs: resource.data?.runs ?? [],
      total: resource.data?.total ?? 0,
      ...fetching(resource),
      payRun,
      writing: paying.pending,
      writeError: paying.error,
    }),
    [resource, payRun, paying],
  )
}

/* ---------------------------------- travel -------------------------------- */

/** A trip that has not yet been called off, completed or refused. */
export const LIVE_TRIP_STATUSES = ['draft', 'submitted', 'approved', 'booked', 'in_progress']
export const CLOSED_TRIP_STATUSES = ['rejected', 'completed', 'cancelled']

/** 'Pending' is the approval queue: trips awaiting somebody's decision. */
export type TripScope = 'Active' | 'Closed' | 'All' | 'Pending'

/**
 * How many trips one request asks for.
 *
 * Stated here rather than left to the server's default, because the screen has
 * no pager: `total` is the count of every matching trip, so a screen showing a
 * silent first page would put a number beside a list that does not contain
 * that many rows. The panes say what they are showing instead.
 */
export const TRIP_PAGE = 50

export function useTravelRequests(scope: TripScope) {
  const statuses =
    scope === 'Active'
      ? LIVE_TRIP_STATUSES.join(',')
      : scope === 'Closed'
        ? CLOSED_TRIP_STATUSES.join(',')
        : scope === 'Pending'
          ? 'submitted'
          : undefined
  const resource = useResource<{ requests: ServerTrip[]; total: number }>(
    `trips:${scope}`,
    useCallback(
      (signal) =>
        api.get<{ requests: ServerTrip[]; total: number }>('/travel/requests', { statuses, limit: TRIP_PAGE }, signal),
      [statuses],
    ),
  )
  const { refetch } = resource

  const [createTrip, creating] = useMutation(
    async (input: {
      employeeId: string
      purpose: string
      destination: string
      departsOn: string
      returnsOn: string
      tripKind: 'domestic' | 'international'
      estimatedCost?: string
      currency?: string
      projectCode?: string
      advanceRequested?: string
    }) => {
      const created = await api.post<{ request: ServerTrip }>('/travel/requests', input)
      refetch()
      return created.request
    },
  )

  const [submitTrip, submitting] = useMutation(async (trip: ServerTrip) => {
    const sent = await api.post<{ request: ServerTrip }>(`/travel/requests/${trip.id}/submit`, { version: trip.version })
    refetch()
    return sent.request
  })

  const [decideTrip, deciding] = useMutation(async (trip: ServerTrip, decision: 'approved' | 'rejected') => {
    const decided = await api.post<{ request: ServerTrip }>(`/travel/requests/${trip.id}/decision`, {
      decision,
      version: trip.version,
    })
    refetch()
    return decided.request
  })

  const [cancelTrip, cancelling] = useMutation(async (trip: ServerTrip) => {
    /*
     * The version goes in a JSON body, because that is where this endpoint
     * reads it. `api.delete` puts its second argument in the query string,
     * which this route never looks at: every Cancel was answered "Send a JSON
     * body with content-type: application/json" and no trip was ever called
     * off. Sending the body makes the button do what it says.
     */
    await apiRequest(`/travel/requests/${trip.id}`, { method: 'DELETE', body: { version: trip.version } })
    refetch()
  })

  return useMemo(
    () => ({
      trips: resource.data?.requests ?? [],
      total: resource.data?.total ?? 0,
      ...fetching(resource),
      createTrip,
      submitTrip,
      decideTrip,
      cancelTrip,
      writing: creating.pending || submitting.pending || deciding.pending || cancelling.pending,
      writeError: creating.error ?? submitting.error ?? deciding.error ?? cancelling.error,
      fieldErrors: creating.fieldErrors,
    }),
    [resource, createTrip, submitTrip, decideTrip, cancelTrip, creating, submitting, deciding, cancelling],
  )
}

/* --------------------------------- people --------------------------------- */

/**
 * Whose claim it is.
 *
 * Every write in this domain names an employee, and the signed-in account may
 * not be one — `{employee: null}` is a real answer, not a failure, and the
 * screen says so rather than filing the claim against somebody arbitrary.
 */
export function useSelfEmployee() {
  const resource = useResource<{ employee: ServerEmployee | null }>(
    'hr-me',
    useCallback((signal) => api.get<{ employee: ServerEmployee | null }>('/hr/me', undefined, signal), []),
  )
  return useMemo(() => ({ employee: resource.data?.employee ?? null, ...fetching(resource) }), [resource])
}

/** The people an administrator may file on behalf of. */
export function useEmployees(enabled: boolean) {
  const resource = useResource<{ employees: ServerEmployee[]; total: number }>(
    'te-employees',
    useCallback(
      (signal) => api.get<{ employees: ServerEmployee[]; total: number }>('/hr/employees', { limit: 200 }, signal),
      [],
    ),
    { enabled },
  )
  return useMemo(
    () => ({
      employees: resource.data?.employees ?? [],
      total: resource.data?.total ?? 0,
      /*
       * Whether this request has answered at all. `loading` is false both
       * before it is enabled and in the frame after it becomes enabled, so a
       * picker keyed on `loading` alone flashes "no employees are visible to
       * you" at somebody before anybody has been asked.
       */
      answered: resource.data !== undefined,
      ...fetching(resource),
    }),
    [resource],
  )
}

/* -------------------------------- settings -------------------------------- */

/**
 * One settings section, with the version its editor read.
 *
 * The version travels with the save, so two administrators in the same pane do
 * not silently overwrite each other: the second is told, and the pane re-reads
 * what the first left behind instead of pretending the save landed.
 */
export function useTeSettings(section: string) {
  const resource = useResource<{ settings: SettingsDoc }>(
    `te-settings:${section}`,
    useCallback(
      (signal) => api.get<{ settings: SettingsDoc }>('/settings/TE', { section }, signal),
      [section],
    ),
  )
  const { refetch } = resource
  const [conflict, setConflict] = useState(false)

  const [save, saving] = useMutation(async (value: Record<string, unknown>, summary: string) => {
    setConflict(false)
    try {
      const saved = await api.put<{ settings: SettingsDoc }>('/settings/TE', {
        section,
        value,
        version: resource.data?.settings.version ?? 0,
        summary,
      })
      refetch()
      return saved.settings
    } catch (error) {
      if (error instanceof ApiClientError && error.isConflict) {
        setConflict(true)
        refetch()
      }
      throw error
    }
  })

  return useMemo(
    () => ({
      value: resource.data?.settings.value ?? {},
      version: resource.data?.settings.version ?? 0,
      updatedAt: resource.data?.settings.updatedAt ?? null,
      ...fetching(resource),
      save,
      saving: saving.pending,
      saveError: saving.error,
      /** True after a 409: the pane has been re-read and the edit must be redone. */
      staleEdit: conflict,
    }),
    [resource, save, saving, conflict],
  )
}

export function useSettingsChanges() {
  const resource = useResource<{ changes: SettingsChange[] }>(
    'te-settings-changes',
    useCallback((signal) => api.get<{ changes: SettingsChange[] }>('/settings/TE/changes', { limit: 50 }, signal), []),
  )
  const { refetch } = resource

  const [revert, reverting] = useMutation(async (changeId: string) => {
    await api.post(`/settings/changes/${changeId}/revert`)
    refetch()
  })

  return useMemo(
    () => ({
      changes: resource.data?.changes ?? [],
      ...fetching(resource),
      revert,
      writing: reverting.pending,
      writeError: reverting.error,
    }),
    [resource, revert, reverting],
  )
}

/* ------------------------------- categories ------------------------------- */

export function useExpenseCategories() {
  const resource = useResource<{ categories: ServerCategory[] }>(
    'te-categories',
    useCallback((signal) => api.get<{ categories: ServerCategory[] }>('/expenses/categories', undefined, signal), []),
  )
  const { refetch } = resource

  const [addCategory, adding] = useMutation(async (input: { name: string; code: string }) => {
    const created = await api.post<{ category: ServerCategory }>('/expenses/categories', input)
    refetch()
    return created.category
  })

  const [saveCategory, savingCategory] = useMutation(
    async (
      id: string,
      patch: {
        glAccount?: string | null
        limitAmount?: string | null
        limitCurrency?: string | null
        receiptRequiredAbove?: string | null
      },
    ) => {
      const saved = await api.patch<{ category: ServerCategory }>(`/expenses/categories/${id}`, patch)
      refetch()
      return saved.category
    },
  )

  return useMemo(
    () => ({
      categories: resource.data?.categories ?? [],
      ...fetching(resource),
      addCategory,
      saveCategory,
      writing: adding.pending || savingCategory.pending,
      writeError: adding.error ?? savingCategory.error,
    }),
    [resource, addCategory, saveCategory, adding, savingCategory],
  )
}

/* ---------------------------- approval levels ----------------------------- */

export function useApprovalLevels(scope: 'expense' | 'travel') {
  const resource = useResource<{ levels: ServerApprovalLevel[] }>(
    `approval-levels:${scope}`,
    useCallback(
      (signal) => api.get<{ levels: ServerApprovalLevel[] }>('/expenses/approval-levels', { scope }, signal),
      [scope],
    ),
  )
  const { refetch } = resource

  const [saveLevels, saving] = useMutation(async (levels: { label: string; threshold?: string }[]) => {
    const saved = await api.put<{ levels: ServerApprovalLevel[] }>('/expenses/approval-levels', { scope, levels })
    refetch()
    return saved.levels
  })

  return useMemo(
    () => ({
      levels: resource.data?.levels ?? [],
      ...fetching(resource),
      saveLevels,
      writing: saving.pending,
      writeError: saving.error,
    }),
    [resource, saveLevels, saving],
  )
}

/* -------------------------------- formatting ------------------------------ */

/**
 * A decimal-string amount, grouped for reading, with its currency beside it.
 *
 * Never parsed into a number on the way through: the string the server sent is
 * the amount, and a float round-trip is how a figure stops matching the lines
 * under it. The currency is not optional — two amounts in different currencies
 * that print the same are the bug this replaces.
 */
export function amount(value: string | null, currency: string | null): string {
  if (value === null) return '—'
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = value.replace('-', '').split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const decimals = fraction.slice(0, 2).padEnd(2, '0')
  return `${negative ? '-' : ''}${currency ? `${currency} ` : ''}${grouped}.${decimals}`
}

/** Adds decimal strings in one currency, in integer units, never as floats. */
export function addAmounts(values: string[]): string {
  const units = values.reduce((total, value) => {
    const negative = value.startsWith('-')
    const [whole, fraction = ''] = value.replace('-', '').split('.')
    const scaled = BigInt(whole + fraction.slice(0, 4).padEnd(4, '0'))
    return total + (negative ? -scaled : scaled)
  }, 0n)
  const negative = units < 0n
  const abs = negative ? -units : units
  return `${negative ? '-' : ''}${abs / 10_000n}.${(abs % 10_000n).toString().padStart(4, '0')}`
}
