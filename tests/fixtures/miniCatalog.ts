/**
 * A hand-built three-course catalog used by the model and state tests.
 *
 * Times are deliberately arranged so CS2102 conflicts with MA1021 on Monday and
 * nothing else conflicts, and PH1110 spans two terms.
 */
import type { CourseJson, PeriodJson, SchedbFile, SectionJson, TermName } from '$lib/model/schedb';
import { SCHEDB_FORMAT_VERSION } from '$lib/model/schedb';
import { parseDayMask } from '$lib/model/days';

export function makePeriod(overrides: Partial<PeriodJson> = {}): PeriodJson {
  return {
    type: 'Lecture',
    professor: 'A Professor',
    days: parseDayMask('mon,wed,fri'),
    startMinutes: 9 * 60,
    endMinutes: 9 * 60 + 50,
    location: 'SL 104',
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 5,
    sectionNumber: 'A01',
    ...overrides,
  };
}

export function makeSection(
  id: string,
  terms: TermName[],
  periods: PeriodJson[],
  overrides: Partial<SectionJson> = {},
): SectionJson {
  const number = id.split('|')[2];
  return {
    id,
    crn: id,
    number,
    termLabel: terms.map((term) => `${term} Term`).join(', '),
    terms,
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 5,
    descriptionIndex: 0,
    periods: periods.map((period) => ({ ...period, sectionNumber: number })),
    ...overrides,
  };
}

export function makeCourse(
  deptAbbrev: string,
  number: string,
  name: string,
  sections: SectionJson[],
): CourseJson {
  return {
    id: `${deptAbbrev}|${number}`,
    number,
    name,
    minCredits: 1,
    maxCredits: 1,
    descriptionIndex: 0,
    sections,
  };
}

/**
 * A one-department catalog, for tests that need meeting patterns of their own.
 *
 * Kept separate from {@link MINI_CATALOG} so a test can add odd-shaped sections
 * without shifting the course counts every other test asserts on.
 */
export function makeCatalog(deptAbbrev: string, courses: CourseJson[]): SchedbFile {
  return {
    formatVersion: SCHEDB_FORMAT_VERSION,
    generated: '11:14 PM Feb 19, 2025',
    minutesPerBlock: 30,
    descriptions: ['A description shared by everything in the mini catalog.'],
    departments: [{ abbrev: deptAbbrev, name: `${deptAbbrev} Department`, courses }],
  };
}

const hour = (h: number, m = 0) => h * 60 + m;

export const MINI_CATALOG: SchedbFile = {
  formatVersion: SCHEDB_FORMAT_VERSION,
  generated: '11:14 PM Feb 19, 2025',
  minutesPerBlock: 30,
  descriptions: ['A description shared by everything in the mini catalog.'],
  departments: [
    {
      abbrev: 'CS',
      name: 'Computer Science',
      courses: [
        makeCourse('CS', '2102', 'Object-Oriented Design Concepts', [
          makeSection('CS|2102|A01', ['A'], [makePeriod({ startMinutes: hour(9), endMinutes: hour(9, 50) })]),
          makeSection('CS|2102|A02', ['A'], [makePeriod({ startMinutes: hour(13), endMinutes: hour(13, 50) })]),
        ]),
      ],
    },
    {
      abbrev: 'MA',
      name: 'Mathematical Sciences',
      courses: [
        makeCourse('MA', '1021', 'Calculus I', [
          // Overlaps CS|2102|A01 exactly.
          makeSection('MA|1021|A01', ['A'], [makePeriod({ startMinutes: hour(9), endMinutes: hour(9, 50) })]),
          makeSection('MA|1021|A02', ['A'], [makePeriod({ startMinutes: hour(11), endMinutes: hour(11, 50) })]),
        ]),
      ],
    },
    {
      abbrev: 'PH',
      name: 'Physics',
      courses: [
        makeCourse('PH', '1110', 'General Physics - Mechanics', [
          makeSection(
            'PH|1110|A01',
            ['A', 'B'],
            [makePeriod({ days: parseDayMask('tue,thu'), startMinutes: hour(10), endMinutes: hour(10, 50) })],
          ),
        ]),
      ],
    },
  ],
};
