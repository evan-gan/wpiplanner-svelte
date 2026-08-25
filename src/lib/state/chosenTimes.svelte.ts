/**
 * The per-term availability grid the Times tab edits.
 *
 * Replaces `StudentChosenTimes` + `StudentTermTimes`, which stored a
 * `HashMap<DayOfWeek, List<Time>>` per term and persisted it through a JSNI
 * `JavaScriptObject` overlay keyed by clock strings. A flat boolean array per
 * term says the same thing and indexes in one step.
 *
 * Every cell starts selected: the grid says which times a student *is* available,
 * and a fresh student is available for all of them.
 */
import type { TermName } from '$lib/model/schedb';
import { TERM_NAMES } from '$lib/model/terms';
import { GRID_CELL_COUNT, cellIndex, isInsideGrid } from '$lib/model/timeGrid';
import type { ChosenTimes } from '$lib/scheduling/types';
import {
  browserStorage,
  loadChosenTimes,
  saveChosenTimes,
  type StorageLike,
} from './persistence';

/** A cell address in the grid. */
export interface GridCell {
  row: number;
  column: number;
}

export class ChosenTimesState {
  times = $state<ChosenTimes>(emptyGrid());

  private readonly storage: StorageLike;

  constructor(storage: StorageLike = browserStorage()) {
    this.storage = storage;
  }

  restore(): void {
    this.times = loadChosenTimes(this.storage);
  }

  isSelected(term: TermName, row: number, column: number): boolean {
    if (!isInsideGrid(row, column)) return false;
    return this.times[term][cellIndex(row, column)];
  }

  setSelected(term: TermName, row: number, column: number, selected: boolean): void {
    if (!isInsideGrid(row, column)) return;

    // Replace the array rather than mutating it so `$state` sees the change.
    const next = [...this.times[term]];
    next[cellIndex(row, column)] = selected;
    this.times = { ...this.times, [term]: next };
    this.save();
  }

  /**
   * Apply a drag from `anchor` to `drop`.
   *
   * The whole rectangle takes the *opposite* of the anchor cell's state, which
   * is what makes a drag across mixed cells feel predictable — and is exactly
   * what `TimeChooserController.timeChosen` did.
   */
  applyDrag(term: TermName, anchor: GridCell, drop: GridCell): void {
    if (!isInsideGrid(anchor.row, anchor.column) || !isInsideGrid(drop.row, drop.column)) return;

    const selected = !this.isSelected(term, anchor.row, anchor.column);
    const next = [...this.times[term]];

    for (let row = Math.min(anchor.row, drop.row); row <= Math.max(anchor.row, drop.row); row++) {
      for (
        let column = Math.min(anchor.column, drop.column);
        column <= Math.max(anchor.column, drop.column);
        column++
      ) {
        next[cellIndex(row, column)] = selected;
      }
    }

    this.times = { ...this.times, [term]: next };
    this.save();
  }

  /** Whether a drag would select or deselect, for the live drag preview. */
  dragWouldSelect(term: TermName, anchor: GridCell): boolean {
    return !this.isSelected(term, anchor.row, anchor.column);
  }

  /** Re-open one blocked cell — what applying a time-conflict fix does. */
  allowTime(term: TermName, row: number, column: number): void {
    this.setSelected(term, row, column, true);
  }

  /** Select every cell of every term again. */
  reset(): void {
    this.times = emptyGrid();
    this.save();
  }

  /** A plain, non-reactive copy — what gets posted to the worker. */
  snapshot(): ChosenTimes {
    return $state.snapshot(this.times) as ChosenTimes;
  }

  save(): void {
    saveChosenTimes(this.snapshot(), this.storage);
  }
}

/** Every cell of every term available. */
function emptyGrid(): ChosenTimes {
  const times = {} as ChosenTimes;
  for (const term of TERM_NAMES) {
    times[term] = new Array<boolean>(GRID_CELL_COUNT).fill(true);
  }
  return times;
}
