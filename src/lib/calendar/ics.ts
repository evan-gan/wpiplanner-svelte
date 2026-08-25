/**
 * iCalendar (RFC 5545) serialisation.
 *
 * Deliberately knows nothing about courses or terms — it takes plain event
 * records and emits a `.ics` file. `scheduleExport.ts` is the piece that turns a
 * schedule into these records.
 */
import type { IsoDate } from '$lib/config/academicCalendar';
import { addDays, zonedTimeToUtcMillis } from './dates';
import { timeZoneBlock } from './timeZones';

/** RFC 5545 §3.3.10 day abbreviations, in `DAY_BITS` order. */
export const ICS_DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/** A wall-clock moment in the calendar's zone. */
export interface ZonedMoment {
  date: IsoDate;
  minutesSinceMidnight: number;
}

export interface WeeklyRecurrence {
  /** Sunday-based day indexes the event repeats on. */
  weekdays: readonly number[];
  /** Last day an occurrence may fall on, inclusive. */
  lastDay: IsoDate;
  /** Occurrences to drop; each must line up with a generated occurrence. */
  excludedDates: readonly IsoDate[];
}

/** A class meeting, or any other event with a start and end time. */
export interface TimedIcsEvent {
  kind: 'timed';
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: ZonedMoment;
  end: ZonedMoment;
  recurrence?: WeeklyRecurrence;
  /** Minutes before the start to alert; omitted or null means no alarm. */
  reminderMinutesBefore?: number | null;
}

/** A holiday or break: no clock time, and it does not mark the student busy. */
export interface AllDayIcsEvent {
  kind: 'allDay';
  uid: string;
  summary: string;
  description?: string;
  firstDay: IsoDate;
  /** Last day of the event, inclusive. */
  lastDay: IsoDate;
}

export type IcsEvent = TimedIcsEvent | AllDayIcsEvent;

export interface CalendarOptions {
  /** IANA zone every {@link ZonedMoment} is expressed in. */
  timeZoneId: string;
  /** Shown by some clients when the file is imported as a new calendar. */
  calendarName: string;
  /** Fixed instant for DTSTAMP; injectable so tests get a stable file. */
  now?: Date;
}

const MAX_LINE_OCTETS = 75;
const PRODUCT_ID = '-//WPI Planner//Schedule Export//EN';

/** Escape a value for a TEXT property: RFC 5545 §3.3.11. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Wrap one content line to 75 octets, continuation lines starting with a space.
 *
 * Measured in UTF-8 bytes rather than characters, and never split inside a
 * multi-byte character — a course description with an em dash in it would
 * otherwise produce an invalid file.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  let current = '';
  let currentOctets = 0;
  // Continuation lines lose one octet to the leading space.
  let limit = MAX_LINE_OCTETS;

  for (const character of line) {
    const size = encoder.encode(character).length;
    if (currentOctets + size > limit) {
      pieces.push(current);
      current = '';
      currentOctets = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += character;
    currentOctets += size;
  }

  pieces.push(current);
  return pieces.join('\r\n ');
}

/** `20260820T090000` — a local date-time, paired with a TZID parameter. */
function formatLocalDateTime(moment: ZonedMoment): string {
  const hours = Math.floor(moment.minutesSinceMidnight / 60);
  const minutes = moment.minutesSinceMidnight % 60;
  const clock = [hours, minutes, 0].map((part) => String(part).padStart(2, '0')).join('');
  return `${moment.date.replace(/-/g, '')}T${clock}`;
}

/** `20260820T130000Z` — an absolute instant. */
function formatUtcDateTime(instant: Date): string {
  return `${instant.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

function formatDateOnly(date: IsoDate): string {
  return date.replace(/-/g, '');
}

function recurrenceLines(
  recurrence: WeeklyRecurrence,
  startMinutes: number,
  timeZoneId: string,
): string[] {
  const byDay = recurrence.weekdays.map((weekday) => ICS_DAY_CODES[weekday]).join(',');
  // UNTIL must be UTC even when DTSTART carries a TZID, and it is compared
  // against occurrence *start* times — so it is the last day's own start time,
  // pushed to the end of that day, converted out of the calendar's zone.
  const untilMillis = zonedTimeToUtcMillis(recurrence.lastDay, 23 * 60 + 59, timeZoneId);
  const lines = [`RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${formatUtcDateTime(new Date(untilMillis))}`];

  for (const date of recurrence.excludedDates) {
    lines.push(
      `EXDATE;TZID=${timeZoneId}:${formatLocalDateTime({ date, minutesSinceMidnight: startMinutes })}`,
    );
  }
  return lines;
}

function timedEventLines(event: TimedIcsEvent, options: CalendarOptions, stamp: string): string[] {
  const zone = options.timeZoneId;
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${zone}:${formatLocalDateTime(event.start)}`,
    `DTEND;TZID=${zone}:${formatLocalDateTime(event.end)}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
  ];

  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.recurrence) {
    lines.push(...recurrenceLines(event.recurrence, event.start.minutesSinceMidnight, zone));
  }

  if (event.reminderMinutesBefore != null) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(event.summary)}`,
      `TRIGGER:-PT${event.reminderMinutesBefore}M`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT');
  return lines;
}

function allDayEventLines(event: AllDayIcsEvent, stamp: string): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    // DTEND on a DATE value is exclusive, so a break through the 27th ends on the 28th.
    `DTSTART;VALUE=DATE:${formatDateOnly(event.firstDay)}`,
    `DTEND;VALUE=DATE:${formatDateOnly(addDays(event.lastDay, 1))}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    'TRANSP:TRANSPARENT',
  ];

  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Serialise events into a complete `.ics` file.
 *
 * @returns The file body, CRLF-terminated and folded to 75 octets per line
 */
export function buildIcsCalendar(
  events: readonly IcsEvent[],
  options: CalendarOptions,
): string {
  const stamp = formatUtcDateTime(options.now ?? new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODUCT_ID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
    `X-WR-TIMEZONE:${options.timeZoneId}`,
    ...timeZoneBlock(options.timeZoneId),
  ];

  for (const event of events) {
    lines.push(
      ...(event.kind === 'timed'
        ? timedEventLines(event, options, stamp)
        : allDayEventLines(event, stamp)),
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
