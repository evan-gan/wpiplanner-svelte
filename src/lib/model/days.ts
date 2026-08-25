/**
 * Day-of-week helpers.
 *
 * The legacy model carried a `HashSet<DayOfWeek>` on every period and tested
 * conflicts with a nested loop. Here a period's days are a 7-bit mask, so the
 * overlap test in the innermost loop of the permutation search is a single AND.
 */
import { DAY_BITS, type DayShortName } from './schedb.ts';

/** The export uses "?" when Workday did not supply meeting days. */
const UNKNOWN_DAYS_MARKER = '?';

/** Short names in Sunday-first order — the bit order of {@link DAY_BITS}. */
export const DAY_SHORT_NAMES = Object.keys(DAY_BITS) as DayShortName[];

/** Full names, matching the legacy `DayOfWeek.getName()`. */
export const DAY_FULL_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * Sunday-based indexes of the days the schedule views lay out.
 *
 * `PermutationController.validDayOfWeek` is Monday–Friday, and the time grid
 * starts at `TimeCell.START_DAY = 1` for the same reason.
 */
export const WEEKDAY_INDEXES = [1, 2, 3, 4, 5] as const;

/**
 * Convert a comma-separated day list into a {@link DAY_BITS} mask.
 *
 * @param rawDays Text such as "mon,tue,thu,fri", or "?" when days are unknown
 * @returns A 7-bit mask; zero when days are unknown
 * @throws Error when a token is not a recognized day abbreviation
 */
export function parseDayMask(rawDays: string): number {
  const trimmed = rawDays.trim();
  if (trimmed === '' || trimmed === UNKNOWN_DAYS_MARKER) return 0;

  let mask = 0;
  for (const token of trimmed.split(',')) {
    const dayName = token.trim().toLowerCase() as DayShortName;
    const bit = DAY_BITS[dayName];

    if (bit === undefined) {
      throw new Error(
        `Unknown day abbreviation ${JSON.stringify(token)} in ${JSON.stringify(rawDays)}; ` +
          `expected one of ${DAY_SHORT_NAMES.join(', ')}.`,
      );
    }
    mask |= bit;
  }
  return mask;
}

/** Expand a day mask back into short names, in Sunday-first order. */
export function dayMaskToNames(mask: number): DayShortName[] {
  return DAY_SHORT_NAMES.filter((day) => (mask & DAY_BITS[day]) !== 0);
}

/** The bit for a Sunday-based day index (0 = Sunday, 6 = Saturday). */
export function dayIndexToBit(dayIndex: number): number {
  return 1 << dayIndex;
}

/** Whether a mask includes the given Sunday-based day index. */
export function maskHasDay(mask: number, dayIndex: number): boolean {
  return (mask & dayIndexToBit(dayIndex)) !== 0;
}

/**
 * Whether two periods meet on at least one common day.
 *
 * Periods with unknown days (mask 0) never overlap anything, which is what the
 * 489 `days="?"` rows in the catalog need.
 */
export function daysOverlap(maskA: number, maskB: number): boolean {
  return (maskA & maskB) !== 0;
}

/** Full day name for a Sunday-based day index. */
export function fullDayName(dayIndex: number): string {
  return DAY_FULL_NAMES[dayIndex];
}
