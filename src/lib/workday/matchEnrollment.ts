/**
 * Resolves enrolled courses from a Workday export to catalog section ids.
 *
 * The two sides label sections differently. Workday names one meeting at a time
 * — `AL01` for the lecture, `AX01` for its lab — while the catalog stores the
 * combination a student actually registers for as a single section whose number
 * joins the parts, `AL01/AX01`. Matching therefore compares *sets* of labels:
 * a catalog section matches when its periods carry exactly the labels Workday
 * listed for that course.
 *
 * Nothing here touches app state. The result is a plan the caller may show the
 * student before anything is applied.
 */
import type { Catalog } from '$lib/model/catalog';
import type { SectionJson } from '$lib/model/schedb';
import type { EnrolledCourse } from './enrollment';

/** An enrolled course that resolved to exactly one catalog section. */
export interface MatchedCourse {
  enrolled: EnrolledCourse;
  courseId: string;
  sectionId: string;
  /** The catalog's label for the section, e.g. `AL01/AX01`. */
  sectionNumber: string;
  /**
   * True when Workday listed only some of the section's meetings and the match
   * was still unambiguous. Worth showing, because it is the shakier match.
   */
  partial: boolean;
}

/** An enrolled course that could not be resolved, and why. */
export interface UnmatchedCourse {
  enrolled: EnrolledCourse;
  reason: string;
}

export interface EnrollmentMatch {
  matched: MatchedCourse[];
  unmatched: UnmatchedCourse[];
}

/**
 * Resolve every enrolled course against the catalog.
 *
 * @param enrolledCourses Courses grouped by `parseEnrolledCourses`
 * @param catalog The loaded course catalog
 * @returns The courses that resolved to a section, and those that did not
 */
export function matchEnrollment(
  enrolledCourses: readonly EnrolledCourse[],
  catalog: Catalog,
): EnrollmentMatch {
  const matched: MatchedCourse[] = [];
  const unmatched: UnmatchedCourse[] = [];

  for (const enrolled of enrolledCourses) {
    const result = matchOne(enrolled, catalog);
    if ('reason' in result) unmatched.push(result);
    else matched.push(result);
  }

  return { matched, unmatched };
}

function matchOne(enrolled: EnrolledCourse, catalog: Catalog): MatchedCourse | UnmatchedCourse {
  const courseId = `${enrolled.deptAbbrev}|${enrolled.courseNumber}`;
  const course = catalog.getCourse(courseId);

  if (course === undefined) {
    return {
      enrolled,
      reason: `${describe(enrolled)} is not in the current catalog — it may be from a different academic year.`,
    };
  }

  const wantedLabels = new Set(enrolled.sectionNumbers);
  const exact = course.sections.filter((section) => coversExactly(section, wantedLabels));
  if (exact.length === 1) return toMatch(enrolled, courseId, exact[0], false);

  if (exact.length > 1) {
    return { enrolled, reason: ambiguityReason(enrolled, exact) };
  }

  // Workday sometimes omits a meeting row; a section that contains every listed
  // label is still the right answer as long as only one section does.
  const supersets = course.sections.filter((section) => coversAll(section, wantedLabels));
  if (supersets.length === 1) return toMatch(enrolled, courseId, supersets[0], true);

  if (supersets.length > 1) {
    return { enrolled, reason: ambiguityReason(enrolled, supersets) };
  }

  return {
    enrolled,
    reason:
      `${describe(enrolled)} has no section ${[...wantedLabels].join('/')} in the current catalog. ` +
      `The catalog offers: ${course.sections.map((section) => section.number).join(', ')}.`,
  };
}

function toMatch(
  enrolled: EnrolledCourse,
  courseId: string,
  section: SectionJson,
  partial: boolean,
): MatchedCourse {
  return { enrolled, courseId, sectionId: section.id, sectionNumber: section.number, partial };
}

function coversExactly(section: SectionJson, wantedLabels: ReadonlySet<string>): boolean {
  const labels = labelsOf(section);
  return labels.size === wantedLabels.size && covers(labels, wantedLabels);
}

function coversAll(section: SectionJson, wantedLabels: ReadonlySet<string>): boolean {
  return covers(labelsOf(section), wantedLabels);
}

function covers(labels: ReadonlySet<string>, wantedLabels: ReadonlySet<string>): boolean {
  for (const wanted of wantedLabels) if (!labels.has(wanted)) return false;
  return true;
}

/**
 * The section labels a catalog section is made of.
 *
 * Each period repeats its own label, which is the authoritative list. Sections
 * whose periods carry no label — the "Interest List" placeholders do not — fall
 * back to splitting the section number, which is those labels joined.
 */
function labelsOf(section: SectionJson): Set<string> {
  const fromPeriods = section.periods
    .map((period) => period.sectionNumber.trim().toUpperCase())
    .filter((label) => label !== '');

  if (fromPeriods.length > 0) return new Set(fromPeriods);

  return new Set(
    section.number
      .split('/')
      .map((label) => label.trim().toUpperCase())
      .filter((label) => label !== ''),
  );
}

function ambiguityReason(enrolled: EnrolledCourse, candidates: readonly SectionJson[]): string {
  return (
    `${describe(enrolled)} section ${enrolled.sectionNumbers.join('/')} matches more than one ` +
    `catalog section (${candidates.map((section) => section.number).join(', ')}), so it was left out. ` +
    `Pick the right one by hand.`
  );
}

function describe(enrolled: EnrolledCourse): string {
  return `${enrolled.deptAbbrev} ${enrolled.courseNumber}`;
}
