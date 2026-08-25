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
  dates: TermDates;
  /** Every date in the term that does not run its own weekday's schedule. */
  exceptionsByDate: ReadonlyMap<IsoDate, ClassDayException>;
}

interface MeetingPlan {
  /** First date the period meets on its own weekdays, or null if it never does. */
  firstNaturalDay: IsoDate | null;
  weekdays: number[];
  excludedDates: IsoDate[];
  /** Dates the period meets only because that day follows another weekday. */
  extraDates: IsoDate[];
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

/** The days a period meets, as Sunday-based indexes. */
function periodWeekdays(period: PeriodJson): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((weekday) => maskHasDay(period.days, weekday));
}

/**
 * Work out when a period actually meets across one term.
 *
 * @param period The meeting pattern from the catalog
 * @param plan The term's date range and its schedule exceptions
 * @returns The weekly rule plus the dates that rule gets wrong
 */
function planMeetings(period: PeriodJson, plan: TermPlan): MeetingPlan {
  const meetings: MeetingPlan = {
    firstNaturalDay: null,
    weekdays: periodWeekdays(period),
    excludedDates: [],
    extraDates: [],
  };

  for (const date of datesInRange(plan.dates.firstDay, plan.dates.lastDay)) {
    const exception = plan.exceptionsByDate.get(date);
    const meetsNaturally = maskHasDay(period.days, isoDateWeekday(date));
    const meetsInFact =
      exception === undefined
        ? meetsNaturally
        : exception.followsDay !== null && (period.days & DAY_BITS[exception.followsDay]) !== 0;

    if (meetsNaturally && meetings.firstNaturalDay === null) meetings.firstNaturalDay = date;
    if (meetsNaturally && !meetsInFact) meetings.excludedDates.push(date);
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

/** The recurring meeting plus any one-off make-up meetings, for one term. */
function periodEvents(
  catalog: Catalog,
  section: SectionJson,
  period: PeriodJson,
  periodIndex: number,
  plan: TermPlan,
  options: ScheduleExportOptions,
): TimedIcsEvent[] {
  const courseId = catalog.getCourseIdOfSection(section.id);
  if (courseId === undefined || period.days === 0) return [];

  const meetings = planMeetings(period, plan);
  const uidBase = `${toUidSlug(section.id)}-p${periodIndex}-${plan.term}`;
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

  if (meetings.firstNaturalDay !== null) {
    events.push({
      ...shared,
      ...timesOn(meetings.firstNaturalDay),
      uid: `${uidBase}@wpiplanner`,
      recurrence: {
        weekdays: meetings.weekdays,
        lastDay: plan.dates.lastDay,
        excludedDates: meetings.excludedDates,
      },
    });
  }

  for (const date of meetings.extraDates) {
    events.push({ ...shared, ...timesOn(date), uid: `${uidBase}-${date}@wpiplanner` });
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
    .filter((dates) => used.has(dates.term))
    .map((dates) => ({ term: dates.term, dates, exceptionsByDate }));
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

    for (const plan of plans.filter((candidate) => section.terms.includes(candidate.term))) {
      section.periods.forEach((period, index) => {
        events.push(...periodEvents(catalog, section, period, index, plan, options));
      });
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
