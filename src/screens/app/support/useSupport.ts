'use client'

import { useCallback, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import { useAuth } from '../../../lib/auth'
import { useResource, useMutation } from '../../../lib/useResource'

/**
 * Support, from the server.
 *
 * Modelled on `useServerLeads`: filtering and counting happen in SQL, every
 * state a real fetch has is represented, and every write carries the version
 * it read. The support screens previously read one browser object, so a failed
 * request and an empty helpdesk looked identical — and several panes said
 * reassuring things ("Nothing needs review", "Inbound mail is landing
 * cleanly") on the strength of that emptiness.
 *
 * Two translations run through the whole file, because the prototype and the
 * server disagree about what a ticket is made of:
 *
 *  * statuses, priorities, categories and channels are SLUGS on the server and
 *    were display LABELS in the browser. Every filter, chip and comparison uses
 *    the slug; the label is looked up from the tenant's own vocabulary.
 *  * the assignee is a user id, not a name. "My tickets" is a server filter on
 *    that id, and the name beside "Unassign" comes from the member list.
 */

export const SUPPORT_APP = 'SUP'

/* ------------------------------ vocabularies ------------------------------ */

export type FieldName = 'status' | 'priority' | 'category' | 'type' | 'channel'

export type FieldOption = {
  id: string
  field: FieldName
  slug: string
  label: string
  colour: string | null
  position: number
  behaviour: string | null
  firstResponseMinutes: number | null
  resolutionMinutes: number | null
  isDefault: boolean
}

/**
 * What each status behaviour does, in the words of the engine that reads it.
 *
 * All four the server accepts are here. The prototype's map omitted
 * `resolved`, so a status saved with it came back showing the wrong thing.
 */
export const behaviourLabels: Record<string, string> = {
  active: 'Active',
  waiting: 'Waiting — SLA paused',
  resolved: 'Resolved — end state',
  closed: 'Closed state',
}

/** Vocabulary colours are free text; these are the ones the palette has. */
export const toneForColour: Record<string, string> = {
  rose: 'tone-rose',
  orange: 'tone-amber',
  amber: 'tone-amber',
  sky: 'tone-sky',
  violet: 'tone-violet',
  emerald: 'tone-emerald',
  teal: 'tone-teal',
  slate: 'tone-slate',
}

export function useSupportVocabulary() {
  const resource = useResource<{ options: FieldOption[] }>(
    'support:field-options',
    useCallback((signal) => api.get<{ options: FieldOption[] }>('/support/field-options', undefined, signal), []),
  )
  const { refetch } = resource

  const [createOption, createState] = useMutation(async (input: Partial<FieldOption> & { field: FieldName; slug: string; label: string }) => {
    const created = await api.post<{ option: FieldOption }>('/support/field-options', {
      field: input.field,
      slug: input.slug,
      label: input.label,
      colour: input.colour || undefined,
      behaviour: input.behaviour || undefined,
      firstResponseMinutes: input.firstResponseMinutes ?? undefined,
      resolutionMinutes: input.resolutionMinutes ?? undefined,
    })
    refetch()
    return created.option
  })

  const [updateOption, updateState] = useMutation(async (id: string, patch: Partial<FieldOption>) => {
    const updated = await api.patch<{ option: FieldOption }>(`/support/field-options/${id}`, {
      label: patch.label ?? undefined,
      colour: patch.colour || undefined,
      behaviour: patch.behaviour || undefined,
      firstResponseMinutes: patch.firstResponseMinutes ?? undefined,
      resolutionMinutes: patch.resolutionMinutes ?? undefined,
    })
    refetch()
    return updated.option
  })

  const [archiveOption, archiveState] = useMutation(async (id: string) => {
    await api.delete(`/support/field-options/${id}`)
    refetch()
  })

  return useMemo(() => {
    const options = resource.data?.options ?? []
    const of = (field: FieldName) => options.filter((option) => option.field === field)
    const labelOf = (field: FieldName, slug: string | null) =>
      slug ? (options.find((option) => option.field === field && option.slug === slug)?.label ?? slug) : ''
    return {
      options,
      statuses: of('status'),
      priorities: of('priority'),
      categories: of('category'),
      types: of('type'),
      channels: of('channel'),
      of,
      labelOf,
      colourOf: (field: FieldName, slug: string | null) =>
        options.find((option) => option.field === field && option.slug === slug)?.colour ?? null,
      /** Statuses that end a ticket, as the engine decides it. */
      closedSlugs: of('status')
        .filter((option) => option.behaviour === 'resolved' || option.behaviour === 'closed')
        .map((option) => option.slug),
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      createOption,
      updateOption,
      archiveOption,
      writing: createState.pending || updateState.pending || archiveState.pending,
      writeError: createState.error ?? updateState.error ?? archiveState.error,
      fieldErrors: createState.fieldErrors,
      resetWriteError: () => {
        createState.reset()
        updateState.reset()
        archiveState.reset()
      },
    }
  }, [resource, refetch, createOption, updateOption, archiveOption, createState, updateState, archiveState])
}

/* --------------------------------- tickets -------------------------------- */

export type ServerTicket = {
  id: string
  reference: string
  subject: string
  status: string
  priority: string
  category: string | null
  channel: string
  assigneeUserId: string | null
  requesterEmail: string | null
  requesterName: string | null
  tags: string[]
  lastActivityAt: string
  firstResponseAt: string | null
  resolvedAt: string | null
  version: number
  createdAt: string
}

export type SlaClock = {
  target: string
  dueAt: string
  breached: boolean
  satisfied: boolean
  remainingMinutes: number | null
}

export type TicketQueue = 'all' | 'mine' | 'unassigned'

export type TicketFilters = {
  query: string
  status: string
  channel: string
  tags: string
  queue: TicketQueue
  limit: number
  offset: number
}

export type NewTicket = {
  subject: string
  body: string
  requesterEmail?: string
  priority?: string
  category?: string
  channel?: string
  tags?: string[]
}

export function useServerTickets(filters: TicketFilters) {
  const { ready, session } = useAuth()
  const me = session?.user.id ?? null
  // "My tickets" is meaningless until we know who that is; asking without the
  // id would quietly list everybody's tickets under a personal heading.
  const enabled = ready && (filters.queue !== 'mine' || Boolean(me))
  const key = JSON.stringify({ ...filters, me })

  const resource = useResource<{ tickets: ServerTicket[]; total: number }>(
    key,
    useCallback(
      (signal) =>
        api.get<{ tickets: ServerTicket[]; total: number }>(
          '/support/tickets',
          {
            q: filters.query || undefined,
            status: filters.status || undefined,
            channel: filters.channel || undefined,
            tags: filters.tags || undefined,
            assigneeUserId: filters.queue === 'mine' ? (me ?? undefined) : undefined,
            unassigned: filters.queue === 'unassigned' ? 'true' : undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
          signal,
        ),
      [filters.query, filters.status, filters.channel, filters.tags, filters.queue, filters.limit, filters.offset, me],
    ),
    { enabled },
  )
  const { refetch } = resource

  const [createTicket, createState] = useMutation(async (input: NewTicket) => {
    const created = await api.post<{ ticket: ServerTicket }>('/support/tickets', {
      subject: input.subject,
      body: input.body,
      requesterEmail: input.requesterEmail || undefined,
      priority: input.priority || undefined,
      category: input.category || undefined,
      channel: input.channel || undefined,
      tags: input.tags?.length ? input.tags : undefined,
    })
    refetch()
    return created.ticket
  })

  const [transitionTicket, transitionState] = useMutation(async (id: string, version: number, status: string) => {
    const updated = await api.patch<{ ticket: ServerTicket }>(`/support/tickets/${id}`, { status, version })
    refetch()
    return updated.ticket
  })

  const [assignTicket, assignState] = useMutation(async (id: string, version: number, userId: string | null) => {
    await api.post(`/support/tickets/${id}/assign`, { userId, version })
    refetch()
  })

  return useMemo(
    () => ({
      tickets: resource.data?.tickets ?? [],
      /** Rows matching the filter on the server, not the length of this page. */
      total: resource.data?.total ?? 0,
      me,
      loading: resource.loading || !ready,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      createTicket,
      transitionTicket,
      assignTicket,
      writing: createState.pending || transitionState.pending || assignState.pending,
      writeError: createState.error ?? transitionState.error ?? assignState.error,
      fieldErrors: createState.fieldErrors,
    }),
    [resource, ready, me, refetch, createTicket, transitionTicket, assignTicket, createState, transitionState, assignState],
  )
}

/**
 * Shared filter state for the ticket list, so the toolbar and the list cannot
 * disagree about what is being shown.
 */
export function useServerTicketsFilters(pageSize = 25) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [tags, setTags] = useState('')
  const [queue, setQueue] = useState<TicketQueue>('all')
  const [page, setPage] = useState(0)

  const filters: TicketFilters = { query, status, channel, tags, queue, limit: pageSize, offset: page * pageSize }

  // Every change narrows the result, so staying on page four would show an
  // empty list that reads like "there are none".
  const reset = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(0)
  }

  return {
    filters,
    query,
    status,
    channel,
    tags,
    queue,
    page,
    /** Whether anything is narrowing the list, which changes what empty means. */
    filtered: Boolean(query || status || channel || tags || queue !== 'all'),
    setQuery: reset(setQuery),
    setStatus: reset(setStatus),
    setChannel: reset(setChannel),
    setTags: reset(setTags),
    setQueue: reset(setQueue),
    setPage,
  }
}

