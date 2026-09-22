'use client'

import { useCallback, useMemo } from 'react'
import { api } from '../../../lib/api.ts'
import { useResource, useMutation } from '../../../lib/useResource.ts'

/**
 * HR, from the server.
 *
 * Every screen in this app used to read one untyped bag of browser records, so
 * a filter dropdown filtered nothing, a count counted whatever had been loaded,
 * and a failed request was indistinguishable from an empty workspace. These
 * hooks follow `useServerLeads`: the request itself is the resource key, the
 * total is the server's count for the filter, and each caller gets every fetch
 * state rather than an array that stands in for all of them.
 *
 * Only what the backend actually serves appears here. A screen with nothing
 * behind it says so on the screen; it does not get a hook that pretends.
 */

type Query = Record<string, string | number | boolean | undefined>

/**
 * One request, keyed by itself.
 *
 * The query is serialised once and both the cache key and the fetcher read that
 * same string, so the rows on screen and the filter that asked for them cannot
 * drift apart.
 */
function useServerData<T>(path: string, query: Query = {}, enabled = true) {
  const serialised = JSON.stringify(query)
  const fetcher = useCallback(
    (signal: AbortSignal) => api.get<T>(path, JSON.parse(serialised) as Query, signal),
    [path, serialised],
  )
  return useResource<T>(`${path}|${serialised}`, fetcher, { enabled })
}

/* -------------------------------- vocabulary ------------------------------- */

export type VocabularyKind = 'department' | 'designation' | 'location'
export type VocabularyEntry = { id: string; name: string }

export function useVocabulary(kind: VocabularyKind) {
  const resource = useServerData<{ entries: VocabularyEntry[] }>('/hr/vocabulary', { kind })
  const { refetch } = resource

  /*
   * The whole paste, not the first line of it.
   *
   * `useMutation` holds an in-flight guard that is set synchronously, so a
   * caller looping `for (const name of names) add(name)` fired one request and
   * had the rest silently dropped — a bulk paste of twelve departments added
   * one and reported success. The loop lives inside the mutation instead, and
   * the first refusal stops it and is shown, rather than being swallowed with
   * some of the list already written.
   */
  const [add, adding] = useMutation(async (names: string[]) => {
    // The refetch runs even when one of them is refused, so the list shows
    // exactly what was written rather than what was typed.
    try {
      for (const name of names) await api.post('/hr/vocabulary', { kind, name })
    } finally {
      refetch()
    }
  })
  const [remove, removing] = useMutation(async (id: string) => {
    try {
      await api.delete(`/hr/vocabulary/${id}`, { kind })
    } finally {
      refetch()
    }
  })

  return useMemo(
    () => ({
      entries: resource.data?.entries ?? [],
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      add,
      remove,
      writing: adding.pending || removing.pending,
      writeError: adding.error ?? removing.error,
    }),
    [resource, refetch, add, remove, adding, removing],
  )
}

/* --------------------------------- people ---------------------------------- */

export type ServerEmployee = {
  id: string
  employeeNo: string
  userId: string | null
  fullName: string
  workEmail: string | null
  phone: string | null
  status: string
  employmentType: string | null
  joinedOn: string | null
  departmentName: string | null
  designationName: string | null
  locationName: string | null
  managerName: string | null
  version: number
}

export type EmployeeFilters = {
  q?: string
  status?: string
  departmentId?: string
  designationId?: string
  employmentType?: string
  joinedFrom?: string
  joinedTo?: string
  managerId?: string
  limit?: number
  offset?: number
}

export function useEmployees(filters: EmployeeFilters = {}, enabled = true) {
  const resource = useServerData<{ employees: ServerEmployee[]; total: number }>('/hr/employees', filters, enabled)

  return useMemo(
    () => ({
      employees: resource.data?.employees ?? [],
      /** Matching rows on the server, not the length of the loaded page. */
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
    }),
    [resource],
  )
}

/* --------------------------------- overview -------------------------------- */

export type HrOverview = {
  headcount: number
  onProbation: number
  joinersThisMonth: number
  leaversThisMonth: number
  onLeaveToday: number
  byDepartment: { departmentId: string | null; name: string | null; headcount: number }[]
  pendingApprovals: { leave: number; timesheets: number; overtime: number }
  unavailable: { metric: string; reason: string }[]
}

export function useHrOverview() {
  return useServerData<{ overview: HrOverview }>('/hr/overview')
}

/* ------------------------------ self-service ------------------------------- */

export type LeaveBalance = {
  leaveTypeId: string
  code: string
  name: string
  year: number
  accrued: string
  taken: string
  available: string
  pending: string
}

