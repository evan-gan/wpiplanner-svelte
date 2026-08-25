/**
 * The mapping from a schedule to calendar events, against the real academic
 * calendar — the exception handling is only interesting on real dates.
 *
 * `MINI_CATALOG` gives CS|2102|A01 as an A-Term Mon/Wed/Fri 9:00 lecture and
 * PH|1110|A01 as a Tue/Thu lecture spanning A and B Terms.
 */
import { describe, expect, it } from 'vitest';
import { Catalog } from '$lib/model/catalog';
import { ACADEMIC_CALENDAR } from '$lib/config/academicCalendar';
import {
  buildScheduleEvents,
  buildScheduleIcs,
  scheduleIcsFilename,
  type ScheduleExportOptions,
} from '$lib/calendar/scheduleExport';
import type { IcsEvent, TimedIcsEvent } from '$lib/calendar/ics';
import { MINI_CATALOG } from '../fixtures/miniCatalog';

const catalog = new Catalog(MINI_CATALOG);

const BARE: ScheduleExportOptions = {
  includeAcademicCalendar: false,
  reminderMinutesBefore: null,
  now: new Date('2026-08-01T00:00:00Z'),
};

function exportEvents(sectionIds: string[], overrides: Partial<ScheduleExportOptions> = {}) {
  return buildScheduleEvents(catalog, sectionIds, ACADEMIC_CALENDAR, { ...BARE, ...overrides });
}

function timed(events: IcsEvent[]): TimedIcsEvent[] {
  return events.filter((event): event is TimedIcsEvent => event.kind === 'timed');
}

describe('class meetings', () => {
  it('starts the weekly rule on the first day the section actually meets', () => {
    const [series] = timed(exportEvents(['CS|2102|A01']));
    // A-Term opens Thursday Aug 20; the first Mon/Wed/Fri meeting is the 21st.
    expect(series.start.date).toBe('2026-08-21');
    expect(series.recurrence?.weekdays).toEqual([1, 3, 5]);
    expect(series.recurrence?.lastDay).toBe('2026-10-09');
  });

  it('carries the meeting time, location and course into the event', () => {
    const [series] = timed(exportEvents(['CS|2102|A01']));
    expect(series.summary).toBe('CS2102 Lecture (A01)');
    expect(series.start.minutesSinceMidnight).toBe(9 * 60);
    expect(series.end.minutesSinceMidnight).toBe(9 * 60 + 50);
    expect(series.location).toBe('SL 104');
    expect(series.description).toContain('Object-Oriented Design Concepts');
  });

  it('emits one series per term for a section spanning two terms', () => {
    const series = timed(exportEvents(['PH|1110|A01']));
    expect(series.map((event) => event.recurrence?.lastDay)).toEqual([
      '2026-10-09',
      '2026-12-11',
    ]);
  });

  it('gives every event a distinct uid', () => {
    const uids = exportEvents(['CS|2102|A01', 'PH|1110|A01'], {
      includeAcademicCalendar: true,
    }).map((event) => event.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('skips a section the catalog does not have', () => {
    expect(exportEvents(['XX|0000|A01'])).toEqual([]);
  });
});

describe('no-class days', () => {
  it('drops Labor Day and the A-Term Wellness Day from a Mon/Wed/Fri lecture', () => {
    const [series] = timed(exportEvents(['CS|2102|A01']));
    expect(series.recurrence?.excludedDates).toContain('2026-09-07'); // Labor Day, a Monday
    expect(series.recurrence?.excludedDates).toContain('2026-09-25'); // Wellness Day, a Friday
  });

  it('drops the Thanksgiving days a Tue/Thu lecture would have met on', () => {
    const bTerm = timed(exportEvents(['PH|1110|A01']))[1];
    expect(bTerm.recurrence?.excludedDates).toContain('2026-11-26'); // Thursday
    expect(bTerm.recurrence?.excludedDates).not.toContain('2026-11-25'); // Wednesday: never met
  });

  it('leaves days the section does not meet on out of the exclusion list', () => {
    const [series] = timed(exportEvents(['CS|2102|A01']));
    // Nov 3 is a B-Term Tuesday — wrong term and wrong weekday.
    expect(series.recurrence?.excludedDates).not.toContain('2026-11-03');
  });
});

describe('days that follow another weekday', () => {
  it('adds a one-off meeting when Thursday Sept 10 runs the Monday schedule', () => {
    const meetings = timed(exportEvents(['CS|2102|A01']));
    const makeUp = meetings.filter((event) => event.recurrence === undefined);
    expect(makeUp.map((event) => event.start.date)).toEqual(['2026-09-10']);
    expect(makeUp[0].start.minutesSinceMidnight).toBe(9 * 60);
  });

  it('cancels that Thursday for a section that meets Thursdays but not Mondays', () => {
    const [aTerm] = timed(exportEvents(['PH|1110|A01']));
    expect(aTerm.recurrence?.excludedDates).toContain('2026-09-10');
    expect(timed(exportEvents(['PH|1110|A01'])).some((e) => e.start.date === '2026-09-10')).toBe(
      false,
    );
  });
});

describe('academic calendar events', () => {
  it('is left out unless asked for', () => {
    expect(exportEvents(['CS|2102|A01']).some((event) => event.kind === 'allDay')).toBe(false);
  });

  it('adds holidays and breaks as all-day entries', () => {
    const allDay = exportEvents(['CS|2102|A01'], { includeAcademicCalendar: true }).filter(
      (event) => event.kind === 'allDay',
    );
    expect(allDay.map((event) => event.summary)).toContain('Labor Day; No Classes');
  });

  it('scopes them to the terms the schedule covers', () => {
    const summaries = exportEvents(['CS|2102|A01'], { includeAcademicCalendar: true })
      .filter((event) => event.kind === 'allDay')
      .map((event) => event.summary);
    // An A-Term-only schedule must not carry spring's advising day.
    expect(summaries).not.toContain('Academic Advising Day; No Classes');
  });
});

describe('buildScheduleIcs', () => {
  it('produces a parseable file with one VEVENT per event', () => {
    const file = buildScheduleIcs(catalog, ['CS|2102|A01'], ACADEMIC_CALENDAR, BARE);
    expect(file.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(file.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(file.match(/BEGIN:VEVENT/g)?.length).toBe(exportEvents(['CS|2102|A01']).length);
  });
});

describe('scheduleIcsFilename', () => {
  it('names the file after the academic year', () => {
    expect(scheduleIcsFilename(ACADEMIC_CALENDAR)).toBe('wpi-schedule-2026-2027.ics');
  });
});
