/**
 * Helpers for building the small, explicit section sets the scheduling tests
 * reason about. Times are written as `9:00` style strings for readability.
 */
import { parseDayMask } from '$lib/model/days';
import { parseClockTime } from '$lib/model/time';
import { GRID_CELL_COUNT } from '$lib/model/timeGrid';
import { TERM_NAMES } from '$lib/model/terms';
import type { TermName } from '$lib/model/schedb';
import type { ChosenTimes, GeneratorPeriod, GeneratorSection } from '$lib/scheduling/types';

/** `"9:00AM-9:50AM mon,wed,fri"` -> a generator period. */
export function period(spec: string): GeneratorPeriod {
  const [range, days] = spec.split(' ');
  const [start, end] = range.split('-');
  return {
    days: parseDayMask(days ?? '?'),
    startMinutes: parseClockTime(start),
    endMinutes: parseClockTime(end),
  };
}

export function section(
  id: string,
  terms: TermName[],
  periodSpecs: string[],
): GeneratorSection {
  const courseId = id.split('|').slice(0, 2).join('|');
  return { id, courseId, terms, periods: periodSpecs.map(period) };
}

/** Every cell of every term selected — the default a fresh student has. */
export function allTimesAvailable(): ChosenTimes {
  const times = {} as ChosenTimes;
  for (const term of TERM_NAMES) times[term] = new Array<boolean>(GRID_CELL_COUNT).fill(true);
  return times;
}

/** Every cell of every term blocked out. */
export function noTimesAvailable(): ChosenTimes {
  const times = allTimesAvailable();
  for (const term of TERM_NAMES) times[term].fill(false);
  return times;
}
