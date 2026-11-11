/**
 * Groups the Schedules rail's courses by the term(s) they occupy in the
 * schedule on screen, so the rail reads like the calendar: the A-Term courses
 * under an "A-Term" divider, then B, and so on.
 *
 * A course's place comes from its *scheduled* section, not from the terms it
 * is offered in — a course offered in A and C sits under whichever one the
 * schedule picked. Courses the schedule leaves out (all sections off, or no
 * schedule at all) go in a final "Not on schedule" group.
 */
import type { Catalog } from './catalog.ts';
import type { TermName } from './schedb.ts';
import { formatTermSpanLabel, TERM_NAMES, termSpanSortKey } from './terms.ts';

export interface CourseTermGroup {
  /** Stable across regroupings: the term letters ("AB"), or "off" for the last group. */
  key: string;
  label: string;
  /** False only for the trailing "Not on schedule" group. */
  onSchedule: boolean;
  /** In the order the courses were chosen. */
  courseIds: string[];
}

export const OFF_SCHEDULE_KEY = 'off';
export const OFF_SCHEDULE_LABEL = 'Not on schedule';

/** The calendar-ordered terms each course meets in, read from its scheduled sections. */
function scheduledTermsByCourse(catalog: Catalog, scheduledSectionIds: readonly string[]): Map<string, TermName[]> {
  const found = new Map<string, Set<TermName>>();
  for (const sectionId of scheduledSectionIds) {
    const courseId = catalog.getCourseIdOfSection(sectionId);
    const section = catalog.getSection(sectionId);
    // A schedule held over from before a catalog refresh can name a section that no longer exists.
    if (courseId === undefined || section === undefined) continue;
    const terms = found.get(courseId) ?? new Set<TermName>();
    for (const term of section.terms) terms.add(term);
    found.set(courseId, terms);
  }
  return new Map(
    [...found].map(([courseId, terms]) => [courseId, TERM_NAMES.filter((term) => terms.has(term))]),
  );
}

/**
 * Split the chosen courses into term groups for the rail.
 *
 * @param catalog Resolves each scheduled section to its course and terms
 * @param courseIds The chosen courses, in the order they should be listed within a group
 * @param scheduledSectionIds Sections of the schedule on screen; empty when there is none
 * @returns On-schedule groups in calendar order, then the off-schedule group if any
 *   course is not on the schedule. Empty groups are left out.
 */
export function groupCoursesByScheduledTerm(
  catalog: Catalog,
  courseIds: readonly string[],
  scheduledSectionIds: readonly string[],
): CourseTermGroup[] {
  const termsByCourse = scheduledTermsByCourse(catalog, scheduledSectionIds);
  const groups = new Map<string, CourseTermGroup & { terms: TermName[] }>();
  const offSchedule: string[] = [];

  for (const courseId of courseIds) {
    const terms = termsByCourse.get(courseId);
    if (terms === undefined) {
      offSchedule.push(courseId);
      continue;
    }
    const key = terms.join('') || 'tba';
    let group = groups.get(key);
    if (group === undefined) {
      // "Currently in", so the divider is not read as the only term the course is offered in.
      const label = `Currently In ${formatTermSpanLabel(terms)}:`;
      group = { key, label, onSchedule: true, courseIds: [], terms };
      groups.set(key, group);
    }
    group.courseIds.push(courseId);
  }

  const ordered: CourseTermGroup[] = [...groups.values()]
    .sort((a, b) => termSpanSortKey(a.terms) - termSpanSortKey(b.terms))
    .map(({ key, label, onSchedule, courseIds: ids }) => ({ key, label, onSchedule, courseIds: ids }));

  if (offSchedule.length > 0) {
    ordered.push({ key: OFF_SCHEDULE_KEY, label: OFF_SCHEDULE_LABEL, onSchedule: false, courseIds: offSchedule });
  }
  return ordered;
}
