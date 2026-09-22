import { conflict, unprocessable } from '../http/errors.ts'
import type { Db } from '../db/client.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Credits as an immutable ledger.
 *
 * Balance is the sum of entries, never a mutable counter: a counter cannot be
 * audited, and two concurrent spends both read the same value and both succeed.
 * Here a reservation is a negative entry taken under a lock, and the balance
 * check happens inside the same transaction that writes it.
 *
 * The shape is reserve → settle | refund, because the thing you are paying for
 * can fail. The prototype deducted up front and kept the credits whatever
 * happened, which charges for an error message.
 */

export type CreditBalance = {
  granted: number
  used: number
  reserved: number
  available: number
}

export async function balance(db: Db, tenantId: string): Promise<CreditBalance> {
  const { rows } = await db.query<{ granted: string; used: string; reserved: string }>(
    `select
        coalesce(sum(amount) filter (where kind in ('grant', 'adjust') and amount > 0), 0)::text as granted,
        coalesce(-sum(amount) filter (where kind = 'settle'), 0)::text as used,
        coalesce(-sum(amount) filter (where kind = 'reserve'), 0)::text as reserved
       from credit_entries where tenant_id = $1`,
    [tenantId],
  )
  const granted = Number(rows[0].granted)
  const used = Number(rows[0].used)
  // An open reservation is money already committed; settle and refund entries
  // cancel it out, so `reserved` here is the net still held.
  const { rows: open } = await db.query<{ held: string }>(
    `select coalesce(-sum(r.amount), 0)::text as held
       from credit_entries r
      where r.tenant_id = $1 and r.kind = 'reserve'
        and not exists (select 1 from credit_entries s where s.reservation_id = r.id)`,
    [tenantId],
  )
  const held = Number(open[0].held)
  return { granted, used, reserved: held, available: granted - used - held }
}

export type ReserveInput = {
  amount: number
  reason: string
  resource?: string
  resourceId?: string
  /** Collapses duplicate reservations from a retried request. */
  idempotencyKey?: string
}

/**
 * Holds credits for work that has not happened yet.
 *
 * The advisory lock serialises reservations per tenant, so two parallel spends
 * cannot both see enough balance. Without it the check and the write are not
 * atomic and a tenant can go negative.
 */
export async function reserve(ctx: TenantContext, input: ReserveInput): Promise<{ reservationId: string }> {
  ctx.require('credit.spend')
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw unprocessable('invalid_amount', 'A reservation must be a positive whole number of credits.')
  }

  return ctx.db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const { rows } = await tx.query<{ id: string }>(
        `select id::text as id from credit_entries
          where tenant_id = $1 and idempotency_key = $2 and kind = 'reserve'`,
        [ctx.tenantId, input.idempotencyKey],
      )
      // A retry finds its own earlier reservation instead of taking a second.
      if (rows[0]) return { reservationId: rows[0].id }
    }

    // Serialises spend per tenant for the life of this transaction.
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`credits:${ctx.tenantId}`])

    const current = await balance(tx, ctx.tenantId)
    if (current.available < input.amount) {
      throw unprocessable(
        'insufficient_credits',
        `That needs ${input.amount} AI Credits and ${current.available} are available.`,
      )
    }

    const { rows } = await tx.query<{ id: string }>(
      `insert into credit_entries (tenant_id, user_id, kind, amount, reason, resource, resource_id, idempotency_key)
       values ($1, $2, 'reserve', $3, $4, $5, $6, $7) returning id::text as id`,
      [ctx.tenantId, ctx.userId, -input.amount, input.reason, input.resource ?? null, input.resourceId ?? null, input.idempotencyKey ?? null],
    )
    return { reservationId: rows[0].id }
  })
}

/**
 * Converts a reservation into a charge.
 *
 * `actualAmount` may be lower than reserved — an estimate that came in cheaper
 * refunds the difference rather than keeping it.
 */
