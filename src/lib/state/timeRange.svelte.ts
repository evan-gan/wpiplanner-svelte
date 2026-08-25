/**
 * The hours the schedule grids show.
 *
 * Ported from `StudentSchedule.updateTimeRange`: the window always covers at
 * least 10:00–16:00 and stretches to fit the earliest and latest period of any
 * *chosen* course, whether or not that section is currently switched on. That
 * last detail matters — the grid must not resize every time a checkbox moves.
 */
import type { CourseSectionLists } from '$lib/scheduling/types';
import { minutesToDecimalHours } from '$lib/model/time';

/** The window before any course is chosen, matching the legacy field defaults. */
export const DEFAULT_START_HOUR = 8;
export const DEFAULT_END_HOUR = 16;

/** The narrowest window the grid ever shows once courses are chosen. */
const MINIMUM_START_HOUR = 10;
const MINIMUM_END_HOUR = 16;

export interface TimeRange {
  startHour: number;
  endHour: number;
}

/** The window that fits every period of every section handed in. */
export function computeTimeRange(courses: CourseSectionLists): TimeRange {
  let startHour = MINIMUM_START_HOUR;
  let endHour = MINIMUM_END_HOUR;

  for (const sections of courses) {
    for (const section of sections) {
      for (const period of section.periods) {
        startHour = Math.min(minutesToDecimalHours(period.startMinutes), startHour);
        endHour = Math.max(minutesToDecimalHours(period.endMinutes), endHour);
      }
    }
  }

  return { startHour: Math.floor(startHour), endHour: Math.ceil(endHour) };
}

export class TimeRangeState {
  startHour = $state(DEFAULT_START_HOUR);
  endHour = $state(DEFAULT_END_HOUR);

  /** Recompute from every section of the chosen courses. */
  update(courses: CourseSectionLists): void {
    const { startHour, endHour } = computeTimeRange(courses);
    this.startHour = startHour;
    this.endHour = endHour;
  }

  get hours(): number {
    return this.endHour - this.startHour;
  }

  /** Where a time sits in the window, as 0..1 — the grid's vertical position. */
  progress(totalMinutes: number): number {
    return (minutesToDecimalHours(totalMinutes) - this.startHour) / this.hours;
  }
}
