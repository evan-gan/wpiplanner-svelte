import { describe, expect, it } from 'vitest';
import { Catalog } from '$lib/model/catalog';
import type { TermName } from '$lib/model/schedb';
import {
  OFF_SCHEDULE_KEY,
  OFF_SCHEDULE_LABEL,
  groupCoursesByScheduledTerm,
} from '$lib/model/scheduleTermGroups';
import { makeCatalog, makeCourse, makeSection } from '../fixtures/miniCatalog';

/** A course with one section per listed term run, ids like `CS|1101|A01`. */
function courseIn(number: string, runs: TermName[][]) {
  return makeCourse(
    'CS',
    number,
    `Course ${number}`,
    runs.map((terms, index) => makeSection(`CS|${number}|${terms.join('') || 'X'}0${index + 1}`, terms, [])),
  );
}

const catalog = new Catalog(
  makeCatalog('CS', [
    courseIn('1101', [['A'], ['C']]),
    courseIn('1102', [['B']]),
    courseIn('2102', [['A', 'B']]),
    courseIn('2103', [['A']]),
    courseIn('3000', [[]]),
  ]),
);

const ALL = ['CS|1101', 'CS|1102', 'CS|2102', 'CS|2103', 'CS|3000'];

function summary(scheduled: string[], courseIds = ALL) {
  return groupCoursesByScheduledTerm(catalog, courseIds, scheduled).map((group) => [
    group.label,
    group.courseIds,
  ]);
}

describe('groupCoursesByScheduledTerm', () => {
  it('groups by the scheduled section’s term, not every term the course is offered in', () => {
    expect(summary(['CS|1101|C02', 'CS|1102|B01'], ['CS|1101', 'CS|1102'])).toEqual([
      ['Currently In B-Term:', ['CS|1102']],
      ['Currently In C-Term:', ['CS|1101']],
    ]);
  });

  it('places a semester-long course between its two terms', () => {
    expect(summary(['CS|1102|B01', 'CS|2102|AB01', 'CS|2103|A01'], ['CS|1102', 'CS|2102', 'CS|2103'])).toEqual([
      ['Currently In A-Term:', ['CS|2103']],
      ['Currently In A-Term – B-Term:', ['CS|2102']],
      ['Currently In B-Term:', ['CS|1102']],
    ]);
  });

  it('keeps the chosen order within a group', () => {
    expect(summary(['CS|2103|A01', 'CS|1101|A01'], ['CS|2103', 'CS|1101'])).toEqual([
      ['Currently In A-Term:', ['CS|2103', 'CS|1101']],
    ]);
  });

  it('puts courses missing from the schedule in a muted group at the bottom', () => {
    const groups = groupCoursesByScheduledTerm(catalog, ['CS|1102', 'CS|2103'], ['CS|2103|A01']);
    expect(groups.at(-1)).toEqual({
      key: OFF_SCHEDULE_KEY,
      label: OFF_SCHEDULE_LABEL,
      onSchedule: false,
      courseIds: ['CS|1102'],
    });
    expect(groups[0].onSchedule).toBe(true);
  });

  it('puts every course off schedule when there is no schedule', () => {
    expect(summary([], ['CS|1101', 'CS|1102'])).toEqual([[OFF_SCHEDULE_LABEL, ['CS|1101', 'CS|1102']]]);
  });

  it('leaves out the off-schedule group when everything is scheduled', () => {
    expect(summary(['CS|1102|B01'], ['CS|1102']).map(([label]) => label)).toEqual(['Currently In B-Term:']);
  });

  it('files a scheduled section with no term under "Term TBA", after the real terms', () => {
    expect(summary(['CS|3000|X01', 'CS|1102|B01'], ['CS|3000', 'CS|1102'])).toEqual([
      ['Currently In B-Term:', ['CS|1102']],
      ['Currently In Term TBA:', ['CS|3000']],
    ]);
  });

  it('ignores scheduled ids the catalog no longer has', () => {
    expect(summary(['CS|9999|A01', 'CS|1102|B01'], ['CS|1102'])).toEqual([['Currently In B-Term:', ['CS|1102']]]);
  });

  it('ignores scheduled sections of courses that are no longer chosen', () => {
    expect(summary(['CS|1101|A01', 'CS|1102|B01'], ['CS|1102'])).toEqual([['Currently In B-Term:', ['CS|1102']]]);
  });

  it('gives groups keys that survive a regroup', () => {
    const keys = groupCoursesByScheduledTerm(catalog, ['CS|2102', 'CS|1102'], ['CS|2102|AB01']).map(
      (group) => group.key,
    );
    expect(keys).toEqual(['AB', OFF_SCHEDULE_KEY]);
  });
});
