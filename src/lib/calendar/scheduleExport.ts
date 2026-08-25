/**
 * Turn a generated schedule into iCalendar events.
 *
 * The interesting part is the academic calendar, not the serialisation. A
 * section says "Lecture, mon,wed,fri, 9:00AM, A Term"; a calendar client wants
 * a first date, a weekly rule, an end date, and the list of dates the rule is
 * wrong about. WPI produces two kinds of "wrong":
 *
 * - Days with no classes — holidays, Wellness Days, Thanksgiving. Those become
 *   EXDATEs on every meeting that would have fallen there.
 * - Days that run *another* weekday's schedule. Sept 10 2026 is a Thursday
 *   running Monday's classes, so Thursday meetings are dropped and Monday
 *   meetings gain a one-off event on that date. A period meeting both Monday
 *   and Thursday simply keeps its Thursday occurrence, which is the same thing.
 *
 * Everything that can share one recurring event does, because a student who
 * wants to rename a course or move a reminder should have one event to edit
 * rather than ten. Catalog periods that differ only in which days they list are
 * merged into a single multi-day rule, and back-to-back terms (A/B, C/D) become
 * one series running from the first term's start to the last term's end, with
 * the recess between them excluded.
 */
import type {
  AcademicCalendar,
  ClassDayException,
  IsoDate,
  TermDates,
} from '$lib/config/academicCalendar';
import type { Catalog } from '$lib/model/catalog';
import { DAY_BITS, type PeriodJson, type SectionJson, type TermName } from '$lib/model/schedb';
import { maskHasDay } from '$lib/model/days';
import { datesInRange, isoDateWeekday, rangesOverlap } from './dates';
import { buildIcsCalendar, type AllDayIcsEvent, type IcsEvent, type TimedIcsEvent } from './ics';

export interface ScheduleExportOptions {
  /** Add no-class days and breaks as all-day events. */
  includeAcademicCalendar: boolean;
  /** Minutes before each class meeting to alert; null for no reminders. */
  reminderMinutesBefore: number | null;
  /** Fixed DTSTAMP, so a test can compare whole files. */
  now?: Date;
}

/** Where one term's dates and its exceptions are already resolved together. */
interface TermPlan {
  term: TermName;
  /** Position in the academic calendar's term list; adjacent terms differ by 1. */
  calendarIndex: number;
  dates: TermDates;
  /** Every date in the term that does not run its own weekday's schedule. */
  exceptionsByDate: ReadonlyMap<IsoDate, ClassDayException>;
}

interface MeetingPlan {
  /** First date the meeting actually happens, or null if it never does. */
  firstMeetingDay: IsoDate | null;
  weekdays: number[];
  excludedDates: IsoDate[];
  /** Dates the meeting happens only because that day follows another weekday. */
  extraDates: IsoDate[];
}

/**
 * Catalog periods that describe the same meeting, with their day masks merged.
 *
 * Workday sometimes splits one meeting pattern across several period rows — the
 * same course, professor, room and time listed once for Wednesday and once for
 * Thursday/Friday. Those are one weekly event to a student, so they are exported
 * as one.
 */
interface MeetingPattern {
  /** Index of the group's first catalog period; keeps UIDs stable. */
  periodIndex: number;
  /** Representative period: every field except `days` is shared by the group. */
  period: PeriodJson;
  /** Union of the group's day masks. */
  days: number;
}

/** ICS ids must be printable and stable; section ids contain `|` and `/`. */
function toUidSlug(text: string): string {
  return text.replace(/[^A-Za-z0-9]+/g, '-');
}

/**
 * Index every date in the calendar that overrides the ordinary weekly schedule.
 *
 * Break days join the exception list as plain no-class days, so a multi-day
 * break and a one-day holiday cancel classes through the same path.
 */
function buildExceptionIndex(calendar: AcademicCalendar): Map<IsoDate, ClassDayException> {
  const byDate = new Map<IsoDate, ClassDayException>();

  for (const academicBreak of calendar.breaks) {
    for (const date of datesInRange(academicBreak.firstDay, academicBreak.lastDay)) {
      byDate.set(date, { date, reason: academicBreak.name, followsDay: null });
    }
  }

  // Explicit exceptions win: a "Follow Monday schedule" day must not be buried
  // by a break that happens to be listed over the same date.
  for (const exception of calendar.exceptions) {
    byDate.set(exception.date, exception);
  }

  return byDate;
}

/** The days a mask covers, as Sunday-based indexes. */
function weekdaysInMask(days: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((weekday) => maskHasDay(days, weekday));
}

/** Everything but the day mask, so two periods can be tested for sameness. */
function meetingIdentity(period: PeriodJson): string {
  return [
    period.type,
    period.professor,
    period.startMinutes,
    period.endMinutes,
    period.location,
    period.sectionNumber,
  ].join('\u0000');
}

