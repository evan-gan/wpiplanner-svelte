/**
 * Calendar-date arithmetic for the ICS export.
 *
 * Dates here are `YYYY-MM-DD` strings and are manipulated through UTC epoch
 * milliseconds, never through the host's local time zone: a student in Denver
 * exporting a Worcester schedule must get the same file as a student in
 * Worcester, and `new Date('2026-08-20')` parsed as local time would shift the
 * whole term by a day for half the world.
 */
import type { IsoDate } from '$lib/config/academicCalendar';

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
const MILLIS_PER_MINUTE = 60 * 1000;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convert `YYYY-MM-DD` to the UTC midnight that represents it.
 *
 * @throws Error when the text is not an ISO calendar date
 */
export function isoDateToUtcMillis(date: IsoDate): number {
  const match = ISO_DATE_PATTERN.exec(date);
  if (match === null) {
    throw new Error(`Calendar date ${JSON.stringify(date)} is not in YYYY-MM-DD form.`);
  }

  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

/** Render a UTC instant back as `YYYY-MM-DD`. */
export function utcMillisToIsoDate(millis: number): IsoDate {
  return new Date(millis).toISOString().slice(0, 10);
}

/** Sunday-based day index (0 = Sunday), matching `DAY_BITS` bit order. */
export function isoDateWeekday(date: IsoDate): number {
  return new Date(isoDateToUtcMillis(date)).getUTCDay();
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return utcMillisToIsoDate(isoDateToUtcMillis(date) + days * MILLIS_PER_DAY);
}

/**
 * Every date from `firstDay` to `lastDay`, both inclusive.
 *
 * @returns Ascending list; empty when `lastDay` precedes `firstDay`
 */
export function datesInRange(firstDay: IsoDate, lastDay: IsoDate): IsoDate[] {
  const dates: IsoDate[] = [];
  const end = isoDateToUtcMillis(lastDay);

  for (let day = isoDateToUtcMillis(firstDay); day <= end; day += MILLIS_PER_DAY) {
    dates.push(utcMillisToIsoDate(day));
  }
  return dates;
}

/** Whether two inclusive date ranges share at least one day. */
export function rangesOverlap(
  firstStart: IsoDate,
  firstEnd: IsoDate,
  secondStart: IsoDate,
  secondEnd: IsoDate,
): boolean {
  return firstStart <= secondEnd && secondStart <= firstEnd;
}

/**
 * Offset of a time zone from UTC, in minutes, at a given instant.
 *
 * `Intl` is the only DST database the browser exposes, so the offset is
 * recovered by formatting the instant in the zone and diffing the result.
 */
function timeZoneOffsetMinutes(utcMillis: number, timeZoneId: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZoneId,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMillis));

  const field = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asIfUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour'),
    field('minute'),
    field('second'),
  );

  return (asIfUtc - utcMillis) / MILLIS_PER_MINUTE;
}

/**
 * Resolve a wall-clock time in a named zone to the instant it names.
 *
 * @param date Calendar date, `YYYY-MM-DD`
 * @param minutesSinceMidnight Wall-clock time on that date
 * @param timeZoneId IANA zone, e.g. "America/New_York"
 * @returns Epoch milliseconds for that wall-clock moment
 */
export function zonedTimeToUtcMillis(
  date: IsoDate,
  minutesSinceMidnight: number,
  timeZoneId: string,
): number {
  const wallClock = isoDateToUtcMillis(date) + minutesSinceMidnight * MILLIS_PER_MINUTE;

  // First guess uses the offset in force at the wall-clock instant read as UTC;
  // the second pass corrects it when that guess landed on the other side of a
  // DST transition.
  const guess = wallClock - timeZoneOffsetMinutes(wallClock, timeZoneId) * MILLIS_PER_MINUTE;
  return wallClock - timeZoneOffsetMinutes(guess, timeZoneId) * MILLIS_PER_MINUTE;
}