export type SelfService = {
  employee: ServerEmployee | null
  balances: LeaveBalance[]
  openPunch: { id: string; punchedInAt: string } | null
}

/** The signed-in account's employee record, or a truthful null. */
export function useSelfService() {
  return useServerData<SelfService>('/hr/me')
}

/* ----------------------------------- leave --------------------------------- */

export type LeaveType = {
  id: string
  name: string
  code: string
  accrualDays: string
  accrualPeriod: string
  allowNegative: boolean
  requiresApproval: boolean
  countsWeekends: boolean
  countsHolidays: boolean
}

export function useLeaveTypes() {
  const resource = useServerData<{ leaveTypes: LeaveType[]; departments: VocabularyEntry[] }>('/hr/leave/types')
  const { refetch } = resource

  // One mutation for the whole paste — see `useVocabulary.add` for why a loop
  // of separate calls loses everything after the first.
  const [add, adding] = useMutation(async (inputs: { name: string; code: string }[]) => {
    try {
      for (const input of inputs) await api.post('/hr/leave/types', input)
    } finally {
      refetch()
    }
  })
  const [archive, archiving] = useMutation(async (id: string) => {
    try {
      await api.delete(`/hr/leave/types/${id}`)
    } finally {
      refetch()
    }
  })

  return useMemo(
    () => ({
      leaveTypes: resource.data?.leaveTypes ?? [],
      departments: resource.data?.departments ?? [],
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      add,
      archive,
      writing: adding.pending || archiving.pending,
      writeError: adding.error ?? archiving.error,
    }),
    [resource, refetch, add, archive, adding, archiving],
  )
}

export type LeaveRequest = {
  id: string
  employeeId: string
  employeeName: string
  leaveTypeId: string
  leaveTypeName: string
  startsOn: string
  endsOn: string
  dayCount: string
  status: string
  reason: string | null
  version: number
}

