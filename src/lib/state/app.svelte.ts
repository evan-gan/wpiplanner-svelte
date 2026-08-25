/**
 * The app-level state container, and the context that hands it to every route.
 *
 * The legacy `StudentSchedule` was one object holding courses, favourites, the
 * visible time range, the conflict index, and a `HandlerManager` firing seven
 * event types. Those are separate files here; this one wires them together and
 * owns the single rule that connects them: **when the choices change, the
 * schedule search restarts.**
 *
 * Regeneration is an explicit call rather than an `$effect`, so the order of
 * operations is obvious and a burst of changes cannot re-enter the search.
 */
import { getContext, setContext } from 'svelte';
import type { Catalog } from '$lib/model/catalog';
import type { TermName } from '$lib/model/schedb';
import { applyProblem, type SolutionTarget } from '$lib/scheduling/problems';
import type { Problem } from '$lib/scheduling/types';
import { ChosenTimesState } from './chosenTimes.svelte';
import { FavoritesState } from './favorites.svelte';
import { PermutationsState } from './permutations.svelte';
import { browserStorage, loadSelectedDepartments, saveSelectedDepartments, type StorageLike } from './persistence';
import { MAX_COURSES, SelectionState, type AddCourseResult } from './selection.svelte';
import { TimeRangeState } from './timeRange.svelte';

/** Preselected on a first visit, as the legacy `DepartmentListBox` did. */
const DEFAULT_DEPARTMENT = 'MA';

export class AppState {
  readonly catalog: Catalog;
  readonly selection: SelectionState;
  readonly chosenTimes: ChosenTimesState;
  readonly favorites: FavoritesState;
  readonly timeRange: TimeRangeState;
  readonly permutations: PermutationsState;

  /** Departments ticked in the picker. */
  selectedDepartments = $state<string[]>([]);
  /** The course whose description is showing on the Courses tab. */
  selectedCourseId = $state<string | null>(null);
  /** Shown when the student hits the 18-course ceiling. */
  courseLimitWarning = $state(false);

  private readonly storage: StorageLike;

  constructor(catalog: Catalog, storage: StorageLike = browserStorage(), permutations?: PermutationsState) {
    this.catalog = catalog;
    this.storage = storage;
    this.selection = new SelectionState(catalog, storage);
    this.chosenTimes = new ChosenTimesState(storage);
    this.favorites = new FavoritesState(storage);
    this.timeRange = new TimeRangeState();
    this.permutations = permutations ?? new PermutationsState();
  }

  /** Load everything the student had last time, then start the first search. */
  restore(): void {
    this.selection.restore();
    this.chosenTimes.restore();
    this.favorites.restore();

    const saved = loadSelectedDepartments(this.storage);
    this.selectedDepartments =
      saved ?? (this.catalog.getDepartment(DEFAULT_DEPARTMENT) ? [DEFAULT_DEPARTMENT] : []);

    this.refresh();
  }

  setSelectedDepartments(abbrevs: string[]): void {
    this.selectedDepartments = abbrevs;
    saveSelectedDepartments(abbrevs, this.storage);
  }

  /** Whether the Times and Schedules tabs have anything to show. */
  get hasCourses(): boolean {
    return this.selection.courses.length > 0;
  }

  addCourse(courseId: string): AddCourseResult {
    const result = this.selection.addCourse(courseId);
    if (result === 'limit-reached') {
      this.courseLimitWarning = true;
      return result;
    }
    if (result === 'added') this.refresh();
    return result;
  }

  removeCourse(courseId: string): void {
    this.selection.removeCourse(courseId);
    this.courseLimitWarning = false;
    this.refresh();
  }

  toggleSection(courseId: string, sectionId: string): void {
    this.selection.toggleSection(courseId, sectionId);
    this.refresh();
  }

  /** Apply a section filter's tick: many sections change, the search restarts once. */
  setSectionsDenied(courseId: string, sectionIds: readonly string[], denied: boolean): void {
    this.selection.setSectionsDenied(courseId, sectionIds, denied);
    this.refresh();
  }

  setTermDenied(courseId: string, term: TermName, denied: boolean): void {
    this.selection.setTermDenied(courseId, term, denied);
    this.refresh();
  }

  applyChosenTimesDrag(
    term: TermName,
    anchor: { row: number; column: number },
    drop: { row: number; column: number },
  ): void {
    this.chosenTimes.applyDrag(term, anchor, drop);
    this.refresh();
  }

  /**
   * Replace the selection with the sections a Workday export says the student
   * is enrolled in.
   *
   * Every other section of each course is switched off, so the search has one
   * combination to find and the Schedules tab shows the real registered
   * schedule rather than the alternatives to it. This replaces the selection
   * outright — the import describes a whole schedule, not an addition to one —
   * which is why the UI confirms before calling it.
   *
   * @param enrolledSections The sections to keep, one per course
   * @returns How many courses were applied, which is fewer than asked for when
   *   the export exceeds the {@link MAX_COURSES} ceiling
   */
  importEnrolledSections(
    enrolledSections: readonly { courseId: string; sectionId: string }[],
  ): number {
    const courses = enrolledSections.slice(0, MAX_COURSES).map(({ courseId, sectionId }) => ({
      courseId,
      deniedSectionIds: this.catalog
        .requireCourse(courseId)
        .sections.filter((section) => section.id !== sectionId)
        .map((section) => section.id),
    }));

    this.selection.replaceAll(courses);
    this.courseLimitWarning = false;
    this.refresh();

    return courses.length;
  }

  /**
   * Carry out one of the conflict resolver's suggestions.
   *
   * The legacy `AbstractProblem.applySolution` reached into `StudentSchedule`
   * directly; here the problem is data and this class supplies the effects.
   */
  applyProblems(problems: readonly Problem[]): void {
    const target: SolutionTarget = {
      denyCourse: (courseId) => this.selection.denyCourse(courseId),
      allowTime: (term, row, column) => this.chosenTimes.setSelected(term, row, column, true),
    };

    for (const problem of problems) applyProblem(problem, target);
    this.refresh();
  }

  /** Recompute the visible hours and restart the search. */
  refresh(): void {
    this.timeRange.update(this.selection.allSections());
    this.permutations.regenerate(
      this.selection.generatorCourses(),
      this.selection.allSections(),
      this.chosenTimes.snapshot(),
    );
  }

  dispose(): void {
    this.permutations.dispose();
  }
}

const APP_STATE_KEY = Symbol('wpiplanner.app');

export function setAppState(app: AppState): AppState {
  return setContext(APP_STATE_KEY, app);
}

export function getAppState(): AppState {
  const app = getContext<AppState | undefined>(APP_STATE_KEY);
  if (app === undefined) {
    throw new Error('getAppState() was called outside the app layout that provides it.');
  }
  return app;
}
