/**
 * Which sections cannot be taken together.
 *
 * The legacy `ConflictController` built this map incrementally on a 10ms GWT
 * `Timer`, one section per tick, with a `sectionQueue.remove(0)` that had no
 * empty check — re-arming the timer on `addCourse` could pop an empty queue.
 * The index is small enough to build in one pass (5,565 sections would be, and a
 * student's 18 courses certainly are), and it is built inside the worker.
 */
import { daysOverlap } from '$lib/model/days';
import { shareAnyTerm } from '$lib/model/terms';
import type { CourseSectionLists, GeneratorPeriod, GeneratorSection } from './types';

/**
 * Whether two periods share a day and overlap in time.
 *
 * The time comparison is the legacy one, bounds included: a period ending at
 * 10:00 conflicts with one starting at 10:00.
 */
function periodsConflict(period: GeneratorPeriod, other: GeneratorPeriod): boolean {
  if (!daysOverlap(period.days, other.days)) return false;

  return (
    (other.startMinutes >= period.startMinutes && other.startMinutes <= period.endMinutes) ||
    (other.endMinutes >= period.startMinutes && other.endMinutes <= period.endMinutes) ||
    (other.startMinutes <= period.startMinutes && other.endMinutes >= period.endMinutes)
  );
}

/**
 * Whether two sections cannot both be attended.
 *
 * Sections with no term in common are never in session at the same time of year,
 * so their meeting times are irrelevant — this check comes first because it
 * rejects most pairs outright.
 */
export function sectionsConflict(section: GeneratorSection, other: GeneratorSection): boolean {
  if (!shareAnyTerm(section.terms, other.terms)) return false;

  for (const period of section.periods) {
    for (const otherPeriod of other.periods) {
      if (periodsConflict(period, otherPeriod)) return true;
    }
  }
  return false;
}

/**
 * Precomputed pairwise conflicts across every section of the chosen courses.
 *
 * Sections of the *same* course are never recorded as conflicting: a schedule
 * only ever contains one of them, and the section-details dialog lists this map
 * as "other classes you could not also take".
 */
export class ConflictIndex {
  private readonly conflictsBySectionId = new Map<string, string[]>();

  constructor(courses: CourseSectionLists) {
    const allSections = courses.flat();

    for (const section of allSections) {
      this.conflictsBySectionId.set(section.id, []);
    }

    for (let i = 0; i < allSections.length; i++) {
      for (let j = i + 1; j < allSections.length; j++) {
        const a = allSections[i];
        const b = allSections[j];

        if (a.courseId === b.courseId) continue;
        if (!sectionsConflict(a, b)) continue;

        this.conflictsBySectionId.get(a.id)!.push(b.id);
        this.conflictsBySectionId.get(b.id)!.push(a.id);
      }
    }
  }

  hasConflict(sectionId: string, otherSectionId: string): boolean {
    return this.conflictsBySectionId.get(sectionId)?.includes(otherSectionId) ?? false;
  }

  /** Ids of every section that collides with this one. Empty if unknown. */
  getConflicts(sectionId: string): readonly string[] {
    return this.conflictsBySectionId.get(sectionId) ?? [];
  }
}