/** One ticket's live SLA clocks, fetched only while its row is expanded. */
export function useTicketSla(ticketId: string | null) {
  const resource = useResource<{ ticket: ServerTicket; sla: SlaClock[] }>(
    `support:ticket:${ticketId ?? 'none'}`,
    useCallback(
      (signal) => api.get<{ ticket: ServerTicket; sla: SlaClock[] }>(`/support/tickets/${ticketId}`, undefined, signal),
      [ticketId],
    ),
    { enabled: Boolean(ticketId) },
  )
  return resource
}

/* ------------------------------- my requests ------------------------------ */

export function useMyRequests() {
  const { ready, session } = useAuth()
  const email = session?.user.email ?? null

  const resource = useResource<{ tickets: ServerTicket[]; total: number }>(
    `support:my-requests:${email ?? 'none'}`,
    useCallback(
      (signal) =>
        api.get<{ tickets: ServerTicket[]; total: number }>(
          '/support/tickets',
          // Exact address, never a search: `q` also matches the subject, so
          // anyone whose address appeared in somebody else's subject line
          // would find that ticket listed among their own.
          { requesterEmail: email ?? undefined, limit: 50 },
          signal,
        ),
      [email],
    ),
    { enabled: ready && Boolean(email) },
  )
  const { refetch } = resource

  const [raiseRequest, raiseState] = useMutation(async (input: { subject: string; body: string; priority?: string }) => {
    const created = await api.post<{ ticket: ServerTicket }>('/support/tickets', {
      subject: input.subject,
      body: input.body,
      requesterEmail: email ?? undefined,
      priority: input.priority || undefined,
      channel: 'web',
    })
    refetch()
    return created.ticket
  })

  return useMemo(
    () => ({
      email,
      tickets: resource.data?.tickets ?? [],
      total: resource.data?.total ?? 0,
      loading: resource.loading || !ready,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      raiseRequest,
      raising: raiseState.pending,
      raiseError: raiseState.error,
      fieldErrors: raiseState.fieldErrors,
    }),
    [resource, ready, email, refetch, raiseRequest, raiseState],
  )
}

