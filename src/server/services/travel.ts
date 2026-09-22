import { conflict, notFound, unprocessable } from '../http/errors.ts'
import { recordAudit } from '../events/audit.ts'
import { decimalText, toMinor } from './sales.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Travel requests and their bookings.
 *
 * A trip is approved before it is booked, and the approval chain is the same
 * threshold-and-round machinery expense claims use — one decision per level
 * per round, so a resubmitted trip is decided afresh and a double-click cannot
 * skip a level.
 *
 * Bookings are refused before approval. Letting somebody book a flight against
 * an unapproved request is how an unapproved trip becomes a fait accompli.
 */

export type TravelRequestRow = {
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
  currentLevel: number
  approvalRound: number
  version: number
}

export type BookingRow = {
  id: string
  kind: string
  vendor: string | null
  reference: string | null
  cost: string | null
  currency: string | null
  status: string
}

type Raw = Record<string, unknown>

const day = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, 10) : (value as Date).toISOString().slice(0, 10)

const mapRequest = (row: Raw): TravelRequestRow => ({
  id: row.id as string,
  reference: row.reference as string,
  employeeId: row.employee_id as string,
  purpose: row.purpose as string,
  tripKind: row.trip_kind as string,
  origin: (row.origin as string) ?? null,
  destination: row.destination as string,
  departsOn: day(row.departs_on),
  returnsOn: day(row.returns_on),
  estimatedCost: decimalText(row.estimated_cost),
  currency: (row.currency as string) ?? null,
  status: row.status as string,
  currentLevel: row.current_level as number,
  approvalRound: row.approval_round as number,
  version: row.version as number,
})

const DRAFTABLE = new Set(['draft', 'rejected'])
/** States in which the trip has been approved and has not been called off. */
const BOOKABLE = new Set(['approved', 'booked', 'in_progress'])

async function nextReference(tx: Db, ctx: TenantContext): Promise<string> {
  await tx.query('select 1 from tenants where id = $1 for update', [ctx.tenantId])
  const { rows } = await tx.query<{ n: string }>('select count(*)::text as n from te_travel_requests where tenant_id = $1', [
    ctx.tenantId,
  ])
  return `TRV-${ctx.now.getUTCFullYear()}-${String(Number(rows[0].n) + 1).padStart(4, '0')}`
}

async function levelsFor(db: Db, ctx: TenantContext, amount: string): Promise<number[]> {
  const { rows } = await db.query<{ level: number; threshold: string }>(
    "select level, threshold::text as threshold from te_approval_levels where tenant_id = $1 and scope = 'travel' order by level",
    [ctx.tenantId],
  )
  const minor = toMinor(amount)
  return rows.filter((row) => minor >= toMinor(row.threshold)).map((row) => row.level)
}

export type CreateTripInput = {
  employeeId: string
  purpose: string
  destination: string
  departsOn: string
  returnsOn: string
  tripKind?: 'domestic' | 'international'
  origin?: string | null
  estimatedCost?: string | null
  currency?: string | null
  projectCode?: string | null
  budgetHead?: string | null
  advanceRequested?: string | null
}

export async function createTrip(ctx: TenantContext, input: CreateTripInput): Promise<TravelRequestRow> {
  ctx.require('record.create')
  if (input.returnsOn < input.departsOn) throw unprocessable('bad_dates', 'The return is before the departure.')
  if (input.estimatedCost && !input.currency) {
    throw unprocessable('currency_required', 'State the currency of the estimate.')
  }

  return ctx.db.transaction(async (tx) => {
    const { rows: employee } = await tx.query('select 1 from hr_employees where id = $1 and tenant_id = $2 and archived_at is null', [
      input.employeeId,
      ctx.tenantId,
    ])
    if (!employee[0]) throw notFound('That employee')

    /*
     * Overlapping trips for the same person are refused: somebody cannot be in
     * two places, and two live requests for the same week means two advances
     * and two sets of bookings.
     */
    const { rows: clash } = await tx.query<{ reference: string }>(
      `select reference from te_travel_requests
        where employee_id = $1 and status in ('submitted','approved','booked','in_progress')
          and departs_on <= $3 and returns_on >= $2
        limit 1`,
      [input.employeeId, input.departsOn, input.returnsOn],
    )
    if (clash[0]) throw conflict(`${clash[0].reference} already covers those dates.`)

    const reference = await nextReference(tx, ctx)
    const { rows } = await tx.query<Raw>(
      `insert into te_travel_requests
         (tenant_id, company_id, reference, employee_id, purpose, trip_kind, origin, destination,
          departs_on, returns_on, estimated_cost, currency, project_code, budget_head, advance_requested, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       returning *`,
      [
        ctx.tenantId,
        ctx.companyId,
        reference,
        input.employeeId,
        input.purpose,
        input.tripKind ?? 'domestic',
        input.origin ?? null,
        input.destination,
        input.departsOn,
        input.returnsOn,
        input.estimatedCost ?? null,
        input.currency?.toUpperCase() ?? null,
        input.projectCode ?? null,
        input.budgetHead ?? null,
        input.advanceRequested ?? null,
        ctx.userId,
      ],
    )
    return mapRequest(rows[0])
  })
}

