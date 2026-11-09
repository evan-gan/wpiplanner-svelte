/**
 * Course-background data → the short English the Courses tab shows.
 *
 * Kept apart from `courseBackground.ts` (the stored shape and its validator)
 * because this half only matters to the UI.
 */
import type { CourseBackgroundStatus, Requirement, ShippedBackgroundClause } from './courseBackground.ts';

/** `MA|2051` → `MA 2051`. */
export function formatCourseId(courseId: string): string {
  return courseId.replace('|', ' ');
}

/** "A", "A or B", "A, B, or C" — the serial comma keeps three-way choices unambiguous. */
function joinWords(items: string[], conjunction: 'and' | 'or'): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`;
}

function isGroup(requirement: Requirement): boolean {
  return requirement.kind === 'allOf' || requirement.kind === 'anyOf' || requirement.kind === 'countOf';
}

/** A child group inside a different kind of group gets parentheses, so "A and (B or C)" reads correctly. */
function describeChild(child: Requirement, parentKind: Requirement['kind']): string {
  const text = describeRequirement(child);
  return isGroup(child) && child.kind !== parentKind ? `(${text})` : text;
}

/**
 * A list of plain courses that each allow an equivalent reads better with the
 * phrase said once at the end: "ES 2503 or PH 2201, or equivalent".
 */
function describeCourseChoice(courses: Extract<Requirement, { kind: 'course' }>[]): string {
  const codes = joinWords(courses.map((course) => formatCourseId(course.course)), 'or');
  return courses.some((course) => course.orEquivalent) ? `${codes}, or equivalent` : codes;
}

/**
 * One requirement tree as a single phrase.
 *
 * Returns:
 *   e.g. "differential equations (MA 2051 or equivalent)" or "AB 1531 or instructor approval".
 */
export function describeRequirement(requirement: Requirement): string {
  switch (requirement.kind) {
    case 'course':
      return requirement.orEquivalent
        ? `${formatCourseId(requirement.course)} or equivalent`
        : formatCourseId(requirement.course);
    case 'allOf':
      return joinWords(requirement.of.map((child) => describeChild(child, 'allOf')), 'and');
    case 'anyOf': {
      const courses = requirement.of.filter((child) => child.kind === 'course');
      if (courses.length === requirement.of.length) return describeCourseChoice(courses);
      return joinWords(requirement.of.map((child) => describeChild(child, 'anyOf')), 'or');
    }
    case 'countOf':
      return `any ${requirement.count} of ${requirement.of.map((child) => describeChild(child, 'countOf')).join(', ')}`;
    case 'topic':
      return requirement.satisfiedBy
        ? `${requirement.topic} (${describeRequirement(requirement.satisfiedBy)})`
        : requirement.topic;
    case 'permission':
    case 'standing':
    case 'other':
      return requirement.text;
  }
}

/** A top-level "all of" becomes one line per item, so a long list of subjects reads as a list. */
export function describeRequirementLines(requirement: Requirement): string[] {
  return requirement.kind === 'allOf' ? requirement.of.map((child) => describeChild(child, 'allOf')) : [describeRequirement(requirement)];
}

/** The bold label in front of a clause: "Prerequisite", "Corequisite", "Restriction", "Recommended", "Suggested". */
export function clauseLabel(clause: ShippedBackgroundClause): string {
  // "Prerequisite: closed to native speakers" reads as a course to take; it is a rule about who may enrol.
  if (clause.strength === 'required' && clause.requirement.kind === 'standing') return 'Restriction';
  if (clause.strength === 'required') return clause.timing === 'concurrent' ? 'Corequisite' : 'Prerequisite';
  return clause.strength === 'recommended' ? 'Recommended' : 'Suggested';
}

/** How the clause's timing reads after its label; null when it is the default (taken before) or the label already says it. */
export function clauseTimingNote(clause: ShippedBackgroundClause): string | null {
  if (clause.timing === 'priorOrConcurrent') return 'before or at the same time';
  if (clause.timing === 'concurrent' && clause.strength !== 'required') return 'at the same time';
  return null;
}

/**
 * The warning shown in place of a Background block when nobody has read this
 * course's description for prerequisites, so a missing block is not taken to
 * mean "no prerequisites".
 *
 * Args:
 *   status: the course's `CourseBackgroundStatus['status']`
 *
 * Returns:
 *   The note for `unchecked` and `stale`; null when the course has been read
 *   (`none` and `hasBackground`), since then the block, or its absence, is accurate.
 */
export function uncheckedBackgroundNote(status: CourseBackgroundStatus['status']): string | null {
  if (status === 'unchecked') {
    return 'Prerequisites for this course have not been checked yet, so none are listed here. Check the description above before assuming it has none.';
  }
  if (status === 'stale') {
    return 'This description changed after its prerequisites were last checked, so none are listed here. Check the description above before assuming it has none.';
  }
  return null;
}