/* ---------------------------------- stats --------------------------------- */

export type Breakdown = { slug: string; label: string; count: number }

export type SupportStats = {
  total: number
  open: number
  closed: number
  slaBreached: number
  /** Null when nobody has rated anything — which is not an average of zero. */
  csatAverage: string | null
  csatResponses: number
  byStatus: Breakdown[]
  byPriority: Breakdown[]
  byCategory: Breakdown[]
}

export function useSupportStats() {
  return useResource<{ stats: SupportStats }>(
    'support:stats',
    useCallback((signal) => api.get<{ stats: SupportStats }>('/support/stats', undefined, signal), []),
  )
}

/* -------------------------------- SLA report ------------------------------ */

export type SlaComplianceRow = {
  priority: string
  label: string
  tickets: number
  firstResponseMet: number
  firstResponseBreached: number
  resolutionMet: number
  resolutionBreached: number
}

export function useSlaReport(from: string) {
  return useResource<{ rows: SlaComplianceRow[] }>(
    `support:sla-report:${from}`,
    useCallback((signal) => api.get<{ rows: SlaComplianceRow[] }>('/support/reports/sla', { from }, signal), [from]),
  )
}

/* ----------------------------------- CSAT --------------------------------- */

export type CsatResponse = {
  id: string
  ticketId: string
  reference: string
  subject: string
  score: number | null
  comment: string | null
  sentAt: string
  respondedAt: string | null
  reviewedAt: string | null
  reviewNote: string | null
}

