/**
 * A brute-force oracle for the permutation search. **Tests only.**
 *
 * It enumerates the entire cartesian product of sections and keeps the
 * combinations that break no rule. That is obviously correct and hopelessly slow
 * — exponential with no pruning — which is exactly what makes it useful: the
 * property test in `tests/scheduling/generator.parity.test.ts` checks the real
 * depth-first search against it on hundreds of random course sets, and catches
 * the subtle stack bugs a hand-written fixture never would.
 *
 * It only models the `maxSolutions = 0` case. Problem suggestions are a
 * different search, and the resolver's escalation is covered separately.
 */
import { sectionsConflict } from './conflicts';
import { hasTimeConflicts } from './timeConflicts';
import type { ChosenTimes, CourseSectionLists, GeneratorSection } from './types';

/**
 * Every conflict-free combination taking one section from each course.
 *
 * @returns Each schedule as the ids of its sections, in course order
 */
export function generateReferenceSchedules(
  courses: CourseSectionLists,
  chosenTimes: ChosenTimes,
): string[][] {
  const usable = courses
    .map((sections) => sections.filter((section) => !hasTimeConflicts(section, chosenTimes)))
    .filter((_, index) => courses[index].length > 0);

  const schedules: string[][] = [];

  function extend(courseIndex: number, chosen: GeneratorSection[]): void {
    if (courseIndex === usable.length) {
      schedules.push(chosen.map((section) => section.id));
      return;
    }

    for (const candidate of usable[courseIndex]) {
      const collides = chosen.some(
        (section) => section.courseId !== candidate.courseId && sectionsConflict(section, candidate),
      );
      if (collides) continue;

      chosen.push(candidate);
      extend(courseIndex + 1, chosen);
      chosen.pop();
    }
  }

  // A course whose sections were all excluded makes the whole set unsatisfiable.
  if (usable.some((sections) => sections.length === 0)) return [];

  extend(0, []);
  return schedules;
}
