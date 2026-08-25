/**
 * The permutation search — a close port of `ScheduleProducer.java`.
 *
 * Sections of each chosen course form the levels of a tree; the search walks it
 * depth-first over an explicit stack, testing each candidate section against the
 * chosen-times grid and then against the sections already placed. Reaching the
 * last level yields a schedule.
 *
 * The structure is kept deliberately close to the original — same stack, same
 * `SearchState`, same shortest-course-first ordering, same `maxSolutions`
 * semantics — because the algorithm is the part of the old app that was already
 * correct. What changed is where it runs: the legacy version was sliced into
 * 30-step chunks on a GWT `Timer` to keep the UI alive, and this one runs flat
 * out inside a worker.
 *
 * `maxSolutions` is 0 for the normal search, which means "never suggest fixes,
 * only report real schedules". The conflict resolver re-runs the same search
 * with it escalating 1..10 to explain why nothing fits.
 */
import { ConflictIndex } from './conflicts';
import { conflictProblem, problemListsEqual, timeConflictProblem } from './problems';
import { getTimeConflicts, hasTimeConflicts } from './timeConflicts';
import type {
  ChosenTimes,
  CourseSectionLists,
  GeneratorSection,
  Problem,
  SchedulePermutation,
} from './types';

export interface GeneratorInput {
  /** Candidate sections per chosen course; empty lists are dropped. */
  courses: CourseSectionLists;
  chosenTimes: ChosenTimes;
  /** How many problems a suggested schedule may assume. 0 = real schedules only. */
  maxSolutions?: number;
}

/** One node of the depth-first search. */
interface SearchState {
  sections: GeneratorSection[];
  problems: Problem[];
  currentCourse: number;
  currentSection: number;
}

function cloneState(state: SearchState): SearchState {
  return {
    sections: [...state.sections],
    problems: [...state.problems],
    currentCourse: state.currentCourse,
    currentSection: state.currentSection,
  };
}

/**
 * Whether two schedules are the same, ignoring the order sections were placed.
 *
 * Ported from `SchedulePermutation.equals`; used for favourites and for keeping
 * the selected schedule stable across regenerations.
 */
export function permutationsEqual(
  permutation: SchedulePermutation,
  other: SchedulePermutation,
): boolean {
  if (permutation.sectionIds.length !== other.sectionIds.length) return false;
  if (!permutation.sectionIds.every((id) => other.sectionIds.includes(id))) return false;

  return permutationSolutionsEqual(permutation, other);
}

/** Whether two schedules assume the same set of fixes — `equalSolution`. */
export function permutationSolutionsEqual(
  permutation: SchedulePermutation,
  other: SchedulePermutation,
): boolean {
  if (permutation.problems.length !== other.problems.length) return false;
  return problemListsEqual(permutation.problems, other.problems);
}

export class ScheduleGenerator {
  /** Candidate sections per course, shortest list first. */
  readonly courses: CourseSectionLists;
  readonly conflicts: ConflictIndex;

  private readonly chosenTimes: ChosenTimes;
  private readonly stack: SearchState[] = [];
  private readonly found: SchedulePermutation[] = [];

  maxSolutions: number;

  constructor(input: GeneratorInput) {
    // Sorting shortest-first narrows the tree early. Array#sort is stable, as
    // Collections.sort was, so equally sized courses keep their original order.
    this.courses = input.courses
      .filter((sections) => sections.length > 0)
      .sort((a, b) => a.length - b.length);

    this.chosenTimes = input.chosenTimes;
    this.maxSolutions = input.maxSolutions ?? 0;
    this.conflicts = new ConflictIndex(this.courses);

    if (this.courses.length > 0) {
      this.stack.push({ sections: [], problems: [], currentCourse: 0, currentSection: 0 });
    }
  }

  /**
   * A second generator over the same courses, with a larger solution budget.
   *
   * The conflict resolver escalates `maxSolutions` 1..10 this way rather than
   * rebuilding the input — the legacy `ScheduleProducer(ScheduleProducer)`
   * constructor.
   */
  withMaxSolutions(maxSolutions: number): ScheduleGenerator {
    const next = new ScheduleGenerator({
      courses: this.courses,
      chosenTimes: this.chosenTimes,
      maxSolutions,
    });
    return next;
  }

  get permutations(): readonly SchedulePermutation[] {
    return this.found;
  }

  /** Whether any part of the tree is still unexplored. */
  canGenerate(): boolean {
    return this.stack.length > 0;
  }

  /** Explore one node. Safe to call on an exhausted search. */
  step(): void {
    const state = this.stack.pop();
    if (state === undefined) return;

    // Before descending, queue the next sibling section of this course.
    if (state.currentSection < this.courses[state.currentCourse].length - 1) {
      const sibling = cloneState(state);
      sibling.currentSection++;
      this.stack.push(sibling);
    }

    this.visitSection(state);
  }

