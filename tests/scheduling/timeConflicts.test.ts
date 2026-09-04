import { describe, expect, it } from 'vitest';
import { cellIndex, dayIndexToColumn, minutesToRow } from '$lib/model/timeGrid';
import { getTimeConflicts, hasTimeConflicts } from '$lib/scheduling/timeConflicts';
import { allTimesAvailable, noTimesAvailable, section } from '../fixtures/generatorFixtures';

/** Block out one half-hour cell of one term. */
function block(times: ReturnType<typeof allTimesAvailable>, term: 'A' | 'B' | 'C' | 'D', clock: number, dayIndex: number) {
  times[term][cellIndex(minutesToRow(clock), dayIndexToColumn(dayIndex))] = false;
  return times;
}

const MONDAY = 1;
const TUESDAY = 2;

describe('hasTimeConflicts', () => {
  it('is false when every cell the section needs is available', () => {
    const cs = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon']);
    expect(hasTimeConflicts(cs, allTimesAvailable())).toBe(false);
  });

  it('is true when the student blocked out a cell the section covers', () => {
    const cs = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon']);
    const times = block(allTimesAvailable(), 'A', 9 * 60, MONDAY);
    expect(hasTimeConflicts(cs, times)).toBe(true);
  });

  it('only cares about the terms the section is taught in', () => {
    const cs = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon']);
    const times = block(allTimesAvailable(), 'B', 9 * 60, MONDAY);
    expect(hasTimeConflicts(cs, times)).toBe(false);
  });

  it('checks every term of a two-term section', () => {
    const ph = section('PH|1110|A01', ['A', 'B'], ['9:00AM-9:50AM mon']);
    const times = block(allTimesAvailable(), 'B', 9 * 60, MONDAY);
    expect(hasTimeConflicts(ph, times)).toBe(true);
  });

  it('ignores periods whose meeting days the export did not supply', () => {
    const unknown = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM ?']);
    expect(hasTimeConflicts(unknown, noTimesAvailable())).toBe(false);
  });
});

describe('getTimeConflicts', () => {
  it('reports the exact cells that are blocked, per term', () => {
    const cs = section('CS|2102|A01', ['A'], ['9:00AM-10:50AM mon']);
    const times = block(allTimesAvailable(), 'A', 10 * 60, MONDAY);
    const conflicts = getTimeConflicts(cs, times);

    expect(conflicts.A).toHaveLength(1);
    expect(conflicts.A![0]).toMatchObject({
      dayIndex: MONDAY,
      startMinutes: 10 * 60,
      row: minutesToRow(10 * 60),
      column: dayIndexToColumn(MONDAY),
    });
  });

  it('walks every half-hour block a period covers', () => {
    // 9:00-10:50 touches the 9:00, 9:30, 10:00 and 10:30 cells.
    const cs = section('CS|2102|A01', ['A'], ['9:00AM-10:50AM mon']);
    expect(getTimeConflicts(cs, noTimesAvailable()).A).toHaveLength(4);
  });

  it('snaps a period that does not start on :00 or :30 back into its block', () => {
    // A 9:10 start is tested against the 9:00 cell, not a 9:10 cell that does
    // not exist. This snapping is load-bearing for parity with the old app.
    const cs = section('CS|2102|A01', ['A'], ['9:10AM-9:50AM mon']);
    const times = block(allTimesAvailable(), 'A', 9 * 60, MONDAY);
    expect(getTimeConflicts(cs, times).A).toHaveLength(1);
  });

  it('collects conflicts across every day and period of a section', () => {
    const cs = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon,tue']);
    const times = block(block(allTimesAvailable(), 'A', 9 * 60, MONDAY), 'A', 9 * 60, TUESDAY);
    expect(getTimeConflicts(cs, times).A).toHaveLength(2);
  });

  it('reports a cell once even when two periods land in it', () => {
    const cs = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon', '9:00AM-9:20AM mon']);
    const times = block(allTimesAvailable(), 'A', 9 * 60, MONDAY);
    expect(getTimeConflicts(cs, times).A).toHaveLength(1);
  });

  it('has an entry for each of a section’s terms and no others', () => {
    const ph = section('PH|1110|A01', ['A', 'B'], ['9:00AM-9:50AM mon']);
    expect(Object.keys(getTimeConflicts(ph, allTimesAvailable())).sort()).toEqual(['A', 'B']);
  });
});

describe('times the chosen-times grid cannot express', () => {
  // The grid covers Monday–Friday, 8:00AM–9:00PM. A block outside it can never
  // be selected, so a section meeting there always conflicts and is never
  // schedulable. The legacy grid stopped at 6:00PM, which made that rule delete
  // every evening section; the widened grid leaves only the weekend and the
  // hours before 8:00AM. The crash is still gone: a Saturday section used to
  // throw an NPE inside the generator.
  it('schedules an evening section that the legacy 6:00PM grid excluded', () => {
    const evening = section('CS|4432|A01', ['A'], ['6:00PM-8:50PM mon']);
    expect(hasTimeConflicts(evening, allTimesAvailable())).toBe(false);
  });

  it('still excludes a section running past the bottom of the grid', () => {
    const late = section('CS|4432|A01', ['A'], ['8:30PM-9:50PM mon']);
    expect(hasTimeConflicts(late, allTimesAvailable())).toBe(true);
  });

  it('excludes an early-morning section even with the whole grid available', () => {
    const early = section('PE|1110|A01', ['A'], ['7:00AM-7:50AM mon']);
    expect(hasTimeConflicts(early, allTimesAvailable())).toBe(true);
  });

  it('excludes a weekend section instead of throwing', () => {
    const weekend = section('MU|1611|A01', ['A'], ['9:00AM-9:50AM sat']);
    expect(() => hasTimeConflicts(weekend, allTimesAvailable())).not.toThrow();
    expect(hasTimeConflicts(weekend, allTimesAvailable())).toBe(true);
  });

  it('marks an out-of-grid block as one the student cannot re-enable', () => {
    const late = section('CS|4432|A01', ['A'], ['9:00PM-9:50PM mon']);
    const [cell] = getTimeConflicts(late, allTimesAvailable()).A ?? [];

    expect(cell.insideGrid).toBe(false);
    expect(cell.dayIndex).toBe(1);
    expect(cell.startMinutes).toBe(21 * 60);
  });

  it('reports both halves of a section that straddles the grid edge', () => {
    // 8:00PM-10:00PM: the 8:00 and 8:30 blocks are real cells, 9:00 and 9:30
    // are past the bottom of the grid.
    const spanning = section('CS|4432|A01', ['A'], ['8:00PM-10:00PM mon']);
    const cells = getTimeConflicts(spanning, noTimesAvailable()).A ?? [];

    expect(cells.map((cell) => cell.startMinutes)).toEqual([
      20 * 60,
      20 * 60 + 30,
      21 * 60,
      21 * 60 + 30,
    ]);
    expect(cells.map((cell) => cell.insideGrid)).toEqual([true, true, false, false]);
  });

  it('does not let an out-of-grid block collide with a real cell', () => {
    // Saturday 8:00AM lands on column 5, whose flat index is the same as
    // Monday's 8:30 cell. Both must survive as separate conflicts.
    const saturday = section('MU|1611|A01', ['A'], ['8:00AM-8:30AM sat,mon']);
    const cells = getTimeConflicts(saturday, noTimesAvailable()).A ?? [];

    expect(cells).toHaveLength(2);
    expect(cells.map((cell) => cell.dayIndex).sort()).toEqual([1, 6]);
  });
});
