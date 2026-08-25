import { describe, expect, it } from 'vitest';
import { buildIcsCalendar, escapeIcsText, foldIcsLine, type IcsEvent } from '$lib/calendar/ics';

const OPTIONS = {
  timeZoneId: 'America/New_York',
  calendarName: 'Test',
  now: new Date('2026-08-01T00:00:00Z'),
};

const lecture: IcsEvent = {
  kind: 'timed',
  uid: 'CS-2102-A01@wpiplanner',
  summary: 'CS2102 Lecture (A01)',
  location: 'SL 104',
  start: { date: '2026-08-21', minutesSinceMidnight: 9 * 60 },
  end: { date: '2026-08-21', minutesSinceMidnight: 9 * 60 + 50 },
  recurrence: {
    weekdays: [1, 3, 5],
    lastDay: '2026-10-09',
    excludedDates: ['2026-09-07'],
  },
};

function lines(events: IcsEvent[]): string[] {
  return buildIcsCalendar(events, OPTIONS).split('\r\n');
}

describe('escapeIcsText', () => {
  it('escapes the four characters RFC 5545 reserves in TEXT values', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
});

describe('foldIcsLine', () => {
  it('leaves a short line alone', () => {
    expect(foldIcsLine('SUMMARY:CS2102')).toBe('SUMMARY:CS2102');
  });

  it('folds a long line with a leading space on the continuation', () => {
    const folded = foldIcsLine(`DESCRIPTION:${'x'.repeat(200)}`);
    expect(folded).toContain('\r\n ');
    for (const piece of folded.split('\r\n')) expect(piece.length).toBeLessThanOrEqual(75);
  });

  it('never splits a multi-byte character', () => {
    const folded = foldIcsLine(`DESCRIPTION:${'—'.repeat(80)}`);
    expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'—'.repeat(80)}`);
  });
});

describe('buildIcsCalendar', () => {
  it('wraps events in a VCALENDAR carrying the zone rules', () => {
    const file = lines([lecture]);
    expect(file[0]).toBe('BEGIN:VCALENDAR');
    expect(file).toContain('TZID:America/New_York');
    expect(file.at(-2)).toBe('END:VCALENDAR');
  });

  it('writes local start and end times against the TZID', () => {
    expect(lines([lecture])).toContain('DTSTART;TZID=America/New_York:20260821T090000');
    expect(lines([lecture])).toContain('DTEND;TZID=America/New_York:20260821T095000');
  });

  it('ends the weekly rule at a UTC instant past the last meeting', () => {
    // The VTIMEZONE block carries RRULEs of its own, so match the weekly one.
    const until = lines([lecture]).find((line) => line.startsWith('RRULE:FREQ=WEEKLY'));
    // 23:59 on Oct 9 2026 in EDT is 03:59Z on Oct 10.
    expect(until).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261010T035900Z');
  });

  it('excludes a cancelled meeting at the same wall-clock time as the series', () => {
    expect(lines([lecture])).toContain('EXDATE;TZID=America/New_York:20260907T090000');
  });

  it('omits VALARM unless a reminder was asked for', () => {
    expect(lines([lecture])).not.toContain('BEGIN:VALARM');
    expect(lines([{ ...lecture, reminderMinutesBefore: 10 }])).toContain('TRIGGER:-PT10M');
  });

  it('ends an all-day event on the day after its last day, because DTEND is exclusive', () => {
    const file = lines([
      {
        kind: 'allDay',
        uid: 'break@wpiplanner',
        summary: 'Thanksgiving holiday; No Classes',
        firstDay: '2026-11-25',
        lastDay: '2026-11-27',
      },
    ]);
    expect(file).toContain('DTSTART;VALUE=DATE:20261125');
    expect(file).toContain('DTEND;VALUE=DATE:20261128');
    expect(file).toContain('TRANSP:TRANSPARENT');
  });

  it('escapes a summary that contains a comma', () => {
    const file = lines([{ ...lecture, summary: 'CS2102 Lecture, Lab' }]);
    expect(file).toContain('SUMMARY:CS2102 Lecture\\, Lab');
  });
});
