/**
 * The cheap check behind the rail's "Clashes: CS1102" link.
 *
 * It asks "could this row join what the other courses are set to?" using the
 * conflict index the search already built — no searching. Each other course
 * brings its options: the one section in the schedule on screen, or, when no
 * schedule exists, every section the student checked. A course blocks a row
 * only when *every* one of its options clashes with it, so the link never
 * appears for a row that could fit. Working out *how* to make it fit is the
 * fix panel's job, and only runs when that link is used (`fixFinder.ts`).
 */

/**
 * The other courses that leave a rail row no way to fit.
 *
 * @param candidateIds The combined sections the row stands for
 * @param optionsByCourse Every *other* course → its options (see above);
 *   courses with no options are ignored, as the search ignores them
 * @param hasConflict Pairwise clash test, normally `ConflictIndex.hasConflict`
 * @returns Empty when some candidate fits; otherwise the courses blocking the
 *   candidate that is blocked by the fewest
 */
export function clashingCourseIds(
  candidateIds: readonly string[],
  optionsByCourse: ReadonlyMap<string, readonly string[]>,
  hasConflict: (sectionId: string, otherSectionId: string) => boolean,
): string[] {
  let fewest: string[] | null = null;

  for (const candidateId of candidateIds) {
    const blockers = [...optionsByCourse]
      .filter(([, options]) => options.length > 0)
      .filter(([, options]) => options.every((optionId) => hasConflict(candidateId, optionId)))
      .map(([courseId]) => courseId);
    if (blockers.length === 0) return [];
    if (fewest === null || blockers.length < fewest.length) fewest = blockers;
  }
  return fewest ?? [];
}