export async function submitTrip(ctx: TenantContext, tripId: string, version: number): Promise<TravelRequestRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Raw>('select * from te_travel_requests where id = $1 and tenant_id = $2 for update', [
      tripId,
      ctx.tenantId,
    ])
    const trip = rows[0]
    if (!trip) throw notFound('That travel request')
    if (trip.version !== version) throw conflict('Someone else changed this request.', trip.version as number)
    if (!DRAFTABLE.has(trip.status as string)) throw unprocessable('not_draft', `That request is already ${trip.status}.`)

    const levels = await levelsFor(tx, ctx, decimalText(trip.estimated_cost) ?? '0')
    const round = (trip.approval_round as number) + (trip.status === 'rejected' ? 1 : 0)
    await tx.query(
      `update te_travel_requests
          set status = 'submitted', current_level = $2, approval_round = $3, version = version + 1, updated_at = $4
        where id = $1`,
      [tripId, levels[0] ?? 1, round, ctx.now],
    )
    await recordAudit(tx, ctx, { action: 'travel.submitted', resource: 'travel_request', resourceId: tripId })
    const { rows: after } = await tx.query<Raw>('select * from te_travel_requests where id = $1', [tripId])
    return mapRequest(after[0])
  })
}

export async function decideTrip(
  ctx: TenantContext,
  tripId: string,
  input: { decision: 'approved' | 'rejected'; version: number; note?: string | null },
): Promise<TravelRequestRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Raw>('select * from te_travel_requests where id = $1 and tenant_id = $2 for update', [
      tripId,
      ctx.tenantId,
    ])
    const trip = rows[0]
    if (!trip) throw notFound('That travel request')
    if (trip.version !== input.version) throw conflict('Someone else decided this request.', trip.version as number)
    if (trip.status !== 'submitted') throw unprocessable('not_submitted', `That request is ${trip.status}, not awaiting a decision.`)

    const level = trip.current_level as number
    const round = trip.approval_round as number
    const { rowCount } = await tx.query(
      `insert into te_approvals (tenant_id, subject_kind, subject_id, round, level, decision, decided_by, decided_at, note)
       values ($1,'travel_request',$2,$3,$4,$5,$6,$7,$8)
       on conflict (subject_kind, subject_id, round, level) do nothing`,
      [ctx.tenantId, tripId, round, level, input.decision, ctx.userId, ctx.now, input.note ?? null],
    )
    if (!rowCount) throw conflict(`Level ${level} has already been decided.`)

    if (input.decision === 'rejected') {
      await tx.query(
        `update te_travel_requests set status = 'rejected', decided_at = $2, version = version + 1, updated_at = $2 where id = $1`,
        [tripId, ctx.now],
      )
    } else {
      const levels = await levelsFor(tx, ctx, decimalText(trip.estimated_cost) ?? '0')
      const remaining = levels.filter((candidate) => candidate > level)
      await tx.query(
        remaining.length
          ? 'update te_travel_requests set current_level = $2, version = version + 1, updated_at = $3 where id = $1'
          : `update te_travel_requests set status = 'approved', current_level = $2, decided_at = $3,
                    version = version + 1, updated_at = $3 where id = $1`,
        remaining.length ? [tripId, remaining[0], ctx.now] : [tripId, level, ctx.now],
      )
    }
    await recordAudit(tx, ctx, {
      action: `travel.${input.decision}`,
      resource: 'travel_request',
      resourceId: tripId,
      detail: { level, round },
    })
    const { rows: after } = await tx.query<Raw>('select * from te_travel_requests where id = $1', [tripId])
    return mapRequest(after[0])
  })
}

export type BookingInput = {
  kind: 'flight' | 'train' | 'bus' | 'hotel' | 'car' | 'visa' | 'other'
  vendor?: string | null
  reference?: string | null
  startsAt?: string | null
  endsAt?: string | null
  cost?: string | null
  currency?: string | null
}

