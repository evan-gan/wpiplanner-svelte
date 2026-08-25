/**
 * Catalog quirks that cannot be derived from the feed.
 *
 * These were `planner.properties` next to the legacy Java converter. They live
 * in code here because they are edited about once a year, always alongside a
 * catalog change, and a typo in them should fail `pnpm run check` rather than
 * silently mislabel a few hundred sections.
 */

/**
 * Courses whose sections are all different classes sharing one course number —
 * Great Problems Seminars, special topics, humanities capstones.
 *
 * Two things follow: the section label keeps the full section title so the two
 * "HU 3900" entries are distinguishable, and lecture/lab/discussion components
 * only combine with each other inside a declared cluster.
 */
export const SPECIAL_COURSES: readonly string[] = [
  'HU 3900',
  'HU 3910',
  'ID 2050',
  'WPE 1099',
  'WPE 1699',
];

/** Section-title markers that mean the same thing as {@link SPECIAL_COURSES}. */
export const SPECIAL_SECTION_MARKERS: readonly string[] = [
  'GPS:',
  '- ST:',
  '- ST: -',
  '- SP:',
  '- AT:',
  '- Topics In',
  'History:',
  'In Psychological Science:',
];

/** Marks a placeholder section students join to signal demand, not a real meeting. */
export const INTEREST_LIST_MARKER = 'Interest List';

/** Whether `${subject} ${courseNumber}` is one of {@link SPECIAL_COURSES}. */
export function isSpecialCourse(subjectCode: string, courseNumber: string): boolean {
  const courseKey = `${subjectCode} ${courseNumber}`;
  return SPECIAL_COURSES.some((special) => courseKey.includes(special));
}

/** Whether a full `Course_Section` string carries a {@link SPECIAL_SECTION_MARKERS} marker. */
export function hasSpecialSectionMarker(courseSectionText: string): boolean {
  return SPECIAL_SECTION_MARKERS.some((marker) => courseSectionText.includes(marker));
}

export function isInterestListSection(courseSectionText: string): boolean {
  return courseSectionText.includes(INTEREST_LIST_MARKER);
}
