/**
 * A small catalog shaped for the fix-panel tests: combined lecture/lab
 * sections with named profs, a B-term alternative, and a course that clashes
 * with the others at TR 10am.
 */
import { Catalog } from '$lib/model/catalog';
import { parseDayMask } from '$lib/model/days';
import { parseClockTime } from '$lib/model/time';
import type { PeriodJson, SectionJson, TermName } from '$lib/model/schedb';
import { makeCatalog, makeCourse, makePeriod, makeSection } from './miniCatalog';

/** One meeting: `part('AL01', 'Lecture', 'Grace Hopper', 'tue,thu', '10:00AM-10:50AM')`. */
export function part(sectionNumber: string, type: string, professor: string, days: string, range: string): PeriodJson {
  const [start, end] = range.split('-');
  return makePeriod({
    sectionNumber,
    type,
    professor,
    days: parseDayMask(days),
    startMinutes: parseClockTime(start),
    endMinutes: parseClockTime(end),
  });
}

/** A combined section whose periods keep their own labels. */
export function combo(id: string, periods: PeriodJson[], terms: TermName[] = ['A']): SectionJson {
  return { ...makeSection(id, terms, []), periods };
}

const HOPPER_LECTURE_TR10 = part('AL01', 'Lecture', 'Grace Hopper', 'tue,thu', '10:00AM-10:50AM');

export const FIX_CATALOG = makeCatalog('CS', [
  makeCourse('CS', '1102', 'Accelerated Intro', [
    combo('CS|1102|AL01/AX01', [HOPPER_LECTURE_TR10, part('AX01', 'Lab', 'Sam Park', 'wed', '3:00PM-4:50PM')]),
    combo('CS|1102|AL01/AX02', [HOPPER_LECTURE_TR10, part('AX02', 'Lab', 'Jane Lee', 'thu', '3:00PM-4:50PM')]),
    combo('CS|1102|AL03/AX03', [
      part('AL03', 'Lecture', 'Grace Hopper', 'mon,wed,fri', '1:00PM-1:50PM'),
      part('AX03', 'Lab', 'Sam Park', 'wed', '3:00PM-4:50PM'),
    ]),
    combo('CS|1102|AL04/AX04', [
      part('AL04', 'Lecture', 'Donald Knuth', 'mon,wed,fri', '9:00AM-9:50AM'),
      part('AX04', 'Lab', 'Sam Park', 'wed', '3:00PM-4:50PM'),
    ]),
    combo(
      'CS|1102|BL01/BX01',
      [
        part('BL01', 'Lecture', 'Grace Hopper', 'tue,thu', '10:00AM-10:50AM'),
        part('BX01', 'Lab', 'Sam Park', 'wed', '3:00PM-4:50PM'),
      ],
      ['B'],
    ),
  ]),
  makeCourse('CS', '2102', 'Object-Oriented Design', [
    combo('CS|2102|AL01', [part('AL01', 'Lecture', 'Ada Lovelace', 'mon,wed,fri', '8:00AM-8:50AM')]),
    combo('CS|2102|AL02', [part('AL02', 'Lecture', 'Alan Turing', 'tue,thu', '10:00AM-10:50AM')]),
  ]),
  makeCourse('CS', '3733', 'Software Engineering', [
    combo('CS|3733|A01', [part('A01', 'Lecture', 'Barbara Liskov', 'mon,wed,fri', '1:00PM-1:50PM')]),
    combo('CS|3733|A02', [part('A02', 'Lecture', 'Barbara Liskov', 'mon,wed,fri', '2:00PM-2:50PM')]),
  ]),
]);

export function fixCatalog(): Catalog {
  return new Catalog(structuredClone(FIX_CATALOG));
}

/** The schedule "on screen" in most fix tests, as fix baselines (one section per course). */
export const ON_SCREEN = new Map([
  ['CS|1102', ['CS|1102|AL01/AX01']],
  ['CS|2102', ['CS|2102|AL01']],
  ['CS|3733', ['CS|3733|A01']],
]);
