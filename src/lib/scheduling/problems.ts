/**
 * Problems: the fixes the conflict resolver offers when no schedule exists.
 *
 * The legacy `AbstractProblem` hierarchy mixed three jobs into each subclass —
 * comparison, HTML text, and mutating a `StudentSchedule`. Here a problem is
 * plain data (so it survives structured cloning out of the worker), the text is
 * a pure function of it, and applying it goes through a small interface the
 * state layer implements.
 */
import { fullDayName } from '$lib/model/days';
import type { TermName } from '$lib/model/schedb';
import { formatClockTime } from '$lib/model/time';
import { formatTermLabel } from '$lib/model/terms';
import {
  GRID_COLUMNS,
  columnToDayIndex,
  gridEndMinutes,
  gridStartMinutes,
} from '$lib/model/timeGrid';
import type { GeneratorSection, Problem, TimeConflictCell } from './types';

/** Just enough of {@link import('$lib/model/catalog').Catalog} to write the text. */
export interface ProblemNaming {
  /** e.g. "Calculus I (MA1021)". */
  courseTitle(courseId: string): string;
  /** e.g. "MA1021". */
  courseAbbrev(courseId: string): string;
}

/** What applying a problem does to the student's choices. */
export interface SolutionTarget {
  /** Disable every section of a course, dropping it from the search. */
  denyCourse(courseId: string): void;
  /** Re-select one blocked-out cell of the chosen-times grid. */
  allowTime(term: TermName, row: number, column: number): void;
}

/** The section label is the third field of the section id. */
function sectionNumberOf(sectionId: string): string {
  return sectionId.split('|')[2] ?? sectionId;
}

/**
 * "Give up `section` because it collides with `other`."
 *
 * @param section The section that would be dropped
 * @param other The already-scheduled section it collides with
 */
export function conflictProblem(section: GeneratorSection, other: GeneratorSection): Problem {
  return {
    kind: 'conflict',
    sectionId: section.id,
    courseId: section.courseId,
    otherSectionId: other.id,
    otherCourseId: other.courseId,
  };
}

/** "Re-open these blocked-out times so `section` can be taken." */
export function timeConflictProblem(
  section: GeneratorSection,
  cells: Partial<Record<TermName, TimeConflictCell[]>>,
): Problem {
  return { kind: 'timeConflict', sectionId: section.id, courseId: section.courseId, cells };
}

/**
 * Whether two problems represent the same advice.
 *
 * Conflict problems compare by the two *courses* involved, so the same advice
 * raised against different sections of a course collapses to one suggestion —
 * the legacy `ConflictProblem.equals`. Time conflicts compare by identity,
 * because `TimeConflictProblem` never overrode `equals` and the search's
 * de-duplication depends on that.
 */
export function problemsEqual(problem: Problem, other: Problem): boolean {
  if (problem === other) return true;
  if (problem.kind !== other.kind) return false;
  if (problem.kind !== 'conflict' || other.kind !== 'conflict') return false;

  return problem.courseId === other.courseId && problem.otherCourseId === other.otherCourseId;
}

/** Element-wise, order-sensitive comparison — Java's `List.equals`. */
export function problemListsEqual(
  problems: readonly Problem[],
  others: readonly Problem[],
): boolean {
  if (problems.length !== others.length) return false;
  return problems.every((problem, index) => problemsEqual(problem, others[index]));
}

/** One-line heading for the suggestion. */
export function problemTitle(problem: Problem, naming: ProblemNaming): string {
  if (problem.kind === 'conflict') {
    return `Disable ${naming.courseTitle(problem.courseId)}`;
  }
  return (
    `Your chosen times conflict with ${naming.courseAbbrev(problem.courseId)}: ` +
    `Section ${sectionNumberOf(problem.sectionId)}`
  );
}

/**
 * Body text, as lines.
 *
 * The legacy versions returned HTML with `<br>` separators; returning lines lets
 * the component decide the markup and keeps catalog text out of `innerHTML`.
 */
export function problemDescription(problem: Problem, naming: ProblemNaming): string[] {
  if (problem.kind === 'conflict') {
    return [
      `${naming.courseTitle(problem.courseId)} is conflicting with ` +
        `${naming.courseTitle(problem.otherCourseId)}`,
    ];
  }

  const terms = Object.entries(problem.cells) as [TermName, TimeConflictCell[]][];
  const outsideGrid = terms.flatMap(([, cells]) => cells).filter((cell) => !cell.insideGrid);
  const fixable = terms.some(([, cells]) => cells.some((cell) => cell.insideGrid));

  const lines = fixable ? ['Re-enable the following times to allow this section:'] : [];

  for (const [term, cells] of terms) {
    const times = cells.map(describeCell).join(' ');
    lines.push(`${formatTermLabel(term)}: ${times}`);
  }

  // Nothing the student can do clears an out-of-grid block, so say so rather
  // than heading the list with an instruction that will not work.
  if (outsideGrid.length > 0) {
    lines.push(
      `This section meets outside the hours the planner covers ` +
        `(${gridHoursLabel()}), so it cannot be scheduled.`,
    );
  }

  return lines;
}

/** e.g. "Tuesday@6:00PM", flagged when the grid never covered it. */
function describeCell(cell: TimeConflictCell): string {
  const time = `${fullDayName(cell.dayIndex)}@${formatClockTime(cell.startMinutes)}`;
  return cell.insideGrid ? time : `${time} (outside the grid)`;
}

/** e.g. "Monday–Friday 8:00AM–6:00PM". */
function gridHoursLabel(): string {
  const firstDay = fullDayName(columnToDayIndex(0));
  const lastDay = fullDayName(columnToDayIndex(GRID_COLUMNS - 1));

  return (
    `${firstDay}–${lastDay} ` +
    `${formatClockTime(gridStartMinutes())}–${formatClockTime(gridEndMinutes())}`
  );
}

/** Carry out the fix a problem suggests. */
export function applyProblem(problem: Problem, target: SolutionTarget): void {
  if (problem.kind === 'conflict') {
    target.denyCourse(problem.courseId);
    return;
  }

  if (problem.kind === 'timeConflict') {
    for (const [term, cells] of Object.entries(problem.cells) as [TermName, TimeConflictCell[]][]) {
      for (const cell of cells) target.allowTime(term, cell.row, cell.column);
    }
  }
}