export type CsatList = {
  rows: CsatResponse[]
  total: number
  /** The mean over the whole filter, or null when nobody has answered. */
  average: string | null
  distribution: { score: number; count: number }[]
  pending: number
}

export function useCsat(
  options: {
    maxScore?: number
    reviewed?: boolean
    answeredOnly?: boolean
    /**
     * False while the caller is still waiting for something the filter depends
     * on — the review queue's threshold lives in settings, and asking before it
     * arrives would answer a question nobody asked.
     */
    enabled?: boolean
  } = {},
) {
  const { maxScore, reviewed, answeredOnly, enabled = true } = options
  const key = `support:csat:${maxScore ?? ''}:${reviewed ?? ''}:${answeredOnly ?? ''}`

  const resource = useResource<CsatList>(
    key,
    useCallback(
      (signal) =>
        api.get<CsatList>(
          '/support/csat',
          {
            maxScore,
            // Spelt out rather than left to coercion: "false" has to reach the
            // server as false, or the review queue inverts.
            reviewed: reviewed === undefined ? undefined : String(reviewed),
            answeredOnly: answeredOnly === undefined ? undefined : String(answeredOnly),
            limit: 100,
          },
          signal,
        ),
      [maxScore, reviewed, answeredOnly],
    ),
    { enabled },
  )
  const { refetch } = resource

  const [review, reviewState] = useMutation(async (id: string, note: string) => {
    await api.post(`/support/csat/${id}/review`, { note: note.trim() || undefined })
    refetch()
  })

  const [sendPending, sendState] = useMutation(async () => {
    const result = await api.post<{ eligible: number; queued: number }>('/support/csat/send-pending')
    refetch()
    return result
  })

  return useMemo(
    () => ({
      rows: resource.data?.rows ?? [],
      /** The server's count for this filter, not the length of the page above. */
      total: resource.data?.total ?? 0,
      /** Null until the server has answered, and null when nobody has rated. */
      average: resource.data?.average ?? null,
      distribution: resource.data?.distribution ?? [],
      pending: resource.data?.pending ?? 0,
      hasCounts: resource.data !== undefined,
      // Not asked yet is not "the answer is nothing": while the filter is
      // still being waited on, this has to read as unloaded rather than as an
      // empty queue somebody could take for good news.
      loading: resource.loading || !enabled,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      review,
      sendPending,
      writing: reviewState.pending || sendState.pending,
      writeError: reviewState.error ?? sendState.error,
    }),
    [resource, enabled, refetch, review, sendPending, reviewState, sendState],
  )
}

/* ------------------------------ knowledge base ---------------------------- */

export type KbCategory = { id: string; name: string; slug: string }

export type KbArticle = {
  id: string
  slug: string
  title: string
  body: string
  categoryId: string | null
  categoryName: string | null
  status: string
  visibility: string
  version: number
  publishedVersion: number | null
  publishedAt: string | null
  viewCount: number
}

export function useKbCategories() {
  const resource = useResource<{ categories: KbCategory[] }>(
    'support:kb-categories',
    useCallback((signal) => api.get<{ categories: KbCategory[] }>('/support/kb/categories', undefined, signal), []),
  )
  const { refetch } = resource

  const [createCategory, createState] = useMutation(async (name: string) => {
    const created = await api.post<{ category: KbCategory }>('/support/kb/categories', { name })
    refetch()
    return created.category
  })

  return useMemo(
    () => ({
      categories: resource.data?.categories ?? [],
      loading: resource.loading,
      error: resource.error,
      canRetry: resource.canRetry,
      denied: resource.denied,
      refetch,
      createCategory,
      creating: createState.pending,
      createError: createState.error,
      fieldErrors: createState.fieldErrors,
    }),
    [resource, refetch, createCategory, createState],
  )
}

