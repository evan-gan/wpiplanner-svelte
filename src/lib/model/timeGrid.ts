/**
 * The chosen-times grid: which half-hour blocks of which weekdays a student is
 * willing to have class.
 *
 * The constants below decide which sections the Times tab can exclude, so they
 * are pinned by a test. Four of the five are `TimeCell.java` verbatim; the fifth,
 * {@link NUM_HOURS}, is deliberately larger than the legacy 10. The old grid
 * stopped at 6:00PM while the schedule grids drew as late as 9:00PM, so a class
 * a student could see was one the search would never place. See
 * `scheduling/timeConflicts.ts` for why an uncovered hour is an unschedulable
 * one.
 */
import { MINUTES_PER_HOUR } from './time.ts';

/** Sunday-based index of the grid's first column. 1 = Monday. */
export const START_DAY = 1;
/** Hour of day the grid's first row covers. */
export const START_HOUR = 8;
/** Minutes past {@link START_HOUR} the first row begins at. */
export const START_MIN = 0;
/** Rows per hour; 2 means half-hour blocks. */
export const CELLS_PER_HOUR = 2;
/** Columns — Monday through Friday. */
export const NUM_DAYS = 5;
/**
 * Hours the grid spans, starting at {@link START_HOUR}.
 *
 * 13 covers through 9:00PM, past the latest meeting in the catalog (8:50PM).
 * Rows are appended at the bottom and {@link GRID_COLUMNS} is unchanged, so the
 * blocked-cell indices already in `localStorage` still address the same cells.
 */
export const NUM_HOURS = 13;

/** Minutes covered by one cell. */
export const MINUTES_PER_CELL = MINUTES_PER_HOUR / CELLS_PER_HOUR;

export const GRID_ROWS = NUM_HOURS * CELLS_PER_HOUR;
export const GRID_COLUMNS = NUM_DAYS;
export const GRID_CELL_COUNT = GRID_ROWS * GRID_COLUMNS;

/** Minutes since midnight at the top of the grid. */
export function gridStartMinutes(): number {
  return START_HOUR * MINUTES_PER_HOUR + START_MIN;
}

/** Minutes since midnight just past the bottom of the grid. */
export function gridEndMinutes(): number {
  return gridStartMinutes() + GRID_ROWS * MINUTES_PER_CELL;
}

/** Minutes since midnight at the top of a row. */
export function rowToMinutes(row: number): number {
  return gridStartMinutes() + row * MINUTES_PER_CELL;
}

/**
 * The row containing a time.
 *
 * Returns a row outside `0..GRID_ROWS-1` for times the grid does not cover;
 * callers decide what that means rather than being handed a clamped lie.
 */
export function minutesToRow(totalMinutes: number): number {
  return Math.floor((totalMinutes - gridStartMinutes()) / MINUTES_PER_CELL);
}

/** Sunday-based day index for a grid column. */
export function columnToDayIndex(column: number): number {
  return START_DAY + column;
}

/** Grid column for a Sunday-based day index; negative or >= NUM_DAYS if off-grid. */
export function dayIndexToColumn(dayIndex: number): number {
  return dayIndex - START_DAY;
}

/** Whether a (row, column) pair addresses a real cell. */
export function isInsideGrid(row: number, column: number): boolean {
  return row >= 0 && row < GRID_ROWS && column >= 0 && column < GRID_COLUMNS;
}

/** Row-major index into a flat `GRID_CELL_COUNT`-length array. */
export function cellIndex(row: number, column: number): number {
  return row * GRID_COLUMNS + column;
}