/** Records a booking. Refused before approval — that is the point of approving. */
export async function addBooking(ctx: TenantContext, tripId: string, input: BookingInput): Promise<BookingRow> {
  ctx.require('record.create')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ status: string }>(
      'select status from te_travel_requests where id = $1 and tenant_id = $2 for update',
      [tripId, ctx.tenantId],
    )
    if (!rows[0]) throw notFound('That travel request')
    if (!BOOKABLE.has(rows[0].status)) {
      throw unprocessable('not_approved', `That trip is ${rows[0].status}; it cannot be booked yet.`)
    }

    const { rows: booking } = await tx.query<Raw>(
      `insert into te_travel_bookings (tenant_id, request_id, kind, vendor, reference, starts_at, ends_at, cost, currency)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [
        ctx.tenantId,
        tripId,
        input.kind,
        input.vendor ?? null,
        input.reference ?? null,
        input.startsAt ?? null,
        input.endsAt ?? null,
        input.cost ?? null,
        input.currency?.toUpperCase() ?? null,
      ],
    )
    // The first booking moves the trip on, so a glance at the list shows what
    // is arranged and what is still only approved.
    if (rows[0].status === 'approved') {
      await tx.query(`update te_travel_requests set status = 'booked', version = version + 1, updated_at = $2 where id = $1`, [
        tripId,
        ctx.now,
      ])
    }
    return {
      id: booking[0].id as string,
      kind: booking[0].kind as string,
      vendor: (booking[0].vendor as string) ?? null,
      reference: (booking[0].reference as string) ?? null,
      cost: decimalText(booking[0].cost),
      currency: (booking[0].currency as string) ?? null,
      status: booking[0].status as string,
    }
  })
}

export async function readTrip(ctx: TenantContext, tripId: string): Promise<TravelRequestRow & { bookings: BookingRow[] }> {
  ctx.require('record.read')
  const { rows } = await ctx.db.query<Raw>('select * from te_travel_requests where id = $1 and tenant_id = $2', [tripId, ctx.tenantId])
  if (!rows[0]) throw notFound('That travel request')

  const { rows: bookings } = await ctx.db.query<Raw>(
    'select * from te_travel_bookings where request_id = $1 order by starts_at nulls last, created_at',
    [tripId],
  )
  return {
    ...mapRequest(rows[0]),
    bookings: bookings.map((row) => ({
      id: row.id as string,
      kind: row.kind as string,
      vendor: (row.vendor as string) ?? null,
      reference: (row.reference as string) ?? null,
      cost: decimalText(row.cost),
      currency: (row.currency as string) ?? null,
      status: row.status as string,
    })),
  }
}

export async function listTrips(
  ctx: TenantContext,
  options: { employeeId?: string; status?: string; from?: string; to?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: TravelRequestRow[]; total: number }> {
  ctx.require('record.read')
  const filters = ['t.tenant_id = $1']
  const params: unknown[] = [ctx.tenantId]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    filters.push(clause.replace('$?', `$${params.length}`))
  }
  if (options.employeeId) add('t.employee_id = $?', options.employeeId)
  if (options.status) add('t.status = $?', options.status)
  if (options.from) add('t.returns_on >= $?', options.from)
  if (options.to) add('t.departs_on <= $?', options.to)
  const where = filters.join(' and ')

  const { rows: counted } = await ctx.db.query<{ n: string }>(
    `select count(*)::text as n from te_travel_requests t where ${where}`,
    params as never[],
  )
  params.push(Math.min(options.limit ?? 50, 200), Math.max(options.offset ?? 0, 0))
  const { rows } = await ctx.db.query<Raw>(
    `select t.* from te_travel_requests t where ${where}
      order by t.departs_on desc limit $${params.length - 1} offset $${params.length}`,
    params as never[],
  )
  return { total: Number(counted[0].n), rows: rows.map(mapRequest) }
}

/** Calls off a trip. Bookings stay on record — they may have cost money already. */
export async function cancelTrip(ctx: TenantContext, tripId: string, version: number): Promise<TravelRequestRow> {
  ctx.require('record.update')

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<Raw>('select * from te_travel_requests where id = $1 and tenant_id = $2 for update', [
      tripId,
      ctx.tenantId,
    ])
    if (!rows[0]) throw notFound('That travel request')
    if (rows[0].version !== version) throw conflict('Someone else changed this request.', rows[0].version as number)
    if (rows[0].status === 'completed') throw unprocessable('already_completed', 'That trip has already happened.')

    await tx.query(`update te_travel_requests set status = 'cancelled', version = version + 1, updated_at = $2 where id = $1`, [
      tripId,
      ctx.now,
    ])
    await recordAudit(tx, ctx, { action: 'travel.cancelled', resource: 'travel_request', resourceId: tripId })
    const { rows: after } = await tx.query<Raw>('select * from te_travel_requests where id = $1', [tripId])
    return mapRequest(after[0])
  })
}
