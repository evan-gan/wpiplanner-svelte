import { describe, expect, it } from 'vitest';
import { ChosenTimesState } from '$lib/state/chosenTimes.svelte';
import { createMemoryStorage } from '$lib/state/persistence';
import { GRID_COLUMNS, GRID_ROWS } from '$lib/model/timeGrid';

const make = () => new ChosenTimesState(createMemoryStorage());

describe('the starting grid', () => {
  it('has every cell of every term available', () => {
    const times = make();
    expect(times.isSelected('A', 0, 0)).toBe(true);
    expect(times.isSelected('D', GRID_ROWS - 1, GRID_COLUMNS - 1)).toBe(true);
  });
});

describe('setSelected', () => {
  it('blocks a single cell', () => {
    const times = make();
    times.setSelected('A', 3, 2, false);
    expect(times.isSelected('A', 3, 2)).toBe(false);
  });

  it('leaves the other terms alone', () => {
    const times = make();
    times.setSelected('A', 3, 2, false);
    expect(times.isSelected('B', 3, 2)).toBe(true);
  });

  it('ignores a cell outside the grid instead of growing the array', () => {
    const times = make();
    times.setSelected('A', GRID_ROWS + 5, 0, false);
    expect(times.snapshot().A).toHaveLength(GRID_ROWS * GRID_COLUMNS);
  });
});

describe('applyDrag', () => {
  it('blocks the whole rectangle when the anchor cell was available', () => {
    const times = make();
    times.applyDrag('A', { row: 1, column: 1 }, { row: 3, column: 2 });

    expect(times.isSelected('A', 1, 1)).toBe(false);
    expect(times.isSelected('A', 3, 2)).toBe(false);
    expect(times.isSelected('A', 2, 2)).toBe(false);
    expect(times.isSelected('A', 0, 1)).toBe(true);
    expect(times.isSelected('A', 1, 3)).toBe(true);
  });

  it('re-opens the whole rectangle when the anchor cell was blocked', () => {
    const times = make();
    times.applyDrag('A', { row: 1, column: 1 }, { row: 3, column: 2 });
    times.applyDrag('A', { row: 1, column: 1 }, { row: 3, column: 2 });
    expect(times.isSelected('A', 2, 2)).toBe(true);
  });

  it('takes its direction from the anchor even across mixed cells', () => {
    const times = make();
    times.setSelected('A', 2, 2, false);
    // Anchor is still available, so the drag blocks everything it covers.
    times.applyDrag('A', { row: 1, column: 1 }, { row: 3, column: 3 });
    expect(times.isSelected('A', 2, 2)).toBe(false);
    expect(times.isSelected('A', 1, 1)).toBe(false);
  });

  it('works when dragged up and to the left', () => {
    const times = make();
    times.applyDrag('A', { row: 3, column: 3 }, { row: 1, column: 1 });
    expect(times.isSelected('A', 2, 2)).toBe(false);
  });

  it('ignores a drag that starts outside the grid', () => {
    const times = make();
    times.applyDrag('A', { row: -1, column: 0 }, { row: 2, column: 2 });
    expect(times.isSelected('A', 2, 2)).toBe(true);
  });

  it('previews the direction a drag will take', () => {
    const times = make();
    expect(times.dragWouldSelect('A', { row: 0, column: 0 })).toBe(false);
    times.setSelected('A', 0, 0, false);
    expect(times.dragWouldSelect('A', { row: 0, column: 0 })).toBe(true);
  });
});

describe('allowTime', () => {
  it('re-opens one blocked cell, which is what applying a time fix does', () => {
    const times = make();
    times.setSelected('B', 4, 1, false);
    times.allowTime('B', 4, 1);
    expect(times.isSelected('B', 4, 1)).toBe(true);
  });
});

describe('persistence', () => {
  it('restores a saved grid', () => {
    const storage = createMemoryStorage();
    const first = new ChosenTimesState(storage);
    first.applyDrag('C', { row: 0, column: 0 }, { row: 1, column: 1 });

    const second = new ChosenTimesState(storage);
    second.restore();

    expect(second.isSelected('C', 1, 1)).toBe(false);
    expect(second.isSelected('C', 2, 2)).toBe(true);
  });

  it('reset clears every block', () => {
    const times = make();
    times.setSelected('A', 0, 0, false);
    times.reset();
    expect(times.isSelected('A', 0, 0)).toBe(true);
  });
});