export async function settle(ctx: TenantContext, reservationId: string, actualAmount: number): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ amount: number; reason: string; resource: string | null; resource_id: string | null }>(
      `select amount, reason, resource, resource_id from credit_entries
        where id = $1 and tenant_id = $2 and kind = 'reserve' for update`,
      [reservationId, ctx.tenantId],
    )
    const reservation = rows[0]
    if (!reservation) throw unprocessable('unknown_reservation', 'That credit reservation does not exist.')

    const { rows: resolved } = await tx.query<{ n: string }>(
      'select count(*)::text as n from credit_entries where reservation_id = $1',
      [reservationId],
    )
    if (Number(resolved[0].n) > 0) throw conflict('That reservation has already been settled or refunded.')

    const held = -reservation.amount
    const charge = Math.max(0, Math.min(actualAmount, held))

    await tx.query(
      `insert into credit_entries (tenant_id, user_id, kind, amount, reservation_id, reason, resource, resource_id)
       values ($1, $2, 'settle', $3, $4, $5, $6, $7)`,
      [ctx.tenantId, ctx.userId, -charge, reservationId, reservation.reason, reservation.resource, reservation.resource_id],
    )
    // Releasing the held amount and booking the real charge keeps the two
    // visible separately, which is what makes an over-estimate explainable.
    await tx.query(
      `insert into credit_entries (tenant_id, user_id, kind, amount, reservation_id, reason)
       values ($1, $2, 'refund', $3, $4, $5)`,
      [ctx.tenantId, ctx.userId, held, reservationId, `Released reservation for: ${reservation.reason}`],
    )
  })
}

/** Returns the whole reservation. Used when the work failed or was cancelled. */
export async function refund(ctx: TenantContext, reservationId: string, reason: string): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ amount: number }>(
      `select amount from credit_entries where id = $1 and tenant_id = $2 and kind = 'reserve' for update`,
      [reservationId, ctx.tenantId],
    )
    if (!rows[0]) throw unprocessable('unknown_reservation', 'That credit reservation does not exist.')
    const { rows: resolved } = await tx.query<{ n: string }>(
      'select count(*)::text as n from credit_entries where reservation_id = $1',
      [reservationId],
    )
    if (Number(resolved[0].n) > 0) throw conflict('That reservation has already been settled or refunded.')

    await tx.query(
      `insert into credit_entries (tenant_id, user_id, kind, amount, reservation_id, reason)
       values ($1, $2, 'refund', $3, $4, $5)`,
      [ctx.tenantId, ctx.userId, -rows[0].amount, reservationId, reason],
    )
  })
}

/** Operator-side grant. Not reachable from the product UI. */
export async function grant(
  db: Db,
  tenantId: string,
  amount: number,
  reason: string,
  period?: { start: Date; end: Date },
  idempotencyKey?: string,
): Promise<void> {
  await db.query(
    `insert into credit_entries (tenant_id, kind, amount, reason, period_start, period_end, idempotency_key)
     values ($1, 'grant', $2, $3, $4, $5, $6)
     on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing`,
    [tenantId, amount, reason, period?.start ?? null, period?.end ?? null, idempotencyKey ?? null],
  )
}

/**
 * Runs `work` with credits held, settling the real cost or refunding on failure.
 *
 * Every paid capability should go through this rather than deducting up front:
 * it is the difference between charging for an answer and charging for an
 * attempt.
 */
export async function withCredits<T>(
  ctx: TenantContext,
  input: ReserveInput,
  work: () => Promise<{ result: T; actualCost?: number }>,
): Promise<T> {
  const { reservationId } = await reserve(ctx, input)
  try {
    const { result, actualCost } = await work()
    await settle(ctx, reservationId, actualCost ?? input.amount)
    return result
  } catch (error) {
    await refund(ctx, reservationId, `Failed: ${error instanceof Error ? error.message : 'unknown error'}`).catch(
      () => undefined,
    )
    throw error
  }
}
