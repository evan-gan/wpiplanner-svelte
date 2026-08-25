/**
 * The WPI academic calendar, by hand.
 *
 * None of this is in the Workday export: the `.schedb` says a section meets
 * "9:00AM mon,wed,fri in A Term" and nothing about when A Term runs, so the
 * calendar export has no way to turn a weekly pattern into real dates without
 * it. Everything here is transcribed from the Registrar's published calendar
 * and has to be re-transcribed once a year — see the checklist at the bottom.
 *
 * Source: https://www.wpi.edu/academics/calendar
 */
import type { DayShortName, TermName } from '$lib/model/schedb';

/** Calendar dates are plain `YYYY-MM-DD` — no clock, no zone. */
export type IsoDate = string;

export interface TermDates {
  term: TermName;
  /** First day classes meet, inclusive. */
  firstDay: IsoDate;
  /** Last day classes meet, inclusive. */
  lastDay: IsoDate;
}

/**
 * A single day that does not run its ordinary weekly schedule.
 *
 * `followsDay` is the wrinkle: WPI replaces a lost weekday by running its
 * schedule on some other date ("Follow Monday schedule"). On such a day the
 * date's own weekday does not meet and `followsDay`'s classes meet instead.
 * `null` means no classes at all.
 */
export interface ClassDayException {
  date: IsoDate;
  /** Shown as the all-day event title, e.g. "Labor Day; No Classes". */
  reason: string;
  followsDay: DayShortName | null;
}

/** A multi-day stretch with no classes, exported as one all-day event. */
export interface AcademicBreak {
  name: string;
  firstDay: IsoDate;
  /** Last day of the break, inclusive. */
  lastDay: IsoDate;
}

export interface AcademicCalendar {
  /** Matches the first line of `static/yearHeader.txt`. */
  academicYear: string;
  /** IANA zone every class meeting is expressed in. */
  timeZoneId: string;
  terms: readonly TermDates[];
  exceptions: readonly ClassDayException[];
  breaks: readonly AcademicBreak[];
}

/**
 * 2026–2027. Add/drop, withdrawal and grade deadlines are deliberately left
 * out: they are not class meetings and would bury the schedule in noise.
 */
export const ACADEMIC_CALENDAR: AcademicCalendar = {
  academicYear: '2026 - 2027 Academic Year',
  timeZoneId: 'America/New_York',

  terms: [
    { term: 'A', firstDay: '2026-08-20', lastDay: '2026-10-09' },
    { term: 'B', firstDay: '2026-10-19', lastDay: '2026-12-11' },
    { term: 'C', firstDay: '2027-01-13', lastDay: '2027-03-05' },
    { term: 'D', firstDay: '2027-03-15', lastDay: '2027-05-05' },
  ],

  exceptions: [
    // Fall
    { date: '2026-09-07', reason: 'Labor Day; No Classes', followsDay: null },
    { date: '2026-09-10', reason: 'Follow Monday schedule', followsDay: 'mon' },
    { date: '2026-09-25', reason: 'Wellness Day; No Classes', followsDay: null },
    { date: '2026-11-03', reason: 'Wellness Day; No Classes', followsDay: null },
    { date: '2026-12-07', reason: 'Reading Day/Make-up Day', followsDay: null },

    // Spring
    { date: '2027-01-13', reason: 'First day of C-Term; Follow Monday schedule', followsDay: 'mon' },
    { date: '2027-01-18', reason: 'Martin Luther King, Jr. Day; No Classes', followsDay: null },
    { date: '2027-02-12', reason: 'Wellness Day; No Classes', followsDay: null },
    { date: '2027-02-25', reason: 'Academic Advising Day; No Classes', followsDay: null },
    { date: '2027-03-29', reason: 'Wellness Day; No Classes', followsDay: null },
    { date: '2027-03-30', reason: 'Follow Monday schedule', followsDay: 'mon' },
    { date: '2027-04-16', reason: 'Undergraduate Research Projects Showcase; No Classes', followsDay: null },
    { date: '2027-04-19', reason: "Patriot's Day; No Classes", followsDay: null },
    { date: '2027-05-05', reason: 'Last day of D-Term; Follow Friday schedule', followsDay: 'fri' },
  ],

  // Breaks inside a term cancel the classes they cover; the ones between terms
  // fall outside every term range, so they are informational only.
  breaks: [
    { name: 'Thanksgiving holiday; No Classes', firstDay: '2026-11-25', lastDay: '2026-11-27' },
    { name: 'A/B-Term break', firstDay: '2026-10-10', lastDay: '2026-10-18' },
    { name: 'Winter break', firstDay: '2026-12-12', lastDay: '2027-01-12' },
    { name: 'C/D-Term break', firstDay: '2027-03-06', lastDay: '2027-03-14' },
  ],
};

/**
 * Rolling the calendar over to a new academic year:
 *
 * 1. Replace `academicYear`, the four term ranges, every exception and every
 *    break above from the Registrar's calendar.
 * 2. Keep only entries that change what days classes meet — a "Follow X
 *    schedule" day needs `followsDay`, everything else is `null`.
 * 3. `pnpm test` — `tests/calendar/academicCalendar.test.ts` checks the ranges
 *    are ordered, non-overlapping, and that every exception lands inside a term.
 */