/** A section's periods, collapsed to one entry per distinct meeting. */
function meetingPatterns(section: SectionJson): MeetingPattern[] {
  const byIdentity = new Map<string, MeetingPattern>();

  section.periods.forEach((period, index) => {
    // Days listed as "?" give no rule to recur on, so there is nothing to export.
    if (period.days === 0) return;

    const identity = meetingIdentity(period);
    const existing = byIdentity.get(identity);
    if (existing === undefined) {
      byIdentity.set(identity, {
        periodIndex: index,
        period,
        days: period.days,
      });
    } else {
      existing.days |= period.days;
    }
  });

  return [...byIdentity.values()];
}

/**
 * Split a section's terms into runs of terms that sit next to each other.
 *
 * A run is exported as a single series. Non-adjacent terms stay apart: an A/C
 * section merged into one rule would spend all of B Term as excluded dates,
 * which is both a larger file and a worse thing to look at in a calendar client.
 *
 * @param plans The section's terms, in calendar order
 * @returns Groups of consecutive terms, each in calendar order
 */
function consecutiveTermRuns(plans: readonly TermPlan[]): TermPlan[][] {
  const runs: TermPlan[][] = [];

  for (const plan of plans) {
    const current = runs[runs.length - 1];
    const previous = current?.[current.length - 1];
    if (previous !== undefined && plan.calendarIndex === previous.calendarIndex + 1) {
      current.push(plan);
    } else {
      runs.push([plan]);
    }
  }

  return runs;
}

/**
 * Work out when a meeting actually happens across a run of terms.
 *
 * Dates in the recess between two terms of the run are treated exactly like a
 * holiday: the weekly rule would fire there, so they are excluded.
 *
 * @param days Merged day mask for the meeting
 * @param run One or more consecutive terms, in calendar order
 * @returns The weekly rule plus the dates that rule gets wrong
 */
function planMeetings(days: number, run: readonly TermPlan[]): MeetingPlan {
  const meetings: MeetingPlan = {
    firstMeetingDay: null,
    weekdays: weekdaysInMask(days),
    excludedDates: [],
    extraDates: [],
  };

  const spanFirstDay = run[0].dates.firstDay;
  const spanLastDay = run[run.length - 1].dates.lastDay;

  for (const date of datesInRange(spanFirstDay, spanLastDay)) {
    const term = run.find((plan) => date >= plan.dates.firstDay && date <= plan.dates.lastDay);
    const exception = term?.exceptionsByDate.get(date);
    const meetsNaturally = maskHasDay(days, isoDateWeekday(date));
    let meetsInFact: boolean;

    if (term === undefined) {
      meetsInFact = false; // Between two terms of the run — nothing meets.
    } else if (exception === undefined) {
      meetsInFact = meetsNaturally;
    } else {
      meetsInFact = exception.followsDay !== null && (days & DAY_BITS[exception.followsDay]) !== 0;
    }

    // The series starts on a day it really meets: a rule whose first occurrence
    // is immediately excluded shows up as a ghost meeting in some clients. Days
    // before that start are simply not part of the rule, so they need no EXDATE.
    if (meetsNaturally && meetsInFact && meetings.firstMeetingDay === null) {
      meetings.firstMeetingDay = date;
    }
    if (meetsNaturally && !meetsInFact && meetings.firstMeetingDay !== null) {
      meetings.excludedDates.push(date);
    }
    if (!meetsNaturally && meetsInFact) meetings.extraDates.push(date);
  }

  return meetings;
}

/** "CS2102 Lecture (A01)" — what the student sees in the month view. */
function meetingSummary(catalog: Catalog, courseId: string, period: PeriodJson): string {
  const label = period.type.trim() || 'Class';
  return `${catalog.courseAbbrev(courseId)} ${label} (${period.sectionNumber})`;
}

function meetingDescription(
  catalog: Catalog,
  courseId: string,
  section: SectionJson,
  period: PeriodJson,
): string {
  const lines = [catalog.courseTitle(courseId), `Section ${section.number} — ${section.termLabel}`];
  if (period.type.trim()) lines.push(`Type: ${period.type}`);
  if (period.professor.trim()) lines.push(`Professor: ${period.professor}`);
  if (period.location.trim()) lines.push(`Location: ${period.location}`);
  // The Workday feed stopped publishing CRNs; older catalogs still carry them.
  if (section.crn.trim()) lines.push(`CRN ${section.crn}`);
  return lines.join('\n');
}

/**
 * One recurring meeting, plus any one-off make-up meetings, for a run of terms.
 *
 * @param pattern The merged meeting to export
 * @param run Consecutive terms the section runs in, in calendar order
 * @returns The series and its make-ups; empty when the meeting never happens on
 *   its own weekdays inside the run
 */