  /**
   * Run up to `maxSteps` steps.
   *
   * @returns How many steps actually ran, which is fewer when the search ends
   */
  run(maxSteps: number): number {
    let steps = 0;
    while (steps < maxSteps && this.canGenerate()) {
      this.step();
      steps++;
    }
    return steps;
  }

  /** Run to completion. Only safe off the main thread, or on small inputs. */
  runToCompletion(): void {
    while (this.canGenerate()) this.step();
  }

  private currentSectionOf(state: SearchState): GeneratorSection {
    return this.courses[state.currentCourse][state.currentSection];
  }

  private canAddProblems(state: SearchState): boolean {
    return state.problems.length < this.maxSolutions;
  }

  private visitSection(state: SearchState): void {
    const section = this.currentSectionOf(state);

    // The chosen-times grid is checked first: it rejects a section outright,
    // regardless of what else is already scheduled.
    if (hasTimeConflicts(section, this.chosenTimes)) {
      if (this.canAddProblems(state)) this.pushTimeConflictBranch(state, section);
      return;
    }

    if (this.conflictsWithScheduled(state.sections, section)) {
      if (this.canAddProblems(state)) this.pushConflictBranches(state, section);
      return;
    }

    const next = cloneState(state);
    next.sections.push(section);
    this.advance(next);
  }

  private conflictsWithScheduled(
    sections: readonly GeneratorSection[],
    candidate: GeneratorSection,
  ): boolean {
    return sections.some((section) => this.conflicts.hasConflict(candidate.id, section.id));
  }

  /**
   * Two ways out of a section-vs-section collision: drop the new section, or
   * drop the one already scheduled. Both are explored.
   */
  private pushConflictBranches(state: SearchState, candidate: GeneratorSection): void {
    for (const scheduled of state.sections) {
      if (!this.conflicts.hasConflict(candidate.id, scheduled.id)) continue;

      const dropCandidate = cloneState(state);
      dropCandidate.problems.push(conflictProblem(candidate, scheduled));

      const dropScheduled = cloneState(state);
      dropScheduled.problems.push(conflictProblem(scheduled, candidate));
      dropScheduled.sections = dropScheduled.sections.filter((section) => section !== scheduled);
      dropScheduled.sections.push(candidate);

      this.advance(dropCandidate);
      this.advance(dropScheduled);
    }
  }

  /**
   * Take the section anyway and record which blocked-out times that needs.
   *
   * If it *also* collides with something already scheduled, that needs a second
   * fix on top, so the branch continues into {@link pushConflictBranches}.
   */
  private pushTimeConflictBranch(state: SearchState, section: GeneratorSection): void {
    const next = cloneState(state);
    next.problems.push(timeConflictProblem(section, getTimeConflicts(section, this.chosenTimes)));
    next.sections.push(section);

    if (this.conflictsWithScheduled(state.sections, section)) {
      if (!this.canAddProblems(next)) return;
      this.pushConflictBranches(next, section);
      return;
    }

    this.advance(next);
  }

  /**
   * Move a state to the next course, or record it as a finished schedule.
   *
   * When a finished schedule carries problems, every queued state that assumes
   * the same set of problems is discarded: they would all restate the same
   * advice, and the resolver only needs to show it once.
   */
  private advance(state: SearchState): void {
    if (state.currentCourse < this.courses.length - 1) {
      state.currentCourse++;
      state.currentSection = 0;
      this.stack.push(state);
      return;
    }

    if (state.problems.length > 0) {
      while (this.stack.length > 0) {
        const queued = this.stack[this.stack.length - 1];
        if (!problemListsEqual(queued.problems, state.problems)) break;
        this.stack.pop();
      }
    }

    this.found.push({
      sectionIds: state.sections.map((section) => section.id),
      problems: [...state.problems],
    });
  }
}

export interface StreamOptions {
  /** Steps to run between batches. Larger means fewer messages, coarser cancel. */
  stepsPerBatch?: number;
  /** Called with the schedules found since the previous batch. */
  onBatch(permutations: SchedulePermutation[], total: number): void;
  /** Checked between batches; returning true abandons the search. */
  shouldCancel?(): boolean;
}

const DEFAULT_STEPS_PER_BATCH = 2000;

/**
 * Drive a generator to completion, handing out schedules as they are found.
 *
 * This is what the worker runs. Batching exists so the UI sees early results and
 * so a cancel (the student changed a course) is noticed promptly — not, as in
 * the legacy 30-steps-per-tick timer, to keep the main thread from freezing.
 *
 * @returns Whether the search finished, as opposed to being cancelled
 */
export function streamPermutations(
  generator: ScheduleGenerator,
  options: StreamOptions,
): boolean {
  const stepsPerBatch = options.stepsPerBatch ?? DEFAULT_STEPS_PER_BATCH;
  let delivered = 0;

  while (generator.canGenerate()) {
    if (options.shouldCancel?.() === true) return false;

    generator.run(stepsPerBatch);

    const total = generator.permutations.length;
    if (total > delivered) {
      options.onBatch(generator.permutations.slice(delivered), total);
      delivered = total;
    }
  }

  return true;
}