export function useKbArticles(filters: { query: string; categoryId: string; status: string }) {
  const key = JSON.stringify(filters)
  const resource = useResource<{ articles: KbArticle[]; total: number }>(
    `support:kb-articles:${key}`,
    useCallback(
      (signal) =>
        api.get<{ articles: KbArticle[]; total: number }>(
          '/support/kb/articles',
          {
            q: filters.query || undefined,
            categoryId: filters.categoryId || undefined,
            status: filters.status || undefined,
            limit: 100,
          },
          signal,
        ),
      [filters.query, filters.categoryId, filters.status],
    ),
  )
  const { refetch } = resource

  const [createArticle, createState] = useMutation(
    async (input: { title: string; body: string; categoryId?: string; publish: boolean }) => {
      // The server always creates a draft; publishing is a separate, deliberate
      // act that refuses an empty article. So "create as published" is two
      // calls, and the second one can legitimately fail.
      const created = await api.post<{ article: KbArticle }>('/support/kb/articles', {
        title: input.title,
        body: input.body || undefined,
        categoryId: input.categoryId || undefined,
      })
      if (input.publish) {
        await api.post(`/support/kb/articles/${created.article.id}/publish`, { version: created.article.version })
      }
      refetch()
      return created.article
    },
  )

  const [archiveArticle, archiveState] = useMutation(async (id: string, version: number) => {
    await api.delete(`/support/kb/articles/${id}`, { version })
    refetch()
  })

  return useMemo(
    () => ({
      articles: resource.data?.articles ?? [],
      total: resource.data?.total ?? 0,
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      createArticle,
      archiveArticle,
      writing: createState.pending || archiveState.pending,
      writeError: createState.error ?? archiveState.error,
      fieldErrors: createState.fieldErrors,
    }),
    [resource, refetch, createArticle, archiveArticle, createState, archiveState],
  )
}

/* ----------------------------- canned responses --------------------------- */

export type CannedResponse = {
  id: string
  shortcut: string
  title: string
  body: string
  teamId: string | null
  usageCount: number
}

export function useCannedResponses() {
  const resource = useResource<{ responses: CannedResponse[] }>(
    'support:canned',
    useCallback((signal) => api.get<{ responses: CannedResponse[] }>('/support/canned-responses', undefined, signal), []),
  )
  const { refetch } = resource

  const [createResponse, createState] = useMutation(async (input: { shortcut: string; title: string; body: string }) => {
    const created = await api.post<{ response: CannedResponse }>('/support/canned-responses', input)
    refetch()
    return created.response
  })

  const [archiveResponse, archiveState] = useMutation(async (id: string) => {
    await api.delete(`/support/canned-responses/${id}`)
    refetch()
  })

  return useMemo(
    () => ({
      responses: resource.data?.responses ?? [],
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      createResponse,
      archiveResponse,
      writing: createState.pending || archiveState.pending,
      writeError: createState.error ?? archiveState.error,
      fieldErrors: createState.fieldErrors,
    }),
    [resource, refetch, createResponse, archiveResponse, createState, archiveState],
  )
}

/* ------------------------------- SLA policies ----------------------------- */

export type SlaPolicy = {
  id: string
  name: string
  calendarId: string | null
  appliesTo: Record<string, unknown>
  firstResponseMinutes: number | null
  resolutionMinutes: number | null
  active: boolean
}

export function useSlaPolicies() {
  const resource = useResource<{ policies: SlaPolicy[] }>(
    'support:sla-policies',
    useCallback((signal) => api.get<{ policies: SlaPolicy[] }>('/support/sla-policies', undefined, signal), []),
  )
  const { refetch } = resource

  const [createPolicy, createState] = useMutation(
    async (input: {
      name: string
      firstResponseMinutes?: number
      resolutionMinutes?: number
      calendarId?: string
      appliesTo?: Record<string, unknown>
    }) => {
      const created = await api.post<{ policy: SlaPolicy }>('/support/sla-policies', {
        name: input.name,
        firstResponseMinutes: input.firstResponseMinutes || undefined,
        resolutionMinutes: input.resolutionMinutes || undefined,
        calendarId: input.calendarId || undefined,
        appliesTo: input.appliesTo && Object.keys(input.appliesTo).length ? input.appliesTo : undefined,
      })
      refetch()
      return created.policy
    },
  )

  const [setPolicyActive, activeState] = useMutation(async (id: string, active: boolean) => {
    await api.patch(`/support/sla-policies/${id}`, { active })
    refetch()
  })

  return useMemo(
    () => ({
      policies: resource.data?.policies ?? [],
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      createPolicy,
      setPolicyActive,
      writing: createState.pending || activeState.pending,
      writeError: createState.error ?? activeState.error,
      fieldErrors: createState.fieldErrors,
    }),
    [resource, refetch, createPolicy, setPolicyActive, createState, activeState],
  )
}