function meetingEvents(
  catalog: Catalog,
  section: SectionJson,
  pattern: MeetingPattern,
  run: readonly TermPlan[],
  options: ScheduleExportOptions,
): TimedIcsEvent[] {
  const courseId = catalog.getCourseIdOfSection(section.id);
  if (courseId === undefined) return [];

  const { period } = pattern;
  const meetings = planMeetings(pattern.days, run);
  const terms = run.map((plan) => plan.term).join('');
  const uidBase = `${toUidSlug(section.id)}-p${pattern.periodIndex}-${terms}`;
  const shared = {
    kind: 'timed' as const,
    summary: meetingSummary(catalog, courseId, period),
    description: meetingDescription(catalog, courseId, section, period),
    location: period.location,
    reminderMinutesBefore: options.reminderMinutesBefore,
  };
  const timesOn = (date: IsoDate) => ({
    start: { date, minutesSinceMidnight: period.startMinutes },
    end: { date, minutesSinceMidnight: period.endMinutes },
  });

  const events: TimedIcsEvent[] = [];

  if (meetings.firstMeetingDay !== null) {
    events.push({
      ...shared,
      ...timesOn(meetings.firstMeetingDay),
      uid: `${uidBase}@wpiplanner`,
      recurrence: {
        weekdays: meetings.weekdays,
        lastDay: run[run.length - 1].dates.lastDay,
        excludedDates: meetings.excludedDates,
      },
    });
  }

  for (const date of meetings.extraDates) {
    events.push({
      ...shared,
      ...timesOn(date),
      uid: `${uidBase}-${date}@wpiplanner`,
    });
  }

  return events;
}

/**
 * All-day entries for the holidays and breaks that overlap the exported terms.
 *
 * Scoped to the terms the schedule actually covers so an A-term-only export
 * does not arrive carrying next spring's advising day.
 */
function academicCalendarEvents(
  calendar: AcademicCalendar,
  plans: readonly TermPlan[],
): AllDayIcsEvent[] {
  if (plans.length === 0) return [];

  // `calendar.terms` is in calendar order, and so is `plans`.
  const spanStart = plans[0].dates.firstDay;
  const spanEnd = plans[plans.length - 1].dates.lastDay;
  const overlapsSpan = (firstDay: IsoDate, lastDay: IsoDate) =>
    rangesOverlap(firstDay, lastDay, spanStart, spanEnd);

  const events: AllDayIcsEvent[] = [];

  for (const exception of calendar.exceptions) {
    if (!overlapsSpan(exception.date, exception.date)) continue;
    events.push({
      kind: 'allDay',
      uid: `wpi-${exception.date}@wpiplanner`,
      summary: exception.reason,
      firstDay: exception.date,
      lastDay: exception.date,
    });
  }

  for (const academicBreak of calendar.breaks) {
    if (!overlapsSpan(academicBreak.firstDay, academicBreak.lastDay)) continue;
    events.push({
      kind: 'allDay',
      uid: `wpi-break-${academicBreak.firstDay}@wpiplanner`,
      summary: academicBreak.name,
      firstDay: academicBreak.firstDay,
      lastDay: academicBreak.lastDay,
    });
  }

  return events;
}

/** Terms the given sections span, in calendar order, that the config knows. */
function plansForSchedule(
  catalog: Catalog,
  sectionIds: readonly string[],
  calendar: AcademicCalendar,
): TermPlan[] {
  const exceptionsByDate = buildExceptionIndex(calendar);
  const used = new Set<TermName>();

  for (const sectionId of sectionIds) {
    for (const term of catalog.getSection(sectionId)?.terms ?? []) used.add(term);
  }

  return calendar.terms
    .map((dates, calendarIndex) => ({
      term: dates.term,
      calendarIndex,
      dates,
      exceptionsByDate,
    }))
    .filter((plan) => used.has(plan.term));
}

/**
 * Every event for a schedule: class meetings, then the academic calendar.
 *
 * Exported separately from {@link buildScheduleIcs} so the UI can show a count
 * before the student downloads anything, and so tests can assert on structure
 * rather than on text.
 */
export function buildScheduleEvents(
  catalog: Catalog,
  sectionIds: readonly string[],
  calendar: AcademicCalendar,
  options: ScheduleExportOptions,
): IcsEvent[] {
  const plans = plansForSchedule(catalog, sectionIds, calendar);
  const events: IcsEvent[] = [];

  for (const sectionId of sectionIds) {
    const section = catalog.getSection(sectionId);
    if (section === undefined) continue;

    const sectionPlans = plans.filter((candidate) => section.terms.includes(candidate.term));
    for (const run of consecutiveTermRuns(sectionPlans)) {
      for (const pattern of meetingPatterns(section)) {
        events.push(...meetingEvents(catalog, section, pattern, run, options));
      }
    }
  }

  if (options.includeAcademicCalendar) events.push(...academicCalendarEvents(calendar, plans));

  return events;
}

/** The `.ics` file body for a schedule. */
export function buildScheduleIcs(
  catalog: Catalog,
  sectionIds: readonly string[],
  calendar: AcademicCalendar,
  options: ScheduleExportOptions,
): string {
  return buildIcsCalendar(buildScheduleEvents(catalog, sectionIds, calendar, options), {
    timeZoneId: calendar.timeZoneId,
    calendarName: `WPI Schedule — ${calendar.academicYear}`,
    now: options.now,
  });
}

/** Download filename, e.g. `wpi-schedule-2026-2027.ics`. */
export function scheduleIcsFilename(calendar: AcademicCalendar): string {
  const years = calendar.academicYear.match(/\d{4}/g) ?? [];
  return `wpi-schedule${years.length > 0 ? `-${years.join('-')}` : ''}.ics`;
}
