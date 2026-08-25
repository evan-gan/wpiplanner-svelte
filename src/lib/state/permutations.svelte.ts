/**
 * Drives the schedule search and holds its results.
 *
 * Replaces `PermutationController`, minus the GWT event plumbing. The legacy
 * version re-ran the producer on every course change, stepped it 30 nodes at a
 * time from a 10ms `Timer`, and stopped once it had 300 schedules. The stepping
 * moved into the worker; the 300 cap stayed, because past that the thumbnail
 * strip is the bottleneck, not the search.
 */
import { ConflictIndex } from '$lib/scheduling/conflicts';
import { permutationsEqual } from '$lib/scheduling/generator';
import type { ChosenTimes, CourseSectionLists, SchedulePermutation } from '$lib/scheduling/types';
import { GeneratorClient, type GenerateOptions } from '$lib/scheduling/worker/client';

/**
 * The course colour palette, carried over verbatim.
 *
 * 17 entries for a limit of 18 courses — the eighteenth course renders white,
 * exactly as it did before.
 */
export const COURSE_COLORS = [
  'rgb(172, 114, 94)',
  'rgb(250, 87, 60)',
  'rgb(255, 173, 70)',
  'rgb(66, 214, 146)',
  'rgb(123, 209, 72)',
  'rgb(154, 156, 255)',
  'rgb(179, 220, 108)',
  'rgb(202, 189, 191)',
  'rgb(251, 233, 131)',
  'rgb(205, 116, 230)',
  'rgb(194, 194, 194)',
  'rgb(159, 225, 231)',
  'rgb(246, 145, 178)',
  '#92E1C0',
  'rgb(251, 233, 131)',
  '#7BD148',
  'rgb(159, 198, 231)',
] as const;

/** Colour for a course with no palette entry left. */
export const UNCOLORED = 'rgb(255,255,255)';

/**
 * Stop searching once this many schedules exist.
 *
 * From `PermutationController.generateSchedules`: `newCount > 300` ended the
 * run. Nobody scrolls past 300 thumbnails, and an unconstrained search over 18
 * courses does not terminate in useful time.
 */
export const PERMUTATION_LIMIT = 300;

export type GenerationStatus = 'idle' | 'searching' | 'done' | 'error';

/** The part of {@link GeneratorClient} this state needs; injectable for tests. */
export interface PermutationSource {
  generate(options: GenerateOptions): void;
  cancel(): void;
  terminate(): void;
}

/** The colour a course is drawn in, by its position in the chosen list. */
export function colorForCourse(courseId: string, orderedCourseIds: readonly string[]): string {
  const index = orderedCourseIds.indexOf(courseId);
  if (index < 0 || index >= COURSE_COLORS.length) return UNCOLORED;
  return COURSE_COLORS[index];
}

export class PermutationsState {
  permutations = $state<SchedulePermutation[]>([]);
  status = $state<GenerationStatus>('idle');
  errorMessage = $state<string | null>(null);

  /** The schedule shown in the main pane. */
  selected = $state<SchedulePermutation | null>(null);

  /** Highlighted on hover in the section list, drawn on top of the grid. */
  highlightedSectionId = $state<string | null>(null);

  /** Pairwise conflicts across the chosen courses, for the details dialog. */
  conflicts = $state<ConflictIndex | null>(null);

  private readonly source: PermutationSource;

  constructor(source: PermutationSource = new GeneratorClient()) {
    this.source = source;
  }

  get count(): number {
    return this.permutations.length;
  }

  /** True while the search is running and has found nothing yet. */
  get isSearching(): boolean {
    return this.status === 'searching';
  }

  /** True when the search finished having found nothing — the resolver's cue. */
  get foundNothing(): boolean {
    return this.status === 'done' && this.permutations.length === 0;
  }

  /**
   * Restart the search.
   *
   * @param courses Allowed sections per chosen course
   * @param allSections Every section of every chosen course, for the conflict
   *   index the section-details dialog reads
   * @param chosenTimes The availability grid, already snapshotted
   */
  regenerate(
    courses: CourseSectionLists,
    allSections: CourseSectionLists,
    chosenTimes: ChosenTimes,
  ): void {
    this.source.cancel();

    this.permutations = [];
    this.errorMessage = null;
    this.conflicts = new ConflictIndex(allSections);

    if (courses.every((sections) => sections.length === 0)) {
      this.status = 'done';
      this.selected = null;
      return;
    }

    this.status = 'searching';
    const previouslySelected = this.selected;
    this.selected = null;

    this.source.generate({
      courses,
      chosenTimes,
      onBatch: (batch) => this.acceptBatch(batch, previouslySelected),
      onDone: (_total, completed) => {
        if (completed) this.status = 'done';
      },
      onError: (message) => {
        this.status = 'error';
        this.errorMessage = message;
      },
    });
  }

  select(permutation: SchedulePermutation | null): void {
    this.selected = permutation;
  }

  /** Whether a schedule is the one on screen. */
  isSelected(permutation: SchedulePermutation): boolean {
    return this.selected !== null && permutationsEqual(this.selected, permutation);
  }

  dispose(): void {
    this.source.terminate();
  }

  /**
   * Take a batch of results.
   *
   * The first schedule is auto-selected so the pane is never blank, but if the
   * student's previous choice survived the regeneration it is kept instead —
   * toggling one section should not throw away the schedule they were reading.
   */
  private acceptBatch(batch: SchedulePermutation[], previous: SchedulePermutation | null): void {
    if (this.permutations.length >= PERMUTATION_LIMIT) return;

    this.permutations = [...this.permutations, ...batch].slice(0, PERMUTATION_LIMIT);

    if (this.selected === null) {
      const restored =
        previous === null
          ? undefined
          : this.permutations.find((candidate) => permutationsEqual(candidate, previous));
      this.selected = restored ?? this.permutations[0] ?? null;
    }

    if (this.permutations.length >= PERMUTATION_LIMIT) {
      this.source.cancel();
      this.status = 'done';
    }
  }
}
