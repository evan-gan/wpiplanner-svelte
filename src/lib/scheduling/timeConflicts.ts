/**
 * Which half-hour cells a section needs that the student has blocked out.
 *
 * Ported from `ScheduleProducer.getTimeConflicts`. Two details are load-bearing:
 *
 * 1. **Start times snap to the enclosing block.** A 9:10 lecture is tested
 *    against the 9:00 cell. Changing this changes which sections the Times tab
 *    excludes, so it is preserved exactly.
 * 2. **Cells outside the grid count as blocked.** A cell outside the grid can
 *    never be selected, so a section meeting there always conflicts and is never
 *    schedulable. The legacy app did the same, but its grid stopped at 6:00PM,
 *    which silently deleted every evening section from the search while the
 *    schedule grids still drew the 7:00PM and 8:00PM rows. The grid now runs to
 *    9:00PM (`timeGrid.ts`), past the latest meeting in the catalog, so the only
 *    times still excluded by this rule are the weekend — which no section in the
 *    Workday feed uses — and anything before 8:00AM.
 *
 *    The other legacy behaviour deliberately not kept is the crash: a weekend
 *    section indexed a row of the chosen-times map that did not exist and threw
 *    an NPE inside the search. Here it is an ordinary conflict.
 *
 * Cells outside the grid are marked `insideGrid: false`, because the conflict
 * resolver cannot offer to re-enable a cell the student was never shown.
 */
import { dayMaskToNames } from '$lib/model/days';
import { DAY_BITS, type TermName } from '$lib/model/schedb';
import { snapToBlockStart } from '$lib/model/time';
import {
  MINUTES_PER_CELL,
  cellIndex,
  dayIndexToColumn,
  isInsideGrid,
  minutesToRow,
  rowToMinutes,
} from '$lib/model/timeGrid';
import type { ChosenTimes, GeneratorSection, TimeConflictCell } from './types';

export type TermTimeConflicts = Partial<Record<TermName, TimeConflictCell[]>>;

/** Sunday-based day indexes a period meets on. */
function periodDayIndexes(days: number): number[] {
  return dayMaskToNames(days).map((name) => Math.log2(DAY_BITS[name]));
}

/**
 * The blocked-out cells each term of a section would need.
 *
 * @returns One entry per term the section is taught in; the array is empty when
 *   that term has no conflict
 */
export function getTimeConflicts(
  section: GeneratorSection,
  chosenTimes: ChosenTimes,
): TermTimeConflicts {
  const conflicts: TermTimeConflicts = {};

  for (const term of section.terms) {
    const cells: TimeConflictCell[] = [];
    // Keyed by day and time rather than by cell index: an out-of-grid row or
    // column produces an index that can collide with a real cell's.
    const seen = new Set<string>();
    const selected = chosenTimes[term];

    for (const period of section.periods) {
      for (const dayIndex of periodDayIndexes(period.days)) {
        const column = dayIndexToColumn(dayIndex);

        for (
          let minutes = snapToBlockStart(period.startMinutes);
          minutes < period.endMinutes;
          minutes += MINUTES_PER_CELL
        ) {
          const row = minutesToRow(minutes);
          const insideGrid = isInsideGrid(row, column);

          if (insideGrid && selected[cellIndex(row, column)]) continue;

          const key = `${dayIndex}:${minutes}`;
          if (seen.has(key)) continue;
          seen.add(key);

          // rowToMinutes only reconstructs the block start for a real row; off
          // the grid the snapped minutes are already the block start.
          cells.push({
            row,
            column,
            dayIndex,
            startMinutes: insideGrid ? rowToMinutes(row) : minutes,
            insideGrid,
          });
        }
      }
    }

    conflicts[term] = cells;
  }

  return conflicts;
}

/** Whether any term of the section runs into a blocked-out cell. */
export function hasTimeConflicts(section: GeneratorSection, chosenTimes: ChosenTimes): boolean {
  const conflicts = getTimeConflicts(section, chosenTimes);
  return section.terms.some((term) => (conflicts[term]?.length ?? 0) > 0);
}
