import type { Calendar } from './calendar.ts'
import type { TenantContext } from '../tenancy/context.ts'

/**
 * Loads a tenant's working calendar.
 *
 * Returns null when none is configured, and callers treat that as "we do not
 * know the working week" rather than substituting a default. Assuming
 * Monday-to-Friday for a workspace that never said so produces attendance and
 * leave figures that look authoritative and are guesses.
 */
export async function loadDefaultCalendar(ctx: TenantContext, calendarId?: string | null): Promise<Calendar | null> {
  const { rows } = calendarId
    ? await ctx.db.query<{ id: string; timezone: string }>(
        'select id, timezone from business_calendars where id = $1 and tenant_id = $2',
        [calendarId, ctx.tenantId],
      )
    : await ctx.db.query<{ id: string; timezone: string }>(
        'select id, timezone from business_calendars where tenant_id = $1 and is_default limit 1',
        [ctx.tenantId],
      )
  if (!rows[0]) return null

  const { rows: hours } = await ctx.db.query<{ weekday: number; opens_minute: number; closes_minute: number }>(
    'select weekday, opens_minute, closes_minute from business_hours where calendar_id = $1',
    [rows[0].id],
  )
  const { rows: holidays } = await ctx.db.query<{ observed_on: Date }>(
    'select observed_on from business_holidays where calendar_id = $1',
    [rows[0].id],
  )
  return {
    timezone: rows[0].timezone,
    hours: hours.map((hour) => ({
      weekday: hour.weekday,
      opensMinute: hour.opens_minute,
      closesMinute: hour.closes_minute,
    })),
    holidays: new Set(holidays.map((holiday) => new Date(holiday.observed_on).toISOString().slice(0, 10))),
  }
}