/* ----------------------------- escalation rules --------------------------- */

export type EscalationAction = { kind: string; [key: string]: unknown }

export type EscalationRule = {
  id: string
  name: string
  triggerTarget: string
  offsetMinutes: number
  conditions: Record<string, unknown>
  actions: EscalationAction[]
  active: boolean
}

export function useEscalationRules() {
  const resource = useResource<{ rules: EscalationRule[] }>(
    'support:escalation-rules',
    useCallback((signal) => api.get<{ rules: EscalationRule[] }>('/support/escalation-rules', undefined, signal), []),
  )
  const { refetch } = resource

  const [createRule, createState] = useMutation(
    async (input: { name: string; triggerTarget: string; offsetMinutes: number; actions: EscalationAction[] }) => {
      const created = await api.post<{ rule: EscalationRule }>('/support/escalation-rules', input)
      refetch()
      return created.rule
    },
  )

  // There is no DELETE: deactivating is the correct semantic, because the
  // escalation events a rule already fired still point at it.
  const [setRuleActive, activeState] = useMutation(async (id: string, active: boolean) => {
    await api.patch(`/support/escalation-rules/${id}`, { active })
    refetch()
  })

  const [runSweep, sweepState] = useMutation(async () => {
    const result = await api.post<{ fired: number; breached: number }>('/support/escalations/run')
    refetch()
    return result
  })

  const [runAutoClose, autoCloseState] = useMutation(async () => {
    const result = await api.post<{ closed: number; status: string }>('/support/tickets/auto-close')
    return result
  })

  return useMemo(
    () => ({
      rules: resource.data?.rules ?? [],
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      createRule,
      setRuleActive,
      runSweep,
      runAutoClose,
      writing: createState.pending || activeState.pending,
      sweeping: sweepState.pending || autoCloseState.pending,
      writeError: createState.error ?? activeState.error,
      sweepError: sweepState.error ?? autoCloseState.error,
      fieldErrors: createState.fieldErrors,
    }),
    [resource, refetch, createRule, setRuleActive, runSweep, runAutoClose, createState, activeState, sweepState, autoCloseState],
  )
}

/* ------------------------------- calendars -------------------------------- */

export type WorkingHour = { weekday: number; opensMinute: number; closesMinute: number }

export type Calendar = {
  id: string
  name: string
  timezone: string
  isDefault: boolean
  hours: WorkingHour[]
  holidays: { observedOn: string; name: string }[]
}

export function useCalendars() {
  const resource = useResource<{ calendars: Calendar[] }>(
    'support:calendars',
    useCallback((signal) => api.get<{ calendars: Calendar[] }>('/support/calendars', undefined, signal), []),
  )
  const { refetch } = resource

  const [createCalendar, createState] = useMutation(
    async (input: { name: string; timezone: string; isDefault: boolean; hours: WorkingHour[] }) => {
      const created = await api.post<{ calendar: Calendar }>('/support/calendars', input)
      refetch()
      return created.calendar
    },
  )

  const [deleteCalendar, deleteState] = useMutation(async (id: string) => {
    await api.delete(`/support/calendars/${id}`)
    refetch()
  })

  return useMemo(
    () => ({
      calendars: resource.data?.calendars ?? [],
      loading: resource.loading,
      refreshing: resource.refreshing,
      error: resource.error,
      denied: resource.denied,
      canRetry: resource.canRetry,
      refetch,
      createCalendar,
      deleteCalendar,
      writing: createState.pending || deleteState.pending,
      writeError: createState.error ?? deleteState.error,
      fieldErrors: createState.fieldErrors,
    }),
    [resource, refetch, createCalendar, deleteCalendar, createState, deleteState],
  )
}

/* --------------------------------- members -------------------------------- */

export type Member = { userId: string; email: string; fullName: string; role: string; status: string }

/** Who the assignee ids belong to. Without it a ticket shows a uuid. */
export function useMembers() {
  const resource = useResource<{ members: Member[] }>(
    'support:members',
    useCallback((signal) => api.get<{ members: Member[] }>('/members', undefined, signal), []),
  )
  const members = useMemo(() => resource.data?.members ?? [], [resource.data])
  return useMemo(
    () => ({
      members,
      nameOf: (userId: string | null) =>
        userId ? (members.find((member) => member.userId === userId)?.fullName ?? null) : null,
      loading: resource.loading,
      error: resource.error,
    }),
    [members, resource.loading, resource.error],
  )
}

