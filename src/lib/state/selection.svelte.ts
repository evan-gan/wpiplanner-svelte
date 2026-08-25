/**
 * The courses a student has chosen, and which of their sections are switched on.
 *
 * Replaces `StudentSchedule`'s course half plus every `SectionProducer`. The
 * legacy `StudentSchedule` also owned favourites and the visible time range;
 * those are separate files here, because they change for different reasons.
 */
import type { Catalog } from '$lib/model/catalog';
import { sectionHasAvailableSeats } from '$lib/model/availability';
import type { SectionJson, TermName } from '$lib/model/schedb';
import type { CourseSectionLists, GeneratorSection } from '$lib/scheduling/types';
import {
  browserStorage,
  loadSelection,
  saveSelection,
  type SavedCourse,
  type StorageLike,
} from './persistence';

/**
 * Hard limit on chosen courses, kept from the old app.
 *
 * The reason it exists is the 17-colour palette in `PermutationController`; the
 * legacy code enforced it with a `Window.alert`, and the UI shows it inline.
 */
export const MAX_COURSES = 18;

export type AddCourseResult = 'added' | 'already-added' | 'limit-reached';

export class SelectionState {
  /** Chosen courses, in the order they were added — this order picks colours. */
  courses = $state<SavedCourse[]>([]);

  private readonly catalog: Catalog;
  private readonly storage: StorageLike;

  constructor(catalog: Catalog, storage: StorageLike = browserStorage()) {
    this.catalog = catalog;
    this.storage = storage;
  }

  /** Reload from storage, dropping anything the current catalog no longer has. */
  restore(): void {
    this.courses = loadSelection(this.storage)
      .filter((saved) => this.catalog.getCourse(saved.courseId) !== undefined)
      .slice(0, MAX_COURSES)
      .map((saved) => ({
        courseId: saved.courseId,
        deniedSectionIds: saved.deniedSectionIds.filter(
          (id) => this.catalog.getCourseIdOfSection(id) === saved.courseId,
        ),
      }));
  }

  /** Replace the whole selection, e.g. when opening a share link. */
  replaceAll(courses: SavedCourse[]): void {
    this.courses = courses.slice(0, MAX_COURSES);
    this.save();
  }

  get courseIds(): string[] {
    return this.courses.map((course) => course.courseId);
  }

  get isFull(): boolean {
    return this.courses.length >= MAX_COURSES;
  }

  hasCourse(courseId: string): boolean {
    return this.courses.some((course) => course.courseId === courseId);
  }

  /**
   * Add a course, switching off any section that has no seats left.
   *
   * That default came from `SectionProducer`'s constructor: a student browsing
   * schedules almost never wants a section they cannot register for, but they
   * can switch it back on.
   */
  addCourse(courseId: string): AddCourseResult {
    if (this.hasCourse(courseId)) return 'already-added';
    if (this.isFull) return 'limit-reached';

    const course = this.catalog.requireCourse(courseId);
    const deniedSectionIds = course.sections
      .filter((section) => !sectionHasAvailableSeats(section))
      .map((section) => section.id);

    this.courses = [...this.courses, { courseId, deniedSectionIds }];
    this.save();
    return 'added';
  }

  removeCourse(courseId: string): void {
    this.courses = this.courses.filter((course) => course.courseId !== courseId);
    this.save();
  }

  deniedSectionIds(courseId: string): readonly string[] {
    return this.courses.find((course) => course.courseId === courseId)?.deniedSectionIds ?? [];
  }

  isSectionDenied(courseId: string, sectionId: string): boolean {
    return this.deniedSectionIds(courseId).includes(sectionId);
  }

  setSectionDenied(courseId: string, sectionId: string, denied: boolean): void {
    this.updateDenied(courseId, (current) => {
      const without = current.filter((id) => id !== sectionId);
      return denied ? [...without, sectionId] : without;
    });
  }

  toggleSection(courseId: string, sectionId: string): void {
    this.setSectionDenied(courseId, sectionId, !this.isSectionDenied(courseId, sectionId));
  }

  /**
   * Whether a whole term of a course is switched off.
   *
   * Also true when the course simply is not taught that term, which is what the
   * term badges want: there is nothing to enable either way.
   */
  isTermDenied(courseId: string, term: TermName): boolean {
    const sections = this.catalog.getCourse(courseId)?.sections ?? [];
    return !sections.some(
      (section) => section.terms.includes(term) && !this.isSectionDenied(courseId, section.id),
    );
  }

  /**
   * Switch a whole term of a course on or off.
   *
   * Switching a term back on re-enables its full sections too, matching
   * `SectionProducer.removeDenyTerm` — the student asked for the term, so they
   * get all of it.
   */
  setTermDenied(courseId: string, term: TermName, denied: boolean): void {
    const sections = this.catalog.getCourse(courseId)?.sections ?? [];
    const inTerm = new Set(
      sections.filter((section) => section.terms.includes(term)).map((section) => section.id),
    );

    this.updateDenied(courseId, (current) => {
      if (!denied) return current.filter((id) => !inTerm.has(id));
      return [...new Set([...current, ...inTerm])];
    });
  }

  /** Switch every section of a course off — what a conflict fix does. */
  denyCourse(courseId: string): void {
    const sections = this.catalog.getCourse(courseId)?.sections ?? [];
    this.updateDenied(courseId, () => sections.map((section) => section.id));
  }

  /** The sections of one course that are still in play. */
  allowedSections(courseId: string): SectionJson[] {
    const sections = this.catalog.getCourse(courseId)?.sections ?? [];
    return sections.filter((section) => !this.isSectionDenied(courseId, section.id));
  }

  /** The search input: allowed sections per chosen course, stripped to essentials. */
  generatorCourses(): CourseSectionLists {
    return this.courses.map((course) =>
      this.allowedSections(course.courseId).map(
        (section): GeneratorSection => ({
          id: section.id,
          courseId: course.courseId,
          terms: section.terms,
          periods: section.periods.map((period) => ({
            days: period.days,
            startMinutes: period.startMinutes,
            endMinutes: period.endMinutes,
          })),
        }),
      ),
    );
  }

  /** Every section of every chosen course, for the conflict index and colours. */
  allSections(): CourseSectionLists {
    return this.courses.map((course) =>
      (this.catalog.getCourse(course.courseId)?.sections ?? []).map(
        (section): GeneratorSection => ({
          id: section.id,
          courseId: course.courseId,
          terms: section.terms,
          periods: section.periods.map((period) => ({
            days: period.days,
            startMinutes: period.startMinutes,
            endMinutes: period.endMinutes,
          })),
        }),
      ),
    );
  }

  save(): void {
    saveSelection($state.snapshot(this.courses), this.storage);
  }

  private updateDenied(courseId: string, change: (current: string[]) => string[]): void {
    this.courses = this.courses.map((course) =>
      course.courseId === courseId
        ? { ...course, deniedSectionIds: change([...course.deniedSectionIds]) }
        : course,
    );
    this.save();
  }
}
