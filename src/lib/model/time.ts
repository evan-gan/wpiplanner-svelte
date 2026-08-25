/**
 * Clock-time helpers.
 *
 * Times are minutes since midnight everywhere in the app. The legacy `Time`
 * class carried `{hour, minutes}` plus a hand-written `compareTo`; integers
 * compare, sort, and subtract without any of that.
 */

const CLOCK_TIME_PATTERN = /^(\d{1,2}):(\d{2})\s*([AP])M$/i;

export const MINUTES_PER_HOUR = 60;

const HOURS_PER_HALF_DAY = 12;

export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * The scheduling grid is half-hour blocks, so conflict resolution snaps period
 * start times onto :00 or :30. See {@link snapToBlockStart}.
 */
export const MINUTES_PER_BLOCK = 30;

/**
 * Convert a 12-hour clock string from the schedule export into minutes since
 * midnight.
 *
 * The legacy Java implementation mishandled midnight — it left "12:00AM" at
 * hour 12 rather than 0. This version follows the clock.
 *
 * @param rawTime Clock text such as "9:00AM", "12:30PM", "11:59AM"
 * @returns Minutes elapsed since midnight, in the range 0..1439
 * @throws Error when the text does not match the expected 12-hour format
 */
export function parseClockTime(rawTime: string): number {
  const match = CLOCK_TIME_PATTERN.exec(rawTime.trim());
  if (match === null) {
    throw new Error(
      `Could not parse time ${JSON.stringify(rawTime)}; expected a form like "9:00AM".`,
    );
  }

  const [, hourText, minuteText, meridiem] = match;
  const hour = Number(hourText);
  const minutes = Number(minuteText);

  if (hour < 1 || hour > 12 || minutes > 59) {
    throw new Error(`Time ${JSON.stringify(rawTime)} is outside the valid 12-hour clock range.`);
  }

  const isPm = meridiem.toUpperCase() === 'P';
  const hourOfDay = (hour % HOURS_PER_HALF_DAY) + (isPm ? HOURS_PER_HALF_DAY : 0);

  return hourOfDay * MINUTES_PER_HOUR + minutes;
}

/**
 * Render minutes-since-midnight back as 12-hour clock text.
 *
 * @param totalMinutes Minutes since midnight
 * @param includeMinutes When false, drop `:MM` (used by compact axis labels)
 */
export function formatClockTime(totalMinutes: number, includeMinutes = true): string {
  const hourOfDay = Math.floor(totalMinutes / MINUTES_PER_HOUR) % 24;
  const minutes = totalMinutes % MINUTES_PER_HOUR;

  const meridiem = hourOfDay >= HOURS_PER_HALF_DAY ? 'PM' : 'AM';
  const displayHour = hourOfDay % HOURS_PER_HALF_DAY === 0 ? 12 : hourOfDay % HOURS_PER_HALF_DAY;
  const minuteText = includeMinutes ? `:${String(minutes).padStart(2, '0')}` : '';

  return `${displayHour}${minuteText}${meridiem}`;
}

/** Hours as a fraction, e.g. 9:30 -> 9.5. The old `Time.getValue()`. */
export function minutesToDecimalHours(totalMinutes: number): number {
  return totalMinutes / MINUTES_PER_HOUR;
}

/** Whole hours as a fraction converted back to minutes. */
export function decimalHoursToMinutes(hours: number): number {
  return Math.round(hours * MINUTES_PER_HOUR);
}

/**
 * Round a period start time down onto the half-hour block that contains it.
 *
 * Load-bearing: the legacy `ScheduleProducer.getTimeConflicts` does exactly this
 * before walking a period against the chosen-times grid, so a 9:10 lecture is
 * tested against the 9:00 cell. Changing it changes which sections the Times tab
 * excludes.
 */
export function snapToBlockStart(totalMinutes: number): number {
  return totalMinutes - (totalMinutes % MINUTES_PER_BLOCK);
}
