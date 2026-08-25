/**
 * The value types the permutation search works with.
 *
 * These are deliberately narrower than the catalog types: the search needs a
 * section's id, its terms, and the day/time span of each period, and nothing
 * else. Keeping them plain data means the whole input and output can be
 * structured-cloned into the generator worker.
 */
import type { TermName } from '$lib/model/schedb';

export interface GeneratorPeriod {
  /** Bit mask of {@link import('$lib/model/schedb').DAY_BITS}. */
  days: number;
  startMinutes: number;
  endMinutes: number;
}

export interface GeneratorSection {
  /** `${dept}|${courseNumber}|${sectionNumber}` — unique across the catalog. */
  id: string;
  /** `${dept}|${courseNumber}` — sections of one course are interchangeable. */
  courseId: string;
  terms: TermName[];
  periods: GeneratorPeriod[];
}

/**
 * One list of candidate sections per chosen course.
 *
 * The search treats this as a tree: level *i* picks one section from
 * `courses[i]`.
 */
export type CourseSectionLists = GeneratorSection[][];

/**
 * The student's availability grid, per term.
 *
 * Each array is `GRID_CELL_COUNT` long, indexed by
 * {@link import('$lib/model/timeGrid').cellIndex}; `true` means "I can have
 * class then".
 */
export type ChosenTimes = Record<TermName, boolean[]>;

/** A half-hour block a section needs that the student is not available for. */
export interface TimeConflictCell {
  row: number;
  column: number;
  /** Sunday-based day index, for rendering. */
  dayIndex: number;
  /** Minutes since midnight at the top of the block. */
  startMinutes: number;
  /**
   * Whether `row` and `column` address a real cell of the grid.
   *
   * False for a block the grid never covered — an evening or weekend meeting.
   * Those conflict like any other (PLAN.md §10.5), but no student action can
   * clear them, so the resolver must not offer to.
   */
  insideGrid: boolean;
}

/**
 * A change to the student's choices that would make a schedule possible.
 *
 * The legacy code modelled these as an `AbstractProblem` class hierarchy whose
 * subclasses each knew how to mutate a `StudentSchedule`. Here they are plain
 * data, so they can cross the worker boundary, and applying one is a function.
 */
export type Problem =
  | {
      kind: 'conflict';
      /** The section that would have to be given up. */
      sectionId: string;
      courseId: string;
      /** The already-scheduled section it collides with. */
      otherSectionId: string;
      otherCourseId: string;
    }
  | {
      kind: 'timeConflict';
      sectionId: string;
      courseId: string;
      /** Blocked-out cells this section needs, per term. */
      cells: Partial<Record<TermName, TimeConflictCell[]>>;
    };

/** One complete schedule: a section per course, plus any problems it assumes. */
export interface SchedulePermutation {
  sectionIds: string[];
  /**
   * Empty for a real schedule. Non-empty only for the conflict resolver, which
   * runs a second search with `maxSolutions > 0` to suggest fixes.
   */
  problems: Problem[];
}