/* -------------------------------- settings -------------------------------- */

type SettingsDocument<T> = { appCode: string; section: string; value: T; version: number; updatedAt: string | null }

/**
 * One versioned settings section, with the draft the pane edits.
 *
 * The version it read travels with the save. Without that, two administrators
 * on the same pane silently overwrite each other; with it the second is told
 * somebody else changed it and can reload.
 */
export function useSupportSettings<T extends Record<string, unknown>>(section: string, defaults: T) {
  const resource = useResource<{ settings: SettingsDocument<T> }>(
    `support:settings:${section}`,
    useCallback(
      (signal) => api.get<{ settings: SettingsDocument<T> }>(`/settings/${SUPPORT_APP}`, { section }, signal),
      [section],
    ),
  )

  /*
   * Two pieces of state, and no effect syncing them.
   *
   * `written` is the document our own save returned; it supersedes the fetched
   * one while it is at least as new, so the form does not flash back to the
   * pre-save text in the gap before the refetch lands. `edit` carries the
   * version it was typed against, so a document that moved on underneath —
   * because somebody else saved — replaces the draft instead of letting it be
   * written back over their work.
   */
  const [written, setWritten] = useState<{ value: T; version: number } | null>(null)
  const [edit, setEdit] = useState<{ value: T; version: number } | null>(null)

  const fetched = resource.data?.settings
  const current =
    written && (!fetched || written.version >= fetched.version)
      ? written
      : fetched
        ? { value: fetched.value, version: fetched.version }
        : null

  const pending = edit && current && edit.version === current.version ? edit.value : null
  const draft = pending ?? current?.value ?? defaults

  const setDraft = (update: T | ((previous: T) => T)) => {
    if (!current) return
    setEdit({
      value: typeof update === 'function' ? update(draft) : update,
      version: current.version,
    })
  }

  const [save, saveState] = useMutation(async (summary: string) => {
    const result = await api.put<{ settings: SettingsDocument<T> }>(`/settings/${SUPPORT_APP}`, {
      section,
      value: draft,
      version: current?.version ?? 0,
      summary,
    })
    setWritten({ value: result.settings.value, version: result.settings.version })
    setEdit(null)
    return result.settings
  })

  return {
    draft,
    setDraft,
    dirty: pending !== null && current !== null && JSON.stringify(pending) !== JSON.stringify(current.value),
    /** False until the server has answered; the form must not be saveable yet. */
    ready: current !== null,
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    denied: resource.denied,
    canRetry: resource.canRetry,
    refetch: resource.refetch,
    save,
    saving: saveState.pending,
    saveError: saveState.error,
    fieldErrors: saveState.fieldErrors,
  }
}

/* --------------------------------- widget --------------------------------- */

export type WidgetSettings = {
  enabled: boolean
  panelTitle: string
  launcherText: string
  subtitle: string
  confirmation: string
  accent: string
  position: string
  showHelpTab: boolean
  requireEmail: boolean
}

export const widgetDefaults: WidgetSettings = {
  enabled: false,
  panelTitle: 'How can we help?',
  launcherText: 'Support',
  subtitle: 'We usually reply within a few hours.',
  confirmation: "Thanks — we've got your message and emailed you a copy.",
  accent: '#0f766e',
  position: 'Bottom right',
  showHelpTab: true,
  requireEmail: true,
}

export type CsatSettings = {
  sendOnResolve: boolean
  waitHours: number
  skipOlderDays: number
  lowScore: number
  slaWarnPercent: number
  portalUrl: string
}

/** Mirrors `CSAT_DEFAULTS` in the support service, which owns the real ones. */
export const csatDefaults: CsatSettings = {
  sendOnResolve: true,
  waitHours: 1,
  skipOlderDays: 14,
  lowScore: 3,
  slaWarnPercent: 75,
  portalUrl: '',
}

/* --------------------------------- helpers -------------------------------- */

/** Minutes as an SLA target reads on screen. */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return 'Not set'
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`
  return `${minutes} min`
}

/**
 * A percentage, or null when the denominator is nothing.
 *
 * Returning 0 for "nothing measured" is the single most common way one of
 * these screens told somebody they were failing a target nobody had measured.
 */
export function percentOf(part: number, whole: number): string | null {
  return whole ? `${Math.round((part / whole) * 100)}%` : null
}
