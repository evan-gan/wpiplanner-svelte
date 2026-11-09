/**
 * The fix panel: which rail row it is open for, and the search result.
 *
 * Nothing is solved until the student rests on (or clicks) a row's "Clashes" link — that is
 * the only thing that calls {@link FixPanelState.open}. Results are cached per
 * row and on-screen schedule until the choices change (`AppState.refresh`
 * calls {@link FixPanelState.invalidate}), so reopening the same row is free.
 */
import type { FixRequest, FixResult } from '$lib/scheduling/fixFinder';
import { FixFinderClient } from '$lib/scheduling/worker/fixFinderClient';

/** A rail row whose "Clashes" link can open the panel. */
export interface FixTrigger {
  courseId: string;
  componentNumber: string;
  componentSectionIds: readonly string[];
  /** The combined section standing in for the component (closest to what is on screen). */
  pickedSectionId: string;
}

export interface FixTarget {
  courseId: string;
  /** The lecture/lab/discussion label clicked, e.g. "AL02". */
  componentNumber: string;
  /** The combined section standing in for it in the header and the clash list. */
  pickedSectionId: string;
  /** Course id → its baseline when the panel opened (`AppState.fixBaselines`); every card is measured against it. */
  baselines: ReadonlyMap<string, readonly string[]>;
}

export type FixSearchStatus = 'searching' | 'done' | 'error';

/** The first search's time limit; past it the panel says so and offers a longer one. */
export const QUICK_SEARCH_MS = 1000;
/** "Search longer"; closing the panel stops it at any point. */
export const LONG_SEARCH_MS = 30_000;

/** The part of {@link FixFinderClient} this state needs; injectable for tests. */
export interface FixSource {
  find(request: FixRequest, handlers: { onResult(result: FixResult): void; onError(message: string): void }): void;
  cancel(): void;
  terminate(): void;
}

export class FixPanelState {
  target = $state.raw<FixTarget | null>(null);
  status = $state<FixSearchStatus>('searching');
  result = $state.raw<FixResult | null>(null);
  errorMessage = $state<string | null>(null);
  /** The fix being hovered; the calendar draws it instead of the selected schedule. */
  previewSectionIds = $state.raw<string[] | null>(null);
  /** The running or finished search is the long one, so there is no longer one to offer. */
  searchedLonger = $state(false);

  private readonly cache = new Map<string, FixResult>();
  /** The open row's question, kept so "Search longer" can ask it again. */
  private lastQuestion: { request: FixRequest; cacheKey: string } | null = null;

  constructor(private readonly source: FixSource = new FixFinderClient()) {}

  /**
   * Open the panel for a row and solve it, unless this exact question was
   * already answered.
   *
   * @param cacheKey Identifies the row and the schedule on screen
   */
  open(target: FixTarget, request: FixRequest, cacheKey: string): void {
    this.source.cancel();
    this.target = target;
    this.previewSectionIds = null;
    this.errorMessage = null;
    this.searchedLonger = false;
    this.lastQuestion = { request, cacheKey };

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      this.result = cached;
      this.status = 'done';
      return;
    }
    this.run(request, cacheKey, QUICK_SEARCH_MS);
  }

  /** Ask the open row's question again with {@link LONG_SEARCH_MS} to answer it. */
  searchLonger(): void {
    if (this.lastQuestion === null) return;
    this.source.cancel();
    this.searchedLonger = true;
    this.previewSectionIds = null;
    this.run(this.lastQuestion.request, this.lastQuestion.cacheKey, LONG_SEARCH_MS);
  }

  private run(request: FixRequest, cacheKey: string, maxMillis: number): void {
    this.result = null;
    this.errorMessage = null;
    this.status = 'searching';
    this.source.find({ ...request, maxMillis }, {
      onResult: (result) => {
        this.cache.set(cacheKey, result);
        this.result = result;
        this.status = 'done';
      },
      onError: (message) => {
        this.errorMessage = message;
        this.status = 'error';
      },
    });
  }

  /** Hide the panel and stop any search still running. */
  close(): void {
    this.source.cancel();
    this.lastQuestion = null;
    this.target = null;
    this.result = null;
    this.previewSectionIds = null;
  }

  /** The choices changed: every cached answer is stale and the open one with it. */
  invalidate(): void {
    this.cache.clear();
    this.close();
  }

  dispose(): void {
    this.source.terminate();
  }
}
