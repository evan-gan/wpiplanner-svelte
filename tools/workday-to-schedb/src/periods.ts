/**
 * `Section_Details` -> the periods a section meets.
 *
 * The field is a `;`-separated list of meetings, each of which is
 * `location | day pattern | time range`, sometimes with a fourth date-range
 * part on courses that move rooms mid-term. Both trailing parts are optional:
 * an asynchronous online section is just "Online-asynchronous |".
 *
 *   "Olin Hall 126 | M-T-R-F | 9:00 AM - 9:50 AM"
 *   "Fuller Labs 320 | W | 1:00 PM - 2:50 PM; Olin Hall 126 | M | 1:00 PM - 1:50 PM"
 *   "Stratton Hall 311 | T-F | 12:00 PM - 1:20 PM | 08/20/2026 - 10/09/2026"
 */
import { DAY_BITS, type PeriodJson } from '../../../src/lib/model/schedb.ts';
import { parseClockTime } from '../../../src/lib/model/time.ts';
import type { AnomalyLog } from './report.ts';

/** Workday's day letters, in the order it writes them. */
const DAY_BIT_BY_LETTER: ReadonlyMap<string, number> = new Map([
  ['M', DAY_BITS.mon],
  ['T', DAY_BITS.tue],
  ['W', DAY_BITS.wed],
  ['R', DAY_BITS.thu],
  ['F', DAY_BITS.fri],
]);

/**
 * Where a section with no meeting time is parked, matching the legacy
 * converter. It has no days, so the search treats it as conflicting with
 * nothing and the grid never draws it.
 */
const PLACEHOLDER_TIME = parseClockTime('12:00PM');

/** "9:00 AM - 9:50 AM" — the third part of a meeting. */
const TIME_RANGE_PATTERN = /^\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)\s*$/i;

/** Everything about a section that its periods repeat. */
export interface PeriodContext {
  type: string;
  professor: string;
  sectionNumber: string;
  seats: number;
  seatsAvailable: number;
  actualWaitlist: number;
  maxWaitlist: number;
}

/**
 * Build the periods for one section.
 *
 * Always returns at least one period: a section with no meeting information
 * still has to appear in the catalog so students can see it exists.
 *
 * @param sectionDetails Raw `Section_Details` text
 * @param context Section-level values every period repeats
 * @param where Section id, for anomaly messages
 * @param log Collects meetings that parsed but look wrong
 */
export function parsePeriods(
  sectionDetails: string,
  context: PeriodContext,
  where: string,
  log: AnomalyLog,
): PeriodJson[] {
  const meetings = sectionDetails.split(';').filter((meeting) => meeting.trim() !== '');

  if (meetings.length === 0) {
    log.add('no-meeting-times', where, 'Section_Details was empty; added a placeholder period.');
    return [buildPeriod(context, { location: '', days: 0, start: PLACEHOLDER_TIME, end: PLACEHOLDER_TIME })];
  }

  return meetings.map((meeting, index) =>
    parseMeeting(meeting, context, `${where} period ${index + 1}`, log),
  );
}

function parseMeeting(
  meeting: string,
  context: PeriodContext,
  where: string,
  log: AnomalyLog,
): PeriodJson {
  const parts = meeting.split('|').map((part) => part.trim());
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();

  const { location, dayPattern, timeRange } = splitMeetingParts(parts);
  const period = buildPeriod(context, {
    location,
    days: parseDayLetters(dayPattern),
    ...parseTimeRange(timeRange, where, log),
  });

  notePeriodAnomalies(period, timeRange, where, log);
  return period;
}

/**
 * Assign the parts of one meeting to location, days, and time.
 *
 * Workday sometimes drops the location, leaving "M-T-R-F | 9:00 AM - 9:50 AM",
 * and sometimes drops the schedule, leaving "Online-asynchronous". The time
 * range is the only part with a recognisable shape, so it anchors the rest.
 */
function splitMeetingParts(parts: readonly string[]): {
  location: string;
  dayPattern: string;
  timeRange: string;
} {
  if (parts.length >= 3) {
    return { location: parts[0], dayPattern: parts[1], timeRange: parts[2] };
  }
  if (parts.length === 2 && TIME_RANGE_PATTERN.test(parts[1])) {
    return { location: '', dayPattern: parts[0], timeRange: parts[1] };
  }
  return { location: parts[0] ?? '', dayPattern: '', timeRange: '' };
}

function parseTimeRange(
  timeRange: string,
  where: string,
  log: AnomalyLog,
): { start: number; end: number } {
  if (timeRange === '') return { start: PLACEHOLDER_TIME, end: PLACEHOLDER_TIME };

  const match = TIME_RANGE_PATTERN.exec(timeRange);
  if (match === null) {
    throw new Error(
      `Could not parse the meeting time ${JSON.stringify(timeRange)} for ${where}; ` +
        `expected a form like "9:00 AM - 9:50 AM". The feed format may have changed.`,
    );
  }

  return { start: parseClockTime(match[1]), end: parseClockTime(match[2]) };
}

/** "M-T-R-F" -> a {@link DAY_BITS} mask. Unknown letters are ignored. */
export function parseDayLetters(dayPattern: string): number {
  let mask = 0;
  for (const letter of dayPattern.toUpperCase()) {
    mask |= DAY_BIT_BY_LETTER.get(letter) ?? 0;
  }
  return mask;
}

function buildPeriod(
  context: PeriodContext,
  meeting: { location: string; days: number; start: number; end: number },
): PeriodJson {
  return {
    type: context.type,
    professor: context.professor,
    days: meeting.days,
    startMinutes: meeting.start,
    endMinutes: meeting.end,
    location: meeting.location.replace(/\s+/g, ' ').trim(),
    seats: context.seats,
    seatsAvailable: context.seatsAvailable,
    actualWaitlist: context.actualWaitlist,
    maxWaitlist: context.maxWaitlist,
    sectionNumber: context.sectionNumber,
  };
}

function notePeriodAnomalies(
  period: PeriodJson,
  timeRange: string,
  where: string,
  log: AnomalyLog,
): void {
  if (period.days === 0 && timeRange !== '') {
    log.add('unknown-days', where, 'A meeting time was given with no day pattern.');
  }
  if (period.endMinutes < period.startMinutes) {
    log.add('end-before-start', where, `Ends ${period.endMinutes} before it starts ${period.startMinutes}.`);
  } else if (period.endMinutes === period.startMinutes && timeRange !== '') {
    log.add('zero-length-period', where, 'Start and end times are identical.');
  }
  if (period.location === '') {
    log.add('empty-location', where, 'The meeting listed no location.');
  }
}
