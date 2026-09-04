import { describe, expect, it } from 'vitest';
import {
  CELLS_PER_HOUR,
  GRID_CELL_COUNT,
  GRID_COLUMNS,
  GRID_ROWS,
  NUM_DAYS,
  NUM_HOURS,
  START_DAY,
  START_HOUR,
  cellIndex,
  columnToDayIndex,
  dayIndexToColumn,
  gridEndMinutes,
  gridStartMinutes,
  isInsideGrid,
  minutesToRow,
  rowToMinutes,
} from '$lib/model/timeGrid';

describe('grid constants', () => {
  // PLAN.md §5 requires these to stay identical to TimeCell.java, with the one
  // documented exception of NUM_HOURS.
  it('match the legacy TimeCell constants exactly', () => {
    expect(START_DAY).toBe(1);
    expect(START_HOUR).toBe(8);
    expect(CELLS_PER_HOUR).toBe(2);
    expect(NUM_DAYS).toBe(5);
  });

  // Widened from the legacy 10 so evening sections are schedulable at all; a
  // narrower grid deletes them from the search. See timeConflicts.ts.
  it('covers 13 hours, three more than the legacy grid', () => {
    expect(NUM_HOURS).toBe(13);
  });

  it('derives a 26-row by 5-column grid', () => {
    expect(GRID_ROWS).toBe(26);
    expect(GRID_COLUMNS).toBe(5);
    expect(GRID_CELL_COUNT).toBe(130);
  });

  it('spans 8:00AM to 9:00PM', () => {
    expect(gridStartMinutes()).toBe(8 * 60);
    expect(gridEndMinutes()).toBe(21 * 60);
  });
});

describe('rowToMinutes', () => {
  it('puts the first row at the grid start hour', () => {
    expect(rowToMinutes(0)).toBe(8 * 60);
  });

  it('advances a half hour per row', () => {
    expect(rowToMinutes(1)).toBe(8 * 60 + 30);
    expect(rowToMinutes(25)).toBe(20 * 60 + 30);
  });
});

describe('minutesToRow', () => {
  it('inverts rowToMinutes', () => {
    for (let row = 0; row < GRID_ROWS; row++) {
      expect(minutesToRow(rowToMinutes(row))).toBe(row);
    }
  });

  it('reports rows outside the grid so callers can reject them', () => {
    expect(minutesToRow(7 * 60)).toBe(-2);
    expect(minutesToRow(21 * 60)).toBe(GRID_ROWS);
  });
});

describe('column and day index', () => {
  it('maps the first column onto Monday', () => {
    expect(columnToDayIndex(0)).toBe(1);
  });

  it('maps the last column onto Friday', () => {
    expect(columnToDayIndex(GRID_COLUMNS - 1)).toBe(5);
  });

  it('inverts back to the column', () => {
    expect(dayIndexToColumn(3)).toBe(2);
  });

  it('gives a negative column for a day the grid does not cover', () => {
    expect(dayIndexToColumn(0)).toBe(-1);
    expect(dayIndexToColumn(6)).toBe(5);
  });
});

describe('isInsideGrid', () => {
  it('accepts a Tuesday mid-morning cell', () => {
    expect(isInsideGrid(minutesToRow(10 * 60), dayIndexToColumn(2))).toBe(true);
  });

  it('rejects a Saturday cell', () => {
    expect(isInsideGrid(0, dayIndexToColumn(6))).toBe(false);
  });

  it('rejects a 7AM cell', () => {
    expect(isInsideGrid(minutesToRow(7 * 60), 0)).toBe(false);
  });
});

describe('cellIndex', () => {
  it('lays cells out row-major so a flat array can back the grid', () => {
    expect(cellIndex(0, 0)).toBe(0);
    expect(cellIndex(0, 4)).toBe(4);
    expect(cellIndex(1, 0)).toBe(5);
    expect(cellIndex(GRID_ROWS - 1, GRID_COLUMNS - 1)).toBe(GRID_CELL_COUNT - 1);
  });
});