export type LeaveRequestFilters = {
  employeeId?: string
  managerId?: string
  status?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export function useLeaveRequests(filters: LeaveRequestFilters = {}, enabled = true) {
  const resource = useServerData<{ requests: LeaveRequest[]; total: number }>('/hr/leave/requests', filters, enabled)
  const { refetch } = resource

  /*
  * The list is refetched whether the decision landed or not.
  *
  * A 409 means the row on screen is out of date, and the version this button
  * sends comes from that row — so refetching only on success left the stale
  * version in place and every further click failed the same way, for ever.
  * Reloading brings back the version that would actually be accepted, and
  * `writeError` still says what happened.
  */
  const [decide, deciding] = useMutation(async (id: string, decision: 'approved' | 'rejected', version: number) => {
    try {
      await api.post(`/hr/leave/requests/${id}/decision`, { decision, version })
    } finally {
      refetch()
    }
  })
  const [cancel, cancelling] = useMutation(async (id: string, version: number) => {
    try {
      await api.post(`/hr/leave/requests/${id}/cancel`, { version })
    } finally {
      refetch()
    }
  })

  return useMemo(
    () => ({
      requests: resource.data?.requests ?? [],
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      decide,
      cancel,
      writing: deciding.pending || cancelling.pending,
      writeError: deciding.error ?? cancelling.error,
    }),
    [resource, refetch, decide, cancel, deciding, cancelling],
  )
}

export type LeaveEntry = {
  id: string
  employeeId: string
  employeeName: string
  leaveTypeId: string
  leaveTypeName: string
  year: number
  kind: string
  days: string
  note: string | null
  createdAt: string
}

export function useLeaveEntries(
  filters: { kind?: string; employeeId?: string; year?: number; limit?: number; offset?: number } = {},
) {
  const resource = useServerData<{ entries: LeaveEntry[]; total: number }>('/hr/leave/allocations', filters)
  return useMemo(
    () => ({
      entries: resource.data?.entries ?? [],
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
    }),
    [resource],
  )
}

/* -------------------------------- timesheets ------------------------------- */

export type Timesheet = {
  id: string
  employeeId: string
  employeeName: string
  periodStart: string
  periodEnd: string
  status: string
  totalMinutes: number
  version: number
}

export function useTimesheets(
  filters: { employeeId?: string; managerId?: string; status?: string; limit?: number; offset?: number } = {},
  enabled = true,
) {
  const resource = useServerData<{ timesheets: Timesheet[]; total: number }>('/hr/timesheets', filters, enabled)
  const { refetch } = resource

  // Refetched either way, so a conflict does not strand the row on the version
  // that caused it. See `useLeaveRequests`.
  const [submit, submitting] = useMutation(async (id: string, version: number) => {
    try {
      await api.post(`/hr/timesheets/${id}/submit`, { version })
    } finally {
      refetch()
    }
  })
  const [decide, deciding] = useMutation(async (id: string, decision: 'approved' | 'rejected', version: number) => {
    try {
      await api.post(`/hr/timesheets/${id}/decision`, { decision, version })
    } finally {
      refetch()
    }
  })

  return useMemo(
    () => ({
      timesheets: resource.data?.timesheets ?? [],
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      submit,
      decide,
      writing: submitting.pending || deciding.pending,
      writeError: submitting.error ?? deciding.error,
    }),
    [resource, refetch, submit, decide, submitting, deciding],
  )
}

/* --------------------------------- overtime -------------------------------- */

export type OvertimeClaim = {
  id: string
  employeeId: string
  employeeName: string
  workedOn: string
  minutes: number
  status: string
  reason: string | null
  version: number
}

export function useOvertime(
  filters: {
    employeeId?: string
    managerId?: string
    status?: string
    from?: string
    to?: string
    limit?: number
    offset?: number
  } = {},
  enabled = true,
) {
  const resource = useServerData<{ overtime: OvertimeClaim[]; total: number }>('/hr/overtime', filters, enabled)
  const { refetch } = resource

  // Refetched either way, so a conflict does not strand the row on the version
  // that caused it. See `useLeaveRequests`.
  const [decide, deciding] = useMutation(async (id: string, decision: 'approved' | 'rejected', version: number) => {
    try {
      await api.post(`/hr/overtime/${id}/decision`, { decision, version })
    } finally {
      refetch()
    }
  })

  return useMemo(
    () => ({
      claims: resource.data?.overtime ?? [],
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      decide,
      writing: deciding.pending,
      writeError: deciding.error,
    }),
    [resource, refetch, decide, deciding],
  )
}

/* -------------------------------- attendance ------------------------------- */

export type AttendanceDay = {
  employeeId: string
  employeeName: string
  departmentName: string | null
  attendanceOn: string
  status: string
  workedMinutes: number
  overtimeMinutes: number
  lateMinutes: number
}

export type AttendanceFilters = {
  from: string
  to: string
  employeeId?: string
  departmentId?: string
  status?: string
  minOvertimeMinutes?: number
  limit?: number
  offset?: number
}

/**
 * Settled days.
 *
 * `totals` covers the whole filter, so the figures beside a paged list are the
 * figures for the range the user chose rather than for the rows on screen.
 */
export function useAttendance(filters: AttendanceFilters, enabled = true) {
  const resource = useServerData<{
    days: AttendanceDay[]
    total: number
    totals: { days: number; workedMinutes: number; overtimeMinutes: number }
  }>('/hr/attendance', filters, enabled)

  return useMemo(
    () => ({
      days: resource.data?.days ?? [],
      total: resource.data?.total ?? 0,
      totals: resource.data?.totals,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
    }),
    [resource],
  )
}

/* ---------------------------------- shifts --------------------------------- */

export type Shift = {
  id: string
  name: string
  startsMinute: number
  endsMinute: number
  breakMinutes: number
  graceMinutes: number
  weekdays: number[]
}

export function useShifts() {
  const resource = useServerData<{ shifts: Shift[] }>('/hr/shifts')
  return useMemo(
    () => ({
      shifts: resource.data?.shifts ?? [],
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
    }),
    [resource],
  )
}

export type ShiftAssignment = {
  id: string
  employeeId: string
  employeeName: string
  shiftId: string
  shiftName: string
  effectiveFrom: string
  effectiveTo: string | null
}

export function useShiftAssignments(enabled = true) {
  const resource = useServerData<{ assignments: ShiftAssignment[]; total: number }>('/hr/shifts/assignments', {}, enabled)
  return useMemo(
    () => ({
      assignments: resource.data?.assignments ?? [],
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
    }),
    [resource],
  )
}

/* ---------------------------- lifecycle changes ---------------------------- */

export type LifecycleChange = {
  id: string
  employeeId: string
  employeeName: string
  effectiveFrom: string
  reason: string | null
  departmentFrom: string | null
  departmentTo: string | null
  designationFrom: string | null
  designationTo: string | null
  locationFrom: string | null
  locationTo: string | null
  managerFrom: string | null
  managerTo: string | null
}

export function useLifecycleChanges(
  filters: { kind?: 'promotion' | 'transfer'; employeeId?: string; limit?: number; offset?: number } = {},
) {
  const resource = useServerData<{ changes: LifecycleChange[]; total: number }>('/hr/lifecycle-changes', filters)
  return useMemo(
    () => ({
      changes: resource.data?.changes ?? [],
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
    }),
    [resource],
  )
}

/* -------------------------------- documents -------------------------------- */

export type EmployeeDocument = {
  id: string
  employeeId: string
  employeeName: string
  fileId: string
  filename: string
  byteSize: number
  kind: string
  visibility: string
  validUntil: string | null
  uploadedAt: string
}

export function useDocuments(filters: { employeeId?: string; limit?: number; offset?: number } = {}) {
  const resource = useServerData<{ documents: EmployeeDocument[]; total: number }>('/hr/documents', filters)
  return useMemo(
    () => ({
      documents: resource.data?.documents ?? [],
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
    }),
    [resource],
  )
}

/**
 * Swaps a file id for a single-use download link.
 *
 * The bytes are never addressed by a guessable id, so the link cannot be
 * forwarded and replayed; this asks for a fresh grant each time somebody clicks.
 */
export async function downloadFile(fileId: string): Promise<void> {
  const { url } = await api.post<{ url: string }>(`/files/${fileId}/grant`)
  window.location.assign(url)
}

/* --------------------------------- calendar -------------------------------- */

export type BusinessCalendar = {
  id: string
  name: string
  timezone: string
  isDefault: boolean
  hours: { weekday: number; opensMinute: number; closesMinute: number }[]
  holidays: { observedOn: string; name: string }[]
}

/**
 * The tenant's working calendars.
 *
 * A workspace with none configured has no working week, and the screens say so
 * rather than shading Saturday and Sunday on the assumption that everybody
 * works Monday to Friday.
 */
export function useCalendars() {
  const resource = useServerData<{ calendars: BusinessCalendar[] }>('/support/calendars')
  return useMemo(
    () => ({
      calendars: resource.data?.calendars ?? [],
      defaultCalendar: resource.data?.calendars.find((calendar) => calendar.isDefault) ?? null,
      loaded: resource.data !== undefined,
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
    }),
    [resource],
  )
}

/* --------------------------------- settings -------------------------------- */

export type SettingsDocument = {
  appCode: string
  section: string
  value: Record<string, unknown>
  version: number
  updatedAt: string | null
}

export type SettingsChange = {
  id: string
  version: number
  summary: string
  changedByName: string | null
  changedAt: string
  reverted: boolean
}

/**
 * One HR settings section, version-checked.
 *
 * `writeSettings` refuses a stale write with a 409 carrying the current
 * version. That is surfaced rather than retried silently: the second
 * administrator has to see that somebody else changed the list, or one of the
 * two edits disappears with nobody told.
 */
export function useHrSettings(section: string) {
  const resource = useServerData<{ settings: SettingsDocument }>('/settings/hr', { section })
  const { refetch } = resource

  const [save, saving] = useMutation(async (value: Record<string, unknown>, version: number, summary: string) => {
    /*
     * Refetched on refusal too. The version this sends is the one the pane
     * read; leaving it in place after a 409 meant the administrator could
     * never save again, however many times they tried. Reloading also puts the
     * other administrator's list on screen, which is the thing the conflict is
     * telling them about.
     */
    try {
      await api.put('/settings/hr', { section, value, version, summary })
    } finally {
      refetch()
    }
  })

  return useMemo(
    () => ({
      settings: resource.data?.settings,
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      save,
      writing: saving.pending,
      writeError: saving.error,
    }),
    [resource, refetch, save, saving],
  )
}

export function useHrSettingsChanges() {
  const resource = useServerData<{ changes: SettingsChange[] }>('/settings/hr/changes', { limit: 50 })
  return useMemo(
    () => ({
      changes: resource.data?.changes ?? [],
      loading: resource.loading,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch: resource.refetch,
    }),
    [resource],
  )
}

/* --------------------------------- display --------------------------------- */

/** Minutes as hours and minutes. Never a rounded decimal of hours. */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}m`
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

/** A minute-of-day as a 24-hour clock time, which is how shifts are stored. */
export function formatMinuteOfDay(minute: number): string {
  const normalised = minute % 1440
  return `${String(Math.floor(normalised / 60)).padStart(2, '0')}:${String(normalised % 60).padStart(2, '0')}`
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatWeekdays(weekdays: number[]): string {
  return weekdays.length ? weekdays.map((day) => WEEKDAY_NAMES[day]).join(', ') : 'Every day'
}
